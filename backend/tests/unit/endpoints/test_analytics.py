"""
Unit Tests for Analytics API Endpoints — HTTP Contract Verification

Tests cover:
1. GET /analytics/members — list members, auth required, PermissionError → 403
2. GET /analytics/members/{id}/trend — member trend, auth required
3. GET /analytics/members/{id}/summary — 404 when no data, auth required
4. GET /analytics/members/{id}/comparison — 404 when no data, auth required
5. GET /analytics/periods/{id}/averages — period averages, auth required
6. GET /analytics/alliance/trend — alliance trend, auth required
7. GET /analytics/seasons/{id}/averages — season averages, auth required
8. GET /analytics/alliance — full alliance analytics, auth required
9. GET /analytics/groups — group list, auth required
10. GET /analytics/groups/comparison — group comparison, auth required
11. GET /analytics/groups/{name} — group analytics, 404 when empty, auth required

Following test-writing conventions:
- AAA pattern (Arrange-Act-Assert)
- DI overrides for service dependencies and UserIdDep
- No business logic tested — only HTTP contract
"""

from unittest.mock import AsyncMock, MagicMock
from uuid import UUID

import pytest
from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse
from httpx import ASGITransport, AsyncClient

from src.api.v1.endpoints.analytics import router
from src.core.auth import get_current_user_id
from src.core.dependencies import (
    get_alliance_analytics_service,
    get_group_analytics_service,
    get_member_analytics_service,
    get_period_metrics_service,
    get_season_service,
)
from src.services.analytics import (
    AllianceAnalyticsService,
    GroupAnalyticsService,
    MemberAnalyticsService,
)
from src.services.period_metrics_service import PeriodMetricsService
from src.services.season_service import SeasonService

# =============================================================================
# Constants
# =============================================================================

FIXED_USER_ID = UUID("11111111-1111-1111-1111-111111111111")
FIXED_SEASON_ID = UUID("22222222-2222-2222-2222-222222222222")
FIXED_MEMBER_ID = UUID("33333333-3333-3333-3333-333333333333")
FIXED_PERIOD_ID = UUID("44444444-4444-4444-4444-444444444444")
FIXED_ALLIANCE_ID = UUID("55555555-5555-5555-5555-555555555555")


# =============================================================================
# Sample response payloads
# =============================================================================

MEMBER_LIST_ITEM = {
    "id": str(FIXED_MEMBER_ID),
    "name": "玩家一",
    "is_active": True,
    "contribution_rank": 1,
    "group": "A組",
}

MEMBER_TREND_ITEM = {
    "period_id": str(FIXED_PERIOD_ID),
    "period_number": 1,
    "period_label": "10/01-10/07",
    "start_date": "2024-10-01",
    "end_date": "2024-10-07",
    "days": 7,
    "daily_contribution": 100.0,
    "daily_merit": 200.0,
    "daily_assist": 50.0,
    "daily_donation": 30.0,
    "contribution_diff": 700,
    "merit_diff": 1400,
    "assist_diff": 350,
    "donation_diff": 210,
    "power_diff": 0,
    "start_rank": None,
    "end_rank": 1,
    "rank_change": None,
    "end_power": 100000,
    "end_state": "涼州",
    "end_group": "A組",
    "is_new_member": False,
    "alliance_avg_contribution": 90.0,
    "alliance_avg_merit": 180.0,
    "alliance_avg_assist": 45.0,
    "alliance_avg_donation": 25.0,
    "alliance_avg_power": 90000.0,
    "alliance_member_count": 30,
    "alliance_median_contribution": 85.0,
    "alliance_median_merit": 170.0,
    "alliance_median_assist": 42.0,
    "alliance_median_donation": 22.0,
    "alliance_median_power": 88000.0,
}

SEASON_SUMMARY = {
    "period_count": 2,
    "total_days": 14,
    "total_contribution": 1400,
    "total_merit": 2800,
    "total_assist": 700,
    "total_donation": 420,
    "total_power_change": 0,
    "avg_daily_contribution": 100.0,
    "avg_daily_merit": 200.0,
    "avg_daily_assist": 50.0,
    "avg_daily_donation": 30.0,
    "avg_power": 100000.0,
    "current_rank": 1,
    "rank_change_season": None,
    "current_power": 100000,
    "current_group": "A組",
    "current_state": "涼州",
}

ALLIANCE_AVERAGES = {
    "member_count": 30,
    "avg_daily_contribution": 90.0,
    "avg_daily_merit": 180.0,
    "avg_daily_assist": 45.0,
    "avg_daily_donation": 25.0,
    "avg_power": 90000.0,
    "median_daily_contribution": 85.0,
    "median_daily_merit": 170.0,
    "median_daily_assist": 42.0,
    "median_daily_donation": 22.0,
    "median_power": 88000.0,
}

MEMBER_COMPARISON = {
    "member": {
        "daily_contribution": 100.0,
        "daily_merit": 200.0,
        "daily_assist": 50.0,
        "daily_donation": 30.0,
        "end_rank": 1,
        "rank_change": None,
        "end_power": 100000,
        "power_diff": 0,
        "is_new_member": False,
    },
    "alliance_avg": {
        "daily_contribution": 90.0,
        "daily_merit": 180.0,
        "daily_assist": 45.0,
        "daily_donation": 25.0,
    },
    "alliance_median": {
        "daily_contribution": 85.0,
        "daily_merit": 170.0,
        "daily_assist": 42.0,
        "daily_donation": 22.0,
    },
    "total_members": 30,
}

ALLIANCE_TREND_ITEM = {
    "period_id": str(FIXED_PERIOD_ID),
    "period_number": 1,
    "period_label": "10/01-10/07",
    "member_count": 30,
    "avg_daily_contribution": 90.0,
    "avg_daily_merit": 180.0,
    "avg_daily_assist": 45.0,
    "avg_daily_donation": 25.0,
}

GROUP_LIST_ITEM = {"name": "A組", "member_count": 10}

GROUP_COMPARISON_ITEM = {
    "name": "A組",
    "avg_daily_merit": 180.0,
    "avg_rank": 5.0,
    "member_count": 10,
    "member_names": ["玩家一", "玩家二"],
}

_COMMON_GROUP_STATS = {
    "group_name": "A組",
    "member_count": 10,
    "avg_daily_contribution": 100.0,
    "avg_daily_merit": 200.0,
    "avg_daily_assist": 50.0,
    "avg_daily_donation": 30.0,
    "avg_power": 100000.0,
    "avg_rank": 5.0,
    "best_rank": 1,
    "worst_rank": 10,
    "contribution_min": 50.0,
    "contribution_q1": 75.0,
    "contribution_median": 100.0,
    "contribution_q3": 125.0,
    "contribution_max": 150.0,
    "contribution_cv": 0.2,
    "merit_min": 100.0,
    "merit_q1": 150.0,
    "merit_median": 200.0,
    "merit_q3": 250.0,
    "merit_max": 300.0,
    "merit_cv": 0.2,
}

GROUP_ANALYTICS = {
    "stats": _COMMON_GROUP_STATS,
    "members": [
        {
            "id": str(FIXED_MEMBER_ID),
            "name": "玩家一",
            "contribution_rank": 1,
            "daily_contribution": 100.0,
            "daily_merit": 200.0,
            "daily_assist": 50.0,
            "daily_donation": 30.0,
            "power": 100000,
            "rank_change": None,
            "contribution_change": None,
            "merit_change": None,
        }
    ],
    "trends": [],
    "alliance_averages": ALLIANCE_AVERAGES,
}

ALLIANCE_ANALYTICS = {
    "summary": {
        "member_count": 30,
        "avg_daily_contribution": 90.0,
        "avg_daily_merit": 180.0,
        "avg_daily_assist": 45.0,
        "avg_daily_donation": 25.0,
        "avg_power": 90000.0,
        "median_daily_contribution": 85.0,
        "median_daily_merit": 170.0,
        "contribution_change_pct": None,
        "merit_change_pct": None,
        "power_change_pct": None,
    },
    "trends": [],
    "distributions": {"contribution": [], "merit": []},
    "groups": [],
    "top_performers": [],
    "bottom_performers": [],
    "needs_attention": [],
    "current_period": {
        "period_id": str(FIXED_PERIOD_ID),
        "period_number": 1,
        "period_label": "10/01-10/07",
        "start_date": "2024-10-01",
        "end_date": "2024-10-07",
        "days": 7,
    },
}


# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def mock_season_service() -> MagicMock:
    svc = MagicMock(spec=SeasonService)
    svc.verify_user_access = AsyncMock(return_value=FIXED_ALLIANCE_ID)
    return svc


@pytest.fixture
def mock_member_analytics_service() -> MagicMock:
    svc = MagicMock(spec=MemberAnalyticsService)
    svc.get_members_for_analytics = AsyncMock(return_value=[MEMBER_LIST_ITEM])
    svc.get_member_trend = AsyncMock(return_value=[MEMBER_TREND_ITEM])
    svc.get_season_summary = AsyncMock(return_value=SEASON_SUMMARY)
    svc.get_member_with_comparison = AsyncMock(return_value=MEMBER_COMPARISON)
    return svc


@pytest.fixture
def mock_alliance_analytics_service() -> MagicMock:
    svc = MagicMock(spec=AllianceAnalyticsService)
    svc.get_period_alliance_averages = AsyncMock(return_value=ALLIANCE_AVERAGES)
    svc.get_alliance_trend_averages = AsyncMock(return_value=[ALLIANCE_TREND_ITEM])
    svc.get_season_alliance_averages = AsyncMock(return_value=ALLIANCE_AVERAGES)
    svc.get_alliance_analytics = AsyncMock(return_value=ALLIANCE_ANALYTICS)
    return svc


@pytest.fixture
def mock_group_analytics_service() -> MagicMock:
    svc = MagicMock(spec=GroupAnalyticsService)
    svc.get_groups_list = AsyncMock(return_value=[GROUP_LIST_ITEM])
    svc.get_groups_comparison = AsyncMock(return_value=[GROUP_COMPARISON_ITEM])
    svc.get_group_analytics = AsyncMock(return_value=GROUP_ANALYTICS)
    return svc


@pytest.fixture
def mock_period_metrics_service() -> MagicMock:
    svc = MagicMock(spec=PeriodMetricsService)
    svc.verify_user_access = AsyncMock(return_value=FIXED_ALLIANCE_ID)
    return svc


def _make_test_app(
    mock_season_service,
    mock_member_analytics_service,
    mock_alliance_analytics_service,
    mock_group_analytics_service,
    mock_period_metrics_service,
) -> FastAPI:
    """Build a test FastAPI app with analytics router and all DI overrides."""
    test_app = FastAPI()
    test_app.include_router(router, prefix="/api/v1")
    test_app.dependency_overrides[get_current_user_id] = lambda: FIXED_USER_ID
    test_app.dependency_overrides[get_season_service] = lambda: mock_season_service
    test_app.dependency_overrides[get_member_analytics_service] = (
        lambda: mock_member_analytics_service
    )
    test_app.dependency_overrides[get_alliance_analytics_service] = (
        lambda: mock_alliance_analytics_service
    )
    test_app.dependency_overrides[get_group_analytics_service] = (
        lambda: mock_group_analytics_service
    )
    test_app.dependency_overrides[get_period_metrics_service] = lambda: mock_period_metrics_service

    @test_app.exception_handler(PermissionError)
    async def permission_error_handler(request: Request, exc: PermissionError) -> JSONResponse:
        return JSONResponse(
            status_code=status.HTTP_403_FORBIDDEN,
            content={"detail": "您沒有權限執行此操作"},
        )

    @test_app.exception_handler(FileNotFoundError)
    async def file_not_found_handler(request: Request, exc: FileNotFoundError) -> JSONResponse:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"detail": "找不到請求的資源"},
        )

    @test_app.exception_handler(ValueError)
    async def value_error_handler(request: Request, exc: ValueError) -> JSONResponse:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={"detail": str(exc)},
        )

    return test_app


@pytest.fixture
def app(
    mock_season_service,
    mock_member_analytics_service,
    mock_alliance_analytics_service,
    mock_group_analytics_service,
    mock_period_metrics_service,
) -> FastAPI:
    test_app = _make_test_app(
        mock_season_service,
        mock_member_analytics_service,
        mock_alliance_analytics_service,
        mock_group_analytics_service,
        mock_period_metrics_service,
    )
    yield test_app
    test_app.dependency_overrides.clear()


@pytest.fixture
async def client(app: FastAPI) -> AsyncClient:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


# =============================================================================
# GET /analytics/members
# =============================================================================


class TestGetMembers:
    """Tests for GET /analytics/members."""

    async def test_returns_200_with_member_list(self, client):
        """Should return 200 and list of members for valid season_id."""
        response = await client.get(
            "/api/v1/analytics/members", params={"season_id": str(FIXED_SEASON_ID)}
        )

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 1
        assert data[0]["name"] == "玩家一"

    async def test_missing_season_id_returns_422(self, client):
        """Should return 422 when required season_id query param is absent."""
        response = await client.get("/api/v1/analytics/members")

        assert response.status_code == 422

    async def test_missing_auth_returns_403(self, app):
        """Should return 403 when no auth token is provided."""
        app.dependency_overrides.pop(get_current_user_id, None)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            response = await c.get(
                "/api/v1/analytics/members", params={"season_id": str(FIXED_SEASON_ID)}
            )

        assert response.status_code == 403

    async def test_permission_error_returns_403(self, client, mock_season_service):
        """Should return 403 when season access is denied."""
        mock_season_service.verify_user_access = AsyncMock(
            side_effect=PermissionError("Access denied")
        )

        response = await client.get(
            "/api/v1/analytics/members", params={"season_id": str(FIXED_SEASON_ID)}
        )

        assert response.status_code == 403


# =============================================================================
# GET /analytics/members/{member_id}/trend
# =============================================================================


class TestGetMemberTrend:
    """Tests for GET /analytics/members/{member_id}/trend."""

    async def test_returns_200_with_trend_data(self, client):
        """Should return 200 and trend list for valid request."""
        response = await client.get(
            f"/api/v1/analytics/members/{FIXED_MEMBER_ID}/trend",
            params={"season_id": str(FIXED_SEASON_ID)},
        )

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert data[0]["period_number"] == 1

    async def test_missing_season_id_returns_422(self, client):
        """Should return 422 when season_id is not provided."""
        response = await client.get(f"/api/v1/analytics/members/{FIXED_MEMBER_ID}/trend")

        assert response.status_code == 422

    async def test_missing_auth_returns_403(self, app):
        """Should return 403 when no auth token is provided."""
        app.dependency_overrides.pop(get_current_user_id, None)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            response = await c.get(
                f"/api/v1/analytics/members/{FIXED_MEMBER_ID}/trend",
                params={"season_id": str(FIXED_SEASON_ID)},
            )

        assert response.status_code == 403

    async def test_permission_error_returns_403(self, client, mock_season_service):
        """Should return 403 when user lacks season access."""
        mock_season_service.verify_user_access = AsyncMock(side_effect=PermissionError("denied"))

        response = await client.get(
            f"/api/v1/analytics/members/{FIXED_MEMBER_ID}/trend",
            params={"season_id": str(FIXED_SEASON_ID)},
        )

        assert response.status_code == 403


# =============================================================================
# GET /analytics/members/{member_id}/summary
# =============================================================================


class TestGetMemberSeasonSummary:
    """Tests for GET /analytics/members/{member_id}/summary."""

    async def test_returns_200_with_summary(self, client):
        """Should return 200 with season summary when data exists."""
        response = await client.get(
            f"/api/v1/analytics/members/{FIXED_MEMBER_ID}/summary",
            params={"season_id": str(FIXED_SEASON_ID)},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["period_count"] == 2
        assert data["current_rank"] == 1

    async def test_returns_404_when_no_data(self, client, mock_member_analytics_service):
        """Should return 404 when service returns None (no metrics data)."""
        mock_member_analytics_service.get_season_summary = AsyncMock(return_value=None)

        response = await client.get(
            f"/api/v1/analytics/members/{FIXED_MEMBER_ID}/summary",
            params={"season_id": str(FIXED_SEASON_ID)},
        )

        assert response.status_code == 404

    async def test_missing_auth_returns_403(self, app):
        """Should return 403 when no auth token provided."""
        app.dependency_overrides.pop(get_current_user_id, None)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            response = await c.get(
                f"/api/v1/analytics/members/{FIXED_MEMBER_ID}/summary",
                params={"season_id": str(FIXED_SEASON_ID)},
            )

        assert response.status_code == 403


# =============================================================================
# GET /analytics/members/{member_id}/comparison
# =============================================================================


class TestGetMemberComparison:
    """Tests for GET /analytics/members/{member_id}/comparison."""

    async def test_returns_200_with_comparison_data(self, client):
        """Should return 200 with comparison data when it exists."""
        response = await client.get(
            f"/api/v1/analytics/members/{FIXED_MEMBER_ID}/comparison",
            params={"period_id": str(FIXED_PERIOD_ID)},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["total_members"] == 30
        assert "member" in data
        assert "alliance_avg" in data

    async def test_returns_404_when_no_data(self, client, mock_member_analytics_service):
        """Should return 404 when comparison data is not found."""
        mock_member_analytics_service.get_member_with_comparison = AsyncMock(return_value=None)

        response = await client.get(
            f"/api/v1/analytics/members/{FIXED_MEMBER_ID}/comparison",
            params={"period_id": str(FIXED_PERIOD_ID)},
        )

        assert response.status_code == 404

    async def test_missing_period_id_returns_422(self, client):
        """Should return 422 when required period_id query param is absent."""
        response = await client.get(f"/api/v1/analytics/members/{FIXED_MEMBER_ID}/comparison")

        assert response.status_code == 422

    async def test_missing_auth_returns_403(self, app):
        """Should return 403 when no auth token provided."""
        app.dependency_overrides.pop(get_current_user_id, None)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            response = await c.get(
                f"/api/v1/analytics/members/{FIXED_MEMBER_ID}/comparison",
                params={"period_id": str(FIXED_PERIOD_ID)},
            )

        assert response.status_code == 403


# =============================================================================
# GET /analytics/periods/{period_id}/averages
# =============================================================================


class TestGetPeriodAverages:
    """Tests for GET /analytics/periods/{period_id}/averages."""

    async def test_returns_200_with_averages(self, client):
        """Should return 200 with alliance averages for a valid period."""
        response = await client.get(f"/api/v1/analytics/periods/{FIXED_PERIOD_ID}/averages")

        assert response.status_code == 200
        data = response.json()
        assert data["member_count"] == 30
        assert "avg_daily_merit" in data

    async def test_missing_auth_returns_403(self, app):
        """Should return 403 when no auth token provided."""
        app.dependency_overrides.pop(get_current_user_id, None)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            response = await c.get(f"/api/v1/analytics/periods/{FIXED_PERIOD_ID}/averages")

        assert response.status_code == 403

    async def test_permission_error_returns_403(self, client, mock_period_metrics_service):
        """Should return 403 when period access is denied."""
        mock_period_metrics_service.verify_user_access = AsyncMock(
            side_effect=PermissionError("denied")
        )

        response = await client.get(f"/api/v1/analytics/periods/{FIXED_PERIOD_ID}/averages")

        assert response.status_code == 403


# =============================================================================
# GET /analytics/alliance/trend
# =============================================================================


class TestGetAllianceTrend:
    """Tests for GET /analytics/alliance/trend."""

    async def test_returns_200_with_trend_list(self, client):
        """Should return 200 with list of alliance trend items."""
        response = await client.get(
            "/api/v1/analytics/alliance/trend",
            params={"season_id": str(FIXED_SEASON_ID)},
        )

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert data[0]["period_number"] == 1

    async def test_missing_season_id_returns_422(self, client):
        """Should return 422 when season_id is absent."""
        response = await client.get("/api/v1/analytics/alliance/trend")

        assert response.status_code == 422

    async def test_missing_auth_returns_403(self, app):
        """Should return 403 when no auth token provided."""
        app.dependency_overrides.pop(get_current_user_id, None)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            response = await c.get(
                "/api/v1/analytics/alliance/trend",
                params={"season_id": str(FIXED_SEASON_ID)},
            )

        assert response.status_code == 403


# =============================================================================
# GET /analytics/seasons/{season_id}/averages
# =============================================================================


class TestGetSeasonAverages:
    """Tests for GET /analytics/seasons/{season_id}/averages."""

    async def test_returns_200_with_averages(self, client):
        """Should return 200 with season-to-date alliance averages."""
        response = await client.get(f"/api/v1/analytics/seasons/{FIXED_SEASON_ID}/averages")

        assert response.status_code == 200
        data = response.json()
        assert data["member_count"] == 30

    async def test_missing_auth_returns_403(self, app):
        """Should return 403 when no auth token provided."""
        app.dependency_overrides.pop(get_current_user_id, None)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            response = await c.get(f"/api/v1/analytics/seasons/{FIXED_SEASON_ID}/averages")

        assert response.status_code == 403

    async def test_permission_error_returns_403(self, client, mock_season_service):
        """Should return 403 when season access is denied."""
        mock_season_service.verify_user_access = AsyncMock(side_effect=PermissionError("denied"))

        response = await client.get(f"/api/v1/analytics/seasons/{FIXED_SEASON_ID}/averages")

        assert response.status_code == 403


# =============================================================================
# GET /analytics/alliance
# =============================================================================


class TestGetAllianceAnalytics:
    """Tests for GET /analytics/alliance."""

    async def test_returns_200_with_full_analytics(self, client):
        """Should return 200 with complete alliance analytics payload."""
        response = await client.get(
            "/api/v1/analytics/alliance",
            params={"season_id": str(FIXED_SEASON_ID)},
        )

        assert response.status_code == 200
        data = response.json()
        assert "summary" in data
        assert "trends" in data
        assert "distributions" in data

    async def test_accepts_view_param(self, client, mock_alliance_analytics_service):
        """Should pass the view param to the service."""
        response = await client.get(
            "/api/v1/analytics/alliance",
            params={"season_id": str(FIXED_SEASON_ID), "view": "season"},
        )

        assert response.status_code == 200
        mock_alliance_analytics_service.get_alliance_analytics.assert_awaited_once_with(
            FIXED_SEASON_ID, view="season"
        )

    async def test_missing_season_id_returns_422(self, client):
        """Should return 422 when season_id is absent."""
        response = await client.get("/api/v1/analytics/alliance")

        assert response.status_code == 422

    async def test_missing_auth_returns_403(self, app):
        """Should return 403 when no auth token provided."""
        app.dependency_overrides.pop(get_current_user_id, None)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            response = await c.get(
                "/api/v1/analytics/alliance",
                params={"season_id": str(FIXED_SEASON_ID)},
            )

        assert response.status_code == 403


# =============================================================================
# GET /analytics/groups
# =============================================================================


class TestGetGroups:
    """Tests for GET /analytics/groups."""

    async def test_returns_200_with_group_list(self, client):
        """Should return 200 with list of groups."""
        response = await client.get(
            "/api/v1/analytics/groups",
            params={"season_id": str(FIXED_SEASON_ID)},
        )

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert data[0]["name"] == "A組"

    async def test_missing_season_id_returns_422(self, client):
        """Should return 422 when season_id is absent."""
        response = await client.get("/api/v1/analytics/groups")

        assert response.status_code == 422

    async def test_missing_auth_returns_403(self, app):
        """Should return 403 when no auth token provided."""
        app.dependency_overrides.pop(get_current_user_id, None)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            response = await c.get(
                "/api/v1/analytics/groups",
                params={"season_id": str(FIXED_SEASON_ID)},
            )

        assert response.status_code == 403


# =============================================================================
# GET /analytics/groups/comparison
# =============================================================================


class TestGetGroupsComparison:
    """Tests for GET /analytics/groups/comparison."""

    async def test_returns_200_with_comparison_list(self, client):
        """Should return 200 with list of group comparison items."""
        response = await client.get(
            "/api/v1/analytics/groups/comparison",
            params={"season_id": str(FIXED_SEASON_ID)},
        )

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert data[0]["name"] == "A組"

    async def test_accepts_view_param(self, client, mock_group_analytics_service):
        """Should pass the view param to the service."""
        response = await client.get(
            "/api/v1/analytics/groups/comparison",
            params={"season_id": str(FIXED_SEASON_ID), "view": "season"},
        )

        assert response.status_code == 200
        mock_group_analytics_service.get_groups_comparison.assert_awaited_once_with(
            FIXED_SEASON_ID, view="season"
        )

    async def test_missing_auth_returns_403(self, app):
        """Should return 403 when no auth token provided."""
        app.dependency_overrides.pop(get_current_user_id, None)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            response = await c.get(
                "/api/v1/analytics/groups/comparison",
                params={"season_id": str(FIXED_SEASON_ID)},
            )

        assert response.status_code == 403


# =============================================================================
# GET /analytics/groups/{group_name}
# =============================================================================


class TestGetGroupAnalytics:
    """Tests for GET /analytics/groups/{group_name}."""

    async def test_returns_200_with_group_analytics(self, client):
        """Should return 200 with complete group analytics."""
        response = await client.get(
            "/api/v1/analytics/groups/A%E7%B5%84",
            params={"season_id": str(FIXED_SEASON_ID)},
        )

        assert response.status_code == 200
        data = response.json()
        assert "stats" in data
        assert "members" in data

    async def test_returns_404_when_group_has_no_members(
        self, client, mock_group_analytics_service
    ):
        """Should return 404 when the group has no members."""
        empty_analytics = {**GROUP_ANALYTICS, "members": []}
        mock_group_analytics_service.get_group_analytics = AsyncMock(return_value=empty_analytics)

        response = await client.get(
            "/api/v1/analytics/groups/A%E7%B5%84",
            params={"season_id": str(FIXED_SEASON_ID)},
        )

        assert response.status_code == 404

    async def test_missing_season_id_returns_422(self, client):
        """Should return 422 when season_id is absent."""
        response = await client.get("/api/v1/analytics/groups/A%E7%B5%84")

        assert response.status_code == 422

    async def test_missing_auth_returns_403(self, app):
        """Should return 403 when no auth token provided."""
        app.dependency_overrides.pop(get_current_user_id, None)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            response = await c.get(
                "/api/v1/analytics/groups/A%E7%B5%84",
                params={"season_id": str(FIXED_SEASON_ID)},
            )

        assert response.status_code == 403

    async def test_permission_error_returns_403(self, client, mock_season_service):
        """Should return 403 when season access is denied."""
        mock_season_service.verify_user_access = AsyncMock(side_effect=PermissionError("denied"))

        response = await client.get(
            "/api/v1/analytics/groups/A%E7%B5%84",
            params={"season_id": str(FIXED_SEASON_ID)},
        )

        assert response.status_code == 403
