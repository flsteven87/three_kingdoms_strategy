"""
Unit Tests for Payments Endpoint — HTTP Contract Verification

Tests cover:
1. POST /api/v1/payments/checkout-session happy path
2. Auth required (missing/invalid bearer token → 403)
3. 503 when RECUR_PRODUCT_ID not configured
4. 400 when redirect URLs originate from untrusted domain
5. 502 when CheckoutService raises CheckoutSessionError
6. Request body validation (missing required fields)
7. Optional fields (promotion_code, customer_name, cancel_url)

Following test-writing conventions:
- AAA pattern (Arrange-Act-Assert)
- DI overrides for CheckoutService and UserIdDep
- No business logic tested — only HTTP contract
"""

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from src.api.v1.endpoints.payments import router
from src.core.auth import get_current_user_id
from src.core.dependencies import get_checkout_service
from src.services.checkout_service import CheckoutService, CheckoutSessionError

# =============================================================================
# Constants
# =============================================================================

FIXED_USER_ID = UUID("11111111-1111-1111-1111-111111111111")
CHECKOUT_URL = "https://checkout.recur.tw/session/abc123"
FRONTEND_URL = "https://tktmanager.com"

VALID_REQUEST = {
    "customer_email": "player@example.com",
    "customer_name": "玩家一",
    "success_url": f"{FRONTEND_URL}/purchase/success",
    "cancel_url": f"{FRONTEND_URL}/purchase",
    "promotion_code": "PROMO2025",
}


# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def mock_checkout_service() -> MagicMock:
    """Mock CheckoutService that returns a checkout URL by default."""
    svc = MagicMock(spec=CheckoutService)
    svc.create_session = AsyncMock(return_value=CHECKOUT_URL)
    return svc


@pytest.fixture
def app(mock_checkout_service: MagicMock) -> FastAPI:
    """Test app with payments router and DI overrides for service + auth."""
    test_app = FastAPI()
    test_app.include_router(router, prefix="/api/v1")
    test_app.dependency_overrides[get_checkout_service] = lambda: mock_checkout_service
    test_app.dependency_overrides[get_current_user_id] = lambda: FIXED_USER_ID
    yield test_app
    test_app.dependency_overrides.clear()


@pytest.fixture
async def client(app: FastAPI) -> AsyncClient:
    """Async HTTP client bound to the test app."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


# =============================================================================
# Helper
# =============================================================================


def _post(client: AsyncClient, body: dict, **kwargs):
    """POST to the checkout-session endpoint."""
    return client.post("/api/v1/payments/checkout-session", json=body, **kwargs)


# =============================================================================
# Happy Path
# =============================================================================


class TestCreateCheckoutSessionHappyPath:
    """Successful checkout session creation."""

    async def test_returns_200_with_checkout_url(self, client, mock_checkout_service):
        """Should return 200 and a checkout_url for a valid request."""
        with patch(
            "src.api.v1.endpoints.payments.settings"
        ) as mock_settings:
            mock_settings.recur_product_id = "prod_abc"
            mock_settings.frontend_url = FRONTEND_URL

            response = await _post(client, VALID_REQUEST)

        assert response.status_code == 200
        body = response.json()
        assert body["checkout_url"] == CHECKOUT_URL

    async def test_calls_service_with_correct_args(self, client, mock_checkout_service):
        """Should forward all request fields to CheckoutService.create_session."""
        with patch(
            "src.api.v1.endpoints.payments.settings"
        ) as mock_settings:
            mock_settings.recur_product_id = "prod_abc"
            mock_settings.frontend_url = FRONTEND_URL

            await _post(client, VALID_REQUEST)

        mock_checkout_service.create_session.assert_awaited_once_with(
            product_id="prod_abc",
            customer_email="player@example.com",
            customer_name="玩家一",
            external_customer_id=str(FIXED_USER_ID),
            promotion_code="PROMO2025",
            success_url=f"{FRONTEND_URL}/purchase/success",
            cancel_url=f"{FRONTEND_URL}/purchase",
        )

    async def test_optional_fields_omitted_still_succeeds(self, client, mock_checkout_service):
        """Should succeed when optional fields (promotion_code, customer_name, cancel_url) are absent."""
        minimal = {
            "customer_email": "player@example.com",
            "success_url": f"{FRONTEND_URL}/purchase/success",
        }

        with patch(
            "src.api.v1.endpoints.payments.settings"
        ) as mock_settings:
            mock_settings.recur_product_id = "prod_abc"
            mock_settings.frontend_url = FRONTEND_URL

            response = await _post(client, minimal)

        assert response.status_code == 200

    async def test_user_id_passed_as_external_customer_id(self, client, mock_checkout_service):
        """external_customer_id must be the string form of the authenticated user UUID."""
        with patch(
            "src.api.v1.endpoints.payments.settings"
        ) as mock_settings:
            mock_settings.recur_product_id = "prod_abc"
            mock_settings.frontend_url = FRONTEND_URL

            await _post(client, VALID_REQUEST)

        call_kwargs = mock_checkout_service.create_session.await_args.kwargs
        assert call_kwargs["external_customer_id"] == str(FIXED_USER_ID)


# =============================================================================
# Authentication
# =============================================================================


class TestCreateCheckoutSessionAuth:
    """Authentication enforcement."""

    async def test_missing_bearer_token_returns_403(self, app):
        """Should return 403 when no Authorization header is provided."""
        # Remove the auth override so the real dependency runs
        app.dependency_overrides.pop(get_current_user_id, None)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            response = await c.post(
                "/api/v1/payments/checkout-session",
                json=VALID_REQUEST,
            )

        assert response.status_code == 403

    async def test_invalid_bearer_token_returns_401_or_403(self, app):
        """Should return 401/403 for a malformed JWT token."""
        app.dependency_overrides.pop(get_current_user_id, None)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            response = await c.post(
                "/api/v1/payments/checkout-session",
                json=VALID_REQUEST,
                headers={"Authorization": "Bearer not.a.real.jwt"},
            )

        assert response.status_code in (401, 403)


# =============================================================================
# Configuration Guard (503)
# =============================================================================


class TestCreateCheckoutSessionConfiguration:
    """503 when payment is not configured."""

    async def test_returns_503_when_product_id_not_configured(self, client):
        """Should return 503 when RECUR_PRODUCT_ID is falsy."""
        with patch(
            "src.api.v1.endpoints.payments.settings"
        ) as mock_settings:
            mock_settings.recur_product_id = None
            mock_settings.frontend_url = FRONTEND_URL

            response = await _post(client, VALID_REQUEST)

        assert response.status_code == 503
        assert "not configured" in response.json()["detail"]

    async def test_returns_503_when_product_id_empty_string(self, client):
        """Should return 503 when RECUR_PRODUCT_ID is an empty string."""
        with patch(
            "src.api.v1.endpoints.payments.settings"
        ) as mock_settings:
            mock_settings.recur_product_id = ""
            mock_settings.frontend_url = FRONTEND_URL

            response = await _post(client, VALID_REQUEST)

        assert response.status_code == 503


# =============================================================================
# URL Validation (400)
# =============================================================================


class TestCreateCheckoutSessionUrlValidation:
    """Redirect URL origin enforcement."""

    async def test_returns_400_for_untrusted_success_url(self, client):
        """Should return 400 when success_url originates from a foreign domain."""
        body = {**VALID_REQUEST, "success_url": "https://evil.com/steal"}

        with patch(
            "src.api.v1.endpoints.payments.settings"
        ) as mock_settings:
            mock_settings.recur_product_id = "prod_abc"
            mock_settings.frontend_url = FRONTEND_URL

            response = await _post(client, body)

        assert response.status_code == 400
        assert "success_url" in response.json()["detail"]
        assert FRONTEND_URL in response.json()["detail"]

    async def test_returns_400_for_untrusted_cancel_url(self, client):
        """Should return 400 when cancel_url originates from a foreign domain."""
        body = {**VALID_REQUEST, "cancel_url": "https://attacker.io/phish"}

        with patch(
            "src.api.v1.endpoints.payments.settings"
        ) as mock_settings:
            mock_settings.recur_product_id = "prod_abc"
            mock_settings.frontend_url = FRONTEND_URL

            response = await _post(client, body)

        assert response.status_code == 400
        assert "cancel_url" in response.json()["detail"]

    async def test_returns_400_for_authority_smuggling_success_url(self, client):
        """Should block scheme://trusted@attacker style URL smuggling."""
        # urlparse("https://tktmanager.com@evil.com/...") → netloc = "tktmanager.com@evil.com"
        smuggled = f"https://{FRONTEND_URL.split('//')[1]}@evil.com/steal"
        body = {**VALID_REQUEST, "success_url": smuggled}

        with patch(
            "src.api.v1.endpoints.payments.settings"
        ) as mock_settings:
            mock_settings.recur_product_id = "prod_abc"
            mock_settings.frontend_url = FRONTEND_URL

            response = await _post(client, body)

        assert response.status_code == 400

    async def test_trusted_subdomain_is_rejected(self, client):
        """A subdomain of the allowed origin must be rejected (exact match required)."""
        body = {**VALID_REQUEST, "success_url": "https://sub.tktmanager.com/success"}

        with patch(
            "src.api.v1.endpoints.payments.settings"
        ) as mock_settings:
            mock_settings.recur_product_id = "prod_abc"
            mock_settings.frontend_url = FRONTEND_URL

            response = await _post(client, body)

        assert response.status_code == 400

    async def test_omitted_cancel_url_skips_origin_check(self, client, mock_checkout_service):
        """cancel_url is optional — omitting it must not trigger the 400 guard."""
        body = {k: v for k, v in VALID_REQUEST.items() if k != "cancel_url"}

        with patch(
            "src.api.v1.endpoints.payments.settings"
        ) as mock_settings:
            mock_settings.recur_product_id = "prod_abc"
            mock_settings.frontend_url = FRONTEND_URL

            response = await _post(client, body)

        assert response.status_code == 200


# =============================================================================
# Service Error Handling (502)
# =============================================================================


class TestCreateCheckoutSessionServiceErrors:
    """Error propagation from CheckoutService."""

    async def test_returns_502_when_service_raises_checkout_session_error(
        self, client, mock_checkout_service
    ):
        """Should return 502 when CheckoutService raises CheckoutSessionError."""
        mock_checkout_service.create_session = AsyncMock(
            side_effect=CheckoutSessionError(422, "invalid promotion code")
        )

        with patch(
            "src.api.v1.endpoints.payments.settings"
        ) as mock_settings:
            mock_settings.recur_product_id = "prod_abc"
            mock_settings.frontend_url = FRONTEND_URL

            response = await _post(client, VALID_REQUEST)

        assert response.status_code == 502
        assert response.json()["detail"] == "Payment provider error"

    async def test_502_detail_does_not_leak_internal_error(self, client, mock_checkout_service):
        """Internal error details from the payment provider must not leak to clients."""
        mock_checkout_service.create_session = AsyncMock(
            side_effect=CheckoutSessionError(500, "internal db connection failed — secret info")
        )

        with patch(
            "src.api.v1.endpoints.payments.settings"
        ) as mock_settings:
            mock_settings.recur_product_id = "prod_abc"
            mock_settings.frontend_url = FRONTEND_URL

            response = await _post(client, VALID_REQUEST)

        assert response.status_code == 502
        assert "secret info" not in response.json()["detail"]
        assert "db connection" not in response.json()["detail"]


# =============================================================================
# Request Body Validation
# =============================================================================


class TestCreateCheckoutSessionRequestValidation:
    """Pydantic model validation enforced at the API boundary."""

    async def test_returns_422_when_customer_email_missing(self, client):
        """Should return 422 when required customer_email is absent."""
        body = {k: v for k, v in VALID_REQUEST.items() if k != "customer_email"}

        with patch(
            "src.api.v1.endpoints.payments.settings"
        ) as mock_settings:
            mock_settings.recur_product_id = "prod_abc"
            mock_settings.frontend_url = FRONTEND_URL

            response = await _post(client, body)

        assert response.status_code == 422

    async def test_returns_422_when_success_url_missing(self, client):
        """Should return 422 when required success_url is absent."""
        body = {k: v for k, v in VALID_REQUEST.items() if k != "success_url"}

        with patch(
            "src.api.v1.endpoints.payments.settings"
        ) as mock_settings:
            mock_settings.recur_product_id = "prod_abc"
            mock_settings.frontend_url = FRONTEND_URL

            response = await _post(client, body)

        assert response.status_code == 422

    async def test_returns_422_for_invalid_email_format(self, client):
        """Should return 422 for a malformed email address."""
        body = {**VALID_REQUEST, "customer_email": "not-an-email"}

        with patch(
            "src.api.v1.endpoints.payments.settings"
        ) as mock_settings:
            mock_settings.recur_product_id = "prod_abc"
            mock_settings.frontend_url = FRONTEND_URL

            response = await _post(client, body)

        assert response.status_code == 422
