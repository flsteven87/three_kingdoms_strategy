"""
Unit Tests for PaymentService (server-authoritative validation + atomic RPC).
"""

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID

import pytest
from postgrest.exceptions import APIError

from src.core.webhook_errors import WebhookPermanentError, WebhookTransientError
from src.repositories.webhook_event_repository import WebhookProcessingResult
from src.services.payment_service import PaymentService

USER_ID = UUID("11111111-1111-1111-1111-111111111111")
ALLIANCE_ID = UUID("22222222-2222-2222-2222-222222222222")
PRODUCT_ID = "prod_test_999"


@pytest.fixture
def fake_settings():
    with patch("src.services.payment_service.settings") as s:
        s.recur_product_id = PRODUCT_ID
        s.recur_expected_amount_twd = 999
        s.recur_expected_currency = "TWD"
        yield s


@pytest.fixture
def mock_alliance():
    a = MagicMock()
    a.id = ALLIANCE_ID
    return a


@pytest.fixture
def service(fake_settings, mock_alliance):
    svc = PaymentService()
    svc._quota_service = MagicMock()
    svc._quota_service.get_alliance_by_user = AsyncMock(return_value=mock_alliance)
    svc._webhook_repo = MagicMock()
    svc._webhook_repo.process_event = AsyncMock(
        return_value=WebhookProcessingResult(status="granted", available_seasons=5)
    )
    return svc


def _valid_event_data() -> dict:
    return {
        "externalCustomerId": str(USER_ID),
        "productId": PRODUCT_ID,
        "amount": 999,
        "currency": "TWD",
    }


class TestHandlePaymentSuccess:
    @pytest.mark.asyncio
    async def test_happy_path_grants_one_season(self, service):
        result = await service.handle_payment_success(
            _valid_event_data(), event_id="evt_1", event_type="checkout.completed"
        )
        assert result == {
            "status": "granted",
            "alliance_id": str(ALLIANCE_ID),
            "user_id": str(USER_ID),
            "seasons_added": 1,
            "available_seasons": 5,
        }
        service._webhook_repo.process_event.assert_awaited_once()
        kwargs = service._webhook_repo.process_event.await_args.kwargs
        assert kwargs["seasons"] == 1
        assert kwargs["alliance_id"] == ALLIANCE_ID
        assert kwargs["user_id"] == USER_ID

    @pytest.mark.asyncio
    async def test_duplicate_event_returns_duplicate_status(self, service):
        service._webhook_repo.process_event = AsyncMock(
            return_value=WebhookProcessingResult(status="duplicate", available_seasons=5)
        )
        result = await service.handle_payment_success(
            _valid_event_data(), event_id="evt_dup", event_type="checkout.completed"
        )
        assert result["status"] == "duplicate"
        assert result["seasons_added"] == 0

    @pytest.mark.asyncio
    async def test_missing_event_id_is_permanent(self, service):
        with pytest.raises(WebhookPermanentError) as ei:
            await service.handle_payment_success(_valid_event_data(), event_id=None)
        assert ei.value.code == "missing_event_id"

    @pytest.mark.asyncio
    async def test_missing_external_customer_id_is_permanent(self, service):
        data = _valid_event_data()
        data.pop("externalCustomerId")
        with pytest.raises(WebhookPermanentError) as ei:
            await service.handle_payment_success(data, event_id="evt_1")
        assert ei.value.code == "missing_external_customer_id"

    @pytest.mark.asyncio
    async def test_invalid_uuid_is_permanent(self, service):
        data = _valid_event_data()
        data["externalCustomerId"] = "not-a-uuid"
        with pytest.raises(WebhookPermanentError) as ei:
            await service.handle_payment_success(data, event_id="evt_1")
        assert ei.value.code == "invalid_external_customer_id"

    @pytest.mark.asyncio
    async def test_legacy_quantity_suffix_is_tolerated(self, service):
        """
        Recur stores Customer.externalId sticky-per-email. Customers created under
        the old ``uuid:qty`` format still send that string back in webhook payloads
        forever. Parse defensively — the UUID part is all that matters. Quantity is
        already hardcoded by SEASONS_PER_PURCHASE, so any suffix is ignored noise.
        """
        data = _valid_event_data()
        data["externalCustomerId"] = f"{USER_ID}:1"
        result = await service.handle_payment_success(data, event_id="evt_legacy")
        assert result["status"] == "granted"
        assert result["user_id"] == str(USER_ID)
        assert result["seasons_added"] == 1
        kwargs = service._webhook_repo.process_event.await_args.kwargs
        assert kwargs["user_id"] == USER_ID

    @pytest.mark.asyncio
    async def test_external_id_nested_under_customer(self, service):
        """Recur may nest externalId under data.customer.externalId."""
        data = _valid_event_data()
        data.pop("externalCustomerId")
        data["customer"] = {"id": "recur_cust_1", "externalId": str(USER_ID)}
        result = await service.handle_payment_success(data, event_id="evt_nested_camel")
        assert result["status"] == "granted"
        assert result["user_id"] == str(USER_ID)

    @pytest.mark.asyncio
    async def test_external_id_nested_under_customer_snake(self, service):
        """Same as above but using snake_case field name."""
        data = _valid_event_data()
        data.pop("externalCustomerId")
        data["customer"] = {"id": "recur_cust_1", "external_id": str(USER_ID)}
        result = await service.handle_payment_success(data, event_id="evt_nested_snake")
        assert result["status"] == "granted"

    @pytest.mark.asyncio
    async def test_external_id_nested_under_order_customer(self, service):
        """order.paid events may nest under data.order.customer.externalId."""
        data = _valid_event_data()
        data.pop("externalCustomerId")
        data["order"] = {
            "id": "ord_1",
            "customer": {"id": "recur_cust_1", "externalId": str(USER_ID)},
        }
        result = await service.handle_payment_success(data, event_id="evt_order_nested")
        assert result["status"] == "granted"

    @pytest.mark.asyncio
    async def test_legacy_suffix_never_inflates_grant(self, service):
        """
        Defence-in-depth: even if the suffix claims a large quantity, the grant
        stays at SEASONS_PER_PURCHASE. The old quantity-inflation exploit MUST
        remain closed regardless of what the suffix says.
        """
        data = _valid_event_data()
        data["externalCustomerId"] = f"{USER_ID}:999"
        result = await service.handle_payment_success(data, event_id="evt_exploit")
        assert result["seasons_added"] == 1
        kwargs = service._webhook_repo.process_event.await_args.kwargs
        assert kwargs["seasons"] == 1

    @pytest.mark.asyncio
    async def test_product_mismatch_is_permanent(self, service):
        data = _valid_event_data()
        data["productId"] = "prod_other"
        with pytest.raises(WebhookPermanentError) as ei:
            await service.handle_payment_success(data, event_id="evt_1")
        assert ei.value.code == "product_mismatch"

    @pytest.mark.asyncio
    async def test_missing_product_is_permanent(self, service):
        data = _valid_event_data()
        data.pop("productId")
        with pytest.raises(WebhookPermanentError) as ei:
            await service.handle_payment_success(data, event_id="evt_1")
        assert ei.value.code == "product_mismatch"

    @pytest.mark.asyncio
    async def test_amount_mismatch_is_permanent(self, service):
        data = _valid_event_data()
        data["amount"] = 1
        with pytest.raises(WebhookPermanentError) as ei:
            await service.handle_payment_success(data, event_id="evt_1")
        assert ei.value.code == "amount_mismatch"

    @pytest.mark.asyncio
    async def test_currency_mismatch_is_permanent(self, service):
        data = _valid_event_data()
        data["currency"] = "USD"
        with pytest.raises(WebhookPermanentError) as ei:
            await service.handle_payment_success(data, event_id="evt_1")
        assert ei.value.code == "currency_mismatch"

    @pytest.mark.asyncio
    async def test_user_without_alliance_is_permanent(self, service):
        service._quota_service.get_alliance_by_user = AsyncMock(return_value=None)
        with pytest.raises(WebhookPermanentError) as ei:
            await service.handle_payment_success(_valid_event_data(), event_id="evt_1")
        assert ei.value.code == "alliance_not_found"

    @pytest.mark.asyncio
    async def test_rpc_api_error_is_transient(self, service):
        service._webhook_repo.process_event = AsyncMock(
            side_effect=APIError({"message": "boom", "code": "53300"})
        )
        with pytest.raises(WebhookTransientError) as ei:
            await service.handle_payment_success(_valid_event_data(), event_id="evt_1")
        assert ei.value.code == "rpc_api_error"

    @pytest.mark.asyncio
    async def test_alliance_lookup_os_error_is_transient(self, service):
        service._quota_service.get_alliance_by_user = AsyncMock(side_effect=OSError("db down"))
        with pytest.raises(WebhookTransientError) as ei:
            await service.handle_payment_success(_valid_event_data(), event_id="evt_1")
        assert ei.value.code == "alliance_lookup_failed"
