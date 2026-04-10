"""
Unit Tests for Hegemony Weights Endpoint — HTTP Contract Verification

Tests cover:
1. GET /api/v1/hegemony-weights — list weights for a season
2. POST /api/v1/hegemony-weights — create weight
3. POST /api/v1/hegemony-weights/initialize — initialize season weights
4. GET /api/v1/hegemony-weights/summary — get weights summary
5. GET /api/v1/hegemony-weights/preview — preview hegemony scores
6. PATCH /api/v1/hegemony-weights/{weight_id} — update weight
7. DELETE /api/v1/hegemony-weights/{weight_id} — delete weight
8. Auth required (missing token → 403)
9. PermissionError → 403, ValueError → 400

Following test-writing conventions:
- AAA pattern (Arrange-Act-Assert)
- DI overrides for HegemonyWeightService and UserIdDep
- Exception handlers mirrored from main.py
- No business logic tested — only HTTP contract
"""

from datetime import UTC, datetime
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock
from uuid import UUID

import pytest
from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse
from httpx import ASGITransport, AsyncClient

from src.api.v1.endpoints.hegemony_weights import router
from src.core.auth import get_current_user_id
from src.core.dependencies import get_hegemony_weight_service
from src.models.hegemony_weight import (
    HegemonyScorePreview,
    HegemonyWeight,
    HegemonyWeightWithSnapshot,
    SnapshotWeightsSummary,
)
from src.services.hegemony_weight_service import HegemonyWeightService

# =============================================================================
# Constants
# =============================================================================

FIXED_USER_ID = UUID("11111111-1111-1111-1111-111111111111")
FIXED_SEASON_ID = UUID("22222222-2222-2222-2222-222222222222")
FIXED_WEIGHT_ID = UUID("33333333-3333-3333-3333-333333333333")
FIXED_ALLIANCE_ID = UUID("44444444-4444-4444-4444-444444444444")
FIXED_UPLOAD_ID = UUID("55555555-5555-5555-5555-555555555555")

_NOW = datetime(2025, 1, 1, 0, 0, 0, tzinfo=UTC)

SAMPLE_WEIGHT = HegemonyWeight(
    id=FIXED_WEIGHT_ID,
    alliance_id=FIXED_ALLIANCE_ID,
    season_id=FIXED_SEASON_ID,
    csv_upload_id=FIXED_UPLOAD_ID,
    weight_contribution=Decimal("0.4000"),
    weight_merit=Decimal("0.3000"),
    weight_assist=Decimal("0.2000"),
    weight_donation=Decimal("0.1000"),
    snapshot_weight=Decimal("1.0000"),
    created_at=_NOW,
    updated_at=_NOW,
)

SAMPLE_WEIGHT_WITH_SNAPSHOT = HegemonyWeightWithSnapshot(
    **SAMPLE_WEIGHT.model_dump(),
    snapshot_date=_NOW,
    snapshot_filename="test.csv",
    total_members=10,
)

SAMPLE_SUMMARY = SnapshotWeightsSummary(
    season_id=FIXED_SEASON_ID,
    season_name="Season 1",
    total_snapshots=1,
    total_weight_sum=Decimal("1.0000"),
    is_valid=True,
    weights=[SAMPLE_WEIGHT_WITH_SNAPSHOT],
)

SAMPLE_PREVIEW = HegemonyScorePreview(
    member_id=UUID("66666666-6666-6666-6666-666666666666"),
    member_name="曹操",
    final_score=Decimal("95.50"),
    rank=1,
    snapshot_scores={},
)

VALID_CREATE_BODY = {
    "csv_upload_id": str(FIXED_UPLOAD_ID),
    "weight_contribution": "0.4000",
    "weight_merit": "0.3000",
    "weight_assist": "0.2000",
    "weight_donation": "0.1000",
    "snapshot_weight": "1.0000",
}

VALID_UPDATE_BODY = {
    "weight_contribution": "0.5000",
    "weight_merit": "0.2000",
    "weight_assist": "0.2000",
    "weight_donation": "0.1000",
}


# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def mock_service() -> MagicMock:
    """Mock HegemonyWeightService with sensible defaults."""
    svc = MagicMock(spec=HegemonyWeightService)
    svc.get_season_weights = AsyncMock(return_value=[SAMPLE_WEIGHT_WITH_SNAPSHOT])
    svc.create_weight = AsyncMock(return_value=SAMPLE_WEIGHT)
    svc.initialize_weights_for_season = AsyncMock(return_value=[SAMPLE_WEIGHT])
    svc.get_weights_summary = AsyncMock(return_value=SAMPLE_SUMMARY)
    svc.calculate_hegemony_scores = AsyncMock(return_value=[SAMPLE_PREVIEW])
    svc.update_weight = AsyncMock(return_value=SAMPLE_WEIGHT)
    svc.delete_weight = AsyncMock(return_value=None)
    return svc


@pytest.fixture
def app(mock_service: MagicMock) -> FastAPI:
    """Test app with hegemony-weights router and DI overrides."""
    test_app = FastAPI(redirect_slashes=False)
    test_app.include_router(router, prefix="/api/v1")
    test_app.dependency_overrides[get_hegemony_weight_service] = lambda: mock_service
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
# GET /hegemony-weights — List Season Weights
# =============================================================================


class TestGetSeasonWeights:
    """GET /api/v1/hegemony-weights"""

    async def test_returns_200_with_weights_list(self, client, mock_service):
        """Should return 200 and list of weights for a valid season."""
        response = await client.get(
            "/api/v1/hegemony-weights", params={"season_id": str(FIXED_SEASON_ID)}
        )

        assert response.status_code == 200
        body = response.json()
        assert isinstance(body, list)
        assert len(body) == 1

    async def test_calls_service_with_correct_args(self, client, mock_service):
        """Should forward user_id and season_id to the service."""
        await client.get("/api/v1/hegemony-weights", params={"season_id": str(FIXED_SEASON_ID)})

        mock_service.get_season_weights.assert_awaited_once_with(FIXED_USER_ID, FIXED_SEASON_ID)

    async def test_requires_season_id_query_param(self, client):
        """Should return 422 when season_id query param is missing."""
        response = await client.get("/api/v1/hegemony-weights")
        assert response.status_code == 422

    async def test_missing_auth_returns_403(self, app):
        """Should return 403 when Authorization header is absent."""
        app.dependency_overrides.pop(get_current_user_id, None)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            response = await c.get(
                "/api/v1/hegemony-weights", params={"season_id": str(FIXED_SEASON_ID)}
            )

        assert response.status_code == 403

    async def test_permission_error_returns_403(self, client, mock_service):
        """Should return 403 when service raises PermissionError."""
        mock_service.get_season_weights = AsyncMock(side_effect=PermissionError("no access"))

        response = await client.get(
            "/api/v1/hegemony-weights", params={"season_id": str(FIXED_SEASON_ID)}
        )

        assert response.status_code == 403


# =============================================================================
# POST /hegemony-weights — Create Weight
# =============================================================================


class TestCreateWeight:
    """POST /api/v1/hegemony-weights"""

    async def test_returns_201_with_created_weight(self, client, mock_service):
        """Should return 201 and the created weight for a valid request."""
        response = await client.post(
            "/api/v1/hegemony-weights",
            json=VALID_CREATE_BODY,
            params={"season_id": str(FIXED_SEASON_ID)},
        )

        assert response.status_code == 201
        body = response.json()
        assert body["id"] == str(FIXED_WEIGHT_ID)

    async def test_calls_service_with_correct_args(self, client, mock_service):
        """Should forward user_id, season_id, and data to the service."""
        await client.post(
            "/api/v1/hegemony-weights",
            json=VALID_CREATE_BODY,
            params={"season_id": str(FIXED_SEASON_ID)},
        )

        mock_service.create_weight.assert_awaited_once()
        call_args = mock_service.create_weight.await_args
        assert call_args.args[0] == FIXED_USER_ID
        assert call_args.args[1] == FIXED_SEASON_ID

    async def test_returns_400_when_weights_do_not_sum_to_one(self, client):
        """Should return 400 when tier 1 indicator weights do not sum to 1.0."""
        invalid_body = {
            **VALID_CREATE_BODY,
            "weight_contribution": "0.5000",
            "weight_merit": "0.5000",
            "weight_assist": "0.5000",
            "weight_donation": "0.5000",
        }
        response = await client.post(
            "/api/v1/hegemony-weights",
            json=invalid_body,
            params={"season_id": str(FIXED_SEASON_ID)},
        )

        assert response.status_code == 400
        assert "weights" in response.json()["detail"].lower()

    async def test_missing_auth_returns_403(self, app):
        """Should return 403 when Authorization header is absent."""
        app.dependency_overrides.pop(get_current_user_id, None)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            response = await c.post(
                "/api/v1/hegemony-weights",
                json=VALID_CREATE_BODY,
                params={"season_id": str(FIXED_SEASON_ID)},
            )

        assert response.status_code == 403

    async def test_permission_error_returns_403(self, client, mock_service):
        """Should return 403 when service raises PermissionError."""
        mock_service.create_weight = AsyncMock(side_effect=PermissionError("no access"))

        response = await client.post(
            "/api/v1/hegemony-weights",
            json=VALID_CREATE_BODY,
            params={"season_id": str(FIXED_SEASON_ID)},
        )

        assert response.status_code == 403

    async def test_value_error_returns_400(self, client, mock_service):
        """Should return 400 when service raises ValueError."""
        mock_service.create_weight = AsyncMock(
            side_effect=ValueError("duplicate weight for this upload")
        )

        response = await client.post(
            "/api/v1/hegemony-weights",
            json=VALID_CREATE_BODY,
            params={"season_id": str(FIXED_SEASON_ID)},
        )

        assert response.status_code == 400


# =============================================================================
# POST /hegemony-weights/initialize — Initialize Season Weights
# =============================================================================


class TestInitializeSeasonWeights:
    """POST /api/v1/hegemony-weights/initialize"""

    async def test_returns_200_with_initialized_weights(self, client, mock_service):
        """Should return 200 and list of initialized weights."""
        response = await client.post(
            "/api/v1/hegemony-weights/initialize",
            params={"season_id": str(FIXED_SEASON_ID)},
        )

        assert response.status_code == 200
        body = response.json()
        assert isinstance(body, list)
        assert len(body) == 1

    async def test_calls_service_with_correct_args(self, client, mock_service):
        """Should forward user_id and season_id to initialize_weights_for_season."""
        await client.post(
            "/api/v1/hegemony-weights/initialize",
            params={"season_id": str(FIXED_SEASON_ID)},
        )

        mock_service.initialize_weights_for_season.assert_awaited_once_with(
            FIXED_USER_ID, FIXED_SEASON_ID
        )

    async def test_missing_auth_returns_403(self, app):
        """Should return 403 when Authorization header is absent."""
        app.dependency_overrides.pop(get_current_user_id, None)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            response = await c.post(
                "/api/v1/hegemony-weights/initialize",
                params={"season_id": str(FIXED_SEASON_ID)},
            )

        assert response.status_code == 403

    async def test_permission_error_returns_403(self, client, mock_service):
        """Should return 403 when service raises PermissionError."""
        mock_service.initialize_weights_for_season = AsyncMock(
            side_effect=PermissionError("no access")
        )

        response = await client.post(
            "/api/v1/hegemony-weights/initialize",
            params={"season_id": str(FIXED_SEASON_ID)},
        )

        assert response.status_code == 403


# =============================================================================
# GET /hegemony-weights/summary — Get Weights Summary
# =============================================================================


class TestGetWeightsSummary:
    """GET /api/v1/hegemony-weights/summary"""

    async def test_returns_200_with_summary(self, client, mock_service):
        """Should return 200 and summary object."""
        response = await client.get(
            "/api/v1/hegemony-weights/summary",
            params={"season_id": str(FIXED_SEASON_ID)},
        )

        assert response.status_code == 200
        body = response.json()
        assert body["season_id"] == str(FIXED_SEASON_ID)
        assert "is_valid" in body
        assert "weights" in body

    async def test_calls_service_with_correct_args(self, client, mock_service):
        """Should forward user_id and season_id to get_weights_summary."""
        await client.get(
            "/api/v1/hegemony-weights/summary",
            params={"season_id": str(FIXED_SEASON_ID)},
        )

        mock_service.get_weights_summary.assert_awaited_once_with(FIXED_USER_ID, FIXED_SEASON_ID)

    async def test_missing_auth_returns_403(self, app):
        """Should return 403 when Authorization header is absent."""
        app.dependency_overrides.pop(get_current_user_id, None)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            response = await c.get(
                "/api/v1/hegemony-weights/summary",
                params={"season_id": str(FIXED_SEASON_ID)},
            )

        assert response.status_code == 403

    async def test_permission_error_returns_403(self, client, mock_service):
        """Should return 403 when service raises PermissionError."""
        mock_service.get_weights_summary = AsyncMock(side_effect=PermissionError("no access"))

        response = await client.get(
            "/api/v1/hegemony-weights/summary",
            params={"season_id": str(FIXED_SEASON_ID)},
        )

        assert response.status_code == 403


# =============================================================================
# GET /hegemony-weights/preview — Preview Hegemony Scores
# =============================================================================


class TestPreviewHegemonyScores:
    """GET /api/v1/hegemony-weights/preview"""

    async def test_returns_200_with_preview_list(self, client, mock_service):
        """Should return 200 and list of score previews."""
        response = await client.get(
            "/api/v1/hegemony-weights/preview",
            params={"season_id": str(FIXED_SEASON_ID)},
        )

        assert response.status_code == 200
        body = response.json()
        assert isinstance(body, list)
        assert len(body) == 1
        assert body[0]["rank"] == 1

    async def test_calls_service_with_default_limit(self, client, mock_service):
        """Should use default limit of 20 when not specified."""
        await client.get(
            "/api/v1/hegemony-weights/preview",
            params={"season_id": str(FIXED_SEASON_ID)},
        )

        mock_service.calculate_hegemony_scores.assert_awaited_once_with(
            FIXED_USER_ID, FIXED_SEASON_ID, 20
        )

    async def test_calls_service_with_custom_limit(self, client, mock_service):
        """Should forward custom limit to the service."""
        await client.get(
            "/api/v1/hegemony-weights/preview",
            params={"season_id": str(FIXED_SEASON_ID), "limit": 50},
        )

        mock_service.calculate_hegemony_scores.assert_awaited_once_with(
            FIXED_USER_ID, FIXED_SEASON_ID, 50
        )

    async def test_returns_422_for_limit_below_minimum(self, client):
        """Should return 422 when limit < 1."""
        response = await client.get(
            "/api/v1/hegemony-weights/preview",
            params={"season_id": str(FIXED_SEASON_ID), "limit": 0},
        )

        assert response.status_code == 422

    async def test_returns_422_for_limit_above_maximum(self, client):
        """Should return 422 when limit > 500."""
        response = await client.get(
            "/api/v1/hegemony-weights/preview",
            params={"season_id": str(FIXED_SEASON_ID), "limit": 501},
        )

        assert response.status_code == 422

    async def test_missing_auth_returns_403(self, app):
        """Should return 403 when Authorization header is absent."""
        app.dependency_overrides.pop(get_current_user_id, None)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            response = await c.get(
                "/api/v1/hegemony-weights/preview",
                params={"season_id": str(FIXED_SEASON_ID)},
            )

        assert response.status_code == 403


# =============================================================================
# PATCH /hegemony-weights/{weight_id} — Update Weight
# =============================================================================


class TestUpdateWeight:
    """PATCH /api/v1/hegemony-weights/{weight_id}"""

    async def test_returns_200_with_updated_weight(self, client, mock_service):
        """Should return 200 and updated weight data."""
        response = await client.patch(
            f"/api/v1/hegemony-weights/{FIXED_WEIGHT_ID}",
            json=VALID_UPDATE_BODY,
        )

        assert response.status_code == 200
        body = response.json()
        assert body["id"] == str(FIXED_WEIGHT_ID)

    async def test_calls_service_with_correct_args(self, client, mock_service):
        """Should forward user_id, weight_id, and data to update_weight."""
        await client.patch(
            f"/api/v1/hegemony-weights/{FIXED_WEIGHT_ID}",
            json=VALID_UPDATE_BODY,
        )

        mock_service.update_weight.assert_awaited_once()
        call_args = mock_service.update_weight.await_args
        assert call_args.args[0] == FIXED_USER_ID
        assert call_args.args[1] == FIXED_WEIGHT_ID

    async def test_missing_auth_returns_403(self, app):
        """Should return 403 when Authorization header is absent."""
        app.dependency_overrides.pop(get_current_user_id, None)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            response = await c.patch(
                f"/api/v1/hegemony-weights/{FIXED_WEIGHT_ID}",
                json=VALID_UPDATE_BODY,
            )

        assert response.status_code == 403

    async def test_permission_error_returns_403(self, client, mock_service):
        """Should return 403 when service raises PermissionError."""
        mock_service.update_weight = AsyncMock(side_effect=PermissionError("no access"))

        response = await client.patch(
            f"/api/v1/hegemony-weights/{FIXED_WEIGHT_ID}",
            json=VALID_UPDATE_BODY,
        )

        assert response.status_code == 403

    async def test_value_error_returns_400(self, client, mock_service):
        """Should return 400 when service raises ValueError."""
        mock_service.update_weight = AsyncMock(side_effect=ValueError("weight not found"))

        response = await client.patch(
            f"/api/v1/hegemony-weights/{FIXED_WEIGHT_ID}",
            json=VALID_UPDATE_BODY,
        )

        assert response.status_code == 400

    async def test_returns_422_for_invalid_uuid(self, client):
        """Should return 422 for a malformed weight_id path parameter."""
        response = await client.patch(
            "/api/v1/hegemony-weights/not-a-uuid",
            json=VALID_UPDATE_BODY,
        )

        assert response.status_code == 422


# =============================================================================
# DELETE /hegemony-weights/{weight_id} — Delete Weight
# =============================================================================


class TestDeleteWeight:
    """DELETE /api/v1/hegemony-weights/{weight_id}"""

    async def test_returns_204_on_success(self, client, mock_service):
        """Should return 204 No Content on successful deletion."""
        response = await client.delete(f"/api/v1/hegemony-weights/{FIXED_WEIGHT_ID}")

        assert response.status_code == 204

    async def test_calls_service_with_correct_args(self, client, mock_service):
        """Should forward user_id and weight_id to delete_weight."""
        await client.delete(f"/api/v1/hegemony-weights/{FIXED_WEIGHT_ID}")

        mock_service.delete_weight.assert_awaited_once_with(FIXED_USER_ID, FIXED_WEIGHT_ID)

    async def test_missing_auth_returns_403(self, app):
        """Should return 403 when Authorization header is absent."""
        app.dependency_overrides.pop(get_current_user_id, None)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            response = await c.delete(f"/api/v1/hegemony-weights/{FIXED_WEIGHT_ID}")

        assert response.status_code == 403

    async def test_permission_error_returns_403(self, client, mock_service):
        """Should return 403 when service raises PermissionError."""
        mock_service.delete_weight = AsyncMock(side_effect=PermissionError("no access"))

        response = await client.delete(f"/api/v1/hegemony-weights/{FIXED_WEIGHT_ID}")

        assert response.status_code == 403

    async def test_value_error_returns_400(self, client, mock_service):
        """Should return 400 when service raises ValueError."""
        mock_service.delete_weight = AsyncMock(side_effect=ValueError("weight not found"))

        response = await client.delete(f"/api/v1/hegemony-weights/{FIXED_WEIGHT_ID}")

        assert response.status_code == 400

    async def test_returns_422_for_invalid_uuid(self, client):
        """Should return 422 for a malformed weight_id path parameter."""
        response = await client.delete("/api/v1/hegemony-weights/not-a-uuid")

        assert response.status_code == 422
