"""
Unit Tests for Copper Mines Endpoint — HTTP Contract Verification

Tests cover:
1. GET /api/v1/copper-mines/rules — list rules for user's alliance
2. POST /api/v1/copper-mines/rules — create rule
3. PATCH /api/v1/copper-mines/rules/{rule_id} — update rule
4. DELETE /api/v1/copper-mines/rules/{rule_id} — delete rule
5. GET /api/v1/copper-mines/ownerships — list ownerships for a season
6. POST /api/v1/copper-mines/ownerships — create ownership
7. DELETE /api/v1/copper-mines/ownerships/{ownership_id} — delete ownership
8. PATCH /api/v1/copper-mines/ownerships/{ownership_id} — update ownership
9. GET /api/v1/copper-mines/coordinates/search — search coordinates
10. Auth required (missing token → 403)
11. PermissionError → 403, ValueError → 400

Following test-writing conventions:
- AAA pattern (Arrange-Act-Assert)
- DI overrides for services and UserIdDep
- Exception handlers mirrored from main.py
- No business logic tested — only HTTP contract
"""

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock
from uuid import UUID

import pytest
from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse
from httpx import ASGITransport, AsyncClient

from src.api.v1.endpoints.copper_mines import router
from src.core.auth import get_current_user_id
from src.core.dependencies import (
    get_alliance_service,
    get_copper_mine_rule_service,
    get_copper_mine_service,
    get_season_service,
)
from src.models.copper_mine import (
    CopperMineOwnershipResponse,
    CopperMineRuleResponse,
)
from src.models.copper_mine_coordinate import CopperCoordinateSearchResult
from src.services.alliance_service import AllianceService
from src.services.copper_mine_rule_service import CopperMineRuleService
from src.services.copper_mine_service import CopperMineService
from src.services.season_service import SeasonService

# =============================================================================
# Constants
# =============================================================================

FIXED_USER_ID = UUID("11111111-1111-1111-1111-111111111111")
FIXED_ALLIANCE_ID = UUID("22222222-2222-2222-2222-222222222222")
FIXED_SEASON_ID = UUID("33333333-3333-3333-3333-333333333333")
FIXED_RULE_ID = UUID("44444444-4444-4444-4444-444444444444")
FIXED_OWNERSHIP_ID = UUID("55555555-5555-5555-5555-555555555555")
FIXED_MEMBER_ID = UUID("66666666-6666-6666-6666-666666666666")

_NOW = datetime(2025, 1, 1, 0, 0, 0, tzinfo=UTC)


def _make_alliance():
    alliance = MagicMock()
    alliance.id = FIXED_ALLIANCE_ID
    return alliance


SAMPLE_RULE = CopperMineRuleResponse(
    id=str(FIXED_RULE_ID),
    alliance_id=str(FIXED_ALLIANCE_ID),
    tier=1,
    required_merit=1000,
    allowed_level="both",
    created_at=_NOW,
    updated_at=_NOW,
)

SAMPLE_OWNERSHIP = CopperMineOwnershipResponse(
    id=str(FIXED_OWNERSHIP_ID),
    season_id=str(FIXED_SEASON_ID),
    member_id=str(FIXED_MEMBER_ID),
    coord_x=100,
    coord_y=200,
    level=10,
    applied_at=_NOW,
    created_at=_NOW,
    registered_via="dashboard",
    member_name="曹操",
    member_group="A組",
    line_display_name=None,
)

SAMPLE_COORDINATE = CopperCoordinateSearchResult(
    coord_x=100,
    coord_y=200,
    county="許昌",
    district="許昌市",
    level=10,
    is_taken=False,
)

VALID_RULE_CREATE_BODY = {
    "tier": 1,
    "required_merit": 1000,
    "allowed_level": "both",
}

VALID_RULE_UPDATE_BODY = {
    "required_merit": 1500,
}

VALID_OWNERSHIP_CREATE_BODY = {
    "member_id": str(FIXED_MEMBER_ID),
    "coord_x": 100,
    "coord_y": 200,
    "level": 10,
}

VALID_OWNERSHIP_UPDATE_BODY = {
    "member_id": str(FIXED_MEMBER_ID),
}


# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def mock_alliance_service() -> MagicMock:
    """Mock AllianceService that returns a fixed alliance."""
    svc = MagicMock(spec=AllianceService)
    svc.get_user_alliance = AsyncMock(return_value=_make_alliance())
    return svc


@pytest.fixture
def mock_rule_service() -> MagicMock:
    """Mock CopperMineRuleService with sensible defaults."""
    svc = MagicMock(spec=CopperMineRuleService)
    svc.get_rules = AsyncMock(return_value=[SAMPLE_RULE])
    svc.create_rule = AsyncMock(return_value=SAMPLE_RULE)
    svc.update_rule = AsyncMock(return_value=SAMPLE_RULE)
    svc.delete_rule = AsyncMock(return_value=None)
    return svc


@pytest.fixture
def mock_mine_service() -> MagicMock:
    """Mock CopperMineService with sensible defaults."""
    svc = MagicMock(spec=CopperMineService)
    svc.get_ownerships_by_season = AsyncMock(return_value=[SAMPLE_OWNERSHIP])
    svc.create_ownership = AsyncMock(return_value=SAMPLE_OWNERSHIP)
    svc.delete_ownership = AsyncMock(return_value=None)
    svc.update_ownership = AsyncMock(return_value=SAMPLE_OWNERSHIP)
    svc.search_copper_coordinates_by_season = AsyncMock(return_value=[SAMPLE_COORDINATE])
    return svc


@pytest.fixture
def mock_season_service() -> MagicMock:
    """Mock SeasonService with verify_user_access that passes by default."""
    svc = MagicMock(spec=SeasonService)
    svc.verify_user_access = AsyncMock(return_value=None)
    return svc


@pytest.fixture
def app(
    mock_alliance_service: MagicMock,
    mock_rule_service: MagicMock,
    mock_mine_service: MagicMock,
    mock_season_service: MagicMock,
) -> FastAPI:
    """Test app with copper-mines router and DI overrides."""
    test_app = FastAPI(redirect_slashes=False)
    test_app.include_router(router, prefix="/api/v1")
    test_app.dependency_overrides[get_alliance_service] = lambda: mock_alliance_service
    test_app.dependency_overrides[get_copper_mine_rule_service] = lambda: mock_rule_service
    test_app.dependency_overrides[get_copper_mine_service] = lambda: mock_mine_service
    test_app.dependency_overrides[get_season_service] = lambda: mock_season_service
    test_app.dependency_overrides[get_current_user_id] = lambda: FIXED_USER_ID

    @test_app.exception_handler(ValueError)
    async def _value_error(request: Request, exc: ValueError) -> JSONResponse:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={"detail": str(exc)},
        )

    @test_app.exception_handler(PermissionError)
    async def _permission_error(request: Request, exc: PermissionError) -> JSONResponse:
        return JSONResponse(
            status_code=status.HTTP_403_FORBIDDEN,
            content={"detail": "您沒有權限執行此操作"},
        )

    yield test_app
    test_app.dependency_overrides.clear()


@pytest.fixture
async def client(app: FastAPI) -> AsyncClient:
    """Async HTTP client bound to the test app."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


# =============================================================================
# GET /copper-mines/rules — List Rules
# =============================================================================


class TestGetRules:
    """GET /api/v1/copper-mines/rules"""

    async def test_returns_200_with_rules_list(self, client):
        """Should return 200 and list of rules."""
        response = await client.get("/api/v1/copper-mines/rules")

        assert response.status_code == 200
        body = response.json()
        assert isinstance(body, list)
        assert len(body) == 1

    async def test_fetches_alliance_then_rules(
        self, client, mock_alliance_service, mock_rule_service
    ):
        """Should resolve alliance first, then pass alliance.id to rule service."""
        await client.get("/api/v1/copper-mines/rules")

        mock_alliance_service.get_user_alliance.assert_awaited_once_with(FIXED_USER_ID)
        mock_rule_service.get_rules.assert_awaited_once_with(FIXED_ALLIANCE_ID)

    async def test_missing_auth_returns_403(self, app):
        """Should return 403 when Authorization header is absent."""
        app.dependency_overrides.pop(get_current_user_id, None)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            response = await c.get("/api/v1/copper-mines/rules")

        assert response.status_code == 403

    async def test_permission_error_returns_403(self, client, mock_rule_service):
        """Should return 403 when service raises PermissionError."""
        mock_rule_service.get_rules = AsyncMock(side_effect=PermissionError("no access"))

        response = await client.get("/api/v1/copper-mines/rules")

        assert response.status_code == 403


# =============================================================================
# POST /copper-mines/rules — Create Rule
# =============================================================================


class TestCreateRule:
    """POST /api/v1/copper-mines/rules"""

    async def test_returns_201_with_created_rule(self, client):
        """Should return 201 and the created rule."""
        response = await client.post("/api/v1/copper-mines/rules", json=VALID_RULE_CREATE_BODY)

        assert response.status_code == 201
        body = response.json()
        assert body["id"] == str(FIXED_RULE_ID)

    async def test_calls_service_with_correct_args(self, client, mock_rule_service):
        """Should pass alliance_id and rule data to create_rule."""
        await client.post("/api/v1/copper-mines/rules", json=VALID_RULE_CREATE_BODY)

        mock_rule_service.create_rule.assert_awaited_once_with(
            alliance_id=FIXED_ALLIANCE_ID,
            tier=1,
            required_merit=1000,
            allowed_level="both",
        )

    async def test_missing_auth_returns_403(self, app):
        """Should return 403 when Authorization header is absent."""
        app.dependency_overrides.pop(get_current_user_id, None)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            response = await c.post("/api/v1/copper-mines/rules", json=VALID_RULE_CREATE_BODY)

        assert response.status_code == 403

    async def test_value_error_returns_400(self, client, mock_rule_service):
        """Should return 400 when service raises ValueError."""
        mock_rule_service.create_rule = AsyncMock(side_effect=ValueError("tier must be sequential"))

        response = await client.post("/api/v1/copper-mines/rules", json=VALID_RULE_CREATE_BODY)

        assert response.status_code == 400

    async def test_missing_required_field_returns_422(self, client):
        """Should return 422 when required field tier is absent."""
        body = {k: v for k, v in VALID_RULE_CREATE_BODY.items() if k != "tier"}
        response = await client.post("/api/v1/copper-mines/rules", json=body)

        assert response.status_code == 422


# =============================================================================
# PATCH /copper-mines/rules/{rule_id} — Update Rule
# =============================================================================


class TestUpdateRule:
    """PATCH /api/v1/copper-mines/rules/{rule_id}"""

    async def test_returns_200_with_updated_rule(self, client):
        """Should return 200 and the updated rule."""
        response = await client.patch(
            f"/api/v1/copper-mines/rules/{FIXED_RULE_ID}",
            json=VALID_RULE_UPDATE_BODY,
        )

        assert response.status_code == 200
        body = response.json()
        assert body["id"] == str(FIXED_RULE_ID)

    async def test_calls_service_with_correct_args(self, client, mock_rule_service):
        """Should pass rule_id, alliance_id, and update data to update_rule."""
        await client.patch(
            f"/api/v1/copper-mines/rules/{FIXED_RULE_ID}",
            json=VALID_RULE_UPDATE_BODY,
        )

        mock_rule_service.update_rule.assert_awaited_once_with(
            rule_id=FIXED_RULE_ID,
            alliance_id=FIXED_ALLIANCE_ID,
            required_merit=1500,
            allowed_level=None,
        )

    async def test_missing_auth_returns_403(self, app):
        """Should return 403 when Authorization header is absent."""
        app.dependency_overrides.pop(get_current_user_id, None)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            response = await c.patch(
                f"/api/v1/copper-mines/rules/{FIXED_RULE_ID}",
                json=VALID_RULE_UPDATE_BODY,
            )

        assert response.status_code == 403

    async def test_value_error_returns_400(self, client, mock_rule_service):
        """Should return 400 when service raises ValueError."""
        mock_rule_service.update_rule = AsyncMock(
            side_effect=ValueError("merit must be between tiers")
        )

        response = await client.patch(
            f"/api/v1/copper-mines/rules/{FIXED_RULE_ID}",
            json=VALID_RULE_UPDATE_BODY,
        )

        assert response.status_code == 400

    async def test_returns_422_for_invalid_uuid(self, client):
        """Should return 422 for a malformed rule_id."""
        response = await client.patch(
            "/api/v1/copper-mines/rules/not-a-uuid",
            json=VALID_RULE_UPDATE_BODY,
        )

        assert response.status_code == 422


# =============================================================================
# DELETE /copper-mines/rules/{rule_id} — Delete Rule
# =============================================================================


class TestDeleteRule:
    """DELETE /api/v1/copper-mines/rules/{rule_id}"""

    async def test_returns_204_on_success(self, client):
        """Should return 204 No Content on successful deletion."""
        response = await client.delete(f"/api/v1/copper-mines/rules/{FIXED_RULE_ID}")

        assert response.status_code == 204

    async def test_calls_service_with_correct_args(self, client, mock_rule_service):
        """Should pass rule_id and alliance_id to delete_rule."""
        await client.delete(f"/api/v1/copper-mines/rules/{FIXED_RULE_ID}")

        mock_rule_service.delete_rule.assert_awaited_once_with(
            rule_id=FIXED_RULE_ID,
            alliance_id=FIXED_ALLIANCE_ID,
        )

    async def test_missing_auth_returns_403(self, app):
        """Should return 403 when Authorization header is absent."""
        app.dependency_overrides.pop(get_current_user_id, None)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            response = await c.delete(f"/api/v1/copper-mines/rules/{FIXED_RULE_ID}")

        assert response.status_code == 403

    async def test_value_error_returns_400(self, client, mock_rule_service):
        """Should return 400 when service raises ValueError."""
        mock_rule_service.delete_rule = AsyncMock(
            side_effect=ValueError("can only delete highest tier")
        )

        response = await client.delete(f"/api/v1/copper-mines/rules/{FIXED_RULE_ID}")

        assert response.status_code == 400


# =============================================================================
# GET /copper-mines/ownerships — List Ownerships
# =============================================================================


class TestGetOwnerships:
    """GET /api/v1/copper-mines/ownerships"""

    async def test_returns_200_with_ownerships_list(self, client):
        """Should return 200 and ownerships response with total."""
        response = await client.get(
            "/api/v1/copper-mines/ownerships",
            params={"season_id": str(FIXED_SEASON_ID)},
        )

        assert response.status_code == 200
        body = response.json()
        assert "ownerships" in body
        assert "total" in body
        assert body["total"] == 1

    async def test_calls_services_with_correct_args(
        self, client, mock_season_service, mock_mine_service
    ):
        """Should verify season access and fetch ownerships with correct args."""
        await client.get(
            "/api/v1/copper-mines/ownerships",
            params={"season_id": str(FIXED_SEASON_ID)},
        )

        mock_season_service.verify_user_access.assert_awaited_once_with(
            FIXED_USER_ID, FIXED_SEASON_ID
        )
        mock_mine_service.get_ownerships_by_season.assert_awaited_once_with(
            season_id=FIXED_SEASON_ID,
            alliance_id=FIXED_ALLIANCE_ID,
        )

    async def test_requires_season_id_query_param(self, client):
        """Should return 422 when season_id query param is missing."""
        response = await client.get("/api/v1/copper-mines/ownerships")

        assert response.status_code == 422

    async def test_missing_auth_returns_403(self, app):
        """Should return 403 when Authorization header is absent."""
        app.dependency_overrides.pop(get_current_user_id, None)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            response = await c.get(
                "/api/v1/copper-mines/ownerships",
                params={"season_id": str(FIXED_SEASON_ID)},
            )

        assert response.status_code == 403

    async def test_permission_error_returns_403(self, client, mock_season_service):
        """Should return 403 when season_service raises PermissionError."""
        mock_season_service.verify_user_access = AsyncMock(
            side_effect=PermissionError("no season access")
        )

        response = await client.get(
            "/api/v1/copper-mines/ownerships",
            params={"season_id": str(FIXED_SEASON_ID)},
        )

        assert response.status_code == 403


# =============================================================================
# POST /copper-mines/ownerships — Create Ownership
# =============================================================================


class TestCreateOwnership:
    """POST /api/v1/copper-mines/ownerships"""

    async def test_returns_201_with_created_ownership(self, client):
        """Should return 201 and the created ownership."""
        response = await client.post(
            "/api/v1/copper-mines/ownerships",
            json=VALID_OWNERSHIP_CREATE_BODY,
            params={"season_id": str(FIXED_SEASON_ID)},
        )

        assert response.status_code == 201
        body = response.json()
        assert body["id"] == str(FIXED_OWNERSHIP_ID)

    async def test_calls_service_with_correct_args(self, client, mock_mine_service):
        """Should pass all required args to create_ownership."""
        await client.post(
            "/api/v1/copper-mines/ownerships",
            json=VALID_OWNERSHIP_CREATE_BODY,
            params={"season_id": str(FIXED_SEASON_ID)},
        )

        mock_mine_service.create_ownership.assert_awaited_once_with(
            season_id=FIXED_SEASON_ID,
            alliance_id=FIXED_ALLIANCE_ID,
            member_id=FIXED_MEMBER_ID,
            coord_x=100,
            coord_y=200,
            level=10,
            applied_at=None,
        )

    async def test_reserved_member_id_passes_none_to_service(self, client, mock_mine_service):
        """Should pass member_id=None when member_id is 'reserved'."""
        body = {**VALID_OWNERSHIP_CREATE_BODY, "member_id": "reserved"}

        await client.post(
            "/api/v1/copper-mines/ownerships",
            json=body,
            params={"season_id": str(FIXED_SEASON_ID)},
        )

        call_kwargs = mock_mine_service.create_ownership.await_args.kwargs
        assert call_kwargs["member_id"] is None

    async def test_missing_auth_returns_403(self, app):
        """Should return 403 when Authorization header is absent."""
        app.dependency_overrides.pop(get_current_user_id, None)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            response = await c.post(
                "/api/v1/copper-mines/ownerships",
                json=VALID_OWNERSHIP_CREATE_BODY,
                params={"season_id": str(FIXED_SEASON_ID)},
            )

        assert response.status_code == 403

    async def test_value_error_returns_400(self, client, mock_mine_service):
        """Should return 400 when service raises ValueError."""
        mock_mine_service.create_ownership = AsyncMock(
            side_effect=ValueError("coordinates already taken")
        )

        response = await client.post(
            "/api/v1/copper-mines/ownerships",
            json=VALID_OWNERSHIP_CREATE_BODY,
            params={"season_id": str(FIXED_SEASON_ID)},
        )

        assert response.status_code == 400

    async def test_missing_required_field_returns_422(self, client):
        """Should return 422 when required field member_id is absent."""
        body = {k: v for k, v in VALID_OWNERSHIP_CREATE_BODY.items() if k != "member_id"}

        response = await client.post(
            "/api/v1/copper-mines/ownerships",
            json=body,
            params={"season_id": str(FIXED_SEASON_ID)},
        )

        assert response.status_code == 422


# =============================================================================
# DELETE /copper-mines/ownerships/{ownership_id} — Delete Ownership
# =============================================================================


class TestDeleteOwnership:
    """DELETE /api/v1/copper-mines/ownerships/{ownership_id}"""

    async def test_returns_204_on_success(self, client):
        """Should return 204 No Content on successful deletion."""
        response = await client.delete(f"/api/v1/copper-mines/ownerships/{FIXED_OWNERSHIP_ID}")

        assert response.status_code == 204

    async def test_calls_service_with_correct_args(self, client, mock_mine_service):
        """Should pass ownership_id and alliance_id to delete_ownership."""
        await client.delete(f"/api/v1/copper-mines/ownerships/{FIXED_OWNERSHIP_ID}")

        mock_mine_service.delete_ownership.assert_awaited_once_with(
            ownership_id=FIXED_OWNERSHIP_ID,
            alliance_id=FIXED_ALLIANCE_ID,
        )

    async def test_missing_auth_returns_403(self, app):
        """Should return 403 when Authorization header is absent."""
        app.dependency_overrides.pop(get_current_user_id, None)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            response = await c.delete(f"/api/v1/copper-mines/ownerships/{FIXED_OWNERSHIP_ID}")

        assert response.status_code == 403

    async def test_value_error_returns_400(self, client, mock_mine_service):
        """Should return 400 when service raises ValueError."""
        mock_mine_service.delete_ownership = AsyncMock(
            side_effect=ValueError("ownership not found")
        )

        response = await client.delete(f"/api/v1/copper-mines/ownerships/{FIXED_OWNERSHIP_ID}")

        assert response.status_code == 400

    async def test_permission_error_returns_403(self, client, mock_mine_service):
        """Should return 403 when service raises PermissionError."""
        mock_mine_service.delete_ownership = AsyncMock(
            side_effect=PermissionError("ownership belongs to another alliance")
        )

        response = await client.delete(f"/api/v1/copper-mines/ownerships/{FIXED_OWNERSHIP_ID}")

        assert response.status_code == 403


# =============================================================================
# PATCH /copper-mines/ownerships/{ownership_id} — Update Ownership
# =============================================================================


class TestUpdateOwnership:
    """PATCH /api/v1/copper-mines/ownerships/{ownership_id}"""

    async def test_returns_200_with_updated_ownership(self, client):
        """Should return 200 and the updated ownership."""
        response = await client.patch(
            f"/api/v1/copper-mines/ownerships/{FIXED_OWNERSHIP_ID}",
            json=VALID_OWNERSHIP_UPDATE_BODY,
            params={"season_id": str(FIXED_SEASON_ID)},
        )

        assert response.status_code == 200
        body = response.json()
        assert body["id"] == str(FIXED_OWNERSHIP_ID)

    async def test_calls_service_with_correct_args(self, client, mock_mine_service):
        """Should pass all required args to update_ownership."""
        await client.patch(
            f"/api/v1/copper-mines/ownerships/{FIXED_OWNERSHIP_ID}",
            json=VALID_OWNERSHIP_UPDATE_BODY,
            params={"season_id": str(FIXED_SEASON_ID)},
        )

        mock_mine_service.update_ownership.assert_awaited_once_with(
            ownership_id=FIXED_OWNERSHIP_ID,
            season_id=FIXED_SEASON_ID,
            alliance_id=FIXED_ALLIANCE_ID,
            member_id=FIXED_MEMBER_ID,
        )

    async def test_missing_auth_returns_403(self, app):
        """Should return 403 when Authorization header is absent."""
        app.dependency_overrides.pop(get_current_user_id, None)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            response = await c.patch(
                f"/api/v1/copper-mines/ownerships/{FIXED_OWNERSHIP_ID}",
                json=VALID_OWNERSHIP_UPDATE_BODY,
                params={"season_id": str(FIXED_SEASON_ID)},
            )

        assert response.status_code == 403

    async def test_value_error_returns_400(self, client, mock_mine_service):
        """Should return 400 when service raises ValueError."""
        mock_mine_service.update_ownership = AsyncMock(side_effect=ValueError("member not found"))

        response = await client.patch(
            f"/api/v1/copper-mines/ownerships/{FIXED_OWNERSHIP_ID}",
            json=VALID_OWNERSHIP_UPDATE_BODY,
            params={"season_id": str(FIXED_SEASON_ID)},
        )

        assert response.status_code == 400

    async def test_returns_422_for_invalid_ownership_uuid(self, client):
        """Should return 422 for a malformed ownership_id."""
        response = await client.patch(
            "/api/v1/copper-mines/ownerships/not-a-uuid",
            json=VALID_OWNERSHIP_UPDATE_BODY,
            params={"season_id": str(FIXED_SEASON_ID)},
        )

        assert response.status_code == 422


# =============================================================================
# GET /copper-mines/coordinates/search — Search Coordinates
# =============================================================================


class TestSearchCoordinates:
    """GET /api/v1/copper-mines/coordinates/search"""

    async def test_returns_200_with_results(self, client):
        """Should return 200 and list of coordinate search results."""
        response = await client.get(
            "/api/v1/copper-mines/coordinates/search",
            params={"season_id": str(FIXED_SEASON_ID), "q": "許昌"},
        )

        assert response.status_code == 200
        body = response.json()
        assert isinstance(body, list)
        assert len(body) == 1

    async def test_calls_service_with_correct_args(self, client, mock_mine_service):
        """Should forward season_id and query to search_copper_coordinates_by_season."""
        await client.get(
            "/api/v1/copper-mines/coordinates/search",
            params={"season_id": str(FIXED_SEASON_ID), "q": "許昌"},
        )

        mock_mine_service.search_copper_coordinates_by_season.assert_awaited_once_with(
            season_id=FIXED_SEASON_ID, query="許昌"
        )

    async def test_requires_season_id_query_param(self, client):
        """Should return 422 when season_id is missing."""
        response = await client.get(
            "/api/v1/copper-mines/coordinates/search",
            params={"q": "許昌"},
        )

        assert response.status_code == 422

    async def test_requires_q_query_param(self, client):
        """Should return 422 when search query q is missing."""
        response = await client.get(
            "/api/v1/copper-mines/coordinates/search",
            params={"season_id": str(FIXED_SEASON_ID)},
        )

        assert response.status_code == 422

    async def test_returns_422_for_empty_query(self, client):
        """Should return 422 when q is an empty string (min_length=1)."""
        response = await client.get(
            "/api/v1/copper-mines/coordinates/search",
            params={"season_id": str(FIXED_SEASON_ID), "q": ""},
        )

        assert response.status_code == 422

    async def test_missing_auth_returns_403(self, app):
        """Should return 403 when Authorization header is absent."""
        app.dependency_overrides.pop(get_current_user_id, None)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            response = await c.get(
                "/api/v1/copper-mines/coordinates/search",
                params={"season_id": str(FIXED_SEASON_ID), "q": "許昌"},
            )

        assert response.status_code == 403

    async def test_permission_error_returns_403(self, client, mock_season_service):
        """Should return 403 when season_service raises PermissionError."""
        mock_season_service.verify_user_access = AsyncMock(
            side_effect=PermissionError("no season access")
        )

        response = await client.get(
            "/api/v1/copper-mines/coordinates/search",
            params={"season_id": str(FIXED_SEASON_ID), "q": "許昌"},
        )

        assert response.status_code == 403
