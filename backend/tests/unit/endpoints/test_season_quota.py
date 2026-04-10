"""
Unit Tests for Season Quota Endpoint — HTTP Contract Verification

Tests cover:
1. GET /api/v1/season-quota happy path (200 + SeasonQuotaStatus response shape)
2. Auth required — missing/invalid bearer token → 403/401
3. Service delegation — get_quota_status() called with correct user_id
4. Service raises ValueError → 400 (global exception handler)
"""

from unittest.mock import AsyncMock, MagicMock
from uuid import UUID

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from src.api.v1.endpoints.season_quota import router
from src.core.auth import get_current_user_id
from src.core.dependencies import get_season_quota_service
from src.models.alliance import SeasonQuotaStatus
from src.services.season_quota_service import SeasonQuotaService

# =============================================================================
# Constants
# =============================================================================

FIXED_USER_ID = UUID("22222222-2222-2222-2222-222222222222")

QUOTA_STATUS_PAYLOAD = SeasonQuotaStatus(
    purchased_seasons=3,
    used_seasons=1,
    available_seasons=2,
    has_trial_available=False,
    current_season_is_trial=False,
    trial_days_remaining=None,
    trial_ends_at=None,
    can_activate_season=True,
    can_write=True,
)


# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def mock_quota_service() -> MagicMock:
    """Mock SeasonQuotaService that returns a quota status by default."""
    svc = MagicMock(spec=SeasonQuotaService)
    svc.get_quota_status = AsyncMock(return_value=QUOTA_STATUS_PAYLOAD)
    return svc


@pytest.fixture
def app(mock_quota_service: MagicMock) -> FastAPI:
    """Test app with season_quota router and DI overrides for service + auth."""
    test_app = FastAPI()
    test_app.include_router(router, prefix="/api/v1")
    test_app.dependency_overrides[get_season_quota_service] = lambda: mock_quota_service
    test_app.dependency_overrides[get_current_user_id] = lambda: FIXED_USER_ID
    yield test_app
    test_app.dependency_overrides.clear()


@pytest.fixture
async def client(app: FastAPI) -> AsyncClient:
    """Async HTTP client bound to the test app."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


# =============================================================================
# Happy Path
# =============================================================================


class TestGetSeasonQuotaStatusHappyPath:
    """Successful quota status retrieval."""

    async def test_returns_200(self, client):
        """Should return 200 for authenticated request."""
        response = await client.get("/api/v1/season-quota")

        assert response.status_code == 200

    async def test_response_contains_required_fields(self, client):
        """Should return all SeasonQuotaStatus fields in the response body."""
        response = await client.get("/api/v1/season-quota")

        body = response.json()
        assert "purchased_seasons" in body
        assert "used_seasons" in body
        assert "available_seasons" in body
        assert "has_trial_available" in body
        assert "current_season_is_trial" in body
        assert "can_activate_season" in body
        assert "can_write" in body

    async def test_response_values_match_service_return(self, client):
        """Should forward service return value to client unchanged."""
        response = await client.get("/api/v1/season-quota")

        body = response.json()
        assert body["purchased_seasons"] == 3
        assert body["used_seasons"] == 1
        assert body["available_seasons"] == 2
        assert body["can_activate_season"] is True
        assert body["can_write"] is True

    async def test_calls_service_with_user_id(self, client, mock_quota_service):
        """Should call service.get_quota_status() with the authenticated user's UUID."""
        await client.get("/api/v1/season-quota")

        mock_quota_service.get_quota_status.assert_awaited_once_with(FIXED_USER_ID)

    async def test_trial_fields_present_when_none(self, client):
        """Should include trial_days_remaining and trial_ends_at even when None."""
        response = await client.get("/api/v1/season-quota")

        body = response.json()
        assert "trial_days_remaining" in body
        assert "trial_ends_at" in body

    async def test_response_with_active_trial(self, client, mock_quota_service):
        """Should correctly return trial information when trial is active."""
        mock_quota_service.get_quota_status = AsyncMock(
            return_value=SeasonQuotaStatus(
                purchased_seasons=0,
                used_seasons=0,
                available_seasons=0,
                has_trial_available=False,
                current_season_is_trial=True,
                trial_days_remaining=7,
                trial_ends_at="2026-04-17",
                can_activate_season=False,
                can_write=True,
            )
        )

        response = await client.get("/api/v1/season-quota")

        body = response.json()
        assert body["current_season_is_trial"] is True
        assert body["trial_days_remaining"] == 7
        assert body["trial_ends_at"] == "2026-04-17"


# =============================================================================
# Authentication
# =============================================================================


class TestGetSeasonQuotaStatusAuth:
    """Authentication enforcement."""

    async def test_missing_bearer_token_returns_403(self, app):
        """Should return 403 when no Authorization header is provided."""
        app.dependency_overrides.pop(get_current_user_id, None)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            response = await c.get("/api/v1/season-quota")

        assert response.status_code == 403

    async def test_invalid_bearer_token_returns_401_or_403(self, app):
        """Should return 401/403 for a malformed JWT token."""
        app.dependency_overrides.pop(get_current_user_id, None)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            response = await c.get(
                "/api/v1/season-quota",
                headers={"Authorization": "Bearer not.a.real.jwt"},
            )

        assert response.status_code in (401, 403)


# =============================================================================
# Service Error Handling
# =============================================================================


class TestGetSeasonQuotaStatusServiceErrors:
    """Error propagation from SeasonQuotaService."""

    async def test_service_value_error_returns_400(self, client, mock_quota_service, app):
        """Should return 400 when service raises ValueError (global exception handler)."""
        # Register the global ValueError handler that main.py normally provides
        from fastapi import Request, status
        from fastapi.responses import JSONResponse

        @app.exception_handler(ValueError)
        async def value_error_handler(request: Request, exc: ValueError) -> JSONResponse:
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content={"detail": str(exc)},
            )

        mock_quota_service.get_quota_status = AsyncMock(
            side_effect=ValueError("Alliance not found")
        )

        response = await client.get("/api/v1/season-quota")

        assert response.status_code == 400
        assert "Alliance not found" in response.json()["detail"]
