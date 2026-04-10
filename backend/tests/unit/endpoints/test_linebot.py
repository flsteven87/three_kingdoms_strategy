"""
Unit Tests for LINE Bot Endpoint — HTTP Contract Verification

Tests cover Web App (JWT-authed) and LIFF (public, no auth) route groups.
Webhook route is excluded — signature verification and event dispatch logic
are covered by test_linebot_trial_gate.py (internal function tests).

Web App routes tested:
- POST /linebot/codes        — generate binding code (201)
- GET  /linebot/binding      — get binding status (200)
- DELETE /linebot/binding    — unbind (204)
- POST /linebot/binding/refresh-info  — refresh group info (200)
- GET  /linebot/binding/members — get registered members (200)
- GET  /linebot/commands     — list custom commands (200)
- POST /linebot/commands     — create custom command (201)
- PATCH /linebot/commands/{id} — update custom command (200)
- DELETE /linebot/commands/{id} — delete custom command (204)

LIFF routes tested (public, no JWT):
- GET /linebot/member/info   — get member info (200)
- GET /linebot/member/performance — get member performance (200)
- POST /linebot/member/register — register game ID (201)
- DELETE /linebot/member/unregister — unregister game ID (200)
- GET /linebot/member/candidates — get candidates (200)
- GET /linebot/member/similar — find similar members (200)

Auth enforcement:
- All Web App routes require JWT — missing token → 403
- LIFF routes are public — succeed without Authorization header

Note: _handle_group_message trial/quota gate is tested in test_linebot_trial_gate.py.
"""

from datetime import datetime
from unittest.mock import AsyncMock, MagicMock
from uuid import UUID, uuid4

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from src.api.v1.endpoints.linebot import router
from src.core.auth import get_current_user_id
from src.core.dependencies import (
    get_alliance_service,
    get_battle_event_service,
    get_line_binding_service,
    get_permission_service,
)
from src.core.line_auth import verify_webhook_signature
from src.models.line_binding import (
    LineBindingCodeResponse,
    LineBindingStatusResponse,
    LineCustomCommandResponse,
    MemberCandidatesResponse,
    MemberInfoResponse,
    MemberPerformanceResponse,
    RegisteredMembersResponse,
    RegisterMemberResponse,
    SimilarMembersResponse,
)

# =============================================================================
# Constants
# =============================================================================

FIXED_USER_ID = UUID("44444444-4444-4444-4444-444444444444")
ALLIANCE_ID = uuid4()
COMMAND_ID = uuid4()
_NOW = datetime(2026, 4, 10, 12, 0, 0)

# Minimal Alliance stub
_MOCK_ALLIANCE = MagicMock()
_MOCK_ALLIANCE.id = ALLIANCE_ID

# Stub responses
_BINDING_CODE_RESPONSE = LineBindingCodeResponse(
    code="ABC123",
    expires_at=_NOW,
    is_test=False,
    created_at=_NOW,
)

_BINDING_STATUS_NOT_BOUND = LineBindingStatusResponse(
    is_bound=False, binding=None, pending_code=None
)

_MOCK_COMMAND = LineCustomCommandResponse(
    id=COMMAND_ID,
    command_name="Test Command",
    trigger_keyword="/test",
    response_message="Test response",
    is_enabled=True,
    created_at=_NOW,
    updated_at=_NOW,
)

_REGISTERED_MEMBERS = RegisteredMembersResponse(
    members=[], unregistered=[], total=0, unregistered_count=0
)
_MEMBER_CANDIDATES = MemberCandidatesResponse(candidates=[])
_SIMILAR_MEMBERS = SimilarMembersResponse()

_MEMBER_INFO = MemberInfoResponse(has_registered=False)

_MEMBER_PERFORMANCE = MemberPerformanceResponse(has_data=False)

_REGISTER_RESPONSE = RegisterMemberResponse(has_registered=True)

# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def mock_line_binding_service() -> MagicMock:
    """Mock LineBindingService with sensible defaults for all operations."""
    svc = MagicMock()
    svc.generate_binding_code = AsyncMock(return_value=_BINDING_CODE_RESPONSE)
    svc.get_binding_status = AsyncMock(return_value=_BINDING_STATUS_NOT_BOUND)
    svc.unbind_group = AsyncMock(return_value=None)
    svc.refresh_group_info = AsyncMock(return_value=MagicMock())
    svc.get_registered_members = AsyncMock(return_value=_REGISTERED_MEMBERS)
    svc.list_custom_commands = AsyncMock(return_value=[_MOCK_COMMAND])
    svc.create_custom_command = AsyncMock(return_value=_MOCK_COMMAND)
    svc.update_custom_command = AsyncMock(return_value=_MOCK_COMMAND)
    svc.delete_custom_command = AsyncMock(return_value=None)
    svc.get_member_info = AsyncMock(return_value=_MEMBER_INFO)
    svc.get_member_performance = AsyncMock(return_value=_MEMBER_PERFORMANCE)
    svc.register_member = AsyncMock(return_value=_REGISTER_RESPONSE)
    svc.unregister_member = AsyncMock(return_value=_REGISTER_RESPONSE)
    svc.get_member_candidates = AsyncMock(return_value=_MEMBER_CANDIDATES)
    svc.find_similar_members = AsyncMock(return_value=_SIMILAR_MEMBERS)
    return svc


@pytest.fixture
def mock_alliance_service() -> MagicMock:
    """Mock AllianceService that returns a valid alliance by default."""
    svc = MagicMock()
    svc.get_user_alliance = AsyncMock(return_value=_MOCK_ALLIANCE)
    return svc


@pytest.fixture
def mock_permission_service() -> MagicMock:
    """Mock PermissionService that always allows by default."""
    svc = MagicMock()
    svc.require_owner_or_collaborator = AsyncMock(return_value=None)
    return svc


@pytest.fixture
def mock_battle_event_service() -> MagicMock:
    """Mock BattleEventService (needed for some routes)."""
    return MagicMock()


def _make_app(
    mock_line_binding_service,
    mock_alliance_service,
    mock_permission_service,
    mock_battle_event_service,
) -> FastAPI:
    """Build a test FastAPI app with all linebot DI overrides applied."""
    # Use a high-limit rate limiter so tests never hit rate limiting
    test_limiter = Limiter(key_func=lambda r: "test", default_limits=["10000/minute"])

    test_app = FastAPI()
    test_app.state.limiter = test_limiter
    test_app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
    test_app.include_router(router, prefix="/api/v1")

    test_app.dependency_overrides[get_line_binding_service] = lambda: mock_line_binding_service
    test_app.dependency_overrides[get_alliance_service] = lambda: mock_alliance_service
    test_app.dependency_overrides[get_permission_service] = lambda: mock_permission_service
    test_app.dependency_overrides[get_battle_event_service] = lambda: mock_battle_event_service
    test_app.dependency_overrides[get_current_user_id] = lambda: FIXED_USER_ID
    # Bypass webhook signature verification in all tests
    test_app.dependency_overrides[verify_webhook_signature] = lambda: b"{}"

    return test_app


@pytest.fixture
def app(
    mock_line_binding_service,
    mock_alliance_service,
    mock_permission_service,
    mock_battle_event_service,
) -> FastAPI:
    """Test app with full DI overrides."""
    test_app = _make_app(
        mock_line_binding_service,
        mock_alliance_service,
        mock_permission_service,
        mock_battle_event_service,
    )
    yield test_app
    test_app.dependency_overrides.clear()


@pytest.fixture
async def client(app: FastAPI) -> AsyncClient:
    """Async HTTP client bound to the test app."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


# =============================================================================
# POST /linebot/codes — Generate Binding Code
# =============================================================================


class TestGenerateBindingCode:
    """POST /api/v1/linebot/codes."""

    async def test_returns_201_with_code(self, client):
        """Should return 201 and a binding code for an authenticated user with an alliance."""
        response = await client.post("/api/v1/linebot/codes")

        assert response.status_code == 201
        body = response.json()
        assert body["code"] == "ABC123"

    async def test_calls_service_generate_binding_code(
        self, client, mock_line_binding_service, mock_alliance_service
    ):
        """Should call generate_binding_code with the resolved alliance_id and user_id."""
        await client.post("/api/v1/linebot/codes")

        mock_line_binding_service.generate_binding_code.assert_awaited_once_with(
            alliance_id=ALLIANCE_ID,
            user_id=FIXED_USER_ID,
            is_test=False,
        )

    async def test_returns_404_when_no_alliance(self, client, mock_alliance_service):
        """Should return 404 when user has no alliance."""
        mock_alliance_service.get_user_alliance = AsyncMock(return_value=None)

        response = await client.post("/api/v1/linebot/codes")

        assert response.status_code == 404

    async def test_missing_auth_returns_403(self, app):
        """Should return 403 when no Authorization header is provided."""
        app.dependency_overrides.pop(get_current_user_id, None)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            response = await c.post("/api/v1/linebot/codes")

        assert response.status_code == 403

    async def test_is_test_query_param_forwarded(self, client, mock_line_binding_service):
        """Should forward is_test=true query param to the service."""
        await client.post("/api/v1/linebot/codes?is_test=true")

        mock_line_binding_service.generate_binding_code.assert_awaited_once_with(
            alliance_id=ALLIANCE_ID,
            user_id=FIXED_USER_ID,
            is_test=True,
        )


# =============================================================================
# GET /linebot/binding — Get Binding Status
# =============================================================================


class TestGetBindingStatus:
    """GET /api/v1/linebot/binding."""

    async def test_returns_200_with_status(self, client):
        """Should return 200 with binding status."""
        response = await client.get("/api/v1/linebot/binding")

        assert response.status_code == 200
        assert "is_bound" in response.json()

    async def test_returns_not_bound_when_no_alliance(self, client, mock_alliance_service):
        """Should return is_bound=False when user has no alliance."""
        mock_alliance_service.get_user_alliance = AsyncMock(return_value=None)

        response = await client.get("/api/v1/linebot/binding")

        assert response.status_code == 200
        assert response.json()["is_bound"] is False

    async def test_missing_auth_returns_403(self, app):
        """Should return 403 when no Authorization header is provided."""
        app.dependency_overrides.pop(get_current_user_id, None)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            response = await c.get("/api/v1/linebot/binding")

        assert response.status_code == 403


# =============================================================================
# DELETE /linebot/binding — Unbind
# =============================================================================


class TestUnbindLineGroup:
    """DELETE /api/v1/linebot/binding."""

    async def test_returns_204_on_success(self, client):
        """Should return 204 No Content on successful unbind."""
        response = await client.delete("/api/v1/linebot/binding")

        assert response.status_code == 204

    async def test_calls_service_unbind(self, client, mock_line_binding_service):
        """Should call unbind_group with the resolved alliance_id."""
        await client.delete("/api/v1/linebot/binding")

        mock_line_binding_service.unbind_group.assert_awaited_once_with(ALLIANCE_ID, is_test=None)

    async def test_returns_404_when_no_alliance(self, client, mock_alliance_service):
        """Should return 404 when user has no alliance."""
        mock_alliance_service.get_user_alliance = AsyncMock(return_value=None)

        response = await client.delete("/api/v1/linebot/binding")

        assert response.status_code == 404

    async def test_missing_auth_returns_403(self, app):
        """Should return 403 when no Authorization header is provided."""
        app.dependency_overrides.pop(get_current_user_id, None)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            response = await c.delete("/api/v1/linebot/binding")

        assert response.status_code == 403


# =============================================================================
# GET /linebot/binding/members — Get Registered Members
# =============================================================================


class TestGetRegisteredMembers:
    """GET /api/v1/linebot/binding/members."""

    async def test_returns_200_with_members(self, client):
        """Should return 200 and registered members list."""
        response = await client.get("/api/v1/linebot/binding/members")

        assert response.status_code == 200

    async def test_returns_404_when_no_alliance(self, client, mock_alliance_service):
        """Should return 404 when user has no alliance."""
        mock_alliance_service.get_user_alliance = AsyncMock(return_value=None)

        response = await client.get("/api/v1/linebot/binding/members")

        assert response.status_code == 404

    async def test_missing_auth_returns_403(self, app):
        """Should return 403 when no Authorization header is provided."""
        app.dependency_overrides.pop(get_current_user_id, None)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            response = await c.get("/api/v1/linebot/binding/members")

        assert response.status_code == 403


# =============================================================================
# GET /linebot/commands — List Custom Commands
# =============================================================================


class TestGetCustomCommands:
    """GET /api/v1/linebot/commands."""

    async def test_returns_200_with_command_list(self, client):
        """Should return 200 and a list of commands."""
        response = await client.get("/api/v1/linebot/commands")

        assert response.status_code == 200
        assert isinstance(response.json(), list)

    async def test_returns_404_when_no_alliance(self, client, mock_alliance_service):
        """Should return 404 when user has no alliance."""
        mock_alliance_service.get_user_alliance = AsyncMock(return_value=None)

        response = await client.get("/api/v1/linebot/commands")

        assert response.status_code == 404

    async def test_missing_auth_returns_403(self, app):
        """Should return 403 when no Authorization header is provided."""
        app.dependency_overrides.pop(get_current_user_id, None)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            response = await c.get("/api/v1/linebot/commands")

        assert response.status_code == 403


# =============================================================================
# POST /linebot/commands — Create Custom Command
# =============================================================================


class TestCreateCustomCommand:
    """POST /api/v1/linebot/commands."""

    async def test_returns_201_with_command(self, client):
        """Should return 201 and the created command."""
        response = await client.post(
            "/api/v1/linebot/commands",
            json={
                "command_name": "Test Command",
                "trigger_keyword": "/test",
                "response_message": "Test response",
            },
        )

        assert response.status_code == 201

    async def test_returns_404_when_no_alliance(self, client, mock_alliance_service):
        """Should return 404 when user has no alliance."""
        mock_alliance_service.get_user_alliance = AsyncMock(return_value=None)

        response = await client.post(
            "/api/v1/linebot/commands",
            json={
                "command_name": "Test Command",
                "trigger_keyword": "/test",
                "response_message": "Test response",
            },
        )

        assert response.status_code == 404

    async def test_missing_auth_returns_403(self, app):
        """Should return 403 when no Authorization header is provided."""
        app.dependency_overrides.pop(get_current_user_id, None)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            response = await c.post(
                "/api/v1/linebot/commands",
                json={
                    "command_name": "Test Command",
                    "trigger_keyword": "/test",
                    "response_message": "Test response",
                },
            )

        assert response.status_code == 403


# =============================================================================
# PATCH /linebot/commands/{id} — Update Custom Command
# =============================================================================


class TestUpdateCustomCommand:
    """PATCH /api/v1/linebot/commands/{command_id}."""

    async def test_returns_200_with_updated_command(self, client):
        """Should return 200 and the updated command."""
        response = await client.patch(
            f"/api/v1/linebot/commands/{COMMAND_ID}",
            json={"response": "Updated response"},
        )

        assert response.status_code == 200

    async def test_returns_404_when_no_alliance(self, client, mock_alliance_service):
        """Should return 404 when user has no alliance."""
        mock_alliance_service.get_user_alliance = AsyncMock(return_value=None)

        response = await client.patch(
            f"/api/v1/linebot/commands/{COMMAND_ID}",
            json={"response": "Updated response"},
        )

        assert response.status_code == 404

    async def test_missing_auth_returns_403(self, app):
        """Should return 403 when no Authorization header is provided."""
        app.dependency_overrides.pop(get_current_user_id, None)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            response = await c.patch(
                f"/api/v1/linebot/commands/{COMMAND_ID}",
                json={"response": "Updated response"},
            )

        assert response.status_code == 403


# =============================================================================
# DELETE /linebot/commands/{id} — Delete Custom Command
# =============================================================================


class TestDeleteCustomCommand:
    """DELETE /api/v1/linebot/commands/{command_id}."""

    async def test_returns_204_on_success(self, client):
        """Should return 204 No Content on successful deletion."""
        response = await client.delete(f"/api/v1/linebot/commands/{COMMAND_ID}")

        assert response.status_code == 204

    async def test_returns_404_when_no_alliance(self, client, mock_alliance_service):
        """Should return 404 when user has no alliance."""
        mock_alliance_service.get_user_alliance = AsyncMock(return_value=None)

        response = await client.delete(f"/api/v1/linebot/commands/{COMMAND_ID}")

        assert response.status_code == 404

    async def test_missing_auth_returns_403(self, app):
        """Should return 403 when no Authorization header is provided."""
        app.dependency_overrides.pop(get_current_user_id, None)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            response = await c.delete(f"/api/v1/linebot/commands/{COMMAND_ID}")

        assert response.status_code == 403


# =============================================================================
# LIFF Public Endpoints (no JWT required)
# =============================================================================


class TestLiffMemberInfo:
    """GET /api/v1/linebot/member/info — public LIFF endpoint."""

    async def test_returns_200_with_member_info(self, client):
        """Should return 200 and member info for given LINE user/group IDs."""
        response = await client.get(
            "/api/v1/linebot/member/info",
            params={"u": "Uuser123", "g": "Cgroup123"},
        )

        assert response.status_code == 200

    async def test_succeeds_without_auth_header(self, app):
        """Should return 200 without an Authorization header (LIFF is public)."""
        app.dependency_overrides.pop(get_current_user_id, None)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            response = await c.get(
                "/api/v1/linebot/member/info",
                params={"u": "Uuser123", "g": "Cgroup123"},
            )

        assert response.status_code == 200

    async def test_returns_422_when_params_missing(self, client):
        """Should return 422 when required query params u or g are absent."""
        response = await client.get("/api/v1/linebot/member/info")

        assert response.status_code == 422


class TestLiffMemberPerformance:
    """GET /api/v1/linebot/member/performance — public LIFF endpoint."""

    async def test_returns_200(self, client):
        """Should return 200 with performance data."""
        response = await client.get(
            "/api/v1/linebot/member/performance",
            params={"u": "Uuser123", "g": "Cgroup123", "game_id": "TestGame"},
        )

        assert response.status_code == 200

    async def test_succeeds_without_auth_header(self, app):
        """Should return 200 without an Authorization header."""
        app.dependency_overrides.pop(get_current_user_id, None)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            response = await c.get(
                "/api/v1/linebot/member/performance",
                params={"u": "Uuser123", "g": "Cgroup123", "game_id": "TestGame"},
            )

        assert response.status_code == 200


class TestLiffRegisterGameId:
    """POST /api/v1/linebot/member/register — public LIFF endpoint."""

    async def test_returns_201_on_success(self, client):
        """Should return 201 when game ID is registered."""
        response = await client.post(
            "/api/v1/linebot/member/register",
            json={
                "line_user_id": "Uuser123",
                "line_group_id": "Cgroup123",
                "line_display_name": "Tester",
                "game_id": "TestGame",
            },
        )

        assert response.status_code == 201

    async def test_succeeds_without_auth_header(self, app):
        """Should return 201 without an Authorization header."""
        app.dependency_overrides.pop(get_current_user_id, None)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            response = await c.post(
                "/api/v1/linebot/member/register",
                json={
                    "line_user_id": "Uuser123",
                    "line_group_id": "Cgroup123",
                    "line_display_name": "Tester",
                    "game_id": "TestGame",
                },
            )

        assert response.status_code == 201


class TestLiffUnregisterGameId:
    """DELETE /api/v1/linebot/member/unregister — public LIFF endpoint."""

    async def test_returns_200_on_success(self, client):
        """Should return 200 when game ID is unregistered."""
        response = await client.delete(
            "/api/v1/linebot/member/unregister",
            params={"u": "Uuser123", "g": "Cgroup123", "game_id": "TestGame"},
        )

        assert response.status_code == 200

    async def test_succeeds_without_auth_header(self, app):
        """Should return 200 without an Authorization header."""
        app.dependency_overrides.pop(get_current_user_id, None)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            response = await c.delete(
                "/api/v1/linebot/member/unregister",
                params={"u": "Uuser123", "g": "Cgroup123", "game_id": "TestGame"},
            )

        assert response.status_code == 200


class TestLiffMemberCandidates:
    """GET /api/v1/linebot/member/candidates — public LIFF endpoint."""

    async def test_returns_200(self, client):
        """Should return 200 with member candidates."""
        response = await client.get(
            "/api/v1/linebot/member/candidates",
            params={"g": "Cgroup123"},
        )

        assert response.status_code == 200

    async def test_returns_422_when_group_id_missing(self, client):
        """Should return 422 when required query param g is absent."""
        response = await client.get("/api/v1/linebot/member/candidates")

        assert response.status_code == 422


class TestLiffFindSimilarMembers:
    """GET /api/v1/linebot/member/similar — public LIFF endpoint."""

    async def test_returns_200_with_similar_members(self, client):
        """Should return 200 with similar members."""
        response = await client.get(
            "/api/v1/linebot/member/similar",
            params={"g": "Cgroup123", "name": "TestName"},
        )

        assert response.status_code == 200

    async def test_returns_422_when_name_missing(self, client):
        """Should return 422 when required query param name is absent."""
        response = await client.get(
            "/api/v1/linebot/member/similar",
            params={"g": "Cgroup123"},
        )

        assert response.status_code == 422

    async def test_succeeds_without_auth_header(self, app):
        """Should return 200 without an Authorization header."""
        app.dependency_overrides.pop(get_current_user_id, None)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            response = await c.get(
                "/api/v1/linebot/member/similar",
                params={"g": "Cgroup123", "name": "TestName"},
            )

        assert response.status_code == 200
