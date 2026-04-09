"""
Webhook Endpoints - External Service Integrations.

Recur gateway only. Error classification:
    - Invalid signature           → 401 + alert
    - Invalid JSON                → 400
    - Duplicate event             → 200 (idempotent)
    - WebhookPermanentError       → 200 + alert (don't retry)
    - WebhookTransientError       → 500 (Recur retries)
    - Unknown exception           → 500 + log

符合 CLAUDE.md 🟡: API layer = HTTP translation; business logic lives in PaymentService.
"""

import base64
import hashlib
import hmac
import logging

from fastapi import APIRouter, Header, HTTPException, Request, status

from src.core.alerts import alert_critical
from src.core.config import settings
from src.core.dependencies import PaymentServiceDep
from src.core.rate_limit import WEBHOOK_RATE, limiter
from src.core.webhook_errors import WebhookPermanentError, WebhookTransientError

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/webhooks", tags=["webhooks"])


def verify_recur_signature(payload: bytes, signature: str, secret: str) -> bool:
    """HMAC-SHA256 + Base64, constant-time compare."""
    if not signature or not secret:
        return False

    computed = hmac.new(secret.encode("utf-8"), payload, hashlib.sha256).digest()
    expected = base64.b64encode(computed).decode("utf-8")
    try:
        return hmac.compare_digest(signature.strip(), expected)
    except (TypeError, ValueError):
        return False


@router.post("/recur")
@limiter.limit(WEBHOOK_RATE)
async def recur_webhook(
    request: Request,
    payment_service: PaymentServiceDep,
    x_recur_signature: str | None = Header(None, alias="x-recur-signature"),
):
    payload = await request.body()

    if not settings.recur_webhook_secret:
        logger.warning("RECUR_WEBHOOK_SECRET not configured; rejecting webhook")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Webhook signature verification is not configured",
        )

    if not verify_recur_signature(
        payload=payload,
        signature=x_recur_signature or "",
        secret=settings.recur_webhook_secret,
    ):
        await alert_critical(
            "recur.webhook.signature_failed",
            source_ip=getattr(request.client, "host", None),
            bytes=len(payload),
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid signature",
        )

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
    event_data = event.get("data", {}) or {}

    logger.info("Recur webhook received type=%s id=%s", event_type, event_id)

    try:
        if event_type in ("checkout.completed", "order.paid"):
            result = await payment_service.handle_payment_success(
                event_data, event_id=event_id, event_type=event_type,
            )
            return {"received": True, **result}

        if event_type == "order.payment_failed":
            customer = event_data.get("customer") or {}
            logger.warning(
                "Payment failed event_id=%s customer=%s amount=%s reason=%s",
                event_id,
                customer.get("external_id") if isinstance(customer, dict) else None,
                event_data.get("amount"),
                event_data.get("failure_reason"),
            )
            return {"received": True, "status": "payment_failed_logged"}

        logger.info("Unhandled Recur event type: %s", event_type)
        return {"received": True, "status": "ignored"}

    except WebhookPermanentError as e:
        # Note: keyword is `error_code`, not `code` — alert_critical's first
        # parameter is named `code`, so passing `code=...` collides. The
        # domain error's code is ferried through as context metadata.
        await alert_critical(
            "recur.webhook.permanent", error_code=e.code, **e.context
        )
        return {"received": True, "status": "permanent_failure", "code": e.code}

    except WebhookTransientError as e:
        logger.error("Transient webhook error code=%s context=%s", e.code, e.context)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"transient:{e.code}",
        ) from e

    except Exception as e:
        logger.exception("Unexpected error processing webhook type=%s", event_type)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal error processing webhook",
        ) from e
