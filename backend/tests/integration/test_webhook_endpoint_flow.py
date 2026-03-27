"""
Integration tests: Webhook HTTP endpoint → PaymentService → Quota update.

Tests the full HTTP request path including signature verification.
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

from src.api.v1.endpoints.webhooks import router

WEBHOOK_SECRET = "test_webhook_secret_key"
USER_ID = UUID("11111111-1111-1111-1111-111111111111")
ALLIANCE_ID = UUID("22222222-2222-2222-2222-222222222222")


def sign_payload(payload: bytes, secret: str = WEBHOOK_SECRET) -> str:
    computed = hmac.new(
        key=secret.encode("utf-8"),
        msg=payload,
        digestmod=hashlib.sha256,
    ).digest()
    return base64.b64encode(computed).decode("utf-8")


def make_checkout_event(user_id: UUID, quantity: int = 1) -> dict:
    return {
        "type": "checkout.completed",
        "id": "evt_test_001",
        "data": {
            "externalCustomerId": f"{user_id}:{quantity}",
            "amount": 999 * quantity,
            "currency": "TWD",
        },
    }


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


class TestWebhookEndpointIntegration:
    """Full HTTP webhook → service → quota update."""

    @patch("src.api.v1.endpoints.webhooks.settings")
    @patch("src.api.v1.endpoints.webhooks.PaymentService")
    async def test_valid_webhook_processes_payment_and_returns_200(
        self,
        mock_payment_cls: MagicMock,
        mock_settings: MagicMock,
        client: AsyncClient,
    ):
        # Arrange
        mock_settings.recur_webhook_secret = WEBHOOK_SECRET
        mock_service = MagicMock()
        mock_service.handle_payment_success = AsyncMock(
            return_value={
                "success": True,
                "alliance_id": str(ALLIANCE_ID),
                "user_id": str(USER_ID),
                "seasons_added": 1,
                "available_seasons": 1,
            }
        )
        mock_payment_cls.return_value = mock_service

        event = make_checkout_event(USER_ID)
        payload = json.dumps(event).encode()
        signature = sign_payload(payload)

        # Act
        response = await client.post(
            "/api/v1/webhooks/recur",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "x-recur-signature": signature,
            },
        )

        # Assert
        assert response.status_code == 200
        assert response.json()["received"] is True
        mock_service.handle_payment_success.assert_awaited_once()

    @patch("src.api.v1.endpoints.webhooks.settings")
    async def test_invalid_signature_returns_401(
        self,
        mock_settings: MagicMock,
        client: AsyncClient,
    ):
        mock_settings.recur_webhook_secret = WEBHOOK_SECRET

        event = make_checkout_event(USER_ID)
        payload = json.dumps(event).encode()

        response = await client.post(
            "/api/v1/webhooks/recur",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "x-recur-signature": "invalid_signature",
            },
        )

        assert response.status_code == 401

    @patch("src.api.v1.endpoints.webhooks.settings")
    async def test_missing_webhook_secret_returns_503(
        self,
        mock_settings: MagicMock,
        client: AsyncClient,
    ):
        mock_settings.recur_webhook_secret = None

        event = make_checkout_event(USER_ID)
        payload = json.dumps(event).encode()
        signature = sign_payload(payload)

        response = await client.post(
            "/api/v1/webhooks/recur",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "x-recur-signature": signature,
            },
        )

        assert response.status_code == 503
