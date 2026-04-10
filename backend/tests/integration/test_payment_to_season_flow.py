"""
Integration tests: Payment → Quota → Season Activation flow.

Tests the full cross-service orchestration with mocked repositories
to verify state transitions are correct end-to-end.
"""

from datetime import UTC, date, datetime
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID

import pytest

from src.core.exceptions import SeasonQuotaExhaustedError
from src.core.webhook_errors import WebhookPermanentError
from src.models.alliance import Alliance
from src.models.season import Season
from src.repositories.webhook_event_repository import WebhookProcessingResult
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
PRODUCT_ID = "prod_test_999"


CHECKOUT_ID = "chk_integration_test"
ORDER_ID = "ord_integration_test"


def valid_event_data() -> dict:
    """``order.paid`` payload matching server-authoritative config."""
    return {
        "id": ORDER_ID,
        "order_id": ORDER_ID,
        "checkout_id": CHECKOUT_ID,
        "customer": {"external_id": str(USER_ID)},
        "product_id": PRODUCT_ID,
        "amount": 999,
        "currency": "TWD",
    }


# --- Fixtures ---


@pytest.fixture(autouse=True)
def fake_payment_settings():
    """Patch PaymentService settings so validation knows the product/amount."""
    with patch("src.services.payment_service.settings") as s:
        s.recur_product_id = PRODUCT_ID
        s.recur_expected_amount_twd = 999
        s.recur_expected_currency = "TWD"
        yield s


@pytest.fixture
def mock_alliance_repo() -> MagicMock:
    repo = MagicMock()
    repo.get_by_collaborator = AsyncMock(return_value=None)
    repo.get_by_id = AsyncMock(return_value=None)
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
    repo.process_event = AsyncMock(
        return_value=WebhookProcessingResult(status="granted", available_seasons=1)
    )
    return repo


@pytest.fixture
def mock_permission_service() -> MagicMock:
    svc = MagicMock()
    svc.get_user_role = AsyncMock(return_value="owner")
    return svc


@pytest.fixture
def mock_supabase_client() -> MagicMock:
    """Mock Supabase client used by SeasonQuotaService for the consume_season_quota RPC."""
    return MagicMock()


@pytest.fixture
def quota_service(
    mock_alliance_repo: MagicMock,
    mock_season_repo: MagicMock,
    mock_supabase_client: MagicMock,
) -> SeasonQuotaService:
    svc = SeasonQuotaService()
    svc._alliance_repo = mock_alliance_repo
    svc._season_repo = mock_season_repo
    svc._client = mock_supabase_client
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
    """Webhook order.paid → RPC grants exactly 1 season."""

    async def test_payment_success_grants_one_season(
        self,
        payment_service: PaymentService,
        mock_alliance_repo: MagicMock,
        mock_webhook_repo: MagicMock,
    ):
        alliance = make_alliance(ALLIANCE_ID, purchased_seasons=0, used_seasons=0)
        mock_alliance_repo.get_by_collaborator = AsyncMock(return_value=alliance)
        mock_webhook_repo.process_event = AsyncMock(
            return_value=WebhookProcessingResult(status="granted", available_seasons=1)
        )

        result = await payment_service.handle_payment_success(
            valid_event_data(),
            event_id="evt_001",
            event_type="order.paid",
        )

        assert result["status"] == "granted"
        assert result["seasons_added"] == 1
        assert result["available_seasons"] == 1
        mock_webhook_repo.process_event.assert_awaited_once()
        kwargs = mock_webhook_repo.process_event.await_args.kwargs
        assert kwargs["alliance_id"] == ALLIANCE_ID
        assert kwargs["user_id"] == USER_ID
        assert kwargs["seasons"] == 1


class TestWebhookIdempotency:
    """Duplicate webhook events must not double-credit seasons."""

    async def test_duplicate_event_returns_duplicate_without_extra_grant(
        self,
        payment_service: PaymentService,
        mock_alliance_repo: MagicMock,
        mock_webhook_repo: MagicMock,
    ):
        alliance = make_alliance(ALLIANCE_ID, purchased_seasons=1, used_seasons=0)
        mock_alliance_repo.get_by_collaborator = AsyncMock(return_value=alliance)
        mock_webhook_repo.process_event = AsyncMock(
            return_value=WebhookProcessingResult(status="duplicate_event", available_seasons=1)
        )

        result = await payment_service.handle_payment_success(
            valid_event_data(),
            event_id="evt_001",
            event_type="order.paid",
        )

        assert result["status"] == "duplicate_event"
        assert result["seasons_added"] == 0
        assert result["available_seasons"] == 1

    async def test_first_then_duplicate_only_credits_once(
        self,
        payment_service: PaymentService,
        mock_alliance_repo: MagicMock,
        mock_webhook_repo: MagicMock,
    ):
        alliance = make_alliance(ALLIANCE_ID, purchased_seasons=0, used_seasons=0)
        mock_alliance_repo.get_by_collaborator = AsyncMock(return_value=alliance)

        # First delivery: RPC claims + grants
        mock_webhook_repo.process_event = AsyncMock(
            return_value=WebhookProcessingResult(status="granted", available_seasons=1)
        )
        result1 = await payment_service.handle_payment_success(
            valid_event_data(),
            event_id="evt_003",
            event_type="order.paid",
        )

        # Redelivery: RPC reports duplicate_event
        mock_webhook_repo.process_event = AsyncMock(
            return_value=WebhookProcessingResult(status="duplicate_event", available_seasons=1)
        )
        result2 = await payment_service.handle_payment_success(
            valid_event_data(),
            event_id="evt_003",
            event_type="order.paid",
        )

        assert result1["status"] == "granted"
        assert result1["seasons_added"] == 1
        assert result2["status"] == "duplicate_event"
        assert result2["seasons_added"] == 0


class TestDiscountedAmountValidation:
    """Coupon-discounted amounts should be accepted; invalid amounts rejected."""

    async def test_discounted_amount_accepted(
        self,
        payment_service: PaymentService,
        mock_alliance_repo: MagicMock,
        mock_webhook_repo: MagicMock,
    ):
        """Webhook with coupon-discounted amount (799) should be accepted."""
        alliance = make_alliance(ALLIANCE_ID, purchased_seasons=0, used_seasons=0)
        mock_alliance_repo.get_by_collaborator = AsyncMock(return_value=alliance)
        mock_webhook_repo.process_event = AsyncMock(
            return_value=WebhookProcessingResult(status="granted", available_seasons=1)
        )

        data = valid_event_data()
        data["amount"] = 799  # NT$999 - NT$200 coupon

        result = await payment_service.handle_payment_success(
            data, event_id="evt_discount_1", event_type="order.paid",
        )
        assert result["status"] == "granted"

    async def test_amount_zero_rejected(
        self,
        payment_service: PaymentService,
    ):
        """Zero amount should be rejected even with valid signature."""
        data = valid_event_data()
        data["amount"] = 0
        with pytest.raises(WebhookPermanentError, match="amount_out_of_range"):
            await payment_service.handle_payment_success(
                data, event_id="evt_zero", event_type="order.paid",
            )

    async def test_amount_above_expected_rejected(
        self,
        payment_service: PaymentService,
    ):
        """Amount exceeding expected price should be rejected."""
        data = valid_event_data()
        data["amount"] = 1500
        with pytest.raises(WebhookPermanentError, match="amount_out_of_range"):
            await payment_service.handle_payment_success(
                data, event_id="evt_over", event_type="order.paid",
            )

    async def test_negative_amount_rejected(
        self,
        payment_service: PaymentService,
    ):
        """Negative amount should be rejected."""
        data = valid_event_data()
        data["amount"] = -100
        with pytest.raises(WebhookPermanentError, match="amount_out_of_range"):
            await payment_service.handle_payment_success(
                data, event_id="evt_neg", event_type="order.paid",
            )


class TestSeasonActivationConsumesQuota:
    """Activating a season must deduct from available quota."""

    async def test_activate_season_uses_purchased_quota(
        self,
        season_service: SeasonService,
        mock_season_repo: MagicMock,
        mock_alliance_repo: MagicMock,
        mock_supabase_client: MagicMock,
    ):
        alliance = make_alliance(ALLIANCE_ID, purchased_seasons=1, used_seasons=0)
        mock_alliance_repo.get_by_collaborator = AsyncMock(return_value=alliance)
        mock_alliance_repo.get_by_id = AsyncMock(return_value=alliance)

        # Mock the atomic consume_season_quota RPC
        rpc_result = MagicMock()
        rpc_result.data = [{"status": "paid", "remaining_seasons": 0}]
        mock_supabase_client.rpc.return_value.execute.return_value = rpc_result

        draft_season = make_season(SEASON_ID, ALLIANCE_ID, activation_status="draft")
        mock_season_repo.get_by_id = AsyncMock(return_value=draft_season)
        mock_season_repo.get_by_alliance = AsyncMock(return_value=[])

        activated_season = make_season(
            SEASON_ID,
            ALLIANCE_ID,
            activation_status="activated",
            activated_at=datetime.now(UTC),
        )
        mock_season_repo.update = AsyncMock(return_value=activated_season)

        result = await season_service.activate_season(USER_ID, SEASON_ID)

        assert result.success is True
        assert result.used_trial is False
        assert result.remaining_seasons == 0
        mock_supabase_client.rpc.assert_called_once_with(
            "consume_season_quota",
            {"p_alliance_id": str(ALLIANCE_ID)},
        )

    async def test_first_activation_uses_trial_when_no_purchased(
        self,
        season_service: SeasonService,
        mock_season_repo: MagicMock,
        mock_alliance_repo: MagicMock,
        mock_supabase_client: MagicMock,
    ):
        alliance = make_alliance(ALLIANCE_ID, purchased_seasons=0, used_seasons=0)
        mock_alliance_repo.get_by_collaborator = AsyncMock(return_value=alliance)
        mock_alliance_repo.get_by_id = AsyncMock(return_value=alliance)
        mock_season_repo.get_activated_seasons_count = AsyncMock(return_value=0)

        # Mock the atomic consume_season_quota RPC — trial path
        rpc_result = MagicMock()
        rpc_result.data = [{"status": "trial", "remaining_seasons": 0}]
        mock_supabase_client.rpc.return_value.execute.return_value = rpc_result

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

        result = await season_service.activate_season(USER_ID, SEASON_ID)

        assert result.success is True
        assert result.used_trial is True
        assert result.trial_ends_at is not None


class TestFullPaymentToActivationFlow:
    """End-to-end: payment adds quota, activation consumes it, exhaustion blocks."""

    async def test_pay_then_activate_then_exhaust(
        self,
        payment_service: PaymentService,
        season_service: SeasonService,
        mock_alliance_repo: MagicMock,
        mock_season_repo: MagicMock,
        mock_webhook_repo: MagicMock,
        mock_supabase_client: MagicMock,
    ):
        # --- Phase 1: Payment grants 1 season via RPC ---
        alliance_before = make_alliance(ALLIANCE_ID, purchased_seasons=0, used_seasons=0)
        mock_alliance_repo.get_by_collaborator = AsyncMock(return_value=alliance_before)
        mock_webhook_repo.process_event = AsyncMock(
            return_value=WebhookProcessingResult(status="granted", available_seasons=1)
        )

        payment_result = await payment_service.handle_payment_success(
            valid_event_data(),
            event_id="evt_100",
            event_type="order.paid",
        )
        assert payment_result["status"] == "granted"
        assert payment_result["available_seasons"] == 1

        # --- Phase 2: Activate season (consumes the 1 purchased via atomic RPC) ---
        alliance_after_pay = make_alliance(ALLIANCE_ID, purchased_seasons=1, used_seasons=0)
        mock_alliance_repo.get_by_collaborator = AsyncMock(return_value=alliance_after_pay)
        mock_alliance_repo.get_by_id = AsyncMock(return_value=alliance_after_pay)
        mock_season_repo.get_activated_seasons_count = AsyncMock(return_value=1)

        rpc_result = MagicMock()
        rpc_result.data = [{"status": "paid", "remaining_seasons": 0}]
        mock_supabase_client.rpc.return_value.execute.return_value = rpc_result

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
        mock_supabase_client: MagicMock,
    ):
        # --- Phase 1: First activation uses trial (via atomic RPC) ---
        alliance_new = make_alliance(ALLIANCE_ID, purchased_seasons=0, used_seasons=0)
        mock_alliance_repo.get_by_collaborator = AsyncMock(return_value=alliance_new)
        mock_alliance_repo.get_by_id = AsyncMock(return_value=alliance_new)
        mock_season_repo.get_activated_seasons_count = AsyncMock(return_value=0)

        rpc_trial = MagicMock()
        rpc_trial.data = [{"status": "trial", "remaining_seasons": 0}]
        mock_supabase_client.rpc.return_value.execute.return_value = rpc_trial

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

        # --- Phase 2: Purchase 1 season via webhook RPC ---
        mock_alliance_repo.get_by_collaborator = AsyncMock(
            return_value=make_alliance(ALLIANCE_ID, purchased_seasons=0, used_seasons=0),
        )
        mock_webhook_repo.process_event = AsyncMock(
            return_value=WebhookProcessingResult(status="granted", available_seasons=1)
        )

        pay_result = await payment_service.handle_payment_success(
            valid_event_data(),
            event_id="evt_200",
            event_type="order.paid",
        )
        assert pay_result["status"] == "granted"

        # --- Phase 3: Second activation uses purchased quota (via atomic RPC) ---
        alliance_paid = make_alliance(ALLIANCE_ID, purchased_seasons=1, used_seasons=0)
        mock_alliance_repo.get_by_collaborator = AsyncMock(return_value=alliance_paid)
        mock_alliance_repo.get_by_id = AsyncMock(return_value=alliance_paid)
        mock_season_repo.get_activated_seasons_count = AsyncMock(return_value=1)

        rpc_paid = MagicMock()
        rpc_paid.data = [{"status": "paid", "remaining_seasons": 0}]
        mock_supabase_client.rpc.return_value.execute.return_value = rpc_paid

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
