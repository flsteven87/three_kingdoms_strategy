"""
Webhook Endpoints - External Service Integrations

Handles incoming webhooks from external services like Recur payment gateway.

Follows CLAUDE.md:
- API Layer: HTTP handling, validation, NO business logic
- Uses Service layer for processing
- Proper error responses
"""

import base64
import hashlib
import hmac
import logging

from fastapi import APIRouter, Header, HTTPException, Request, status

from src.core.config import settings
from src.core.rate_limit import WEBHOOK_RATE, limiter
from src.services.payment_service import PaymentService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/webhooks", tags=["webhooks"])


def verify_recur_signature(payload: bytes, signature: str, secret: str) -> bool:
    """
    Verify Recur webhook signature using HMAC-SHA256 with Base64 encoding.

    Recur sends signatures in Base64 format (not hex), so we must encode
    our computed signature as Base64 for comparison.

    Args:
        payload: Raw request body bytes
        signature: X-Recur-Signature header value (Base64 encoded)
        secret: Webhook secret from Recur dashboard

    Returns:
        True if signature is valid, False otherwise
    """
    if not signature or not secret:
        return False

    # Compute HMAC-SHA256 and encode as Base64 (Recur format)
    computed_hmac = hmac.new(
        key=secret.encode("utf-8"),
        msg=payload,
        digestmod=hashlib.sha256,
    ).digest()
    expected = base64.b64encode(computed_hmac).decode("utf-8")

    # Use constant-time comparison to prevent timing attacks
    # Handle potential length mismatch gracefully
    try:
        return hmac.compare_digest(signature.strip(), expected)
    except (TypeError, ValueError):
        return False


@router.post("/recur")
@limiter.limit(WEBHOOK_RATE)
async def recur_webhook(
    request: Request,
    x_recur_signature: str | None = Header(None, alias="x-recur-signature"),
):
    """
    Handle Recur payment webhook events.

    Supported events:
    - checkout.completed / order.paid: Payment successful, add purchased seasons
    - order.payment_failed: Logged for monitoring, no action taken

    Security:
    - Verifies X-Recur-Signature header using HMAC-SHA256
    - Returns 401 if signature verification fails
    """
    # Get raw body for signature verification
    payload = await request.body()

    # Verify webhook signature - reject all requests if secret is not configured
    if not settings.recur_webhook_secret:
        logger.warning("RECUR_WEBHOOK_SECRET not configured, rejecting webhook request")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Webhook signature verification is not configured",
        )

    if not verify_recur_signature(
        payload=payload,
        signature=x_recur_signature or "",
        secret=settings.recur_webhook_secret,
    ):
        logger.warning("Recur webhook signature verification failed")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid signature",
        )

    # Parse JSON body
    try:
        event = await request.json()
    except Exception as e:
        logger.error("Failed to parse webhook payload: %s", e)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid JSON payload",
        ) from e

    event_type = event.get("type")
    event_id = event.get("id")
    event_data = event.get("data", {})

    logger.info("Received Recur webhook - type=%s, id=%s", event_type, event_id)

    # Handle events
    payment_service = PaymentService()

    try:
        if event_type in ("checkout.completed", "order.paid"):
            result = await payment_service.handle_payment_success(
                event_data, event_id=event_id, event_type=event_type,
            )
            logger.info("Webhook %s processed: %s", event_type, result)

        elif event_type == "order.payment_failed":
            # Log failed payments for monitoring — no action needed
            # (Recur handles retry logic on their side)
            logger.warning(
                "Payment failed - event_id=%s, customer=%s, amount=%s, reason=%s",
                event_id,
                event_data.get("externalCustomerId"),
                event_data.get("amount"),
                event_data.get("failureReason"),
            )

        else:
            logger.info("Unhandled Recur event type: %s", event_type)

    except ValueError as e:
        # Business logic errors - return 200 to prevent Recur retries
        logger.error("Error processing webhook %s: %s", event_type, e)
        return {"received": True, "error": str(e)}

    except Exception as e:
        # Unexpected errors - return 500 for retry
        logger.exception("Unexpected error processing webhook %s", event_type)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal error processing webhook",
        ) from e

    return {"received": True}
