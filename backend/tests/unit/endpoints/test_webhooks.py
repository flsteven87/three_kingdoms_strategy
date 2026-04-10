"""
Unit Tests for Webhook Endpoints — Signature Verification & Event Routing

Tests cover:
1. verify_recur_signature: HMAC-SHA256 + Base64 validation
2. recur_webhook endpoint: all HTTP status paths (503/401/400/200/500)

Following test-writing skill conventions:
- AAA pattern (Arrange-Act-Assert)
- Mocked dependencies
- Coverage: happy path + edge cases + error cases
"""

import base64
import hashlib
import hmac
import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from src.api.v1.endpoints.webhooks import router, verify_recur_signature
from src.core.dependencies import get_payment_service
from src.services.payment_service import PaymentService

# =============================================================================
# Fixtures
# =============================================================================

WEBHOOK_SECRET = "test_webhook_secret_key"


def compute_valid_signature(payload: bytes, secret: str = WEBHOOK_SECRET) -> str:
    """Helper to compute a valid HMAC-SHA256 Base64 signature."""
    computed = hmac.new(
        key=secret.encode("utf-8"),
        msg=payload,
        digestmod=hashlib.sha256,
    ).digest()
    return base64.b64encode(computed).decode("utf-8")


@pytest.fixture
def mock_payment_service() -> MagicMock:
    """Create a mock PaymentService for DI override."""
    svc = MagicMock(spec=PaymentService)
    svc.handle_payment_success = AsyncMock(return_value={"success": True})
    return svc


@pytest.fixture
def app(mock_payment_service: MagicMock) -> FastAPI:
    """Create test FastAPI app with webhook router and DI overrides."""
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")
    app.dependency_overrides[get_payment_service] = lambda: mock_payment_service
    yield app
    app.dependency_overrides.clear()


@pytest.fixture
async def async_client(app: FastAPI):
    """Create async test client with proper cleanup."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield client


@pytest.fixture
def checkout_request() -> tuple[bytes, str]:
    """Pre-built checkout.completed event payload and valid signature."""
    event = {
        "type": "checkout.completed",
        "id": "evt_123",
        "data": {"externalCustomerId": "11111111-1111-1111-1111-111111111111:1"},
    }
    payload = json.dumps(event).encode()
    return payload, compute_valid_signature(payload)


# =============================================================================
# Tests for verify_recur_signature
# =============================================================================


class TestVerifyRecurSignature:
    """Tests for HMAC-SHA256 + Base64 signature verification"""

    def test_valid_signature_returns_true(self):
        """Should return True for correctly signed payload"""
        payload = b'{"type": "checkout.completed"}'
        signature = compute_valid_signature(payload)

        result = verify_recur_signature(payload, signature, WEBHOOK_SECRET)

        assert result is True

    def test_invalid_signature_returns_false(self):
        """Should return False for tampered signature"""
        payload = b'{"type": "checkout.completed"}'
        bad_signature = base64.b64encode(b"wrong").decode("utf-8")

        result = verify_recur_signature(payload, bad_signature, WEBHOOK_SECRET)

        assert result is False

    def test_tampered_payload_returns_false(self):
        """Should return False when payload was modified after signing"""
        original_payload = b'{"type": "checkout.completed"}'
        signature = compute_valid_signature(original_payload)
        tampered_payload = b'{"type": "checkout.completed", "hack": true}'

        result = verify_recur_signature(tampered_payload, signature, WEBHOOK_SECRET)

        assert result is False

    def test_empty_signature_returns_false(self):
        """Should return False for empty signature string"""
        payload = b'{"type": "checkout.completed"}'

        result = verify_recur_signature(payload, "", WEBHOOK_SECRET)

        assert result is False

    def test_empty_secret_returns_false(self):
        """Should return False for empty secret"""
        payload = b'{"type": "checkout.completed"}'

        result = verify_recur_signature(payload, "some_sig", "")

        assert result is False

    def test_none_signature_returns_false(self):
        """Should return False for None signature"""
        payload = b'{"type": "checkout.completed"}'

        result = verify_recur_signature(payload, None, WEBHOOK_SECRET)

        assert result is False

    def test_signature_with_whitespace_is_trimmed(self):
        """Should handle signatures with leading/trailing whitespace"""
        payload = b'{"type": "checkout.completed"}'
        signature = compute_valid_signature(payload)

        result = verify_recur_signature(payload, f"  {signature}  ", WEBHOOK_SECRET)

        assert result is True

    def test_wrong_secret_returns_false(self):
        """Should return False when verified with different secret"""
        payload = b'{"type": "checkout.completed"}'
        signature = compute_valid_signature(payload, "correct_secret")

        result = verify_recur_signature(payload, signature, "wrong_secret")

        assert result is False


# =============================================================================
# Tests for recur_webhook endpoint
# =============================================================================


class TestRecurWebhookEndpoint:
    """Tests for POST /api/v1/webhooks/recur endpoint"""

    @pytest.mark.asyncio
    async def test_returns_503_when_secret_not_configured(self, async_client):
        """Should return 503 when RECUR_WEBHOOK_SECRET is not set"""
        with patch("src.api.v1.endpoints.webhooks.settings") as mock_settings:
            mock_settings.recur_webhook_secret = None

            response = await async_client.post(
                "/api/v1/webhooks/recur",
                content=b'{"type": "test"}',
            )

        assert response.status_code == 503
        assert "not configured" in response.json()["detail"]

    @pytest.mark.asyncio
    async def test_returns_401_when_signature_invalid(self, async_client):
        """Should return 401 when X-Recur-Signature verification fails"""
        with patch("src.api.v1.endpoints.webhooks.settings") as mock_settings:
            mock_settings.recur_webhook_secret = WEBHOOK_SECRET

            response = await async_client.post(
                "/api/v1/webhooks/recur",
                content=b'{"type": "test"}',
                headers={"x-recur-signature": "invalid_signature"},
            )

        assert response.status_code == 401
        assert "Invalid signature" in response.json()["detail"]

    @pytest.mark.asyncio
    async def test_returns_401_when_signature_header_missing(self, async_client):
        """Should return 401 when X-Recur-Signature header is absent"""
        with patch("src.api.v1.endpoints.webhooks.settings") as mock_settings:
            mock_settings.recur_webhook_secret = WEBHOOK_SECRET

            response = await async_client.post(
                "/api/v1/webhooks/recur",
                content=b'{"type": "test"}',
            )

        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_returns_200_for_checkout_completed(
        self, async_client, checkout_request, mock_payment_service
    ):
        """Should process checkout.completed and return 200"""
        payload, signature = checkout_request

        with patch("src.api.v1.endpoints.webhooks.settings") as mock_settings:
            mock_settings.recur_webhook_secret = WEBHOOK_SECRET

            response = await async_client.post(
                "/api/v1/webhooks/recur",
                content=payload,
                headers={"x-recur-signature": signature},
            )

        assert response.status_code == 200
        assert response.json()["received"] is True
        mock_payment_service.handle_payment_success.assert_called_once()

    @pytest.mark.asyncio
    async def test_returns_200_for_unknown_event_type(self, async_client):
        """Should return 200 and silently log unknown event types"""
        event = {"type": "subscription.cancelled", "id": "evt_456", "data": {}}
        payload = json.dumps(event).encode()
        signature = compute_valid_signature(payload)

        with patch("src.api.v1.endpoints.webhooks.settings") as mock_settings:
            mock_settings.recur_webhook_secret = WEBHOOK_SECRET

            response = await async_client.post(
                "/api/v1/webhooks/recur",
                content=payload,
                headers={"x-recur-signature": signature},
            )

        assert response.status_code == 200
        assert response.json()["received"] is True

    @pytest.mark.asyncio
    async def test_permanent_error_returns_200_and_alerts(
        self, async_client, checkout_request, mock_payment_service
    ):
        """WebhookPermanentError → 200 + alert_critical (no Recur retry).

        The alert_critical mock uses `spec=alert_critical` so the real
        function's signature is enforced at the mock boundary — a previous
        version of the handler passed both a positional and a ``code=``
        keyword for the same parameter, and a loose mock silently accepted
        it. Keeping the spec guarantees that class of bug trips in tests.
        """
        from src.core.alerts import alert_critical
        from src.core.webhook_errors import WebhookPermanentError

        payload, signature = checkout_request

        mock_payment_service.handle_payment_success = AsyncMock(
            side_effect=WebhookPermanentError(
                "product_mismatch", event_id="evt_123", expected="prod_a", actual="prod_b"
            )
        )

        with (
            patch("src.api.v1.endpoints.webhooks.settings") as mock_settings,
            patch(
                "src.api.v1.endpoints.webhooks.alert_critical",
                new=AsyncMock(spec=alert_critical),
            ) as mock_alert,
        ):
            mock_settings.recur_webhook_secret = WEBHOOK_SECRET

            response = await async_client.post(
                "/api/v1/webhooks/recur",
                content=payload,
                headers={"x-recur-signature": signature},
            )

        assert response.status_code == 200
        body = response.json()
        assert body["status"] == "permanent_failure"
        assert "code" not in body  # internal codes must not leak
        mock_alert.assert_awaited_once()
        call = mock_alert.await_args
        assert call.args[0] == "recur.webhook.permanent"
        # The domain error's code is ferried as `error_code`, not `code`, to
        # avoid colliding with alert_critical's own first parameter.
        assert call.kwargs["error_code"] == "product_mismatch"
        assert call.kwargs["event_id"] == "evt_123"
        assert "code" not in call.kwargs

    @pytest.mark.asyncio
    async def test_transient_error_returns_500(
        self, async_client, checkout_request, mock_payment_service
    ):
        """WebhookTransientError → 500 so Recur retries."""
        from src.core.webhook_errors import WebhookTransientError

        payload, signature = checkout_request

        mock_payment_service.handle_payment_success = AsyncMock(
            side_effect=WebhookTransientError("rpc_api_error", event_id="evt_123")
        )

        with patch("src.api.v1.endpoints.webhooks.settings") as mock_settings:
            mock_settings.recur_webhook_secret = WEBHOOK_SECRET

            response = await async_client.post(
                "/api/v1/webhooks/recur",
                content=payload,
                headers={"x-recur-signature": signature},
            )

        assert response.status_code == 500

    @pytest.mark.asyncio
    async def test_signature_failure_alerts(self, async_client):
        """Signature verification failure → 401 + alert_critical."""
        with (
            patch("src.api.v1.endpoints.webhooks.settings") as mock_settings,
            patch("src.api.v1.endpoints.webhooks.alert_critical", new=AsyncMock()) as mock_alert,
        ):
            mock_settings.recur_webhook_secret = WEBHOOK_SECRET

            response = await async_client.post(
                "/api/v1/webhooks/recur",
                content=b'{"type": "test"}',
                headers={"x-recur-signature": "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="},
            )

        assert response.status_code == 401
        mock_alert.assert_awaited_once()
        assert mock_alert.await_args.args[0] == "recur.webhook.signature_failed"

    @pytest.mark.asyncio
    async def test_returns_500_for_unexpected_error(
        self, async_client, checkout_request, mock_payment_service
    ):
        """Should return 500 for unexpected errors (trigger Recur retry)"""
        payload, signature = checkout_request

        mock_payment_service.handle_payment_success = AsyncMock(
            side_effect=RuntimeError("Database connection failed")
        )

        with patch("src.api.v1.endpoints.webhooks.settings") as mock_settings:
            mock_settings.recur_webhook_secret = WEBHOOK_SECRET

            response = await async_client.post(
                "/api/v1/webhooks/recur",
                content=payload,
                headers={"x-recur-signature": signature},
            )

        assert response.status_code == 500

    @pytest.mark.asyncio
    async def test_returns_200_when_event_has_no_type(self, async_client):
        """Should return 200 for events with missing type field"""
        event = {"id": "evt_no_type", "data": {}}
        payload = json.dumps(event).encode()
        signature = compute_valid_signature(payload)

        with patch("src.api.v1.endpoints.webhooks.settings") as mock_settings:
            mock_settings.recur_webhook_secret = WEBHOOK_SECRET

            response = await async_client.post(
                "/api/v1/webhooks/recur",
                content=payload,
                headers={"x-recur-signature": signature},
            )

        assert response.status_code == 200
        assert response.json()["received"] is True
