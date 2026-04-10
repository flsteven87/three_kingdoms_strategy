"""
Unit Tests for Alliance Collaborators Endpoint — HTTP Contract Verification

Tests cover:
1. POST /alliances/{id}/collaborators — add collaborator (201)
2. GET  /alliances/{id}/collaborators — list collaborators (200)
3. DELETE /alliances/{id}/collaborators/{user_id} — remove collaborator (204)
4. POST /collaborators/process-invitations — process pending invitations (200)
5. PATCH /alliances/{id}/collaborators/{user_id}/role — update role (200)
6. GET  /alliances/{id}/my-role — get current user role (200)
7. Auth required for all endpoints
8. 404 / 403 / ValueError → 400 error paths
"""

from datetime import datetime
from unittest.mock import AsyncMock, MagicMock
from uuid import UUID, uuid4

import pytest
from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse
from httpx import ASGITransport, AsyncClient

from src.api.v1.endpoints.alliance_collaborators import router
from src.core.auth import get_current_user_id
from src.core.dependencies import (
    get_alliance_collaborator_service,
    get_permission_service,
)
from src.models.alliance_collaborator import (
    AllianceCollaboratorResponse,
)
from src.services.alliance_collaborator_service import AllianceCollaboratorService
from src.services.permission_service import PermissionService

# =============================================================================
# Constants
# =============================================================================

FIXED_USER_ID = UUID("33333333-3333-3333-3333-333333333333")
ALLIANCE_ID = uuid4()
TARGET_USER_ID = uuid4()

_NOW = datetime(2026, 4, 10, 12, 0, 0)

MOCK_COLLABORATOR = AllianceCollaboratorResponse(
    id=uuid4(),
    alliance_id=ALLIANCE_ID,
    user_id=TARGET_USER_ID,
    role="member",
    invited_by=FIXED_USER_ID,
    joined_at=_NOW,
    created_at=_NOW,
    user_email="collab@example.com",
)

VALID_ADD_REQUEST = {"email": "collab@example.com"}


# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def mock_collaborator_service() -> MagicMock:
    """Mock AllianceCollaboratorService with sensible defaults."""
    svc = MagicMock(spec=AllianceCollaboratorService)
    svc.add_collaborator_by_email = AsyncMock(return_value=MOCK_COLLABORATOR)
    svc.get_alliance_collaborators = AsyncMock(return_value=[MOCK_COLLABORATOR])
    svc.remove_collaborator = AsyncMock(return_value=None)
    svc.get_user_email = AsyncMock(return_value="current@example.com")
    svc.process_pending_invitations = AsyncMock(return_value=2)
    svc.update_collaborator_role = AsyncMock(return_value=MOCK_COLLABORATOR)
    return svc


@pytest.fixture
def mock_permission_service() -> MagicMock:
    """Mock PermissionService that grants 'owner' role by default."""
    svc = MagicMock(spec=PermissionService)
    svc.get_user_role = AsyncMock(return_value="owner")
    return svc


@pytest.fixture
def app(mock_collaborator_service: MagicMock, mock_permission_service: MagicMock) -> FastAPI:
    """Test app with alliance_collaborators router and all DI overrides."""
    test_app = FastAPI()
    test_app.include_router(router, prefix="/api/v1")
    test_app.dependency_overrides[get_alliance_collaborator_service] = (
        lambda: mock_collaborator_service
    )
    test_app.dependency_overrides[get_permission_service] = lambda: mock_permission_service
    test_app.dependency_overrides[get_current_user_id] = lambda: FIXED_USER_ID

    # Register global ValueError handler (matches main.py behavior)
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
    """Async HTTP client bound to the test app."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


# =============================================================================
# POST /alliances/{id}/collaborators — Add Collaborator
# =============================================================================


class TestAddAllianceCollaborator:
    """POST /api/v1/alliances/{alliance_id}/collaborators."""

    async def test_returns_201_on_success(self, client):
        """Should return 201 when collaborator is added successfully."""
        response = await client.post(
            f"/api/v1/alliances/{ALLIANCE_ID}/collaborators",
            json=VALID_ADD_REQUEST,
        )

        assert response.status_code == 201

    async def test_calls_service_with_correct_args(self, client, mock_collaborator_service):
        """Should call add_collaborator_by_email with current_user_id, alliance_id, and email."""
        await client.post(
            f"/api/v1/alliances/{ALLIANCE_ID}/collaborators",
            json=VALID_ADD_REQUEST,
        )

        mock_collaborator_service.add_collaborator_by_email.assert_awaited_once_with(
            current_user_id=FIXED_USER_ID,
            alliance_id=ALLIANCE_ID,
            email="collab@example.com",
        )

    async def test_returns_422_for_invalid_email(self, client):
        """Should return 422 when email is malformed."""
        response = await client.post(
            f"/api/v1/alliances/{ALLIANCE_ID}/collaborators",
            json={"email": "not-an-email"},
        )

        assert response.status_code == 422

    async def test_returns_422_when_email_missing(self, client):
        """Should return 422 when email field is absent."""
        response = await client.post(
            f"/api/v1/alliances/{ALLIANCE_ID}/collaborators",
            json={},
        )

        assert response.status_code == 422

    async def test_missing_auth_returns_403(self, app):
        """Should return 403 when no Authorization header is provided."""
        app.dependency_overrides.pop(get_current_user_id, None)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            response = await c.post(
                f"/api/v1/alliances/{ALLIANCE_ID}/collaborators",
                json=VALID_ADD_REQUEST,
            )

        assert response.status_code == 403


# =============================================================================
# GET /alliances/{id}/collaborators — List Collaborators
# =============================================================================


class TestGetAllianceCollaborators:
    """GET /api/v1/alliances/{alliance_id}/collaborators."""

    async def test_returns_200_with_collaborator_list(self, client):
        """Should return 200 and a list of collaborators."""
        response = await client.get(f"/api/v1/alliances/{ALLIANCE_ID}/collaborators")

        assert response.status_code == 200
        body = response.json()
        assert "collaborators" in body
        assert "total" in body

    async def test_total_matches_collaborator_count(self, client):
        """Should return total equal to number of collaborators."""
        response = await client.get(f"/api/v1/alliances/{ALLIANCE_ID}/collaborators")

        body = response.json()
        assert body["total"] == len(body["collaborators"])

    async def test_calls_service_with_user_and_alliance(self, client, mock_collaborator_service):
        """Should call get_alliance_collaborators with current_user_id and alliance_id."""
        await client.get(f"/api/v1/alliances/{ALLIANCE_ID}/collaborators")

        mock_collaborator_service.get_alliance_collaborators.assert_awaited_once_with(
            FIXED_USER_ID, ALLIANCE_ID
        )

    async def test_returns_empty_list_when_no_collaborators(
        self, client, mock_collaborator_service
    ):
        """Should return total=0 and empty list when no collaborators exist."""
        mock_collaborator_service.get_alliance_collaborators = AsyncMock(return_value=[])

        response = await client.get(f"/api/v1/alliances/{ALLIANCE_ID}/collaborators")

        body = response.json()
        assert body["total"] == 0
        assert body["collaborators"] == []

    async def test_missing_auth_returns_403(self, app):
        """Should return 403 when no Authorization header is provided."""
        app.dependency_overrides.pop(get_current_user_id, None)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            response = await c.get(f"/api/v1/alliances/{ALLIANCE_ID}/collaborators")

        assert response.status_code == 403


# =============================================================================
# DELETE /alliances/{id}/collaborators/{user_id} — Remove Collaborator
# =============================================================================


class TestRemoveAllianceCollaborator:
    """DELETE /api/v1/alliances/{alliance_id}/collaborators/{user_id}."""

    async def test_returns_204_on_success(self, client):
        """Should return 204 No Content on successful removal."""
        response = await client.delete(
            f"/api/v1/alliances/{ALLIANCE_ID}/collaborators/{TARGET_USER_ID}"
        )

        assert response.status_code == 204

    async def test_calls_service_remove_collaborator(self, client, mock_collaborator_service):
        """Should call remove_collaborator with the correct arguments."""
        await client.delete(f"/api/v1/alliances/{ALLIANCE_ID}/collaborators/{TARGET_USER_ID}")

        mock_collaborator_service.remove_collaborator.assert_awaited_once_with(
            FIXED_USER_ID, ALLIANCE_ID, TARGET_USER_ID
        )

    async def test_service_value_error_returns_400(self, client, mock_collaborator_service):
        """Should return 400 when service raises ValueError (e.g., removing self)."""
        mock_collaborator_service.remove_collaborator = AsyncMock(
            side_effect=ValueError("Cannot remove yourself from the alliance")
        )

        response = await client.delete(
            f"/api/v1/alliances/{ALLIANCE_ID}/collaborators/{TARGET_USER_ID}"
        )

        assert response.status_code == 400

    async def test_missing_auth_returns_403(self, app):
        """Should return 403 when no Authorization header is provided."""
        app.dependency_overrides.pop(get_current_user_id, None)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            response = await c.delete(
                f"/api/v1/alliances/{ALLIANCE_ID}/collaborators/{TARGET_USER_ID}"
            )

        assert response.status_code == 403


# =============================================================================
# POST /collaborators/process-invitations — Process Pending Invitations
# =============================================================================


class TestProcessPendingInvitations:
    """POST /api/v1/collaborators/process-invitations."""

    async def test_returns_200_with_processed_count(self, client):
        """Should return 200 with processed_count and message."""
        response = await client.post("/api/v1/collaborators/process-invitations")

        assert response.status_code == 200
        body = response.json()
        assert "processed_count" in body
        assert "message" in body

    async def test_processed_count_matches_service_return(self, client):
        """Should return the processed_count returned by the service."""
        response = await client.post("/api/v1/collaborators/process-invitations")

        body = response.json()
        assert body["processed_count"] == 2

    async def test_returns_zero_when_email_not_found(self, client, mock_collaborator_service):
        """Should return processed_count=0 when user email cannot be found."""
        mock_collaborator_service.get_user_email = AsyncMock(return_value=None)

        response = await client.post("/api/v1/collaborators/process-invitations")

        assert response.status_code == 200
        body = response.json()
        assert body["processed_count"] == 0

    async def test_missing_auth_returns_403(self, app):
        """Should return 403 when no Authorization header is provided."""
        app.dependency_overrides.pop(get_current_user_id, None)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            response = await c.post("/api/v1/collaborators/process-invitations")

        assert response.status_code == 403


# =============================================================================
# PATCH /alliances/{id}/collaborators/{user_id}/role — Update Role
# =============================================================================


class TestUpdateCollaboratorRole:
    """PATCH /api/v1/alliances/{alliance_id}/collaborators/{user_id}/role."""

    async def test_returns_200_on_success(self, client):
        """Should return 200 when role is updated successfully."""
        response = await client.patch(
            f"/api/v1/alliances/{ALLIANCE_ID}/collaborators/{TARGET_USER_ID}/role",
            params={"new_role": "collaborator"},
        )

        assert response.status_code == 200

    async def test_calls_service_update_collaborator_role(self, client, mock_collaborator_service):
        """Should call update_collaborator_role with correct arguments."""
        await client.patch(
            f"/api/v1/alliances/{ALLIANCE_ID}/collaborators/{TARGET_USER_ID}/role",
            params={"new_role": "collaborator"},
        )

        mock_collaborator_service.update_collaborator_role.assert_awaited_once_with(
            FIXED_USER_ID, ALLIANCE_ID, TARGET_USER_ID, "collaborator"
        )

    async def test_service_value_error_returns_400(self, client, mock_collaborator_service):
        """Should return 400 when service raises ValueError (e.g., invalid role)."""
        mock_collaborator_service.update_collaborator_role = AsyncMock(
            side_effect=ValueError("Invalid role: superadmin")
        )

        response = await client.patch(
            f"/api/v1/alliances/{ALLIANCE_ID}/collaborators/{TARGET_USER_ID}/role",
            params={"new_role": "superadmin"},
        )

        assert response.status_code == 400

    async def test_missing_auth_returns_403(self, app):
        """Should return 403 when no Authorization header is provided."""
        app.dependency_overrides.pop(get_current_user_id, None)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            response = await c.patch(
                f"/api/v1/alliances/{ALLIANCE_ID}/collaborators/{TARGET_USER_ID}/role",
                params={"new_role": "collaborator"},
            )

        assert response.status_code == 403


# =============================================================================
# GET /alliances/{id}/my-role — Get Current User Role
# =============================================================================


class TestGetMyRole:
    """GET /api/v1/alliances/{alliance_id}/my-role."""

    async def test_returns_200_with_role(self, client):
        """Should return 200 and a role field."""
        response = await client.get(f"/api/v1/alliances/{ALLIANCE_ID}/my-role")

        assert response.status_code == 200
        body = response.json()
        assert "role" in body
        assert body["role"] == "owner"

    async def test_calls_permission_service_get_user_role(self, client, mock_permission_service):
        """Should call permission_service.get_user_role with user_id and alliance_id."""
        await client.get(f"/api/v1/alliances/{ALLIANCE_ID}/my-role")

        mock_permission_service.get_user_role.assert_awaited_once_with(FIXED_USER_ID, ALLIANCE_ID)

    async def test_returns_collaborator_role(self, client, mock_permission_service):
        """Should return 'collaborator' when user is a collaborator."""
        mock_permission_service.get_user_role = AsyncMock(return_value="collaborator")

        response = await client.get(f"/api/v1/alliances/{ALLIANCE_ID}/my-role")

        assert response.status_code == 200
        assert response.json()["role"] == "collaborator"

    async def test_returns_400_when_role_is_none(self, client, mock_permission_service):
        """Should return 400 (via ValueError) when user has no role in the alliance."""
        mock_permission_service.get_user_role = AsyncMock(return_value=None)

        response = await client.get(f"/api/v1/alliances/{ALLIANCE_ID}/my-role")

        assert response.status_code == 400

    async def test_missing_auth_returns_403(self, app):
        """Should return 403 when no Authorization header is provided."""
        app.dependency_overrides.pop(get_current_user_id, None)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            response = await c.get(f"/api/v1/alliances/{ALLIANCE_ID}/my-role")

        assert response.status_code == 403
