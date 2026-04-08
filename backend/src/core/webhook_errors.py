"""
Webhook processing error classes.

These split webhook failures into two retry buckets:
- PermanentError: return 200 to the gateway (retry is futile) but alert loudly.
- TransientError: return 500 so the gateway retries.

符合 CLAUDE.md 🟡: Domain exceptions — API layer converts to HTTP responses.
"""

from typing import Any


class WebhookProcessingError(Exception):
    """Base class for webhook processing errors."""

    def __init__(self, code: str, **context: Any) -> None:
        self.code = code
        self.context = context
        detail = ", ".join(f"{k}={v}" for k, v in context.items())
        super().__init__(f"{code}({detail})" if detail else code)


class WebhookPermanentError(WebhookProcessingError):
    """
    The event is parsed and signed correctly, but processing cannot succeed
    and retrying will not help. Return 200 to the gateway and alert on-call.

    Examples: unknown product, amount mismatch, user has no alliance.
    """


class WebhookTransientError(WebhookProcessingError):
    """
    Processing failed due to a transient condition. Return 500 to the gateway
    so it retries (idempotency protects us from duplicate grants).

    Examples: database unreachable, PostgREST 5xx.
    """
