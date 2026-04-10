"""
Rate limiting configuration using slowapi.

Provides per-IP rate limits with distinct tiers:
- Default: 120/minute for all endpoints
- Public LIFF endpoints: 30/minute (unauthenticated, tighter)
- Webhook endpoints: 60/minute (external services)
- Mutation endpoints: 20/minute (POST/PUT/DELETE on public routes)

Note: slowapi uses in-memory storage by default. Rate limits are per-process,
not shared across horizontal instances. If scaling to multiple instances,
switch to a shared backend (e.g., Redis via `storage_uri` parameter).
"""

from slowapi import Limiter
from starlette.requests import Request


def _get_real_client_ip(request: Request) -> str:
    """Extract real client IP from X-Forwarded-For behind reverse proxy.

    Zeabur (and most cloud LBs) prepend the real client IP as the first
    entry in X-Forwarded-For. Falls back to direct peer IP when the
    header is absent (local development).
    """
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "127.0.0.1"


limiter = Limiter(
    key_func=_get_real_client_ip,
    default_limits=["120/minute"],
)

# Rate limit constants for use in endpoint decorators
PUBLIC_RATE = "30/minute"
PUBLIC_MUTATION_RATE = "20/minute"
WEBHOOK_RATE = "60/minute"
