"""
Unit Tests for Season API Endpoints

Tests verify HTTP contract only — service layer is mocked.
Coverage:
- GET /seasons              — list, auth required, query param
- GET /seasons/current      — current season, None response
- GET /seasons/{id}         — single fetch, 404 on ValueError, 403 on PermissionError
- POST /seasons             — create, 201, validation errors
- PATCH /seasons/{id}       — update, 403 on PermissionError
- DELETE /seasons/{id}      — 204, 400 on ValueError
- POST /seasons/{id}/activate   — 200, 402 on quota exhausted
- POST /seasons/{id}/set-current — 200
- POST /seasons/{id}/complete    — 200, 400 on wrong status
- POST /seasons/{id}/reopen      — 200

AAA pattern throughout. Service mocked via FastAPI dependency_overrides.
"""

from datetime import date, datetime
from unittest.mock import AsyncMock, MagicMock
from uuid import UUID

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from src.api.v1.endpoints.seasons import router
from src.core.auth import get_current_user_id
from src.core.dependencies import get_season_service
from src.core.exceptions import SeasonQuotaExhaustedError
from src.models.season import Season, SeasonActivateResponse
from src.services.season_service import SeasonService

# =============================================================================
# Constants & helpers
# =============================================================================

FIXED_USER_ID = UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
FIXED_ALLIANCE_ID = UUID("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb")
FIXED_SEASON_ID = UUID("cccccccc-cccc-cccc-cccc-cccccccccccc")

NOW = datetime(2026, 1, 1, 0, 0, 0)
TODAY = date(2026, 1, 1)


def _make_season(**overrides) -> Season:
    """Build a minimal Season instance for use in mock return values."""
    defaults = {
        "id": FIXED_SEASON_ID,
        "alliance_id": FIXED_ALLIANCE_ID,
        "name": "Test Season",
        "start_date": TODAY,
        "end_date": None,
        "is_current": False,
        "activation_status": "draft",
        "description": None,
        "game_season_tag": None,
        "is_trial": False,
        "activated_at": None,
        "created_at": NOW,
        "updated_at": NOW,
    }
    defaults.update(overrides)
    return Season(**defaults)


# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def mock_season_service() -> MagicMock:
    """Create a mock SeasonService for DI override."""
    svc = MagicMock(spec=SeasonService)
    svc.get_seasons = AsyncMock(return_value=[_make_season()])
    svc.get_current_season = AsyncMock(return_value=_make_season(is_current=True))
    svc.get_season = AsyncMock(return_value=_make_season())
    svc.create_season = AsyncMock(return_value=_make_season())
    svc.update_season = AsyncMock(return_value=_make_season())
    svc.delete_season = AsyncMock(return_value=None)
    svc.activate_season = AsyncMock(
        return_value=SeasonActivateResponse(
            success=True,
            season=_make_season(activation_status="activated"),
            remaining_seasons=2,
            used_trial=False,
            trial_ends_at=None,
        )
    )
    svc.set_current_season = AsyncMock(return_value=_make_season(is_current=True))
    svc.complete_season = AsyncMock(return_value=_make_season(activation_status="completed"))
    svc.reopen_season = AsyncMock(return_value=_make_season(activation_status="activated"))
    return svc


@pytest.fixture
def app(mock_season_service: MagicMock) -> FastAPI:
    """Create test FastAPI app with season router, DI overrides, and global exception handlers."""
    from fastapi import Request, status
    from fastapi.responses import JSONResponse

    test_app = FastAPI()
    test_app.include_router(router, prefix="/api/v1")

    # Override service and auth dependencies
    test_app.dependency_overrides[get_season_service] = lambda: mock_season_service
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

    @test_app.exception_handler(SeasonQuotaExhaustedError)
    async def season_quota_handler(
        request: Request, exc: SeasonQuotaExhaustedError
    ) -> JSONResponse:
        return JSONResponse(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            content={"detail": exc.message, "error_code": exc.error_code},
        )

    yield test_app
    test_app.dependency_overrides.clear()


@pytest.fixture
async def client(app: FastAPI):
    """Async HTTP client wired to the test app."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


# =============================================================================
# GET /seasons
# =============================================================================


class TestGetSeasons:
    """Tests for GET /api/v1/seasons"""

    async def test_returns_list_of_seasons(self, client, mock_season_service):
        """Should return 200 with a list of seasons."""
        response = await client.get("/api/v1/seasons")

        assert response.status_code == 200
        body = response.json()
        assert isinstance(body, list)
        assert len(body) == 1
        assert body[0]["id"] == str(FIXED_SEASON_ID)

    async def test_passes_activated_only_false_by_default(self, client, mock_season_service):
        """Should call service with activated_only=False when query param is omitted."""
        await client.get("/api/v1/seasons")

        mock_season_service.get_seasons.assert_awaited_once_with(
            FIXED_USER_ID, activated_only=False
        )

    async def test_passes_activated_only_true_when_set(self, client, mock_season_service):
        """Should forward activated_only=True query param to service."""
        await client.get("/api/v1/seasons?activated_only=true")

        mock_season_service.get_seasons.assert_awaited_once_with(FIXED_USER_ID, activated_only=True)

    async def test_requires_auth(self, app: FastAPI):
        """Should return 403/401 when auth dependency is not overridden."""
        # Remove the auth override to let the real bearer scheme fire
        app.dependency_overrides.pop(get_current_user_id, None)
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            response = await c.get("/api/v1/seasons")
        assert response.status_code == 403

    async def test_returns_400_on_value_error(self, client, mock_season_service):
        """Should return 400 when service raises ValueError."""
        mock_season_service.get_seasons = AsyncMock(side_effect=ValueError("no alliance"))

        response = await client.get("/api/v1/seasons")

        assert response.status_code == 400
        assert "no alliance" in response.json()["detail"]


# =============================================================================
# GET /seasons/current
# =============================================================================


class TestGetCurrentSeason:
    """Tests for GET /api/v1/seasons/current"""

    async def test_returns_current_season(self, client, mock_season_service):
        """Should return 200 with the current season."""
        response = await client.get("/api/v1/seasons/current")

        assert response.status_code == 200
        assert response.json()["is_current"] is True

    async def test_returns_null_when_no_current_season(self, client, mock_season_service):
        """Should return 200 with null body when no current season exists."""
        mock_season_service.get_current_season = AsyncMock(return_value=None)

        response = await client.get("/api/v1/seasons/current")

        assert response.status_code == 200
        assert response.json() is None

    async def test_returns_400_on_value_error(self, client, mock_season_service):
        """Should return 400 when service raises ValueError."""
        mock_season_service.get_current_season = AsyncMock(side_effect=ValueError("no alliance"))

        response = await client.get("/api/v1/seasons/current")

        assert response.status_code == 400


# =============================================================================
# GET /seasons/{season_id}
# =============================================================================


class TestGetSeason:
    """Tests for GET /api/v1/seasons/{season_id}"""

    async def test_returns_season(self, client, mock_season_service):
        """Should return 200 with the requested season."""
        response = await client.get(f"/api/v1/seasons/{FIXED_SEASON_ID}")

        assert response.status_code == 200
        assert response.json()["id"] == str(FIXED_SEASON_ID)

    async def test_calls_service_with_correct_ids(self, client, mock_season_service):
        """Should call service with user_id from token and season_id from path."""
        await client.get(f"/api/v1/seasons/{FIXED_SEASON_ID}")

        mock_season_service.get_season.assert_awaited_once_with(FIXED_USER_ID, FIXED_SEASON_ID)

    async def test_returns_400_when_season_not_found(self, client, mock_season_service):
        """Should return 400 when service raises ValueError for missing season."""
        mock_season_service.get_season = AsyncMock(side_effect=ValueError("season not found"))

        response = await client.get(f"/api/v1/seasons/{FIXED_SEASON_ID}")

        assert response.status_code == 400

    async def test_returns_403_on_permission_error(self, client, mock_season_service):
        """Should return 403 when user does not own the season."""
        mock_season_service.get_season = AsyncMock(side_effect=PermissionError("forbidden"))

        response = await client.get(f"/api/v1/seasons/{FIXED_SEASON_ID}")

        assert response.status_code == 403

    async def test_returns_422_for_invalid_uuid(self, client):
        """Should return 422 when season_id is not a valid UUID."""
        response = await client.get("/api/v1/seasons/not-a-uuid")

        assert response.status_code == 422


# =============================================================================
# POST /seasons
# =============================================================================


class TestCreateSeason:
    """Tests for POST /api/v1/seasons"""

    @pytest.fixture
    def valid_payload(self) -> dict:
        return {
            "alliance_id": str(FIXED_ALLIANCE_ID),
            "name": "New Season",
            "start_date": "2026-01-01",
        }

    async def test_creates_season_and_returns_201(self, client, mock_season_service, valid_payload):
        """Should return 201 with the created season."""
        response = await client.post("/api/v1/seasons", json=valid_payload)

        assert response.status_code == 201
        assert response.json()["name"] == "Test Season"  # mock always returns _make_season()

    async def test_delegates_to_service(self, client, mock_season_service, valid_payload):
        """Should call service.create_season with user_id from JWT."""
        await client.post("/api/v1/seasons", json=valid_payload)

        mock_season_service.create_season.assert_awaited_once()
        call_user_id = mock_season_service.create_season.call_args.args[0]
        assert call_user_id == FIXED_USER_ID

    async def test_returns_422_when_name_missing(self, client, valid_payload):
        """Should return 422 when required field name is absent."""
        del valid_payload["name"]
        response = await client.post("/api/v1/seasons", json=valid_payload)

        assert response.status_code == 422

    async def test_returns_422_when_start_date_missing(self, client, valid_payload):
        """Should return 422 when required field start_date is absent."""
        del valid_payload["start_date"]
        response = await client.post("/api/v1/seasons", json=valid_payload)

        assert response.status_code == 422

    async def test_returns_422_when_end_date_before_start_date(self, client, valid_payload):
        """Should return 422 when end_date precedes start_date."""
        valid_payload["end_date"] = "2025-12-31"  # before start_date 2026-01-01
        response = await client.post("/api/v1/seasons", json=valid_payload)

        assert response.status_code == 422

    async def test_returns_400_on_value_error(self, client, mock_season_service, valid_payload):
        """Should return 400 when service raises ValueError."""
        mock_season_service.create_season = AsyncMock(side_effect=ValueError("alliance mismatch"))

        response = await client.post("/api/v1/seasons", json=valid_payload)

        assert response.status_code == 400

    async def test_returns_403_on_permission_error(
        self, client, mock_season_service, valid_payload
    ):
        """Should return 403 when user lacks permission."""
        mock_season_service.create_season = AsyncMock(side_effect=PermissionError("forbidden"))

        response = await client.post("/api/v1/seasons", json=valid_payload)

        assert response.status_code == 403


# =============================================================================
# PATCH /seasons/{season_id}
# =============================================================================


class TestUpdateSeason:
    """Tests for PATCH /api/v1/seasons/{season_id}"""

    async def test_updates_season_and_returns_200(self, client, mock_season_service):
        """Should return 200 with the updated season."""
        response = await client.patch(
            f"/api/v1/seasons/{FIXED_SEASON_ID}",
            json={"name": "Updated Name"},
        )

        assert response.status_code == 200

    async def test_calls_service_with_correct_args(self, client, mock_season_service):
        """Should call service with user_id, season_id, and update data."""
        await client.patch(
            f"/api/v1/seasons/{FIXED_SEASON_ID}",
            json={"name": "Updated Name"},
        )

        mock_season_service.update_season.assert_awaited_once()
        args = mock_season_service.update_season.call_args.args
        assert args[0] == FIXED_USER_ID
        assert args[1] == FIXED_SEASON_ID

    async def test_returns_403_on_permission_error(self, client, mock_season_service):
        """Should return 403 when user does not own the season."""
        mock_season_service.update_season = AsyncMock(side_effect=PermissionError("forbidden"))

        response = await client.patch(
            f"/api/v1/seasons/{FIXED_SEASON_ID}",
            json={"name": "X"},
        )

        assert response.status_code == 403

    async def test_returns_400_on_value_error(self, client, mock_season_service):
        """Should return 400 when service raises ValueError."""
        mock_season_service.update_season = AsyncMock(side_effect=ValueError("not found"))

        response = await client.patch(
            f"/api/v1/seasons/{FIXED_SEASON_ID}",
            json={"name": "X"},
        )

        assert response.status_code == 400


# =============================================================================
# DELETE /seasons/{season_id}
# =============================================================================


class TestDeleteSeason:
    """Tests for DELETE /api/v1/seasons/{season_id}"""

    async def test_deletes_season_and_returns_204(self, client, mock_season_service):
        """Should return 204 with empty body on success."""
        response = await client.delete(f"/api/v1/seasons/{FIXED_SEASON_ID}")

        assert response.status_code == 204
        assert response.content == b""

    async def test_calls_service_with_correct_ids(self, client, mock_season_service):
        """Should call service with user_id and season_id."""
        await client.delete(f"/api/v1/seasons/{FIXED_SEASON_ID}")

        mock_season_service.delete_season.assert_awaited_once_with(FIXED_USER_ID, FIXED_SEASON_ID)

    async def test_returns_400_on_value_error(self, client, mock_season_service):
        """Should return 400 when service raises ValueError."""
        mock_season_service.delete_season = AsyncMock(side_effect=ValueError("not found"))

        response = await client.delete(f"/api/v1/seasons/{FIXED_SEASON_ID}")

        assert response.status_code == 400

    async def test_returns_403_on_permission_error(self, client, mock_season_service):
        """Should return 403 when user lacks permission."""
        mock_season_service.delete_season = AsyncMock(side_effect=PermissionError("forbidden"))

        response = await client.delete(f"/api/v1/seasons/{FIXED_SEASON_ID}")

        assert response.status_code == 403


# =============================================================================
# POST /seasons/{season_id}/activate
# =============================================================================


class TestActivateSeason:
    """Tests for POST /api/v1/seasons/{season_id}/activate"""

    async def test_activates_season_and_returns_200(self, client, mock_season_service):
        """Should return 200 with SeasonActivateResponse on success."""
        response = await client.post(f"/api/v1/seasons/{FIXED_SEASON_ID}/activate")

        assert response.status_code == 200
        body = response.json()
        assert body["success"] is True
        assert body["season"]["activation_status"] == "activated"
        assert "remaining_seasons" in body

    async def test_calls_service_with_correct_ids(self, client, mock_season_service):
        """Should call service with user_id and season_id."""
        await client.post(f"/api/v1/seasons/{FIXED_SEASON_ID}/activate")

        mock_season_service.activate_season.assert_awaited_once_with(FIXED_USER_ID, FIXED_SEASON_ID)

    async def test_returns_402_on_quota_exhausted(self, client, mock_season_service):
        """Should return 402 when no season credits remain."""
        mock_season_service.activate_season = AsyncMock(side_effect=SeasonQuotaExhaustedError())

        response = await client.post(f"/api/v1/seasons/{FIXED_SEASON_ID}/activate")

        assert response.status_code == 402
        body = response.json()
        assert body["error_code"] == "SEASON_QUOTA_EXHAUSTED"

    async def test_returns_400_when_not_draft(self, client, mock_season_service):
        """Should return 400 when season is not in draft status."""
        mock_season_service.activate_season = AsyncMock(
            side_effect=ValueError("season is not in draft status")
        )

        response = await client.post(f"/api/v1/seasons/{FIXED_SEASON_ID}/activate")

        assert response.status_code == 400

    async def test_returns_403_on_permission_error(self, client, mock_season_service):
        """Should return 403 when user does not own the season."""
        mock_season_service.activate_season = AsyncMock(side_effect=PermissionError("forbidden"))

        response = await client.post(f"/api/v1/seasons/{FIXED_SEASON_ID}/activate")

        assert response.status_code == 403


# =============================================================================
# POST /seasons/{season_id}/set-current
# =============================================================================


class TestSetCurrentSeason:
    """Tests for POST /api/v1/seasons/{season_id}/set-current"""

    async def test_sets_current_and_returns_200(self, client, mock_season_service):
        """Should return 200 with the updated season."""
        response = await client.post(f"/api/v1/seasons/{FIXED_SEASON_ID}/set-current")

        assert response.status_code == 200
        assert response.json()["is_current"] is True

    async def test_returns_400_when_season_is_draft(self, client, mock_season_service):
        """Should return 400 when trying to set a draft season as current."""
        mock_season_service.set_current_season = AsyncMock(
            side_effect=ValueError("cannot set draft season as current")
        )

        response = await client.post(f"/api/v1/seasons/{FIXED_SEASON_ID}/set-current")

        assert response.status_code == 400

    async def test_returns_403_on_permission_error(self, client, mock_season_service):
        """Should return 403 when user does not own the season."""
        mock_season_service.set_current_season = AsyncMock(side_effect=PermissionError("forbidden"))

        response = await client.post(f"/api/v1/seasons/{FIXED_SEASON_ID}/set-current")

        assert response.status_code == 403


# =============================================================================
# POST /seasons/{season_id}/complete
# =============================================================================


class TestCompleteSeason:
    """Tests for POST /api/v1/seasons/{season_id}/complete"""

    async def test_completes_season_and_returns_200(self, client, mock_season_service):
        """Should return 200 with completed season."""
        response = await client.post(f"/api/v1/seasons/{FIXED_SEASON_ID}/complete")

        assert response.status_code == 200
        assert response.json()["activation_status"] == "completed"

    async def test_returns_400_when_not_activated(self, client, mock_season_service):
        """Should return 400 when season is not in activated status."""
        mock_season_service.complete_season = AsyncMock(
            side_effect=ValueError("season is not activated")
        )

        response = await client.post(f"/api/v1/seasons/{FIXED_SEASON_ID}/complete")

        assert response.status_code == 400

    async def test_returns_403_on_permission_error(self, client, mock_season_service):
        """Should return 403 when user does not own the season."""
        mock_season_service.complete_season = AsyncMock(side_effect=PermissionError("forbidden"))

        response = await client.post(f"/api/v1/seasons/{FIXED_SEASON_ID}/complete")

        assert response.status_code == 403


# =============================================================================
# POST /seasons/{season_id}/reopen
# =============================================================================


class TestReopenSeason:
    """Tests for POST /api/v1/seasons/{season_id}/reopen"""

    async def test_reopens_season_and_returns_200(self, client, mock_season_service):
        """Should return 200 with the reopened season."""
        response = await client.post(f"/api/v1/seasons/{FIXED_SEASON_ID}/reopen")

        assert response.status_code == 200
        assert response.json()["activation_status"] == "activated"

    async def test_returns_400_when_not_completed(self, client, mock_season_service):
        """Should return 400 when season is not in completed status."""
        mock_season_service.reopen_season = AsyncMock(
            side_effect=ValueError("season is not completed")
        )

        response = await client.post(f"/api/v1/seasons/{FIXED_SEASON_ID}/reopen")

        assert response.status_code == 400

    async def test_returns_403_on_permission_error(self, client, mock_season_service):
        """Should return 403 when user does not own the season."""
        mock_season_service.reopen_season = AsyncMock(side_effect=PermissionError("forbidden"))

        response = await client.post(f"/api/v1/seasons/{FIXED_SEASON_ID}/reopen")

        assert response.status_code == 403
