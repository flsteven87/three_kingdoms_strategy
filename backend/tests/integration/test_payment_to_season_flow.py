"""
Integration tests: Payment → Quota → Season Activation flow.

Tests the full cross-service orchestration with mocked repositories
to verify state transitions are correct end-to-end.
"""

from datetime import UTC, date, datetime
from unittest.mock import AsyncMock, MagicMock
from uuid import UUID

import pytest

from src.core.exceptions import SeasonQuotaExhaustedError
from src.models.alliance import Alliance
from src.models.season import Season
from src.services.payment_service import PaymentService
from src.services.season_quota_service import SeasonQuotaService
from src.services.season_service import SeasonService

# --- Factory Helpers ---


def make_alliance(
    alliance_id: UUID,
    purchased_seasons: int = 0,
    used_seasons: int = 0,
) -> Alliance:
    now = datetime.now(UTC)
    return Alliance(
        id=alliance_id,
        name="Test Alliance",
        server_name="Server 1",
        created_at=now,
        updated_at=now,
        purchased_seasons=purchased_seasons,
        used_seasons=used_seasons,
    )


def make_season(
    season_id: UUID,
    alliance_id: UUID,
    *,
    activation_status: str = "draft",
    is_trial: bool = False,
    activated_at: datetime | None = None,
) -> Season:
    now = datetime.now(UTC)
    return Season(
        id=season_id,
        alliance_id=alliance_id,
        name="S1",
        start_date=date.today(),
        end_date=None,
        is_current=False,
        activation_status=activation_status,
        is_trial=is_trial,
        activated_at=activated_at,
        description=None,
        created_at=now,
        updated_at=now,
    )


# --- Shared IDs ---

USER_ID = UUID("11111111-1111-1111-1111-111111111111")
ALLIANCE_ID = UUID("22222222-2222-2222-2222-222222222222")
SEASON_ID = UUID("33333333-3333-3333-3333-333333333333")
SEASON_ID_2 = UUID("33333333-3333-3333-3333-333333333334")


# --- Fixtures ---


@pytest.fixture
def mock_alliance_repo() -> MagicMock:
    repo = MagicMock()
    repo.get_by_collaborator = AsyncMock(return_value=None)
    repo.get_by_id = AsyncMock(return_value=None)
    repo.increment_purchased_seasons = AsyncMock(return_value=(0, 0))
    repo.increment_used_seasons = AsyncMock(return_value=(0, 0))
    return repo


@pytest.fixture
def mock_season_repo() -> MagicMock:
    repo = MagicMock()
    repo.get_by_id = AsyncMock(return_value=None)
    repo.get_current_season = AsyncMock(return_value=None)
    repo.get_activated_seasons_count = AsyncMock(return_value=0)
    repo.get_by_alliance = AsyncMock(return_value=[])
    repo.update = AsyncMock(return_value=None)
    return repo


@pytest.fixture
def mock_webhook_repo() -> MagicMock:
    repo = MagicMock()
    repo.try_claim_event = AsyncMock(return_value=True)
    repo.update_event_details = AsyncMock(return_value=None)
    return repo


@pytest.fixture
def mock_permission_service() -> MagicMock:
    svc = MagicMock()
    svc.get_user_role = AsyncMock(return_value="owner")
    return svc


@pytest.fixture
def quota_service(
    mock_alliance_repo: MagicMock,
    mock_season_repo: MagicMock,
) -> SeasonQuotaService:
    svc = SeasonQuotaService()
    svc._alliance_repo = mock_alliance_repo
    svc._season_repo = mock_season_repo
    return svc


@pytest.fixture
def payment_service(
    mock_webhook_repo: MagicMock,
    quota_service: SeasonQuotaService,
) -> PaymentService:
    svc = PaymentService()
    svc._webhook_repo = mock_webhook_repo
    svc._quota_service = quota_service
    return svc


@pytest.fixture
def season_service(
    mock_season_repo: MagicMock,
    quota_service: SeasonQuotaService,
    mock_permission_service: MagicMock,
    mock_alliance_repo: MagicMock,
) -> SeasonService:
    svc = SeasonService()
    svc._repo = mock_season_repo
    svc._alliance_repo = mock_alliance_repo
    svc._permission_service = mock_permission_service
    svc._season_quota_service = quota_service
    return svc


# =========================================================================
# Test Classes
# =========================================================================


class TestPaymentIncreasesQuota:
    """Webhook checkout.completed → purchased_seasons increases."""

    async def test_payment_success_adds_seasons_to_alliance(
        self,
        payment_service: PaymentService,
        mock_alliance_repo: MagicMock,
        mock_webhook_repo: MagicMock,
    ):
        # Arrange: alliance exists with 0 purchased seasons
        alliance = make_alliance(ALLIANCE_ID, purchased_seasons=0, used_seasons=0)
        mock_alliance_repo.get_by_collaborator = AsyncMock(return_value=alliance)
        mock_alliance_repo.increment_purchased_seasons = AsyncMock(return_value=(1, 0))

        event_data = {"externalCustomerId": f"{USER_ID}:1"}

        # Act: simulate webhook
        result = await payment_service.handle_payment_success(
            event_data,
            event_id="evt_001",
            event_type="checkout.completed",
        )

        # Assert: seasons added, quota updated
        assert result["success"] is True
        assert result["seasons_added"] == 1
        assert result["available_seasons"] == 1
        mock_alliance_repo.increment_purchased_seasons.assert_awaited_once_with(ALLIANCE_ID, 1)
        mock_webhook_repo.try_claim_event.assert_awaited_once_with("evt_001", "checkout.completed")

    async def test_payment_adds_multiple_seasons(
        self,
        payment_service: PaymentService,
        mock_alliance_repo: MagicMock,
    ):
        # Arrange: buy 3 seasons at once
        alliance = make_alliance(ALLIANCE_ID, purchased_seasons=0, used_seasons=0)
        mock_alliance_repo.get_by_collaborator = AsyncMock(return_value=alliance)
        mock_alliance_repo.increment_purchased_seasons = AsyncMock(return_value=(3, 0))

        event_data = {"externalCustomerId": f"{USER_ID}:3"}

        # Act
        result = await payment_service.handle_payment_success(
            event_data,
            event_id="evt_002",
            event_type="checkout.completed",
        )

        # Assert
        assert result["seasons_added"] == 3
        assert result["available_seasons"] == 3
        mock_alliance_repo.increment_purchased_seasons.assert_awaited_once_with(ALLIANCE_ID, 3)


class TestWebhookIdempotency:
    """Duplicate webhook events must not double-credit seasons."""

    async def test_duplicate_event_returns_success_without_adding_seasons(
        self,
        payment_service: PaymentService,
        mock_alliance_repo: MagicMock,
        mock_webhook_repo: MagicMock,
    ):
        # Arrange: event already claimed (duplicate)
        mock_webhook_repo.try_claim_event = AsyncMock(return_value=False)

        event_data = {"externalCustomerId": f"{USER_ID}:1"}

        # Act: send same event again
        result = await payment_service.handle_payment_success(
            event_data,
            event_id="evt_001",
            event_type="checkout.completed",
        )

        # Assert: returned success but did NOT touch quota
        assert result["success"] is True
        assert result["duplicate"] is True
        mock_alliance_repo.increment_purchased_seasons.assert_not_awaited()

    async def test_first_then_duplicate_only_credits_once(
        self,
        payment_service: PaymentService,
        mock_alliance_repo: MagicMock,
        mock_webhook_repo: MagicMock,
    ):
        # Arrange
        alliance = make_alliance(ALLIANCE_ID, purchased_seasons=0, used_seasons=0)
        mock_alliance_repo.get_by_collaborator = AsyncMock(return_value=alliance)
        mock_alliance_repo.increment_purchased_seasons = AsyncMock(return_value=(1, 0))

        event_data = {"externalCustomerId": f"{USER_ID}:1"}

        # Act 1: first delivery — claim succeeds
        mock_webhook_repo.try_claim_event = AsyncMock(return_value=True)
        result1 = await payment_service.handle_payment_success(
            event_data,
            event_id="evt_003",
            event_type="checkout.completed",
        )

        # Act 2: redelivery — claim fails (duplicate)
        mock_webhook_repo.try_claim_event = AsyncMock(return_value=False)
        result2 = await payment_service.handle_payment_success(
            event_data,
            event_id="evt_003",
            event_type="checkout.completed",
        )

        # Assert: credited exactly once
        assert result1["success"] is True
        assert result1.get("duplicate") is not True
        assert result2["success"] is True
        assert result2["duplicate"] is True
        assert mock_alliance_repo.increment_purchased_seasons.await_count == 1


class TestSeasonActivationConsumesQuota:
    """Activating a season must deduct from available quota."""

    async def test_activate_season_uses_purchased_quota(
        self,
        season_service: SeasonService,
        mock_season_repo: MagicMock,
        mock_alliance_repo: MagicMock,
    ):
        # Arrange: alliance has 1 purchased season, draft season ready
        alliance = make_alliance(ALLIANCE_ID, purchased_seasons=1, used_seasons=0)
        mock_alliance_repo.get_by_collaborator = AsyncMock(return_value=alliance)
        mock_alliance_repo.get_by_id = AsyncMock(return_value=alliance)
        mock_alliance_repo.increment_used_seasons = AsyncMock(return_value=(1, 1))

        draft_season = make_season(SEASON_ID, ALLIANCE_ID, activation_status="draft")
        mock_season_repo.get_by_id = AsyncMock(return_value=draft_season)
        mock_season_repo.get_by_alliance = AsyncMock(return_value=[])

        # Mock update to return activated season
        activated_season = make_season(
            SEASON_ID,
            ALLIANCE_ID,
            activation_status="activated",
            activated_at=datetime.now(UTC),
        )
        mock_season_repo.update = AsyncMock(return_value=activated_season)

        # Act
        result = await season_service.activate_season(USER_ID, SEASON_ID)

        # Assert: season activated, quota consumed
        assert result.success is True
        assert result.used_trial is False
        assert result.remaining_seasons == 0
        mock_alliance_repo.increment_used_seasons.assert_awaited_once_with(ALLIANCE_ID)

    async def test_first_activation_uses_trial_when_no_purchased(
        self,
        season_service: SeasonService,
        mock_season_repo: MagicMock,
        mock_alliance_repo: MagicMock,
    ):
        # Arrange: no purchased seasons, no prior activations (trial available)
        alliance = make_alliance(ALLIANCE_ID, purchased_seasons=0, used_seasons=0)
        mock_alliance_repo.get_by_collaborator = AsyncMock(return_value=alliance)
        mock_alliance_repo.get_by_id = AsyncMock(return_value=alliance)
        mock_season_repo.get_activated_seasons_count = AsyncMock(return_value=0)

        draft_season = make_season(SEASON_ID, ALLIANCE_ID, activation_status="draft")
        mock_season_repo.get_by_id = AsyncMock(return_value=draft_season)
        mock_season_repo.get_by_alliance = AsyncMock(return_value=[])

        activated_season = make_season(
            SEASON_ID,
            ALLIANCE_ID,
            activation_status="activated",
            is_trial=True,
            activated_at=datetime.now(UTC),
        )
        mock_season_repo.update = AsyncMock(return_value=activated_season)

        # Act
        result = await season_service.activate_season(USER_ID, SEASON_ID)

        # Assert: trial used, no purchased quota consumed
        assert result.success is True
        assert result.used_trial is True
        assert result.trial_ends_at is not None
        mock_alliance_repo.increment_used_seasons.assert_not_awaited()


class TestFullPaymentToActivationFlow:
    """End-to-end: payment adds quota, activation consumes it, exhaustion blocks."""

    async def test_pay_then_activate_then_exhaust(
        self,
        payment_service: PaymentService,
        season_service: SeasonService,
        mock_alliance_repo: MagicMock,
        mock_season_repo: MagicMock,
        mock_webhook_repo: MagicMock,
    ):
        # --- Phase 1: Payment adds 1 season ---
        alliance_before = make_alliance(ALLIANCE_ID, purchased_seasons=0, used_seasons=0)
        mock_alliance_repo.get_by_collaborator = AsyncMock(return_value=alliance_before)
        mock_alliance_repo.increment_purchased_seasons = AsyncMock(return_value=(1, 0))

        payment_result = await payment_service.handle_payment_success(
            {"externalCustomerId": f"{USER_ID}:1"},
            event_id="evt_100",
            event_type="checkout.completed",
        )
        assert payment_result["success"] is True
        assert payment_result["available_seasons"] == 1

        # --- Phase 2: Activate season (consumes the 1 purchased) ---
        alliance_after_pay = make_alliance(ALLIANCE_ID, purchased_seasons=1, used_seasons=0)
        mock_alliance_repo.get_by_collaborator = AsyncMock(return_value=alliance_after_pay)
        mock_alliance_repo.get_by_id = AsyncMock(return_value=alliance_after_pay)
        mock_alliance_repo.increment_used_seasons = AsyncMock(return_value=(1, 1))
        mock_season_repo.get_activated_seasons_count = AsyncMock(return_value=1)

        draft = make_season(SEASON_ID, ALLIANCE_ID, activation_status="draft")
        mock_season_repo.get_by_id = AsyncMock(return_value=draft)
        mock_season_repo.get_by_alliance = AsyncMock(return_value=[])
        activated = make_season(
            SEASON_ID,
            ALLIANCE_ID,
            activation_status="activated",
            activated_at=datetime.now(UTC),
        )
        mock_season_repo.update = AsyncMock(return_value=activated)

        activate_result = await season_service.activate_season(USER_ID, SEASON_ID)
        assert activate_result.success is True
        assert activate_result.remaining_seasons == 0

        # --- Phase 3: Second activation should fail (quota exhausted) ---
        alliance_exhausted = make_alliance(ALLIANCE_ID, purchased_seasons=1, used_seasons=1)
        mock_alliance_repo.get_by_collaborator = AsyncMock(return_value=alliance_exhausted)
        mock_alliance_repo.get_by_id = AsyncMock(return_value=alliance_exhausted)
        mock_season_repo.get_activated_seasons_count = AsyncMock(return_value=1)

        draft2 = make_season(SEASON_ID_2, ALLIANCE_ID, activation_status="draft")
        mock_season_repo.get_by_id = AsyncMock(return_value=draft2)

        with pytest.raises(SeasonQuotaExhaustedError):
            await season_service.activate_season(USER_ID, SEASON_ID_2)

    async def test_trial_then_purchase_then_activate_second(
        self,
        payment_service: PaymentService,
        season_service: SeasonService,
        mock_alliance_repo: MagicMock,
        mock_season_repo: MagicMock,
        mock_webhook_repo: MagicMock,
    ):
        # --- Phase 1: First activation uses trial (no purchase) ---
        alliance_new = make_alliance(ALLIANCE_ID, purchased_seasons=0, used_seasons=0)
        mock_alliance_repo.get_by_collaborator = AsyncMock(return_value=alliance_new)
        mock_alliance_repo.get_by_id = AsyncMock(return_value=alliance_new)
        mock_season_repo.get_activated_seasons_count = AsyncMock(return_value=0)

        draft1 = make_season(SEASON_ID, ALLIANCE_ID, activation_status="draft")
        mock_season_repo.get_by_id = AsyncMock(return_value=draft1)
        mock_season_repo.get_by_alliance = AsyncMock(return_value=[])
        activated1 = make_season(
            SEASON_ID,
            ALLIANCE_ID,
            activation_status="activated",
            is_trial=True,
            activated_at=datetime.now(UTC),
        )
        mock_season_repo.update = AsyncMock(return_value=activated1)

        result1 = await season_service.activate_season(USER_ID, SEASON_ID)
        assert result1.used_trial is True

        # --- Phase 2: Purchase 1 season ---
        mock_alliance_repo.get_by_collaborator = AsyncMock(
            return_value=make_alliance(ALLIANCE_ID, purchased_seasons=0, used_seasons=0),
        )
        mock_alliance_repo.increment_purchased_seasons = AsyncMock(return_value=(1, 0))

        pay_result = await payment_service.handle_payment_success(
            {"externalCustomerId": f"{USER_ID}:1"},
            event_id="evt_200",
            event_type="order.paid",
        )
        assert pay_result["success"] is True

        # --- Phase 3: Second activation uses purchased quota ---
        alliance_paid = make_alliance(ALLIANCE_ID, purchased_seasons=1, used_seasons=0)
        mock_alliance_repo.get_by_collaborator = AsyncMock(return_value=alliance_paid)
        mock_alliance_repo.get_by_id = AsyncMock(return_value=alliance_paid)
        mock_alliance_repo.increment_used_seasons = AsyncMock(return_value=(1, 1))
        mock_season_repo.get_activated_seasons_count = AsyncMock(return_value=1)

        draft2 = make_season(SEASON_ID_2, ALLIANCE_ID, activation_status="draft")
        mock_season_repo.get_by_id = AsyncMock(return_value=draft2)
        mock_season_repo.get_by_alliance = AsyncMock(return_value=[])
        activated2 = make_season(
            SEASON_ID_2,
            ALLIANCE_ID,
            activation_status="activated",
            activated_at=datetime.now(UTC),
        )
        mock_season_repo.update = AsyncMock(return_value=activated2)

        result2 = await season_service.activate_season(USER_ID, SEASON_ID_2)
        assert result2.success is True
        assert result2.used_trial is False
        assert result2.remaining_seasons == 0
