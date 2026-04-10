"""Checkout Service — creates Recur checkout sessions via API.

Used when promotion codes need to be applied, since the client-side
Recur SDK does not support passing promotion codes to checkout().
"""

import logging

import httpx

from src.core.config import settings

logger = logging.getLogger(__name__)

RECUR_API_BASE = "https://api.recur.tw/v1"


class CheckoutSessionError(Exception):
    """Raised when Recur API rejects the session creation."""

    def __init__(self, status_code: int, detail: str) -> None:
        self.status_code = status_code
        self.detail = detail
        super().__init__(f"Recur API error {status_code}: {detail}")


class CheckoutService:
    async def create_session(
        self,
        *,
        product_id: str,
        customer_email: str,
        customer_name: str | None = None,
        external_customer_id: str | None = None,
        promotion_code: str | None = None,
        success_url: str,
        cancel_url: str | None = None,
    ) -> str:
        """Create a Recur checkout session. Returns the hosted checkout URL.

        Raises ``CheckoutSessionError`` on API failure.
        """
        payload: dict = {
            "product_id": product_id,
            "customer_email": customer_email,
            "success_url": success_url,
        }
        if customer_name:
            payload["customer_name"] = customer_name
        if external_customer_id:
            payload["external_customer_id"] = external_customer_id
        if promotion_code:
            payload["promotion_code"] = promotion_code
        if cancel_url:
            payload["cancel_url"] = cancel_url

        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{RECUR_API_BASE}/checkout/sessions",
                json=payload,
                headers={
                    "Authorization": f"Bearer {settings.recur_secret_key}",
                    "Content-Type": "application/json",
                },
                timeout=15.0,
            )

        if resp.status_code >= 400:
            body = resp.text
            logger.error(
                "Recur checkout session creation failed status=%s body=%s",
                resp.status_code,
                body[:500],
            )
            raise CheckoutSessionError(resp.status_code, body)

        data = resp.json()
        url = data.get("url")
        if not url:
            raise CheckoutSessionError(500, "Recur API returned no checkout URL")

        logger.info(
            "Checkout session created id=%s promotion_code=%s",
            data.get("id"),
            promotion_code,
        )
        return url
