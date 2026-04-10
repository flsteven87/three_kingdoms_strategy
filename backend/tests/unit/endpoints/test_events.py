"""
Unit Tests for Events API Endpoints — HTTP Contract Verification

Tests cover:
1. GET /events — list events, auth required
2. POST /events — create event (201), auth required, PermissionError → 403
3. GET /events/{id} — get event, 404 when not found, ValueError → 400
4. PATCH /events/{id} — update event, ValueError → 400, PermissionError → 403
5. DELETE /events/{id} — 204 no content, auth required
6. POST /events/{id}/process — process snapshots, auth required
7. GET /events/{id}/summary — event summary, auth required
8. GET /events/{id}/metrics — event metrics, auth required
9. GET /events/{id}/analytics — full analytics, 404 when event not found
10. GET /events/{id}/group-analytics — group analytics, 404 when not found
11. POST /events/batch-analytics — batch, empty map when no access

Following test-writing conventions:
- AAA pattern (Arrange-Act-Assert)
- DI overrides for BattleEventService, SeasonService, PermissionService, CSVUploadService
- No business logic tested — only HTTP contract
"""

from datetime import datetime
from unittest.mock import AsyncMock, MagicMock
from uuid import UUID

import pytest
from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse
from httpx import ASGITransport, AsyncClient

from src.api.v1.endpoints.events import router
from src.core.auth import get_current_user_id
from src.core.dependencies import (
    get_battle_event_service,
    get_csv_upload_service,
    get_permission_service,
    get_season_service,
)
from src.models.battle_event import EventCategory, EventStatus
from src.services.battle_event_service import BattleEventService
from src.services.csv_upload_service import CSVUploadService
from src.services.permission_service import PermissionService
from src.services.season_service import SeasonService

# =============================================================================
# Constants
# =============================================================================

FIXED_USER_ID = UUID("11111111-1111-1111-1111-111111111111")
FIXED_SEASON_ID = UUID("22222222-2222-2222-2222-222222222222")
FIXED_EVENT_ID = UUID("33333333-3333-3333-3333-333333333333")
FIXED_ALLIANCE_ID = UUID("44444444-4444-4444-4444-444444444444")
FIXED_UPLOAD_ID = UUID("55555555-5555-5555-5555-555555555555")

NOW = datetime(2024, 10, 1, 12, 0, 0)


# =============================================================================
# Sample data builders
# =============================================================================


def _make_event(**overrides):
    """Build a minimal BattleEvent-like object with model_validate support."""
    defaults = {
        "id": FIXED_EVENT_ID,
        "name": "Battle Test",
        "event_type": EventCategory.BATTLE,
        "description": None,
        "status": EventStatus.DRAFT,
        "event_start": None,
        "event_end": None,
        "before_upload_id": None,
        "after_upload_id": None,
        "created_at": NOW,
        "alliance_id": FIXED_ALLIANCE_ID,
        "season_id": FIXED_SEASON_ID,
    }
    defaults.update(overrides)

    obj = MagicMock()
    for k, v in defaults.items():
        setattr(obj, k, v)
    # Make model_validate return the event directly (used in endpoint)
    obj.__class__ = MagicMock()
    return obj


def _make_summary(**overrides):
    defaults = {
        "total_members": 30,
        "participated_count": 25,
        "absent_count": 5,
        "new_member_count": 0,
        "participation_rate": 0.83,
        "total_merit": 100000,
        "total_assist": 5000,
        "total_contribution": 50000,
        "avg_merit": 4000.0,
        "avg_assist": 200.0,
        "mvp_member_id": None,
        "mvp_member_name": None,
        "mvp_merit": None,
        "mvp_contribution": None,
        "mvp_assist": None,
        "mvp_combined_score": None,
        "violator_count": 0,
    }
    defaults.update(overrides)
    obj = MagicMock()
    for k, v in defaults.items():
        setattr(obj, k, v)
    return obj


def _make_metric(**overrides):
    defaults = {
        "id": UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"),
        "member_id": UUID("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"),
        "member_name": "玩家一",
        "group_name": "A組",
        "contribution_diff": 1000,
        "merit_diff": 2000,
        "assist_diff": 100,
        "donation_diff": 50,
        "power_diff": 0,
        "participated": True,
        "is_new_member": False,
        "is_absent": False,
    }
    defaults.update(overrides)
    obj = MagicMock()
    for k, v in defaults.items():
        setattr(obj, k, v)
    return obj


def _make_group_analytics():
    """Build a mock group analytics object."""
    obj = MagicMock()
    obj.event_id = FIXED_EVENT_ID
    obj.event_name = "Battle Test"
    obj.event_type = EventCategory.BATTLE
    obj.event_start = None
    obj.event_end = None
    obj.summary = _make_summary()
    obj.group_stats = []
    obj.top_members = []
    obj.top_contributors = []
    obj.top_assisters = []
    obj.violators = []
    return obj


# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def mock_event_service() -> MagicMock:
    svc = MagicMock(spec=BattleEventService)
    event = _make_event()
    summary = _make_summary()
    metric = _make_metric()

    svc.verify_user_access = AsyncMock(return_value=FIXED_ALLIANCE_ID)
    svc.get_events_by_season = AsyncMock(return_value=[])
    svc.create_event = AsyncMock(return_value=event)
    svc.get_event = AsyncMock(return_value=event)
    svc.process_event_snapshots = AsyncMock(return_value=event)
    svc.get_event_summary = AsyncMock(return_value=summary)
    svc.get_event_metrics = AsyncMock(return_value=[metric])
    svc.update_event = AsyncMock(return_value=event)
    svc.delete_event = AsyncMock(return_value=True)
    svc.get_event_group_analytics = AsyncMock(return_value=_make_group_analytics())
    svc.get_batch_event_analytics = AsyncMock(return_value={})
    return svc


@pytest.fixture
def mock_season_service() -> MagicMock:
    svc = MagicMock(spec=SeasonService)
    svc.verify_user_access = AsyncMock(return_value=FIXED_ALLIANCE_ID)
    return svc


@pytest.fixture
def mock_permission_service() -> MagicMock:
    svc = MagicMock(spec=PermissionService)
    svc.get_user_role = AsyncMock(return_value="owner")
    return svc


@pytest.fixture
def mock_csv_upload_service() -> MagicMock:
    svc = MagicMock(spec=CSVUploadService)
    svc.upload_csv = AsyncMock(
        return_value={
            "upload_id": FIXED_UPLOAD_ID,
            "season_id": FIXED_SEASON_ID,
            "snapshot_date": "2024-10-01T12:00:00",
            "filename": "test.csv",
            "total_members": 30,
        }
    )
    return svc


@pytest.fixture
def app(
    mock_event_service,
    mock_season_service,
    mock_permission_service,
    mock_csv_upload_service,
) -> FastAPI:
    test_app = FastAPI()
    test_app.include_router(router, prefix="/api/v1")
    test_app.dependency_overrides[get_current_user_id] = lambda: FIXED_USER_ID
    test_app.dependency_overrides[get_battle_event_service] = lambda: mock_event_service
    test_app.dependency_overrides[get_season_service] = lambda: mock_season_service
    test_app.dependency_overrides[get_permission_service] = lambda: mock_permission_service
    test_app.dependency_overrides[get_csv_upload_service] = lambda: mock_csv_upload_service

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

    yield test_app
    test_app.dependency_overrides.clear()


@pytest.fixture
async def client(app: FastAPI) -> AsyncClient:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


# =============================================================================
# GET /events
# =============================================================================


class TestListEvents:
    """Tests for GET /events."""

    async def test_returns_200_with_empty_list(self, client):
        """Should return 200 with an empty list when no events exist."""
        response = await client.get("/api/v1/events", params={"season_id": str(FIXED_SEASON_ID)})

        assert response.status_code == 200
        assert response.json() == []

    async def test_missing_season_id_returns_422(self, client):
        """Should return 422 when season_id query param is absent."""
        response = await client.get("/api/v1/events")

        assert response.status_code == 422

    async def test_missing_auth_returns_403(self, app):
        """Should return 403 when no auth token is provided."""
        app.dependency_overrides.pop(get_current_user_id, None)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            response = await c.get("/api/v1/events", params={"season_id": str(FIXED_SEASON_ID)})

        assert response.status_code == 403

    async def test_permission_error_returns_403(self, client, mock_season_service):
        """Should return 403 when season access is denied."""
        mock_season_service.verify_user_access = AsyncMock(side_effect=PermissionError("denied"))

        response = await client.get("/api/v1/events", params={"season_id": str(FIXED_SEASON_ID)})

        assert response.status_code == 403


# =============================================================================
# POST /events
# =============================================================================


class TestCreateEvent:
    """Tests for POST /events."""

    async def test_returns_201_with_event_detail(self, client, mock_event_service):
        """Should return 201 with event detail on successful creation."""
        event = _make_event()
        # Patch model_validate on EventDetailResponse
        mock_event_service.create_event = AsyncMock(return_value=event)

        from unittest.mock import patch

        from src.api.v1.schemas.events import EventDetailResponse

        detail = EventDetailResponse(
            id=FIXED_EVENT_ID,
            name="Battle Test",
            event_type=EventCategory.BATTLE,
            description=None,
            status=EventStatus.DRAFT,
            event_start=None,
            event_end=None,
            before_upload_id=None,
            after_upload_id=None,
            created_at=NOW,
        )
        with patch.object(EventDetailResponse, "model_validate", return_value=detail):
            response = await client.post(
                "/api/v1/events",
                params={"season_id": str(FIXED_SEASON_ID)},
                json={"name": "Battle Test", "event_type": "battle"},
            )

        assert response.status_code == 201

    async def test_missing_name_returns_422(self, client):
        """Should return 422 when required name field is absent."""
        response = await client.post(
            "/api/v1/events",
            params={"season_id": str(FIXED_SEASON_ID)},
            json={"event_type": "battle"},
        )

        assert response.status_code == 422

    async def test_missing_season_id_returns_422(self, client):
        """Should return 422 when season_id query param is absent."""
        response = await client.post(
            "/api/v1/events",
            json={"name": "Battle Test", "event_type": "battle"},
        )

        assert response.status_code == 422

    async def test_missing_auth_returns_403(self, app):
        """Should return 403 when no auth token is provided."""
        app.dependency_overrides.pop(get_current_user_id, None)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            response = await c.post(
                "/api/v1/events",
                params={"season_id": str(FIXED_SEASON_ID)},
                json={"name": "Battle Test", "event_type": "battle"},
            )

        assert response.status_code == 403

    async def test_permission_error_returns_403(self, client, mock_season_service):
        """Should return 403 when user lacks write access to the season."""
        mock_season_service.verify_user_access = AsyncMock(side_effect=PermissionError("denied"))

        response = await client.post(
            "/api/v1/events",
            params={"season_id": str(FIXED_SEASON_ID)},
            json={"name": "Battle Test", "event_type": "battle"},
        )

        assert response.status_code == 403


# =============================================================================
# GET /events/{event_id}
# =============================================================================


class TestGetEvent:
    """Tests for GET /events/{event_id}."""

    async def test_returns_400_when_event_not_found(self, client, mock_event_service):
        """Should return 400 when service returns None for the event."""
        mock_event_service.get_event = AsyncMock(return_value=None)

        response = await client.get(f"/api/v1/events/{FIXED_EVENT_ID}")

        assert response.status_code == 400
        assert "not found" in response.json()["detail"].lower()

    async def test_missing_auth_returns_403(self, app):
        """Should return 403 when no auth token is provided."""
        app.dependency_overrides.pop(get_current_user_id, None)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            response = await c.get(f"/api/v1/events/{FIXED_EVENT_ID}")

        assert response.status_code == 403

    async def test_permission_error_returns_403(self, client, mock_event_service):
        """Should return 403 when verify_user_access raises PermissionError."""
        mock_event_service.verify_user_access = AsyncMock(side_effect=PermissionError("denied"))

        response = await client.get(f"/api/v1/events/{FIXED_EVENT_ID}")

        assert response.status_code == 403


# =============================================================================
# POST /events/{event_id}/process
# =============================================================================


class TestProcessEvent:
    """Tests for POST /events/{event_id}/process."""

    async def test_returns_200_on_success(self, client, mock_event_service):
        """Should return 200 with updated event detail after processing."""
        event = _make_event(status=EventStatus.COMPLETED)
        mock_event_service.process_event_snapshots = AsyncMock(return_value=event)

        from unittest.mock import patch

        from src.api.v1.schemas.events import EventDetailResponse

        detail = EventDetailResponse(
            id=FIXED_EVENT_ID,
            name="Battle Test",
            event_type=EventCategory.BATTLE,
            description=None,
            status=EventStatus.COMPLETED,
            event_start=None,
            event_end=None,
            before_upload_id=FIXED_UPLOAD_ID,
            after_upload_id=FIXED_UPLOAD_ID,
            created_at=NOW,
        )
        with patch.object(EventDetailResponse, "model_validate", return_value=detail):
            response = await client.post(
                f"/api/v1/events/{FIXED_EVENT_ID}/process",
                json={
                    "before_upload_id": str(FIXED_UPLOAD_ID),
                    "after_upload_id": str(FIXED_UPLOAD_ID),
                },
            )

        assert response.status_code == 200

    async def test_missing_upload_ids_returns_422(self, client):
        """Should return 422 when required upload IDs are absent."""
        response = await client.post(
            f"/api/v1/events/{FIXED_EVENT_ID}/process",
            json={},
        )

        assert response.status_code == 422

    async def test_missing_auth_returns_403(self, app):
        """Should return 403 when no auth token is provided."""
        app.dependency_overrides.pop(get_current_user_id, None)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            response = await c.post(
                f"/api/v1/events/{FIXED_EVENT_ID}/process",
                json={
                    "before_upload_id": str(FIXED_UPLOAD_ID),
                    "after_upload_id": str(FIXED_UPLOAD_ID),
                },
            )

        assert response.status_code == 403

    async def test_permission_error_returns_403(self, client, mock_event_service):
        """Should return 403 when user lacks access to the event."""
        mock_event_service.verify_user_access = AsyncMock(side_effect=PermissionError("denied"))

        response = await client.post(
            f"/api/v1/events/{FIXED_EVENT_ID}/process",
            json={
                "before_upload_id": str(FIXED_UPLOAD_ID),
                "after_upload_id": str(FIXED_UPLOAD_ID),
            },
        )

        assert response.status_code == 403


# =============================================================================
# GET /events/{event_id}/summary
# =============================================================================


class TestGetEventSummary:
    """Tests for GET /events/{event_id}/summary."""

    async def test_missing_auth_returns_403(self, app):
        """Should return 403 when no auth token is provided."""
        app.dependency_overrides.pop(get_current_user_id, None)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            response = await c.get(f"/api/v1/events/{FIXED_EVENT_ID}/summary")

        assert response.status_code == 403

    async def test_permission_error_returns_403(self, client, mock_event_service):
        """Should return 403 when user lacks access to the event."""
        mock_event_service.verify_user_access = AsyncMock(side_effect=PermissionError("denied"))

        response = await client.get(f"/api/v1/events/{FIXED_EVENT_ID}/summary")

        assert response.status_code == 403


# =============================================================================
# GET /events/{event_id}/metrics
# =============================================================================


class TestGetEventMetrics:
    """Tests for GET /events/{event_id}/metrics."""

    async def test_missing_auth_returns_403(self, app):
        """Should return 403 when no auth token is provided."""
        app.dependency_overrides.pop(get_current_user_id, None)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            response = await c.get(f"/api/v1/events/{FIXED_EVENT_ID}/metrics")

        assert response.status_code == 403

    async def test_permission_error_returns_403(self, client, mock_event_service):
        """Should return 403 when user lacks access to the event."""
        mock_event_service.verify_user_access = AsyncMock(side_effect=PermissionError("denied"))

        response = await client.get(f"/api/v1/events/{FIXED_EVENT_ID}/metrics")

        assert response.status_code == 403


# =============================================================================
# GET /events/{event_id}/analytics
# =============================================================================


class TestGetEventAnalytics:
    """Tests for GET /events/{event_id}/analytics."""

    async def test_returns_400_when_event_not_found(self, client, mock_event_service):
        """Should return 400 when event is not found."""
        mock_event_service.get_event = AsyncMock(return_value=None)

        response = await client.get(f"/api/v1/events/{FIXED_EVENT_ID}/analytics")

        assert response.status_code == 400

    async def test_missing_auth_returns_403(self, app):
        """Should return 403 when no auth token provided."""
        app.dependency_overrides.pop(get_current_user_id, None)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            response = await c.get(f"/api/v1/events/{FIXED_EVENT_ID}/analytics")

        assert response.status_code == 403

    async def test_permission_error_returns_403(self, client, mock_event_service):
        """Should return 403 when user lacks access to the event."""
        mock_event_service.verify_user_access = AsyncMock(side_effect=PermissionError("denied"))

        response = await client.get(f"/api/v1/events/{FIXED_EVENT_ID}/analytics")

        assert response.status_code == 403


# =============================================================================
# GET /events/{event_id}/group-analytics
# =============================================================================


class TestGetEventGroupAnalytics:
    """Tests for GET /events/{event_id}/group-analytics."""

    async def test_returns_400_when_event_not_found(self, client, mock_event_service):
        """Should return 400 when group analytics is None (event not found)."""
        mock_event_service.get_event_group_analytics = AsyncMock(return_value=None)

        response = await client.get(f"/api/v1/events/{FIXED_EVENT_ID}/group-analytics")

        assert response.status_code == 400

    async def test_missing_auth_returns_403(self, app):
        """Should return 403 when no auth token provided."""
        app.dependency_overrides.pop(get_current_user_id, None)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            response = await c.get(f"/api/v1/events/{FIXED_EVENT_ID}/group-analytics")

        assert response.status_code == 403

    async def test_permission_error_returns_403(self, client, mock_event_service):
        """Should return 403 when user lacks event access."""
        mock_event_service.verify_user_access = AsyncMock(side_effect=PermissionError("denied"))

        response = await client.get(f"/api/v1/events/{FIXED_EVENT_ID}/group-analytics")

        assert response.status_code == 403


# =============================================================================
# PATCH /events/{event_id}
# =============================================================================


class TestUpdateEvent:
    """Tests for PATCH /events/{event_id}."""

    async def test_missing_auth_returns_403(self, app):
        """Should return 403 when no auth token is provided."""
        app.dependency_overrides.pop(get_current_user_id, None)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            response = await c.patch(
                f"/api/v1/events/{FIXED_EVENT_ID}",
                json={"name": "Updated Name"},
            )

        assert response.status_code == 403

    async def test_value_error_returns_400(self, client, mock_event_service):
        """Should return 400 when service raises ValueError (event not found)."""
        mock_event_service.update_event = AsyncMock(side_effect=ValueError("Event not found"))

        response = await client.patch(
            f"/api/v1/events/{FIXED_EVENT_ID}",
            json={"name": "Updated Name"},
        )

        assert response.status_code == 400

    async def test_permission_error_returns_403(self, client, mock_event_service):
        """Should return 403 when user is not owner/collaborator."""
        mock_event_service.update_event = AsyncMock(side_effect=PermissionError("denied"))

        response = await client.patch(
            f"/api/v1/events/{FIXED_EVENT_ID}",
            json={"name": "Updated Name"},
        )

        assert response.status_code == 403


# =============================================================================
# DELETE /events/{event_id}
# =============================================================================


class TestDeleteEvent:
    """Tests for DELETE /events/{event_id}."""

    async def test_returns_204_on_success(self, client):
        """Should return 204 with no body on successful deletion."""
        response = await client.delete(f"/api/v1/events/{FIXED_EVENT_ID}")

        assert response.status_code == 204
        assert response.content == b""

    async def test_missing_auth_returns_403(self, app):
        """Should return 403 when no auth token is provided."""
        app.dependency_overrides.pop(get_current_user_id, None)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            response = await c.delete(f"/api/v1/events/{FIXED_EVENT_ID}")

        assert response.status_code == 403

    async def test_permission_error_returns_403(self, client, mock_event_service):
        """Should return 403 when user lacks access to delete the event."""
        mock_event_service.verify_user_access = AsyncMock(side_effect=PermissionError("denied"))

        response = await client.delete(f"/api/v1/events/{FIXED_EVENT_ID}")

        assert response.status_code == 403


# =============================================================================
# POST /events/batch-analytics
# =============================================================================


class TestGetBatchEventAnalytics:
    """Tests for POST /events/batch-analytics."""

    async def test_returns_empty_analytics_when_no_events_found(self, client):
        """Should return empty analytics map when service returns no events."""
        response = await client.post(
            "/api/v1/events/batch-analytics",
            json={"event_ids": [str(FIXED_EVENT_ID)]},
        )

        assert response.status_code == 200
        assert response.json()["analytics"] == {}

    async def test_missing_event_ids_returns_422(self, client):
        """Should return 422 when event_ids list is absent."""
        response = await client.post(
            "/api/v1/events/batch-analytics",
            json={},
        )

        assert response.status_code == 422

    async def test_empty_event_ids_returns_422(self, client):
        """Should return 422 when event_ids is an empty list (min_length=1)."""
        response = await client.post(
            "/api/v1/events/batch-analytics",
            json={"event_ids": []},
        )

        assert response.status_code == 422

    async def test_missing_auth_returns_403(self, app):
        """Should return 403 when no auth token is provided."""
        app.dependency_overrides.pop(get_current_user_id, None)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            response = await c.post(
                "/api/v1/events/batch-analytics",
                json={"event_ids": [str(FIXED_EVENT_ID)]},
            )

        assert response.status_code == 403

    async def test_returns_empty_when_no_access_to_alliance(
        self, client, mock_event_service, mock_permission_service
    ):
        """Should return empty map when user has no role in the event's alliance."""
        event = _make_event()
        summary = _make_summary()
        metric = _make_metric()
        mock_event_service.get_batch_event_analytics = AsyncMock(
            return_value={FIXED_EVENT_ID: (event, summary, [metric])}
        )
        mock_permission_service.get_user_role = AsyncMock(return_value=None)

        response = await client.post(
            "/api/v1/events/batch-analytics",
            json={"event_ids": [str(FIXED_EVENT_ID)]},
        )

        assert response.status_code == 200
        assert response.json()["analytics"] == {}
