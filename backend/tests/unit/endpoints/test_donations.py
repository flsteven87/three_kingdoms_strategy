"""
Unit Tests for Donations Endpoint — HTTP Contract Verification

Tests cover:
1. GET /api/v1/donations — list donations for alliance+season
2. POST /api/v1/donations — create donation event
3. GET /api/v1/donations/{donation_id} — get donation detail with member info
4. POST /api/v1/donations/{donation_id}/targets — upsert member target override
5. DELETE /api/v1/donations/{donation_id} — delete donation
6. DELETE /api/v1/donations/{donation_id}/targets/{member_id} — delete member target override
7. Auth required (missing token → 403)
8. PermissionError → 403, ValueError → 400

Following test-writing conventions:
- AAA pattern (Arrange-Act-Assert)
- DI overrides for DonationService and UserIdDep
- Exception handlers mirrored from main.py
- get_donation_service is defined locally in the endpoint module, imported directly
- No business logic tested — only HTTP contract
"""

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock
from uuid import UUID

import pytest
from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse
from httpx import ASGITransport, AsyncClient

from src.api.v1.endpoints.donations import get_donation_service, router
from src.core.auth import get_current_user_id
from src.models.donation import (
    Donation,
    DonationMemberInfo,
    DonationStatus,
    DonationType,
    DonationWithInfo,
)
from src.services.donation_service import DonationService

# =============================================================================
# Constants
# =============================================================================

FIXED_USER_ID = UUID("11111111-1111-1111-1111-111111111111")
FIXED_ALLIANCE_ID = UUID("22222222-2222-2222-2222-222222222222")
FIXED_SEASON_ID = UUID("33333333-3333-3333-3333-333333333333")
FIXED_DONATION_ID = UUID("44444444-4444-4444-4444-444444444444")
FIXED_MEMBER_ID = UUID("55555555-5555-5555-5555-555555555555")

_NOW = datetime(2025, 1, 1, 0, 0, 0, tzinfo=UTC)
_DEADLINE = datetime(2025, 2, 1, 0, 0, 0, tzinfo=UTC)

SAMPLE_DONATION = Donation(
    id=FIXED_DONATION_ID,
    alliance_id=FIXED_ALLIANCE_ID,
    season_id=FIXED_SEASON_ID,
    title="月度捐獻",
    type=DonationType.REGULAR,
    deadline=_DEADLINE,
    target_amount=10000,
    description=None,
    status=DonationStatus.ACTIVE,
    created_by=FIXED_USER_ID,
    created_at=_NOW,
    updated_at=_NOW,
)

SAMPLE_DONATION_WITH_INFO = DonationWithInfo(
    **SAMPLE_DONATION.model_dump(),
    member_info=[
        DonationMemberInfo(
            member_id=FIXED_MEMBER_ID,
            member_name="曹操",
            target_amount=10000,
            donated_amount=8000,
        )
    ],
)

VALID_CREATE_BODY = {
    "title": "月度捐獻",
    "type": "regular",
    "deadline": _DEADLINE.isoformat(),
    "target_amount": 10000,
}

VALID_TARGET_OVERRIDE_BODY = {
    "member_id": str(FIXED_MEMBER_ID),
    "target_amount": 5000,
}


# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def mock_service() -> MagicMock:
    """Mock DonationService with sensible defaults."""
    svc = MagicMock(spec=DonationService)
    svc.require_alliance_access = AsyncMock(return_value=None)
    svc.get_donations_by_alliance_and_season = AsyncMock(return_value=[SAMPLE_DONATION])
    svc.create_donation = AsyncMock(return_value=SAMPLE_DONATION)
    svc.verify_donation_access = AsyncMock(return_value=None)
    svc.get_donation_with_info = AsyncMock(return_value=SAMPLE_DONATION_WITH_INFO)
    svc.set_member_target_override = AsyncMock(return_value=None)
    svc.delete_donation = AsyncMock(return_value=None)
    svc.delete_member_target_override = AsyncMock(return_value=None)
    return svc


@pytest.fixture
def app(mock_service: MagicMock) -> FastAPI:
    """Test app with donations router and DI overrides."""
    test_app = FastAPI(redirect_slashes=False)
    test_app.include_router(router, prefix="/api/v1")
    test_app.dependency_overrides[get_donation_service] = lambda: mock_service
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
# GET /donations — List Donations
# =============================================================================


class TestGetDonations:
    """GET /api/v1/donations"""

    async def test_returns_200_with_donations_list(self, client):
        """Should return 200 and list of donation events."""
        response = await client.get(
            "/api/v1/donations",
            params={"alliance_id": str(FIXED_ALLIANCE_ID), "season_id": str(FIXED_SEASON_ID)},
        )

        assert response.status_code == 200
        body = response.json()
        assert isinstance(body, list)
        assert len(body) == 1
        assert body[0]["id"] == str(FIXED_DONATION_ID)

    async def test_calls_service_with_correct_args(self, client, mock_service):
        """Should verify access then fetch donations with correct args."""
        await client.get(
            "/api/v1/donations",
            params={"alliance_id": str(FIXED_ALLIANCE_ID), "season_id": str(FIXED_SEASON_ID)},
        )

        mock_service.require_alliance_access.assert_awaited_once_with(
            FIXED_USER_ID, FIXED_ALLIANCE_ID
        )
        mock_service.get_donations_by_alliance_and_season.assert_awaited_once_with(
            FIXED_ALLIANCE_ID, FIXED_SEASON_ID
        )

    async def test_requires_alliance_id_query_param(self, client):
        """Should return 422 when alliance_id is missing."""
        response = await client.get(
            "/api/v1/donations",
            params={"season_id": str(FIXED_SEASON_ID)},
        )

        assert response.status_code == 422

    async def test_requires_season_id_query_param(self, client):
        """Should return 422 when season_id is missing."""
        response = await client.get(
            "/api/v1/donations",
            params={"alliance_id": str(FIXED_ALLIANCE_ID)},
        )

        assert response.status_code == 422

    async def test_missing_auth_returns_403(self, app):
        """Should return 403 when Authorization header is absent."""
        app.dependency_overrides.pop(get_current_user_id, None)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            response = await c.get(
                "/api/v1/donations",
                params={
                    "alliance_id": str(FIXED_ALLIANCE_ID),
                    "season_id": str(FIXED_SEASON_ID),
                },
            )

        assert response.status_code == 403

    async def test_permission_error_returns_403(self, client, mock_service):
        """Should return 403 when service raises PermissionError on access check."""
        mock_service.require_alliance_access = AsyncMock(
            side_effect=PermissionError("not a member")
        )

        response = await client.get(
            "/api/v1/donations",
            params={"alliance_id": str(FIXED_ALLIANCE_ID), "season_id": str(FIXED_SEASON_ID)},
        )

        assert response.status_code == 403


# =============================================================================
# POST /donations — Create Donation
# =============================================================================


class TestCreateDonation:
    """POST /api/v1/donations"""

    async def test_returns_200_with_created_donation(self, client):
        """Should return 200 and the created donation event."""
        response = await client.post(
            "/api/v1/donations",
            json=VALID_CREATE_BODY,
            params={"alliance_id": str(FIXED_ALLIANCE_ID), "season_id": str(FIXED_SEASON_ID)},
        )

        assert response.status_code == 200
        body = response.json()
        assert body["id"] == str(FIXED_DONATION_ID)
        assert body["title"] == "月度捐獻"

    async def test_calls_service_with_correct_args(self, client, mock_service):
        """Should verify access, build DonationCreate, then call create_donation."""
        await client.post(
            "/api/v1/donations",
            json=VALID_CREATE_BODY,
            params={"alliance_id": str(FIXED_ALLIANCE_ID), "season_id": str(FIXED_SEASON_ID)},
        )

        mock_service.require_alliance_access.assert_awaited_once_with(
            FIXED_USER_ID, FIXED_ALLIANCE_ID
        )
        mock_service.create_donation.assert_awaited_once()

    async def test_missing_auth_returns_403(self, app):
        """Should return 403 when Authorization header is absent."""
        app.dependency_overrides.pop(get_current_user_id, None)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            response = await c.post(
                "/api/v1/donations",
                json=VALID_CREATE_BODY,
                params={
                    "alliance_id": str(FIXED_ALLIANCE_ID),
                    "season_id": str(FIXED_SEASON_ID),
                },
            )

        assert response.status_code == 403

    async def test_permission_error_returns_403(self, client, mock_service):
        """Should return 403 when service raises PermissionError."""
        mock_service.require_alliance_access = AsyncMock(
            side_effect=PermissionError("not an owner")
        )

        response = await client.post(
            "/api/v1/donations",
            json=VALID_CREATE_BODY,
            params={"alliance_id": str(FIXED_ALLIANCE_ID), "season_id": str(FIXED_SEASON_ID)},
        )

        assert response.status_code == 403

    async def test_value_error_returns_400(self, client, mock_service):
        """Should return 400 when service raises ValueError."""
        mock_service.create_donation = AsyncMock(side_effect=ValueError("invalid donation type"))

        response = await client.post(
            "/api/v1/donations",
            json=VALID_CREATE_BODY,
            params={"alliance_id": str(FIXED_ALLIANCE_ID), "season_id": str(FIXED_SEASON_ID)},
        )

        assert response.status_code == 400

    async def test_missing_required_title_returns_422(self, client):
        """Should return 422 when required field title is absent."""
        body = {k: v for k, v in VALID_CREATE_BODY.items() if k != "title"}

        response = await client.post(
            "/api/v1/donations",
            json=body,
            params={"alliance_id": str(FIXED_ALLIANCE_ID), "season_id": str(FIXED_SEASON_ID)},
        )

        assert response.status_code == 422

    async def test_missing_required_deadline_returns_422(self, client):
        """Should return 422 when required field deadline is absent."""
        body = {k: v for k, v in VALID_CREATE_BODY.items() if k != "deadline"}

        response = await client.post(
            "/api/v1/donations",
            json=body,
            params={"alliance_id": str(FIXED_ALLIANCE_ID), "season_id": str(FIXED_SEASON_ID)},
        )

        assert response.status_code == 422

    async def test_invalid_donation_type_returns_422(self, client):
        """Should return 422 for an unrecognized donation type value."""
        body = {**VALID_CREATE_BODY, "type": "unknown_type"}

        response = await client.post(
            "/api/v1/donations",
            json=body,
            params={"alliance_id": str(FIXED_ALLIANCE_ID), "season_id": str(FIXED_SEASON_ID)},
        )

        assert response.status_code == 422


# =============================================================================
# GET /donations/{donation_id} — Get Donation Detail
# =============================================================================


class TestGetDonationDetail:
    """GET /api/v1/donations/{donation_id}"""

    async def test_returns_200_with_detail(self, client):
        """Should return 200 and donation detail with member_info."""
        response = await client.get(f"/api/v1/donations/{FIXED_DONATION_ID}")

        assert response.status_code == 200
        body = response.json()
        assert body["id"] == str(FIXED_DONATION_ID)
        assert "member_info" in body
        assert len(body["member_info"]) == 1

    async def test_calls_service_with_correct_args(self, client, mock_service):
        """Should verify access then call get_donation_with_info."""
        await client.get(f"/api/v1/donations/{FIXED_DONATION_ID}")

        mock_service.verify_donation_access.assert_awaited_once_with(
            FIXED_USER_ID, FIXED_DONATION_ID
        )
        mock_service.get_donation_with_info.assert_awaited_once_with(FIXED_DONATION_ID, None)

    async def test_passes_optional_target_amount(self, client, mock_service):
        """Should forward optional target_amount query param to the service."""
        await client.get(
            f"/api/v1/donations/{FIXED_DONATION_ID}",
            params={"target_amount": 5000},
        )

        mock_service.get_donation_with_info.assert_awaited_once_with(FIXED_DONATION_ID, 5000)

    async def test_missing_auth_returns_403(self, app):
        """Should return 403 when Authorization header is absent."""
        app.dependency_overrides.pop(get_current_user_id, None)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            response = await c.get(f"/api/v1/donations/{FIXED_DONATION_ID}")

        assert response.status_code == 403

    async def test_permission_error_returns_403(self, client, mock_service):
        """Should return 403 when service raises PermissionError on access check."""
        mock_service.verify_donation_access = AsyncMock(
            side_effect=PermissionError("not your donation")
        )

        response = await client.get(f"/api/v1/donations/{FIXED_DONATION_ID}")

        assert response.status_code == 403

    async def test_returns_422_for_invalid_uuid(self, client):
        """Should return 422 for a malformed donation_id path parameter."""
        response = await client.get("/api/v1/donations/not-a-uuid")

        assert response.status_code == 422


# =============================================================================
# POST /donations/{donation_id}/targets — Upsert Member Target Override
# =============================================================================


class TestUpsertMemberTargetOverride:
    """POST /api/v1/donations/{donation_id}/targets"""

    async def test_returns_204_on_success(self, client):
        """Should return 204 No Content on successful upsert."""
        response = await client.post(
            f"/api/v1/donations/{FIXED_DONATION_ID}/targets",
            json=VALID_TARGET_OVERRIDE_BODY,
        )

        assert response.status_code == 204

    async def test_calls_service_with_correct_args(self, client, mock_service):
        """Should forward donation_id, member_id, target_amount, and user_id."""
        await client.post(
            f"/api/v1/donations/{FIXED_DONATION_ID}/targets",
            json=VALID_TARGET_OVERRIDE_BODY,
        )

        mock_service.set_member_target_override.assert_awaited_once_with(
            donation_id=FIXED_DONATION_ID,
            member_id=FIXED_MEMBER_ID,
            target_amount=5000,
            user_id=FIXED_USER_ID,
        )

    async def test_missing_auth_returns_403(self, app):
        """Should return 403 when Authorization header is absent."""
        app.dependency_overrides.pop(get_current_user_id, None)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            response = await c.post(
                f"/api/v1/donations/{FIXED_DONATION_ID}/targets",
                json=VALID_TARGET_OVERRIDE_BODY,
            )

        assert response.status_code == 403

    async def test_permission_error_returns_403(self, client, mock_service):
        """Should return 403 when service raises PermissionError."""
        mock_service.set_member_target_override = AsyncMock(
            side_effect=PermissionError("not authorized")
        )

        response = await client.post(
            f"/api/v1/donations/{FIXED_DONATION_ID}/targets",
            json=VALID_TARGET_OVERRIDE_BODY,
        )

        assert response.status_code == 403

    async def test_negative_target_amount_returns_422(self, client):
        """Should return 422 when target_amount is negative (ge=0 constraint)."""
        body = {**VALID_TARGET_OVERRIDE_BODY, "target_amount": -1}

        response = await client.post(
            f"/api/v1/donations/{FIXED_DONATION_ID}/targets",
            json=body,
        )

        assert response.status_code == 422

    async def test_missing_member_id_returns_422(self, client):
        """Should return 422 when member_id is absent."""
        body = {k: v for k, v in VALID_TARGET_OVERRIDE_BODY.items() if k != "member_id"}

        response = await client.post(
            f"/api/v1/donations/{FIXED_DONATION_ID}/targets",
            json=body,
        )

        assert response.status_code == 422


# =============================================================================
# DELETE /donations/{donation_id} — Delete Donation
# =============================================================================


class TestDeleteDonation:
    """DELETE /api/v1/donations/{donation_id}"""

    async def test_returns_204_on_success(self, client):
        """Should return 204 No Content on successful deletion."""
        response = await client.delete(f"/api/v1/donations/{FIXED_DONATION_ID}")

        assert response.status_code == 204

    async def test_calls_service_with_correct_args(self, client, mock_service):
        """Should forward donation_id and user_id to delete_donation."""
        await client.delete(f"/api/v1/donations/{FIXED_DONATION_ID}")

        mock_service.delete_donation.assert_awaited_once_with(FIXED_DONATION_ID, FIXED_USER_ID)

    async def test_missing_auth_returns_403(self, app):
        """Should return 403 when Authorization header is absent."""
        app.dependency_overrides.pop(get_current_user_id, None)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            response = await c.delete(f"/api/v1/donations/{FIXED_DONATION_ID}")

        assert response.status_code == 403

    async def test_permission_error_returns_403(self, client, mock_service):
        """Should return 403 when service raises PermissionError."""
        mock_service.delete_donation = AsyncMock(side_effect=PermissionError("not the owner"))

        response = await client.delete(f"/api/v1/donations/{FIXED_DONATION_ID}")

        assert response.status_code == 403

    async def test_value_error_returns_400(self, client, mock_service):
        """Should return 400 when service raises ValueError."""
        mock_service.delete_donation = AsyncMock(side_effect=ValueError("donation not found"))

        response = await client.delete(f"/api/v1/donations/{FIXED_DONATION_ID}")

        assert response.status_code == 400

    async def test_returns_422_for_invalid_uuid(self, client):
        """Should return 422 for a malformed donation_id path parameter."""
        response = await client.delete("/api/v1/donations/not-a-uuid")

        assert response.status_code == 422


# =============================================================================
# DELETE /donations/{donation_id}/targets/{member_id} — Delete Member Target Override
# =============================================================================


class TestDeleteMemberTargetOverride:
    """DELETE /api/v1/donations/{donation_id}/targets/{member_id}"""

    async def test_returns_204_on_success(self, client):
        """Should return 204 No Content on successful deletion."""
        response = await client.delete(
            f"/api/v1/donations/{FIXED_DONATION_ID}/targets/{FIXED_MEMBER_ID}"
        )

        assert response.status_code == 204

    async def test_calls_service_with_correct_args(self, client, mock_service):
        """Should forward donation_id, member_id, and user_id to delete_member_target_override."""
        await client.delete(f"/api/v1/donations/{FIXED_DONATION_ID}/targets/{FIXED_MEMBER_ID}")

        mock_service.delete_member_target_override.assert_awaited_once_with(
            FIXED_DONATION_ID, FIXED_MEMBER_ID, FIXED_USER_ID
        )

    async def test_missing_auth_returns_403(self, app):
        """Should return 403 when Authorization header is absent."""
        app.dependency_overrides.pop(get_current_user_id, None)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            response = await c.delete(
                f"/api/v1/donations/{FIXED_DONATION_ID}/targets/{FIXED_MEMBER_ID}"
            )

        assert response.status_code == 403

    async def test_permission_error_returns_403(self, client, mock_service):
        """Should return 403 when service raises PermissionError."""
        mock_service.delete_member_target_override = AsyncMock(
            side_effect=PermissionError("not authorized")
        )

        response = await client.delete(
            f"/api/v1/donations/{FIXED_DONATION_ID}/targets/{FIXED_MEMBER_ID}"
        )

        assert response.status_code == 403

    async def test_value_error_returns_400(self, client, mock_service):
        """Should return 400 when service raises ValueError."""
        mock_service.delete_member_target_override = AsyncMock(
            side_effect=ValueError("target override not found")
        )

        response = await client.delete(
            f"/api/v1/donations/{FIXED_DONATION_ID}/targets/{FIXED_MEMBER_ID}"
        )

        assert response.status_code == 400

    async def test_returns_422_for_invalid_donation_uuid(self, client):
        """Should return 422 for a malformed donation_id in the path."""
        response = await client.delete(f"/api/v1/donations/not-a-uuid/targets/{FIXED_MEMBER_ID}")

        assert response.status_code == 422

    async def test_returns_422_for_invalid_member_uuid(self, client):
        """Should return 422 for a malformed member_id in the path."""
        response = await client.delete(f"/api/v1/donations/{FIXED_DONATION_ID}/targets/not-a-uuid")

        assert response.status_code == 422
