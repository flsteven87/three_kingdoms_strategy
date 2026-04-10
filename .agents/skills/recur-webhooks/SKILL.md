---
name: recur-webhooks
description: Set up and handle Recur webhook events for payment notifications. Use when implementing webhook handlers, verifying signatures, handling subscription events, or when user mentions "webhook", "付款通知", "訂閱事件", "payment notification".
license: Elastic-2.0
metadata:
  author: recur
  version: "0.1.0"
  stack: "FastAPI + React"
---

# Recur Webhook Integration

You are helping implement Recur webhooks to receive real-time payment and subscription events.

**This project uses FastAPI (Python).** All backend examples match this stack.

## Webhook Events

### Core Events (Most Common)

| Event | When Fired |
|-------|------------|
| `checkout.completed` | Payment successful, subscription/order created |
| `subscription.activated` | Subscription is now active |
| `subscription.cancelled` | Subscription was cancelled |
| `subscription.renewed` | Recurring payment successful |
| `subscription.past_due` | Payment failed, subscription at risk |
| `order.paid` | One-time purchase completed |
| `refund.created` | Refund initiated |

### All Supported Events

```python
WEBHOOK_EVENT_TYPES = [
    # Checkout
    "checkout.created",
    "checkout.completed",
    # Orders
    "order.paid",
    "order.payment_failed",
    # Subscription Lifecycle
    "subscription.created",
    "subscription.activated",
    "subscription.cancelled",
    "subscription.expired",
    "subscription.trial_ending",
    # Subscription Changes
    "subscription.upgraded",
    "subscription.downgraded",
    "subscription.renewed",
    "subscription.past_due",
    # Scheduled Changes
    "subscription.schedule_created",
    "subscription.schedule_executed",
    "subscription.schedule_cancelled",
    # Invoices
    "invoice.created",
    "invoice.paid",
    "invoice.payment_failed",
    # Customer
    "customer.created",
    "customer.updated",
    # Product
    "product.created",
    "product.updated",
    # Refunds
    "refund.created",
    "refund.succeeded",
    "refund.failed",
]
```

## FastAPI Webhook Handler

### Signature Verification

```python
# src/core/webhook_utils.py
import base64
import hashlib
import hmac
import logging

logger = logging.getLogger(__name__)


def verify_recur_signature(
    payload: bytes,
    signature: str,
    secret: str,
) -> bool:
    """Verify Recur webhook signature using HMAC-SHA256 + Base64."""
    expected = base64.b64encode(
        hmac.new(
            secret.encode(),
            payload,
            hashlib.sha256,
        ).digest()
    ).decode()
    return hmac.compare_digest(signature, expected)
```

> **Important:** Recur uses **Base64-encoded** HMAC-SHA256, not hex.

### Webhook Endpoint

```python
# src/api/v1/endpoints/webhooks.py
import json
import logging

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse

from src.core.config import Settings, get_settings
from src.core.webhook_utils import verify_recur_signature
from src.services.payment_service import PaymentService

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/recur")
async def recur_webhook(
    request: Request,
    settings: Settings = Depends(get_settings),
    payment_service: PaymentService = Depends(get_payment_service),
) -> JSONResponse:
    """Handle Recur webhook events with signature verification and idempotency."""
    # 1. Read raw body for signature verification
    body = await request.body()
    signature = request.headers.get("x-recur-signature", "")

    # 2. Verify signature
    if not settings.recur_webhook_secret:
        logger.error("RECUR_WEBHOOK_SECRET not configured")
        return JSONResponse({"error": "Webhook secret not configured"}, status_code=503)

    if not verify_recur_signature(body, signature, settings.recur_webhook_secret):
        logger.warning("Invalid webhook signature")
        return JSONResponse({"error": "Invalid signature"}, status_code=401)

    # 3. Parse and process
    event = json.loads(body)
    event_id = event.get("id", "")
    event_type = event.get("type", "")

    logger.info("Webhook received: type=%s id=%s", event_type, event_id)

    # 4. Idempotency check (prevent duplicate processing)
    if not await payment_service.try_claim_event(event_id):
        logger.info("Duplicate event skipped: %s", event_id)
        return JSONResponse({"status": "already_processed"})

    # 5. Route to handler
    try:
        await payment_service.handle_webhook_event(event_type, event.get("data", {}))
    except Exception:
        logger.exception("Error processing webhook event: %s", event_id)
        # Return 200 anyway to prevent Recur from retrying
        # (idempotency already claimed, retrying would be skipped)

    return JSONResponse({"status": "ok"})
```

### Payment Service

```python
# src/services/payment_service.py
import logging

logger = logging.getLogger(__name__)


class PaymentService:
    """Handle Recur payment events."""

    def __init__(self, webhook_event_repo, subscription_repo):
        self._webhook_event_repo = webhook_event_repo
        self._subscription_repo = subscription_repo

    async def try_claim_event(self, event_id: str) -> bool:
        """Claim an event for processing (idempotency)."""
        return await self._webhook_event_repo.try_claim_event(event_id)

    async def handle_webhook_event(self, event_type: str, data: dict) -> None:
        """Route webhook events to handlers."""
        handlers = {
            "checkout.completed": self._handle_checkout_completed,
            "subscription.activated": self._handle_subscription_activated,
            "subscription.cancelled": self._handle_subscription_cancelled,
            "subscription.renewed": self._handle_subscription_renewed,
            "subscription.past_due": self._handle_subscription_past_due,
            "order.paid": self._handle_order_paid,
            "refund.created": self._handle_refund_created,
        }

        handler = handlers.get(event_type)
        if handler:
            await handler(data)
        else:
            logger.info("Unhandled event type: %s", event_type)

    async def _handle_checkout_completed(self, data: dict) -> None:
        customer_id = data.get("customerId")
        external_id = data.get("externalCustomerId")
        product_id = data.get("productId")
        amount = data.get("amount")

        logger.info(
            "Checkout completed: customer=%s product=%s amount=%s",
            customer_id, product_id, amount,
        )
        # Update subscription status in your database
        # Grant access to the user

    async def _handle_subscription_activated(self, data: dict) -> None:
        subscription_id = data.get("subscriptionId")
        customer_id = data.get("customerId")
        logger.info("Subscription activated: %s for customer %s", subscription_id, customer_id)
        # Enable premium features

    async def _handle_subscription_cancelled(self, data: dict) -> None:
        subscription_id = data.get("subscriptionId")
        access_until = data.get("accessUntil")
        logger.info("Subscription cancelled: %s, access until %s", subscription_id, access_until)
        # User still has access until accessUntil date

    async def _handle_subscription_renewed(self, data: dict) -> None:
        subscription_id = data.get("subscriptionId")
        next_billing = data.get("nextBillingDate")
        logger.info("Subscription renewed: %s, next billing %s", subscription_id, next_billing)
        # Extend access period

    async def _handle_subscription_past_due(self, data: dict) -> None:
        subscription_id = data.get("subscriptionId")
        failure_reason = data.get("failureReason")
        logger.info("Subscription past due: %s, reason: %s", subscription_id, failure_reason)
        # Notify user, consider grace period

    async def _handle_order_paid(self, data: dict) -> None:
        order_id = data.get("orderId")
        logger.info("Order paid: %s", order_id)

    async def _handle_refund_created(self, data: dict) -> None:
        refund_id = data.get("refundId")
        order_id = data.get("orderId")
        amount = data.get("amount")
        logger.info("Refund created: %s for order %s amount %s", refund_id, order_id, amount)
        # Revoke access, update records
```

## Event Payload Structure

```python
# Webhook event envelope
{
    "id": "evt_xxxxx",           # Event ID (use for idempotency)
    "type": "checkout.completed", # Event type
    "timestamp": "2026-03-26T12:00:00Z",  # ISO 8601
    "data": {
        "customerId": "cus_xxx",
        "customerEmail": "user@example.com",
        "externalCustomerId": "user_123",
        "subscriptionId": "sub_xxx",    # For subscription events
        "orderId": "ord_xxx",           # For order events
        "productId": "prod_xxx",
        "amount": 29900,                # In cents (29900 = NT$299)
        "currency": "TWD",
        # ... more fields depending on event type
    }
}
```

## Webhook Configuration

1. Go to **Recur Dashboard** → **Settings** → **Webhooks**
2. Click **Add Endpoint**
3. Enter your endpoint URL: `https://api.tktmanager.com/api/v1/webhooks/recur`
4. Select events to receive
5. Copy the **Webhook Secret** to your environment variable `RECUR_WEBHOOK_SECRET`

## Testing Webhooks Locally

### Using ngrok

```bash
# Start ngrok tunnel to your FastAPI backend
ngrok http 8087

# Use the ngrok URL in Recur dashboard:
# https://xxxx.ngrok.io/api/v1/webhooks/recur
```

### Using the test script

```bash
# Send test webhook
.Codex/skills/recur-webhooks/scripts/test-webhook.sh \
  http://localhost:8087/api/v1/webhooks/recur \
  checkout.completed \
  your_webhook_secret
```

### Using curl

```bash
SECRET="your_webhook_secret"
PAYLOAD='{"id":"evt_test_123","type":"checkout.completed","data":{"customerId":"cus_test","productId":"prod_test","amount":29900}}'
SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$SECRET" -binary | base64)

curl -X POST http://localhost:8087/api/v1/webhooks/recur \
  -H "Content-Type: application/json" \
  -H "x-recur-signature: $SIGNATURE" \
  -d "$PAYLOAD"
```

## Best Practices

### 1. Always Verify Signatures
Never trust webhook payloads without verifying the `x-recur-signature` header.

### 2. Handle Idempotency
Webhooks may be delivered multiple times. Use the event `id` to deduplicate:
- Store processed event IDs in database (with TTL)
- Check before processing, skip if already seen

### 3. Return 200 Quickly
Return HTTP 200 before heavy processing to avoid Recur timeouts:
- Claim event ID → return 200 → process async
- Or log + return 200, process in background task

### 4. Handle Retries Gracefully
Recur retries failed deliveries. Ensure your handler is idempotent — processing the same event twice should produce the same result.

### 5. Log Everything

```python
logger.info("Webhook received: type=%s id=%s", event_type, event_id)
logger.info("Webhook processed: type=%s id=%s", event_type, event_id)
```

## Debugging Webhooks

### Check Webhook Logs
In Recur Dashboard → Webhooks → Click endpoint → View delivery logs. You can also **Resend** failed events from the dashboard.

### Common Issues

**401 Unauthorized**
- Check `RECUR_WEBHOOK_SECRET` is correct
- Ensure using raw body bytes for signature verification (not parsed JSON)
- Verify Base64 encoding (not hex)

**Timeout (no response)**
- Return 200 before heavy processing
- Use FastAPI `BackgroundTasks` for async work

**Missing events**
- Check event types are selected in Recur dashboard
- Verify endpoint URL is correct and publicly accessible

## Related Skills

- `/recur-quickstart` - Initial SDK setup
- `/recur-checkout` - Implement payment flows
- `/recur-entitlements` - Check subscription access after webhook
