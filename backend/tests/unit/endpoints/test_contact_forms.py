"""
Unit Tests for Contact Forms Endpoint — HTTP Contract Verification

Tests cover:
1. POST /api/v1/contact happy path (201 + success response)
2. Request body validation — required fields, email format, category enum, message length
3. Service delegation — service.submit() is called with correct data
4. Service errors propagate correctly
"""

from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from src.api.v1.endpoints.contact_forms import router
from src.core.dependencies import get_contact_form_service
from src.services.contact_form_service import ContactFormService

# =============================================================================
# Constants
# =============================================================================

VALID_REQUEST = {
    "email": "player@example.com",
    "category": "bug",
    "message": "This is a valid bug report message with enough characters.",
}


# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def mock_contact_service() -> MagicMock:
    """Mock ContactFormService that succeeds by default."""
    svc = MagicMock(spec=ContactFormService)
    svc.submit = AsyncMock(return_value=None)
    return svc


@pytest.fixture
def app(mock_contact_service: MagicMock) -> FastAPI:
    """Test app with contact_forms router and DI override for service."""
    test_app = FastAPI()
    test_app.include_router(router, prefix="/api/v1")
    test_app.dependency_overrides[get_contact_form_service] = lambda: mock_contact_service
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
    """POST to the contact form endpoint."""
    return client.post("/api/v1/contact", json=body, **kwargs)


# =============================================================================
# Happy Path
# =============================================================================


class TestSubmitContactFormHappyPath:
    """Successful contact form submission."""

    async def test_returns_201_with_success_true(self, client):
        """Should return 201 and success: true for a valid request."""
        response = await _post(client, VALID_REQUEST)

        assert response.status_code == 201
        assert response.json()["success"] is True

    async def test_calls_service_submit(self, client, mock_contact_service):
        """Should call service.submit() exactly once."""
        await _post(client, VALID_REQUEST)

        mock_contact_service.submit.assert_awaited_once()

    async def test_all_valid_categories_accepted(self, client):
        """Should accept all four valid category values."""
        for category in ("bug", "feature", "payment", "other"):
            body = {**VALID_REQUEST, "category": category}
            response = await _post(client, body)
            assert response.status_code == 201, f"Category '{category}' was rejected"

    async def test_message_at_minimum_length_accepted(self, client):
        """Should accept a message of exactly 10 characters."""
        body = {**VALID_REQUEST, "message": "1234567890"}
        response = await _post(client, body)

        assert response.status_code == 201

    async def test_message_at_maximum_length_accepted(self, client):
        """Should accept a message of exactly 2000 characters."""
        body = {**VALID_REQUEST, "message": "x" * 2000}
        response = await _post(client, body)

        assert response.status_code == 201


# =============================================================================
# No Authentication Required
# =============================================================================


class TestContactFormNoAuth:
    """Contact form endpoint is public — no auth header required."""

    async def test_succeeds_without_authorization_header(self, client):
        """Should return 201 even when no Authorization header is provided."""
        response = await _post(client, VALID_REQUEST)

        assert response.status_code == 201


# =============================================================================
# Request Body Validation
# =============================================================================


class TestContactFormRequestValidation:
    """Pydantic model validation enforced at the API boundary."""

    async def test_returns_422_when_email_missing(self, client):
        """Should return 422 when required email field is absent."""
        body = {k: v for k, v in VALID_REQUEST.items() if k != "email"}
        response = await _post(client, body)

        assert response.status_code == 422

    async def test_returns_422_for_invalid_email_format(self, client):
        """Should return 422 for a malformed email address."""
        body = {**VALID_REQUEST, "email": "not-an-email"}
        response = await _post(client, body)

        assert response.status_code == 422

    async def test_returns_422_when_category_missing(self, client):
        """Should return 422 when required category field is absent."""
        body = {k: v for k, v in VALID_REQUEST.items() if k != "category"}
        response = await _post(client, body)

        assert response.status_code == 422

    async def test_returns_422_for_invalid_category(self, client):
        """Should return 422 for a category value not in the allowed enum."""
        body = {**VALID_REQUEST, "category": "complaint"}
        response = await _post(client, body)

        assert response.status_code == 422

    async def test_returns_422_when_message_missing(self, client):
        """Should return 422 when required message field is absent."""
        body = {k: v for k, v in VALID_REQUEST.items() if k != "message"}
        response = await _post(client, body)

        assert response.status_code == 422

    async def test_returns_422_for_message_too_short(self, client):
        """Should return 422 when message is fewer than 10 characters."""
        body = {**VALID_REQUEST, "message": "short"}
        response = await _post(client, body)

        assert response.status_code == 422

    async def test_returns_422_for_message_too_long(self, client):
        """Should return 422 when message exceeds 2000 characters."""
        body = {**VALID_REQUEST, "message": "x" * 2001}
        response = await _post(client, body)

        assert response.status_code == 422

    async def test_returns_422_for_empty_body(self, client):
        """Should return 422 when request body is empty."""
        response = await _post(client, {})

        assert response.status_code == 422


# =============================================================================
# Service Error Handling
# =============================================================================


class TestContactFormServiceErrors:
    """Error propagation from ContactFormService."""

    async def test_service_exception_propagates(self, client, mock_contact_service):
        """Should propagate unexpected service exceptions out of the endpoint."""
        mock_contact_service.submit = AsyncMock(side_effect=RuntimeError("DB connection failed"))

        # ASGI transport re-raises unhandled exceptions; pytest.raises confirms the
        # endpoint does not silently swallow the error.
        with pytest.raises(RuntimeError, match="DB connection failed"):
            await _post(client, VALID_REQUEST)
