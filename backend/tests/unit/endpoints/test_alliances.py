"""
Unit Tests for Alliance API Endpoints

Tests verify HTTP contract only — service layer is mocked.
Coverage:
- GET /alliances         — returns alliance or null, auth required
- POST /alliances        — create, 201, validation errors, duplicate error
- PATCH /alliances       — update, 400 on missing alliance, 403 on permission
- DELETE /alliances      — 204, 400 on missing alliance

AAA pattern throughout. Service mocked via FastAPI dependency_overrides.
"""

from datetime import datetime
from unittest.mock import AsyncMock, MagicMock
from uuid import UUID

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from src.api.v1.endpoints.alliances import router
from src.core.auth import get_current_user_id
from src.core.dependencies import get_alliance_service
from src.models.alliance import Alliance
from src.services.alliance_service import AllianceService

# =============================================================================
# Constants & helpers
# =============================================================================

FIXED_USER_ID = UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
FIXED_ALLIANCE_ID = UUID("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb")

NOW = datetime(2026, 1, 1, 0, 0, 0)


def _make_alliance(**overrides) -> Alliance:
    """Build a minimal Alliance instance for use in mock return values."""
    defaults = {
        "id": FIXED_ALLIANCE_ID,
        "name": "Test Alliance",
        "server_name": "Server 1",
        "created_at": NOW,
        "updated_at": NOW,
        "purchased_seasons": 0,
        "used_seasons": 0,
    }
    defaults.update(overrides)
    return Alliance(**defaults)


# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def mock_alliance_service() -> MagicMock:
    """Create a mock AllianceService for DI override."""
    svc = MagicMock(spec=AllianceService)
    svc.get_user_alliance = AsyncMock(return_value=_make_alliance())
    svc.create_alliance = AsyncMock(return_value=_make_alliance())
    svc.update_alliance = AsyncMock(return_value=_make_alliance())
    svc.delete_alliance = AsyncMock(return_value=None)
    return svc


@pytest.fixture
def app(mock_alliance_service: MagicMock) -> FastAPI:
    """Create test FastAPI app with alliance router, DI overrides, and global exception handlers."""
    from fastapi import Request, status
    from fastapi.responses import JSONResponse

    test_app = FastAPI()
    test_app.include_router(router, prefix="/api/v1")

    # Override service and auth dependencies
    test_app.dependency_overrides[get_alliance_service] = lambda: mock_alliance_service
    test_app.dependency_overrides[get_current_user_id] = lambda: FIXED_USER_ID

    # Mirror the global exception handlers from main.py
    @test_app.exception_handler(ValueError)
    async def value_error_handler(request: Request, exc: ValueError) -> JSONResponse:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={"detail": str(exc)},
        )

    @test_app.exception_handler(PermissionError)
    async def permission_error_handler(request: Request, exc: PermissionError) -> JSONResponse:
        return JSONResponse(
            status_code=status.HTTP_403_FORBIDDEN,
            content={"detail": "您沒有權限執行此操作"},
        )

    yield test_app
    test_app.dependency_overrides.clear()


@pytest.fixture
async def client(app: FastAPI):
    """Async HTTP client wired to the test app."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


# =============================================================================
# GET /alliances
# =============================================================================


class TestGetUserAlliance:
    """Tests for GET /api/v1/alliances"""

    async def test_returns_alliance(self, client, mock_alliance_service):
        """Should return 200 with the user's alliance."""
        response = await client.get("/api/v1/alliances")

        assert response.status_code == 200
        body = response.json()
        assert body["id"] == str(FIXED_ALLIANCE_ID)
        assert body["name"] == "Test Alliance"

    async def test_returns_null_when_no_alliance(self, client, mock_alliance_service):
        """Should return 200 with null body when user has no alliance."""
        mock_alliance_service.get_user_alliance = AsyncMock(return_value=None)

        response = await client.get("/api/v1/alliances")

        assert response.status_code == 200
        assert response.json() is None

    async def test_calls_service_with_user_id(self, client, mock_alliance_service):
        """Should pass user_id from JWT token to service."""
        await client.get("/api/v1/alliances")

        mock_alliance_service.get_user_alliance.assert_awaited_once_with(FIXED_USER_ID)

    async def test_requires_auth(self, app: FastAPI):
        """Should return 403 when no Bearer token is provided."""
        app.dependency_overrides.pop(get_current_user_id, None)
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            response = await c.get("/api/v1/alliances")
        assert response.status_code == 403

    async def test_response_includes_season_quota_fields(self, client, mock_alliance_service):
        """Should include purchased_seasons and used_seasons in response."""
        mock_alliance_service.get_user_alliance = AsyncMock(
            return_value=_make_alliance(purchased_seasons=3, used_seasons=1)
        )

        response = await client.get("/api/v1/alliances")

        body = response.json()
        assert body["purchased_seasons"] == 3
        assert body["used_seasons"] == 1


# =============================================================================
# POST /alliances
# =============================================================================


class TestCreateAlliance:
    """Tests for POST /api/v1/alliances"""

    @pytest.fixture
    def valid_payload(self) -> dict:
        return {"name": "New Alliance", "server_name": "Server 1"}

    async def test_creates_alliance_and_returns_201(
        self, client, mock_alliance_service, valid_payload
    ):
        """Should return 201 with the created alliance."""
        response = await client.post("/api/v1/alliances", json=valid_payload)

        assert response.status_code == 201
        assert response.json()["id"] == str(FIXED_ALLIANCE_ID)

    async def test_delegates_to_service_with_user_id(
        self, client, mock_alliance_service, valid_payload
    ):
        """Should call service.create_alliance with user_id from JWT token."""
        await client.post("/api/v1/alliances", json=valid_payload)

        mock_alliance_service.create_alliance.assert_awaited_once()
        call_user_id = mock_alliance_service.create_alliance.call_args.args[0]
        assert call_user_id == FIXED_USER_ID

    async def test_creates_alliance_without_server_name(self, client, mock_alliance_service):
        """Should accept payload with no server_name (optional field)."""
        response = await client.post("/api/v1/alliances", json={"name": "Minimal Alliance"})

        assert response.status_code == 201

    async def test_returns_422_when_name_missing(self, client):
        """Should return 422 when required field name is absent."""
        response = await client.post("/api/v1/alliances", json={"server_name": "S1"})

        assert response.status_code == 422

    async def test_returns_422_when_name_empty_string(self, client):
        """Should return 422 when name is an empty string (min_length=1)."""
        response = await client.post("/api/v1/alliances", json={"name": ""})

        assert response.status_code == 422

    async def test_returns_422_when_name_too_long(self, client):
        """Should return 422 when name exceeds max_length=100."""
        response = await client.post("/api/v1/alliances", json={"name": "x" * 101})

        assert response.status_code == 422

    async def test_returns_400_when_alliance_already_exists(
        self, client, mock_alliance_service, valid_payload
    ):
        """Should return 400 when user already has an alliance."""
        mock_alliance_service.create_alliance = AsyncMock(
            side_effect=ValueError("user already has an alliance")
        )

        response = await client.post("/api/v1/alliances", json=valid_payload)

        assert response.status_code == 400
        assert "already" in response.json()["detail"]

    async def test_never_trusts_client_user_id(self, client, mock_alliance_service):
        """user_id must come from JWT, not from request body — server_name field exists but not user_id."""
        # AllianceCreate has no user_id field; if the client tried to inject one it would be ignored
        response = await client.post(
            "/api/v1/alliances",
            json={"name": "Alliance", "user_id": "evil-injected-id"},
        )
        # Extra unknown fields are ignored by Pydantic; request must still succeed
        assert response.status_code == 201
        call_user_id = mock_alliance_service.create_alliance.call_args.args[0]
        assert call_user_id == FIXED_USER_ID


# =============================================================================
# PATCH /alliances
# =============================================================================


class TestUpdateAlliance:
    """Tests for PATCH /api/v1/alliances"""

    async def test_updates_alliance_and_returns_200(self, client, mock_alliance_service):
        """Should return 200 with the updated alliance."""
        response = await client.patch("/api/v1/alliances", json={"name": "Updated Name"})

        assert response.status_code == 200
        assert response.json()["id"] == str(FIXED_ALLIANCE_ID)

    async def test_calls_service_with_user_id(self, client, mock_alliance_service):
        """Should pass user_id from JWT token to service."""
        await client.patch("/api/v1/alliances", json={"name": "Updated Name"})

        mock_alliance_service.update_alliance.assert_awaited_once()
        call_user_id = mock_alliance_service.update_alliance.call_args.args[0]
        assert call_user_id == FIXED_USER_ID

    async def test_partial_update_only_server_name(self, client, mock_alliance_service):
        """Should accept patch with only server_name (all fields are optional in update)."""
        response = await client.patch("/api/v1/alliances", json={"server_name": "New Server"})

        assert response.status_code == 200

    async def test_returns_422_when_name_empty_string(self, client):
        """Should return 422 when name is explicitly set to empty string."""
        response = await client.patch("/api/v1/alliances", json={"name": ""})

        assert response.status_code == 422

    async def test_returns_400_when_no_alliance(self, client, mock_alliance_service):
        """Should return 400 when user has no alliance to update."""
        mock_alliance_service.update_alliance = AsyncMock(
            side_effect=ValueError("user has no alliance")
        )

        response = await client.patch("/api/v1/alliances", json={"name": "X"})

        assert response.status_code == 400

    async def test_returns_403_on_permission_error(self, client, mock_alliance_service):
        """Should return 403 when user lacks permission."""
        mock_alliance_service.update_alliance = AsyncMock(side_effect=PermissionError("forbidden"))

        response = await client.patch("/api/v1/alliances", json={"name": "X"})

        assert response.status_code == 403


# =============================================================================
# DELETE /alliances
# =============================================================================


class TestDeleteAlliance:
    """Tests for DELETE /api/v1/alliances"""

    async def test_deletes_alliance_and_returns_204(self, client, mock_alliance_service):
        """Should return 204 with empty body on success."""
        response = await client.delete("/api/v1/alliances")

        assert response.status_code == 204
        assert response.content == b""

    async def test_calls_service_with_user_id(self, client, mock_alliance_service):
        """Should pass user_id from JWT token to service."""
        await client.delete("/api/v1/alliances")

        mock_alliance_service.delete_alliance.assert_awaited_once_with(FIXED_USER_ID)

    async def test_returns_400_when_no_alliance(self, client, mock_alliance_service):
        """Should return 400 when user has no alliance to delete."""
        mock_alliance_service.delete_alliance = AsyncMock(
            side_effect=ValueError("user has no alliance")
        )

        response = await client.delete("/api/v1/alliances")

        assert response.status_code == 400

    async def test_returns_403_on_permission_error(self, client, mock_alliance_service):
        """Should return 403 when user lacks permission."""
        mock_alliance_service.delete_alliance = AsyncMock(side_effect=PermissionError("forbidden"))

        response = await client.delete("/api/v1/alliances")

        assert response.status_code == 403

    async def test_requires_auth(self, app: FastAPI):
        """Should return 403 when no Bearer token is provided."""
        app.dependency_overrides.pop(get_current_user_id, None)
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            response = await c.delete("/api/v1/alliances")
        assert response.status_code == 403
