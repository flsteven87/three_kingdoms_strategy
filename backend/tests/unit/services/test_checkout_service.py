"""Unit tests for CheckoutService — Recur API checkout session creation."""

from unittest.mock import AsyncMock, patch

import httpx
import pytest

from src.services.checkout_service import CheckoutService, CheckoutSessionError


@pytest.fixture
def service():
    return CheckoutService()


@pytest.fixture(autouse=True)
def fake_settings():
    with patch("src.services.checkout_service.settings") as s:
        s.recur_secret_key = "sk_test_fake"
        yield s


def _mock_response(status_code: int, **kwargs) -> httpx.Response:
    return httpx.Response(
        status_code,
        request=httpx.Request("POST", "https://api.recur.tw/v1/checkout/sessions"),
        **kwargs,
    )


class TestCreateSession:
    @pytest.mark.asyncio
    async def test_success_returns_url(self, service):
        resp = _mock_response(200, json={"id": "cs_123", "url": "https://checkout.recur.tw/cs_123"})

        with patch("httpx.AsyncClient.post", new_callable=AsyncMock, return_value=resp):
            url = await service.create_session(
                product_id="prod_test",
                customer_email="test@example.com",
                success_url="https://example.com/success",
                promotion_code="DDYH200",
            )

        assert url == "https://checkout.recur.tw/cs_123"

    @pytest.mark.asyncio
    async def test_api_error_raises(self, service):
        resp = _mock_response(400, text='{"error":{"code":"invalid_promotion_code"}}')

        with patch("httpx.AsyncClient.post", new_callable=AsyncMock, return_value=resp):
            with pytest.raises(CheckoutSessionError) as exc_info:
                await service.create_session(
                    product_id="prod_test",
                    customer_email="test@example.com",
                    success_url="https://example.com/success",
                    promotion_code="INVALID",
                )
            assert exc_info.value.status_code == 400

    @pytest.mark.asyncio
    async def test_no_url_in_response_raises(self, service):
        resp = _mock_response(200, json={"id": "cs_123"})

        with patch("httpx.AsyncClient.post", new_callable=AsyncMock, return_value=resp):
            with pytest.raises(CheckoutSessionError, match="no checkout URL"):
                await service.create_session(
                    product_id="prod_test",
                    customer_email="test@example.com",
                    success_url="https://example.com/success",
                )

    @pytest.mark.asyncio
    async def test_promotion_code_included_in_payload(self, service):
        resp = _mock_response(200, json={"id": "cs_123", "url": "https://checkout.recur.tw/cs_123"})

        with patch(
            "httpx.AsyncClient.post", new_callable=AsyncMock, return_value=resp
        ) as mock_post:
            await service.create_session(
                product_id="prod_test",
                customer_email="test@example.com",
                success_url="https://example.com/success",
                promotion_code="DDYH200",
            )

            payload = mock_post.call_args.kwargs["json"]
            assert payload["promotion_code"] == "DDYH200"

    @pytest.mark.asyncio
    async def test_no_promo_code_omits_field(self, service):
        resp = _mock_response(200, json={"id": "cs_123", "url": "https://checkout.recur.tw/cs_123"})

        with patch(
            "httpx.AsyncClient.post", new_callable=AsyncMock, return_value=resp
        ) as mock_post:
            await service.create_session(
                product_id="prod_test",
                customer_email="test@example.com",
                success_url="https://example.com/success",
            )

            payload = mock_post.call_args.kwargs["json"]
            assert "promotion_code" not in payload

    @pytest.mark.asyncio
    async def test_server_error_raises_with_status(self, service):
        resp = _mock_response(500, text="Internal Server Error")

        with patch("httpx.AsyncClient.post", new_callable=AsyncMock, return_value=resp):
            with pytest.raises(CheckoutSessionError) as exc_info:
                await service.create_session(
                    product_id="prod_test",
                    customer_email="test@example.com",
                    success_url="https://example.com/success",
                )
            assert exc_info.value.status_code == 500
