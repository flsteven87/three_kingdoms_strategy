"""
Unit Tests for PaymentService — purchase-level idempotency edition.

All tests build input via ``tests.fixtures.recur_payloads`` so the synthetic
shapes stay in lockstep with real Recur payloads.
"""

import logging
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID

import pytest
from postgrest.exceptions import APIError

from src.core.webhook_errors import WebhookPermanentError, WebhookTransientError
from src.repositories.webhook_event_repository import WebhookProcessingResult
from src.services.payment_service import PaymentService
from tests.fixtures.recur_payloads import (
    TEST_CHECKOUT_ID,
    TEST_ORDER_ID,
    TEST_PRODUCT_ID,
    TEST_USER_ID,
    checkout_completed,
    clone,
    order_paid,
)

ALLIANCE_ID = UUID("22222222-2222-2222-2222-222222222222")


@pytest.fixture
def fake_settings():
    with patch("src.services.payment_service.settings") as s:
        s.recur_product_id = TEST_PRODUCT_ID
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


class TestEventTypeRouting:
    @pytest.mark.asyncio
    async def test_order_paid_grants_one_season(self, service):
        result = await service.handle_payment_success(
            order_paid(), event_id="evt_order_1", event_type="order.paid"
        )
        assert result["status"] == "granted"
        assert result["seasons_added"] == 1
        kwargs = service._webhook_repo.process_event.await_args.kwargs
        assert kwargs["seasons"] == 1
        assert kwargs["checkout_id"] == TEST_CHECKOUT_ID
        assert kwargs["order_id"] == TEST_ORDER_ID

    @pytest.mark.asyncio
    async def test_checkout_completed_is_audit_only(self, service):
        service._webhook_repo.process_event = AsyncMock(
            return_value=WebhookProcessingResult(status="audit_only", available_seasons=5)
        )
        result = await service.handle_payment_success(
            checkout_completed(), event_id="evt_chk_1", event_type="checkout.completed"
        )
        assert result["status"] == "audit_only"
        assert result["seasons_added"] == 0
        kwargs = service._webhook_repo.process_event.await_args.kwargs
        assert kwargs["seasons"] == 0
        assert kwargs["checkout_id"] == TEST_CHECKOUT_ID
        assert kwargs["order_id"] is None

    @pytest.mark.asyncio
    async def test_unknown_event_type_is_permanent(self, service):
        with pytest.raises(WebhookPermanentError) as ei:
            await service.handle_payment_success(
                order_paid(), event_id="evt_wat", event_type="subscription.renewed"
            )
        assert ei.value.code == "unsupported_event_type"

    @pytest.mark.asyncio
    async def test_duplicate_purchase_status_propagated(self, service):
        service._webhook_repo.process_event = AsyncMock(
            return_value=WebhookProcessingResult(status="duplicate_purchase", available_seasons=6)
        )
        result = await service.handle_payment_success(
            order_paid(), event_id="evt_sibling", event_type="order.paid"
        )
        assert result["status"] == "duplicate_purchase"
        assert result["seasons_added"] == 0


class TestCheckoutIdExtraction:
    @pytest.mark.asyncio
    async def test_checkout_completed_reads_top_level_id(self, service):
        payload = clone(checkout_completed(checkout_id="chk_explicit"))
        await service.handle_payment_success(
            payload, event_id="evt_1", event_type="checkout.completed"
        )
        kwargs = service._webhook_repo.process_event.await_args.kwargs
        assert kwargs["checkout_id"] == "chk_explicit"

    @pytest.mark.asyncio
    async def test_order_paid_reads_checkout_id_field(self, service):
        payload = clone(order_paid(checkout_id="chk_from_order_paid"))
        await service.handle_payment_success(payload, event_id="evt_2", event_type="order.paid")
        kwargs = service._webhook_repo.process_event.await_args.kwargs
        assert kwargs["checkout_id"] == "chk_from_order_paid"
        assert kwargs["order_id"] == TEST_ORDER_ID

    @pytest.mark.asyncio
    async def test_missing_checkout_id_is_permanent(self, service):
        payload = clone(order_paid())
        payload.pop("checkout_id")
        with pytest.raises(WebhookPermanentError) as ei:
            await service.handle_payment_success(payload, event_id="evt_3", event_type="order.paid")
        assert ei.value.code == "missing_checkout_id"


class TestUserIdExtraction:
    @pytest.mark.asyncio
    async def test_snake_case_external_id_under_customer(self, service):
        await service.handle_payment_success(
            order_paid(), event_id="evt_snake", event_type="order.paid"
        )
        kwargs = service._webhook_repo.process_event.await_args.kwargs
        assert kwargs["user_id"] == TEST_USER_ID

    @pytest.mark.asyncio
    async def test_missing_external_id_is_permanent(self, service):
        payload = clone(order_paid())
        payload["customer"].pop("external_id")
        with pytest.raises(WebhookPermanentError) as ei:
            await service.handle_payment_success(payload, event_id="evt_1", event_type="order.paid")
        assert ei.value.code == "missing_external_customer_id"

    @pytest.mark.asyncio
    async def test_invalid_uuid_is_permanent(self, service):
        payload = clone(order_paid())
        payload["customer"]["external_id"] = "not-a-uuid"
        with pytest.raises(WebhookPermanentError) as ei:
            await service.handle_payment_success(payload, event_id="evt_1", event_type="order.paid")
        assert ei.value.code == "invalid_external_customer_id"

    @pytest.mark.asyncio
    async def test_legacy_quantity_suffix_tolerated(self, service, caplog):
        payload = clone(order_paid())
        payload["customer"]["external_id"] = f"{TEST_USER_ID}:999"
        with caplog.at_level(logging.WARNING):
            result = await service.handle_payment_success(
                payload, event_id="evt_legacy", event_type="order.paid"
            )
        assert result["status"] == "granted"
        assert result["seasons_added"] == 1
        assert any("legacy_external_id_suffix" in rec.message for rec in caplog.records), (
            "legacy suffix usage must be logged at WARNING"
        )


class TestValidation:
    @pytest.mark.asyncio
    async def test_product_mismatch_is_permanent(self, service):
        payload = clone(order_paid(product_id="prod_other"))
        with pytest.raises(WebhookPermanentError) as ei:
            await service.handle_payment_success(payload, event_id="evt_1", event_type="order.paid")
        assert ei.value.code == "product_mismatch"

    @pytest.mark.asyncio
    async def test_amount_mismatch_is_permanent(self, service):
        payload = clone(order_paid(amount=1))
        with pytest.raises(WebhookPermanentError) as ei:
            await service.handle_payment_success(payload, event_id="evt_1", event_type="order.paid")
        assert ei.value.code == "amount_mismatch"

    @pytest.mark.asyncio
    async def test_amount_unparseable_has_distinct_code(self, service):
        payload = clone(order_paid())
        payload["amount"] = "not-a-number"
        with pytest.raises(WebhookPermanentError) as ei:
            await service.handle_payment_success(payload, event_id="evt_1", event_type="order.paid")
        assert ei.value.code == "amount_unparseable"

    @pytest.mark.asyncio
    async def test_currency_mismatch_is_permanent(self, service):
        payload = clone(order_paid(currency="USD"))
        with pytest.raises(WebhookPermanentError) as ei:
            await service.handle_payment_success(payload, event_id="evt_1", event_type="order.paid")
        assert ei.value.code == "currency_mismatch"

    @pytest.mark.asyncio
    async def test_currency_missing_is_permanent_strict(self, service):
        payload = clone(order_paid())
        payload.pop("currency")
        with pytest.raises(WebhookPermanentError) as ei:
            await service.handle_payment_success(payload, event_id="evt_1", event_type="order.paid")
        assert ei.value.code == "currency_missing"


class TestPlumbing:
    @pytest.mark.asyncio
    async def test_missing_event_id_is_permanent(self, service):
        with pytest.raises(WebhookPermanentError) as ei:
            await service.handle_payment_success(
                order_paid(), event_id=None, event_type="order.paid"
            )
        assert ei.value.code == "missing_event_id"

    @pytest.mark.asyncio
    async def test_user_without_alliance_is_permanent(self, service):
        service._quota_service.get_alliance_by_user = AsyncMock(return_value=None)
        with pytest.raises(WebhookPermanentError) as ei:
            await service.handle_payment_success(
                order_paid(), event_id="evt_1", event_type="order.paid"
            )
        assert ei.value.code == "alliance_not_found"

    @pytest.mark.asyncio
    async def test_rpc_api_error_is_transient(self, service):
        service._webhook_repo.process_event = AsyncMock(
            side_effect=APIError({"message": "boom", "code": "53300"})
        )
        with pytest.raises(WebhookTransientError) as ei:
            await service.handle_payment_success(
                order_paid(), event_id="evt_1", event_type="order.paid"
            )
        assert ei.value.code == "rpc_api_error"

    @pytest.mark.asyncio
    async def test_alliance_lookup_os_error_is_transient(self, service):
        service._quota_service.get_alliance_by_user = AsyncMock(side_effect=OSError("db down"))
        with pytest.raises(WebhookTransientError) as ei:
            await service.handle_payment_success(
                order_paid(), event_id="evt_1", event_type="order.paid"
            )
        assert ei.value.code == "alliance_lookup_failed"
