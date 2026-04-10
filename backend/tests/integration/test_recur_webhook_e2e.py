"""
End-to-end integration tests for POST /api/v1/webhooks/recur.

This file drives REAL PaymentService logic — extraction, validation, error
classification — using REAL-shaped Recur payloads from
``tests/fixtures/recur_payloads.py``. Only the Supabase RPC boundary
(WebhookEventRepository) and the alliance lookup (SeasonQuotaService) are
mocked, because those are covered by their own unit tests.

Any failure in this file indicates either:
  (a) a drift between the webhook handler and PaymentService contracts, or
  (b) a real bug in the extraction/validation/error-classification path.
"""

import base64
import hashlib
import hmac
import json
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from postgrest.exceptions import APIError

from src.api.v1.endpoints.webhooks import router
from src.repositories.webhook_event_repository import WebhookProcessingResult
from tests.fixtures.recur_payloads import (
    TEST_CHECKOUT_ID,
    TEST_ORDER_ID,
    TEST_PRODUCT_ID,
    TEST_USER_ID,
    checkout_completed,
    order_paid,
)

WEBHOOK_SECRET = "test_webhook_secret_key"
EXPECTED_AMOUNT = 999
EXPECTED_CURRENCY = "TWD"
ALLIANCE_ID = UUID("22222222-2222-2222-2222-222222222222")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def sign(body: bytes, secret: str = WEBHOOK_SECRET) -> str:
    digest = hmac.new(secret.encode("utf-8"), body, hashlib.sha256).digest()
    return base64.b64encode(digest).decode("utf-8")


def envelope(event_type: str, event_id: str, data: dict) -> dict:
    """Wrap a real-shaped ``data`` body in the Recur wire envelope."""
    return {"type": event_type, "id": event_id, "data": data}


async def post_webhook(client: AsyncClient, body: dict, *, secret: str = WEBHOOK_SECRET):
    raw = json.dumps(body).encode()
    return await client.post(
        "/api/v1/webhooks/recur",
        content=raw,
        headers={
            "Content-Type": "application/json",
            "x-recur-signature": sign(raw, secret),
        },
    )


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def app() -> FastAPI:
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")
    return app


@pytest.fixture
async def client(app: FastAPI):
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as c:
        yield c


@pytest.fixture
def mock_settings():
    """Patch settings at the import site used by the webhook handler AND the service."""
    with (
        patch("src.api.v1.endpoints.webhooks.settings") as ws,
        patch("src.services.payment_service.settings") as ss,
    ):
        ws.recur_webhook_secret = WEBHOOK_SECRET
        ss.recur_product_id = TEST_PRODUCT_ID
        ss.recur_expected_amount_twd = EXPECTED_AMOUNT
        ss.recur_expected_currency = EXPECTED_CURRENCY
        yield ws, ss


@pytest.fixture
def mock_deps():
    """
    Patch SeasonQuotaService and WebhookEventRepository at their import sites
    inside payment_service. Yields (quota_instance, repo_instance) so tests
    can customise return values / side effects.
    """
    with (
        patch("src.services.payment_service.SeasonQuotaService") as quota_cls,
        patch("src.services.payment_service.WebhookEventRepository") as repo_cls,
    ):
        alliance = MagicMock()
        alliance.id = ALLIANCE_ID

        quota = MagicMock()
        quota.get_alliance_by_user = AsyncMock(return_value=alliance)
        quota_cls.return_value = quota

        repo = MagicMock()
        repo.process_event = AsyncMock(
            return_value=WebhookProcessingResult(status="granted", available_seasons=1),
        )
        repo_cls.return_value = repo

        yield quota, repo


@pytest.fixture
def mock_alert():
    """Patch alert_critical at the webhook endpoint import site."""
    with patch("src.api.v1.endpoints.webhooks.alert_critical", new=AsyncMock()) as m:
        yield m


# ---------------------------------------------------------------------------
# Smoke test (proves scaffolding works)
# ---------------------------------------------------------------------------


class TestScaffolding:
    async def test_fixtures_import_and_client_round_trips(
        self, client: AsyncClient, mock_settings, mock_deps, mock_alert
    ):
        body = envelope("order.paid", "evt_smoke_001", order_paid())
        response = await post_webhook(client, body)
        assert response.status_code == 200


class TestOrderPaidHappyPath:
    async def test_order_paid_grants_one_season_and_rpc_receives_extracted_values(
        self, client: AsyncClient, mock_settings, mock_deps, mock_alert
    ):
        _, repo = mock_deps
        repo.process_event = AsyncMock(
            return_value=WebhookProcessingResult(status="granted", available_seasons=3),
        )

        body = envelope("order.paid", "evt_happy_001", order_paid())
        response = await post_webhook(client, body)

        assert response.status_code == 200
        j = response.json()
        assert j["received"] is True
        assert j["status"] == "granted"
        assert j["seasons_added"] == 1
        assert j["available_seasons"] == 3
        assert j["user_id"] == str(TEST_USER_ID)
        assert j["alliance_id"] == str(ALLIANCE_ID)
        assert j["checkout_id"] == TEST_CHECKOUT_ID
        assert j["order_id"] == TEST_ORDER_ID

        repo.process_event.assert_awaited_once()
        kwargs = repo.process_event.call_args.kwargs
        assert kwargs["event_id"] == "evt_happy_001"
        assert kwargs["event_type"] == "order.paid"
        assert kwargs["checkout_id"] == TEST_CHECKOUT_ID
        assert kwargs["order_id"] == TEST_ORDER_ID
        assert kwargs["alliance_id"] == ALLIANCE_ID
        assert kwargs["user_id"] == TEST_USER_ID
        assert kwargs["seasons"] == 1
        assert kwargs["payload"]["customer"]["external_id"] == str(TEST_USER_ID)
        assert kwargs["payload"]["product_id"] == TEST_PRODUCT_ID

        mock_alert.assert_not_awaited()


class TestCheckoutCompletedAuditOnly:
    async def test_checkout_completed_writes_audit_row_and_grants_zero_seasons(
        self, client: AsyncClient, mock_settings, mock_deps, mock_alert
    ):
        _, repo = mock_deps
        repo.process_event = AsyncMock(
            return_value=WebhookProcessingResult(status="audit_only", available_seasons=0),
        )

        body = envelope("checkout.completed", "evt_audit_001", checkout_completed())
        response = await post_webhook(client, body)

        assert response.status_code == 200
        j = response.json()
        assert j["status"] == "audit_only"
        assert j["seasons_added"] == 0
        assert j["checkout_id"] == TEST_CHECKOUT_ID
        assert j["order_id"] is None

        kwargs = repo.process_event.call_args.kwargs
        assert kwargs["event_type"] == "checkout.completed"
        assert kwargs["checkout_id"] == TEST_CHECKOUT_ID
        assert kwargs["order_id"] is None
        assert kwargs["seasons"] == 0

        mock_alert.assert_not_awaited()


class TestIdempotencyOutcomes:
    async def test_duplicate_event_returns_zero_seasons_added(
        self, client: AsyncClient, mock_settings, mock_deps, mock_alert
    ):
        _, repo = mock_deps
        repo.process_event = AsyncMock(
            return_value=WebhookProcessingResult(status="duplicate_event", available_seasons=1),
        )

        body = envelope("order.paid", "evt_dup_event_001", order_paid())
        response = await post_webhook(client, body)

        assert response.status_code == 200
        j = response.json()
        assert j["status"] == "duplicate_event"
        assert j["seasons_added"] == 0
        assert j["available_seasons"] == 1
        mock_alert.assert_not_awaited()

    async def test_duplicate_purchase_returns_zero_seasons_added(
        self, client: AsyncClient, mock_settings, mock_deps, mock_alert
    ):
        _, repo = mock_deps
        repo.process_event = AsyncMock(
            return_value=WebhookProcessingResult(status="duplicate_purchase", available_seasons=1),
        )

        body = envelope("order.paid", "evt_dup_purchase_001", order_paid())
        response = await post_webhook(client, body)

        assert response.status_code == 200
        j = response.json()
        assert j["status"] == "duplicate_purchase"
        assert j["seasons_added"] == 0
        assert j["available_seasons"] == 1
        mock_alert.assert_not_awaited()


class TestValidationPermanentFailures:
    """All permanent errors should return 200, set status=permanent_failure, and alert."""

    async def test_wrong_product_id_is_permanent(
        self, client: AsyncClient, mock_settings, mock_deps, mock_alert
    ):
        _, repo = mock_deps
        body = envelope("order.paid", "evt_prod_001", order_paid(product_id="prod_wrong"))
        response = await post_webhook(client, body)

        assert response.status_code == 200
        j = response.json()
        assert j["status"] == "permanent_failure"
        assert j["code"] == "product_mismatch"
        repo.process_event.assert_not_awaited()
        mock_alert.assert_awaited_once()
        assert mock_alert.await_args.args[0] == "recur.webhook.permanent"
        assert mock_alert.await_args.kwargs["error_code"] == "product_mismatch"

    async def test_wrong_currency_is_permanent(
        self, client: AsyncClient, mock_settings, mock_deps, mock_alert
    ):
        _, repo = mock_deps
        body = envelope("order.paid", "evt_cur_001", order_paid(currency="USD"))
        response = await post_webhook(client, body)

        assert response.status_code == 200
        j = response.json()
        assert j["status"] == "permanent_failure"
        assert j["code"] == "currency_mismatch"
        repo.process_event.assert_not_awaited()
        mock_alert.assert_awaited_once()

    async def test_wrong_amount_is_permanent(
        self, client: AsyncClient, mock_settings, mock_deps, mock_alert
    ):
        _, repo = mock_deps
        body = envelope("order.paid", "evt_amt_001", order_paid(amount=0))
        response = await post_webhook(client, body)

        assert response.status_code == 200
        j = response.json()
        assert j["status"] == "permanent_failure"
        assert j["code"] == "amount_out_of_range"
        repo.process_event.assert_not_awaited()
        mock_alert.assert_awaited_once()


class TestExtractionPermanentFailures:
    async def test_missing_external_customer_id_is_permanent(
        self, client: AsyncClient, mock_settings, mock_deps, mock_alert
    ):
        _, repo = mock_deps
        data = order_paid()
        data["customer"]["external_id"] = None

        body = envelope("order.paid", "evt_miss_ext_001", data)
        response = await post_webhook(client, body)

        assert response.status_code == 200
        j = response.json()
        assert j["status"] == "permanent_failure"
        assert j["code"] == "missing_external_customer_id"
        repo.process_event.assert_not_awaited()
        mock_alert.assert_awaited_once()

    async def test_missing_checkout_id_on_order_paid_is_permanent(
        self, client: AsyncClient, mock_settings, mock_deps, mock_alert
    ):
        _, repo = mock_deps
        data = order_paid()
        del data["checkout_id"]

        body = envelope("order.paid", "evt_miss_chk_001", data)
        response = await post_webhook(client, body)

        assert response.status_code == 200
        j = response.json()
        assert j["status"] == "permanent_failure"
        assert j["code"] == "missing_checkout_id"
        repo.process_event.assert_not_awaited()
        mock_alert.assert_awaited_once()


class TestAllianceLookupErrors:
    async def test_alliance_not_found_is_permanent(
        self, client: AsyncClient, mock_settings, mock_deps, mock_alert
    ):
        quota, repo = mock_deps
        quota.get_alliance_by_user = AsyncMock(return_value=None)

        body = envelope("order.paid", "evt_no_alliance_001", order_paid())
        response = await post_webhook(client, body)

        assert response.status_code == 200
        j = response.json()
        assert j["status"] == "permanent_failure"
        assert j["code"] == "alliance_not_found"
        repo.process_event.assert_not_awaited()
        mock_alert.assert_awaited_once()

    async def test_alliance_lookup_api_error_is_transient(
        self, client: AsyncClient, mock_settings, mock_deps, mock_alert
    ):
        quota, repo = mock_deps
        quota.get_alliance_by_user = AsyncMock(
            side_effect=APIError({"message": "boom", "code": "PG500"})
        )

        body = envelope("order.paid", "evt_transient_001", order_paid())
        response = await post_webhook(client, body)

        assert response.status_code == 500
        assert "transient:alliance_lookup_failed" in response.json()["detail"]
        repo.process_event.assert_not_awaited()
        mock_alert.assert_not_awaited()


class TestRpcErrors:
    async def test_rpc_api_error_is_transient_500(
        self, client: AsyncClient, mock_settings, mock_deps, mock_alert
    ):
        _, repo = mock_deps
        repo.process_event = AsyncMock(
            side_effect=APIError({"message": "rpc down", "code": "PG500"})
        )

        body = envelope("order.paid", "evt_rpc_err_001", order_paid())
        response = await post_webhook(client, body)

        assert response.status_code == 500
        assert "transient:rpc_api_error" in response.json()["detail"]
        mock_alert.assert_not_awaited()


class TestEventTypeRouting:
    async def test_unsupported_event_type_is_ignored(
        self, client: AsyncClient, mock_settings, mock_deps, mock_alert
    ):
        _, repo = mock_deps
        body = envelope("customer.created", "evt_unsup_001", order_paid())
        response = await post_webhook(client, body)

        assert response.status_code == 200
        assert response.json() == {"received": True, "status": "ignored"}
        repo.process_event.assert_not_awaited()
        mock_alert.assert_not_awaited()

    async def test_order_payment_failed_is_logged_and_ignored(
        self, client: AsyncClient, mock_settings, mock_deps, mock_alert
    ):
        _, repo = mock_deps
        body = envelope("order.payment_failed", "evt_fail_001", order_paid())
        response = await post_webhook(client, body)

        assert response.status_code == 200
        assert response.json() == {"received": True, "status": "payment_failed_logged"}
        repo.process_event.assert_not_awaited()
        mock_alert.assert_not_awaited()


class TestInfraPaths:
    async def test_invalid_signature_returns_401(
        self, client: AsyncClient, mock_settings, mock_deps, mock_alert
    ):
        _, repo = mock_deps
        body = envelope("order.paid", "evt_bad_sig_001", order_paid())
        raw = json.dumps(body).encode()

        response = await client.post(
            "/api/v1/webhooks/recur",
            content=raw,
            headers={
                "Content-Type": "application/json",
                "x-recur-signature": "deadbeef",
            },
        )

        assert response.status_code == 401
        repo.process_event.assert_not_awaited()
        mock_alert.assert_awaited_once()
        assert mock_alert.await_args.args[0] == "recur.webhook.signature_failed"

    async def test_missing_webhook_secret_returns_503(
        self, client: AsyncClient, mock_deps, mock_alert
    ):
        with (
            patch("src.api.v1.endpoints.webhooks.settings") as ws,
            patch("src.services.payment_service.settings") as ss,
        ):
            ws.recur_webhook_secret = None
            ss.recur_product_id = TEST_PRODUCT_ID
            ss.recur_expected_amount_twd = EXPECTED_AMOUNT
            ss.recur_expected_currency = EXPECTED_CURRENCY

            body = envelope("order.paid", "evt_no_secret_001", order_paid())
            raw = json.dumps(body).encode()
            response = await client.post(
                "/api/v1/webhooks/recur",
                content=raw,
                headers={
                    "Content-Type": "application/json",
                    "x-recur-signature": sign(raw),
                },
            )

        assert response.status_code == 503
