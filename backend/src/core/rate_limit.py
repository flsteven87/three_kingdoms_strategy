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
from slowapi.util import get_remote_address

limiter = Limiter(
    key_func=get_remote_address,
    default_limits=["120/minute"],
)

# Rate limit constants for use in endpoint decorators
PUBLIC_RATE = "30/minute"
PUBLIC_MUTATION_RATE = "20/minute"
WEBHOOK_RATE = "60/minute"
