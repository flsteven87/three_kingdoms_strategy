"""
Unit Tests for Periods API Endpoints — HTTP Contract Verification

Tests cover:
1. POST /periods/seasons/{season_id}/recalculate — happy path, auth required,
   PermissionError → 403 (both season + permission service)
2. GET /periods — list periods, auth required, PermissionError → 403
3. GET /periods/{period_id}/metrics — metrics list, auth required, PermissionError → 403

Following test-writing conventions:
- AAA pattern (Arrange-Act-Assert)
- DI overrides for PeriodMetricsService, SeasonService, PermissionService, and UserIdDep
- No business logic tested — only HTTP contract
"""

from datetime import date
from unittest.mock import AsyncMock, MagicMock
from uuid import UUID

import pytest
from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse
from httpx import ASGITransport, AsyncClient

from src.api.v1.endpoints.periods import router
from src.core.auth import get_current_user_id
from src.core.dependencies import (
    get_period_metrics_service,
    get_permission_service,
    get_season_service,
)
from src.services.period_metrics_service import PeriodMetricsService
from src.services.permission_service import PermissionService
from src.services.season_service import SeasonService

# =============================================================================
# Constants
# =============================================================================

FIXED_USER_ID = UUID("11111111-1111-1111-1111-111111111111")
FIXED_SEASON_ID = UUID("22222222-2222-2222-2222-222222222222")
FIXED_PERIOD_ID = UUID("33333333-3333-3333-3333-333333333333")
FIXED_ALLIANCE_ID = UUID("44444444-4444-4444-4444-444444444444")
FIXED_UPLOAD_ID = UUID("55555555-5555-5555-5555-555555555555")


# =============================================================================
# Sample data builders
# =============================================================================


def _make_period(**overrides):
    """Build a minimal Period-like MagicMock for use in mock return values."""
    defaults = {
        "id": FIXED_PERIOD_ID,
        "season_id": FIXED_SEASON_ID,
        "period_number": 1,
        "start_date": date(2024, 10, 1),
        "end_date": date(2024, 10, 7),
        "days": 7,
        "start_upload_id": None,
        "end_upload_id": FIXED_UPLOAD_ID,
    }
    defaults.update(overrides)
    obj = MagicMock()
    for k, v in defaults.items():
        setattr(obj, k, v)
    return obj


def _make_period_metric(**overrides) -> dict:
    """Build a sample period metric dict."""
    defaults = {
        "member_id": str(UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")),
        "member_name": "玩家一",
        "group": "A組",
        "daily_contribution": 100.0,
        "daily_merit": 200.0,
        "daily_assist": 50.0,
        "daily_donation": 30.0,
        "contribution_rank": 1,
    }
    defaults.update(overrides)
    return defaults


# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def mock_period_service() -> MagicMock:
    svc = MagicMock(spec=PeriodMetricsService)
    svc.verify_user_access = AsyncMock(return_value=FIXED_ALLIANCE_ID)
    svc.calculate_periods_for_season = AsyncMock(return_value=[_make_period()])
    svc.get_periods_by_season = AsyncMock(return_value=[_make_period()])
    svc.get_period_metrics = AsyncMock(return_value=[_make_period_metric()])
    return svc


@pytest.fixture
def mock_season_service() -> MagicMock:
    svc = MagicMock(spec=SeasonService)
    svc.verify_user_access = AsyncMock(return_value=FIXED_ALLIANCE_ID)
    return svc


@pytest.fixture
def mock_permission_service() -> MagicMock:
    svc = MagicMock(spec=PermissionService)
    svc.require_owner_or_collaborator = AsyncMock(return_value=None)
    return svc


@pytest.fixture
def app(mock_period_service, mock_season_service, mock_permission_service) -> FastAPI:
    test_app = FastAPI()
    test_app.include_router(router, prefix="/api/v1")
    test_app.dependency_overrides[get_current_user_id] = lambda: FIXED_USER_ID
    test_app.dependency_overrides[get_period_metrics_service] = lambda: mock_period_service
    test_app.dependency_overrides[get_season_service] = lambda: mock_season_service
    test_app.dependency_overrides[get_permission_service] = lambda: mock_permission_service

    @test_app.exception_handler(PermissionError)
    async def permission_error_handler(request: Request, exc: PermissionError) -> JSONResponse:
        return JSONResponse(
            status_code=status.HTTP_403_FORBIDDEN,
            content={"detail": "您沒有權限執行此操作"},
        )

    @test_app.exception_handler(ValueError)
    async def value_error_handler(request: Request, exc: ValueError) -> JSONResponse:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={"detail": str(exc)},
        )

    yield test_app
    test_app.dependency_overrides.clear()


@pytest.fixture
async def client(app: FastAPI) -> AsyncClient:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


# =============================================================================
# POST /periods/seasons/{season_id}/recalculate
# =============================================================================


class TestRecalculateSeasonPeriods:
    """Tests for POST /periods/seasons/{season_id}/recalculate."""

    async def test_returns_200_with_recalculation_summary(self, client):
        """Should return 200 with success flag and counts on successful recalculation."""
        response = await client.post(f"/api/v1/periods/seasons/{FIXED_SEASON_ID}/recalculate")

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["season_id"] == str(FIXED_SEASON_ID)
        assert data["periods_created"] == 1

    async def test_calls_service_with_correct_season_id(self, client, mock_period_service):
        """Should call calculate_periods_for_season with the path season_id."""
        await client.post(f"/api/v1/periods/seasons/{FIXED_SEASON_ID}/recalculate")

        mock_period_service.calculate_periods_for_season.assert_awaited_once_with(FIXED_SEASON_ID)

    async def test_missing_auth_returns_403(self, app):
        """Should return 403 when no auth token is provided."""
        app.dependency_overrides.pop(get_current_user_id, None)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            response = await c.post(f"/api/v1/periods/seasons/{FIXED_SEASON_ID}/recalculate")

        assert response.status_code == 403

    async def test_season_permission_error_returns_403(self, client, mock_season_service):
        """Should return 403 when season access verification fails."""
        mock_season_service.verify_user_access = AsyncMock(
            side_effect=PermissionError("Access denied")
        )

        response = await client.post(f"/api/v1/periods/seasons/{FIXED_SEASON_ID}/recalculate")

        assert response.status_code == 403

    async def test_owner_collaborator_check_failure_returns_403(
        self, client, mock_permission_service
    ):
        """Should return 403 when user is not owner or collaborator."""
        mock_permission_service.require_owner_or_collaborator = AsyncMock(
            side_effect=PermissionError("Not authorized")
        )

        response = await client.post(f"/api/v1/periods/seasons/{FIXED_SEASON_ID}/recalculate")

        assert response.status_code == 403

    async def test_value_error_returns_400(self, client, mock_period_service):
        """Should return 400 when service raises a ValueError."""
        mock_period_service.calculate_periods_for_season = AsyncMock(
            side_effect=ValueError("No uploads found for season")
        )

        response = await client.post(f"/api/v1/periods/seasons/{FIXED_SEASON_ID}/recalculate")

        assert response.status_code == 400

    async def test_returns_zero_periods_when_no_uploads(self, client, mock_period_service):
        """Should return periods_created=0 when service returns an empty list."""
        mock_period_service.calculate_periods_for_season = AsyncMock(return_value=[])

        response = await client.post(f"/api/v1/periods/seasons/{FIXED_SEASON_ID}/recalculate")

        assert response.status_code == 200
        assert response.json()["periods_created"] == 0


# =============================================================================
# GET /periods
# =============================================================================


class TestGetPeriodsBySeason:
    """Tests for GET /periods."""

    async def test_returns_200_with_period_list(self, client):
        """Should return 200 with serialized periods list."""
        response = await client.get("/api/v1/periods", params={"season_id": str(FIXED_SEASON_ID)})

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 1
        assert data[0]["period_number"] == 1
        assert data[0]["days"] == 7

    async def test_period_serialization_includes_all_fields(self, client):
        """Should include id, season_id, dates, days, and upload IDs in the response."""
        response = await client.get("/api/v1/periods", params={"season_id": str(FIXED_SEASON_ID)})

        assert response.status_code == 200
        period = response.json()[0]
        assert "id" in period
        assert "season_id" in period
        assert "start_date" in period
        assert "end_date" in period
        assert "days" in period
        assert "end_upload_id" in period

    async def test_start_upload_id_is_none_when_not_set(self, client):
        """Should serialize start_upload_id as null when it is None."""
        response = await client.get("/api/v1/periods", params={"season_id": str(FIXED_SEASON_ID)})

        assert response.status_code == 200
        assert response.json()[0]["start_upload_id"] is None

    async def test_missing_season_id_returns_422(self, client):
        """Should return 422 when required season_id query param is absent."""
        response = await client.get("/api/v1/periods")

        assert response.status_code == 422

    async def test_missing_auth_returns_403(self, app):
        """Should return 403 when no auth token is provided."""
        app.dependency_overrides.pop(get_current_user_id, None)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            response = await c.get("/api/v1/periods", params={"season_id": str(FIXED_SEASON_ID)})

        assert response.status_code == 403

    async def test_permission_error_returns_403(self, client, mock_season_service):
        """Should return 403 when season access is denied."""
        mock_season_service.verify_user_access = AsyncMock(
            side_effect=PermissionError("Access denied")
        )

        response = await client.get("/api/v1/periods", params={"season_id": str(FIXED_SEASON_ID)})

        assert response.status_code == 403

    async def test_empty_list_when_no_periods(self, client, mock_period_service):
        """Should return an empty list when no periods exist for the season."""
        mock_period_service.get_periods_by_season = AsyncMock(return_value=[])

        response = await client.get("/api/v1/periods", params={"season_id": str(FIXED_SEASON_ID)})

        assert response.status_code == 200
        assert response.json() == []


# =============================================================================
# GET /periods/{period_id}/metrics
# =============================================================================


class TestGetPeriodMetrics:
    """Tests for GET /periods/{period_id}/metrics."""

    async def test_returns_200_with_metrics_list(self, client):
        """Should return 200 with a list of member metrics."""
        response = await client.get(f"/api/v1/periods/{FIXED_PERIOD_ID}/metrics")

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 1
        assert data[0]["member_name"] == "玩家一"

    async def test_calls_service_with_correct_period_id(self, client, mock_period_service):
        """Should call get_period_metrics with the path period_id."""
        await client.get(f"/api/v1/periods/{FIXED_PERIOD_ID}/metrics")

        mock_period_service.get_period_metrics.assert_awaited_once_with(FIXED_PERIOD_ID)

    async def test_missing_auth_returns_403(self, app):
        """Should return 403 when no auth token is provided."""
        app.dependency_overrides.pop(get_current_user_id, None)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            response = await c.get(f"/api/v1/periods/{FIXED_PERIOD_ID}/metrics")

        assert response.status_code == 403

    async def test_permission_error_returns_403(self, client, mock_period_service):
        """Should return 403 when period access is denied."""
        mock_period_service.verify_user_access = AsyncMock(
            side_effect=PermissionError("Access denied")
        )

        response = await client.get(f"/api/v1/periods/{FIXED_PERIOD_ID}/metrics")

        assert response.status_code == 403

    async def test_returns_empty_list_when_no_metrics(self, client, mock_period_service):
        """Should return an empty list when no metrics exist for the period."""
        mock_period_service.get_period_metrics = AsyncMock(return_value=[])

        response = await client.get(f"/api/v1/periods/{FIXED_PERIOD_ID}/metrics")

        assert response.status_code == 200
        assert response.json() == []

    async def test_verify_access_called_before_fetching_metrics(self, client, mock_period_service):
        """Should call verify_user_access with correct user_id and period_id."""
        await client.get(f"/api/v1/periods/{FIXED_PERIOD_ID}/metrics")

        mock_period_service.verify_user_access.assert_awaited_once_with(
            FIXED_USER_ID, FIXED_PERIOD_ID
        )
