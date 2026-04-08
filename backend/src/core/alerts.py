"""
Critical alert delivery.

Logs at CRITICAL and optionally fans out to a webhook (Discord/Slack-compatible
`{content, context}` JSON body). Delivery failure must NEVER propagate — alerts
are best-effort.
"""

import logging
from typing import Any

import httpx

from src.core.config import settings

logger = logging.getLogger(__name__)

_TIMEOUT = httpx.Timeout(3.0)


async def alert_critical(code: str, **context: Any) -> None:
    """
    Emit a critical alert.

    Always logs at CRITICAL. If ``settings.alert_webhook_url`` is set, also
    POSTs ``{"content": "🚨 {code}", "context": {...}}`` to that URL.
    Exceptions from the webhook call are logged but never raised.
    """
    logger.critical("ALERT %s %s", code, context)

    url = getattr(settings, "alert_webhook_url", None)
    if not url:
        return

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            await client.post(
                url,
                json={"content": f"🚨 {code}", "context": context},
            )
    except Exception:
        logger.exception("alert_webhook_url delivery failed code=%s", code)
