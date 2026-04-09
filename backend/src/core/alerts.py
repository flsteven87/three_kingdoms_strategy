"""
Critical alert delivery.

Logs at CRITICAL and optionally fans out to a webhook (Discord/Slack-compatible
``{content, context}`` JSON body). Delivery failure must NEVER propagate — alerts
are best-effort.

The module-level ``httpx.AsyncClient`` is reused across calls for connection
pooling.  Call ``close_alert_client()`` during application shutdown (wired
through the FastAPI lifespan) so connections are drained cleanly.
"""

import logging
from typing import Any

import httpx

from src.core.config import settings

logger = logging.getLogger(__name__)

_TIMEOUT = httpx.Timeout(3.0)

# Module-level client — reused across all alert calls for connection pooling.
# Created lazily on first use; closed explicitly in lifespan shutdown.
_client: httpx.AsyncClient | None = None


def _get_client() -> httpx.AsyncClient:
    """Return the shared async client, creating it on first use."""
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.AsyncClient(timeout=_TIMEOUT)
    return _client


async def close_alert_client() -> None:
    """Drain connections.  Called from the FastAPI lifespan shutdown path."""
    global _client
    if _client is not None and not _client.is_closed:
        await _client.aclose()
        _client = None


async def alert_critical(code: str, **context: Any) -> None:
    """
    Emit a critical alert.

    Always logs at CRITICAL. If ``settings.alert_webhook_url`` is set, also
    POSTs ``{"content": "🚨 {code}", "context": {...}}`` to that URL.
    Exceptions from the webhook call are logged but never raised.
    """
    logger.critical("ALERT %s %s", code, context)

    url = settings.alert_webhook_url
    if not url:
        return

    try:
        client = _get_client()
        await client.post(
            url,
            json={"content": f"🚨 {code}", "context": context},
        )
    except Exception:
        logger.exception("alert_webhook_url delivery failed code=%s", code)
