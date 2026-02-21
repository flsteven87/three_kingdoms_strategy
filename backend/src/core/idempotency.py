"""
Idempotency key middleware for preventing duplicate mutations.

Based on Stripe's idempotency pattern:
- Client sends unique Idempotency-Key header
- Server caches response and returns cached result on retry
- Prevents duplicate uploads/creates during network retries

Reference: https://github.com/snok/asgi-idempotency-header
"""

import logging
from abc import ABC, abstractmethod
from collections import OrderedDict
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from enum import Enum
from threading import Lock

from fastapi import Request, Response
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint

logger = logging.getLogger(__name__)


class IdempotencyStatus(str, Enum):
    """Status of an idempotency key."""

    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


@dataclass
class IdempotencyRecord:
    """Stored record for an idempotency key."""

    key: str
    user_id: str
    status: IdempotencyStatus
    status_code: int | None
    response_body: str | None
    created_at: datetime
    expires_at: datetime

    def is_expired(self) -> bool:
        """Check if this record has expired."""
        return datetime.now(UTC) > self.expires_at


class IdempotencyStorage(ABC):
    """Abstract storage interface for idempotency records."""

    @abstractmethod
    async def get(self, key: str, user_id: str) -> IdempotencyRecord | None:
        """Get existing record or None."""
        pass

    @abstractmethod
    async def create(self, key: str, user_id: str, ttl_seconds: int) -> bool:
        """
        Create new record in PROCESSING state.
        Returns True if created, False if already exists.
        """
        pass

    @abstractmethod
    async def complete(
        self,
        key: str,
        user_id: str,
        status_code: int,
        response_body: str,
    ) -> None:
        """Mark record as completed with response."""
        pass

    @abstractmethod
    async def fail(self, key: str, user_id: str) -> None:
        """Mark record as failed (allows retry)."""
        pass

    @abstractmethod
    async def cleanup_expired(self) -> int:
        """Remove expired records. Returns count deleted."""
        pass


class InMemoryIdempotencyStorage(IdempotencyStorage):
    """
    In-memory storage for development/testing.
    NOT suitable for production (no persistence, no distribution).
    """

    def __init__(self, max_size: int = 10000):
        self._store: OrderedDict[str, IdempotencyRecord] = OrderedDict()
        self._lock = Lock()
        self._max_size = max_size

    def _make_key(self, key: str, user_id: str) -> str:
        return f"{user_id}:{key}"

    async def get(self, key: str, user_id: str) -> IdempotencyRecord | None:
        composite_key = self._make_key(key, user_id)
        with self._lock:
            record = self._store.get(composite_key)
            if record and record.is_expired():
                del self._store[composite_key]
                return None
            return record

    async def create(self, key: str, user_id: str, ttl_seconds: int) -> bool:
        composite_key = self._make_key(key, user_id)
        now = datetime.now(UTC)

        with self._lock:
            # Check existing
            existing = self._store.get(composite_key)
            if existing and not existing.is_expired():
                return False

            # Evict oldest if at capacity
            while len(self._store) >= self._max_size:
                self._store.popitem(last=False)

            # Create new record
            self._store[composite_key] = IdempotencyRecord(
                key=key,
                user_id=user_id,
                status=IdempotencyStatus.PROCESSING,
                status_code=None,
                response_body=None,
                created_at=now,
                expires_at=now + timedelta(seconds=ttl_seconds),
            )
            return True

    async def complete(
        self,
        key: str,
        user_id: str,
        status_code: int,
        response_body: str,
    ) -> None:
        composite_key = self._make_key(key, user_id)
        with self._lock:
            record = self._store.get(composite_key)
            if record:
                self._store[composite_key] = IdempotencyRecord(
                    key=record.key,
                    user_id=record.user_id,
                    status=IdempotencyStatus.COMPLETED,
                    status_code=status_code,
                    response_body=response_body,
                    created_at=record.created_at,
                    expires_at=record.expires_at,
                )

    async def fail(self, key: str, user_id: str) -> None:
        composite_key = self._make_key(key, user_id)
        with self._lock:
            if composite_key in self._store:
                del self._store[composite_key]

    async def cleanup_expired(self) -> int:
        now = datetime.now(UTC)
        count = 0
        with self._lock:
            expired_keys = [k for k, v in self._store.items() if v.expires_at < now]
            for k in expired_keys:
                del self._store[k]
                count += 1
        return count


# HTTP methods that should be idempotent
IDEMPOTENT_METHODS = {"POST", "PATCH", "DELETE"}

# Paths that require idempotency (prefix match)
IDEMPOTENT_PATHS = [
    "/api/v1/uploads",
    "/api/v1/events",
    "/api/v1/seasons",
]


class IdempotencyMiddleware(BaseHTTPMiddleware):
    """
    Middleware that enforces idempotency for mutating endpoints.

    Usage:
    - Client sends `Idempotency-Key: <uuid>` header
    - First request: processed normally, response cached
    - Retry with same key: returns cached response
    - Concurrent request with same key: returns 409 Conflict
    """

    def __init__(
        self,
        app,
        storage: IdempotencyStorage,
        ttl_seconds: int = 86400,  # 24 hours default
        header_name: str = "Idempotency-Key",
    ):
        super().__init__(app)
        self.storage = storage
        self.ttl_seconds = ttl_seconds
        self.header_name = header_name

    def _should_process(self, request: Request) -> bool:
        """Check if this request needs idempotency handling."""
        if request.method not in IDEMPOTENT_METHODS:
            return False

        return any(request.url.path.startswith(prefix) for prefix in IDEMPOTENT_PATHS)

    def _get_user_id(self, request: Request) -> str | None:
        """Extract user ID from request state (set by auth middleware)."""
        return getattr(request.state, "user_id", None)

    async def dispatch(
        self,
        request: Request,
        call_next: RequestResponseEndpoint,
    ) -> Response:
        # Skip if not applicable
        if not self._should_process(request):
            return await call_next(request)

        # Get idempotency key from header
        idempotency_key = request.headers.get(self.header_name)
        if not idempotency_key:
            # No key provided - process normally (backward compatible)
            return await call_next(request)

        # Get user ID for scoping
        user_id = self._get_user_id(request)
        if not user_id:
            # No user context - skip idempotency
            return await call_next(request)

        # Check for existing record
        existing = await self.storage.get(idempotency_key, user_id)

        if existing:
            if existing.status == IdempotencyStatus.PROCESSING:
                # Another request is processing - reject
                logger.warning(
                    f"Concurrent request with same idempotency key: {idempotency_key}"
                )
                return JSONResponse(
                    status_code=409,
                    content={
                        "detail": "A request with this idempotency key is already being processed",
                        "idempotency_key": idempotency_key,
                    },
                )

            if existing.status == IdempotencyStatus.COMPLETED:
                # Return cached response
                logger.info(
                    f"Returning cached response for idempotency key: {idempotency_key}"
                )
                return Response(
                    content=existing.response_body,
                    status_code=existing.status_code or 200,
                    media_type="application/json",
                )

            # FAILED status - allow retry (record was deleted)

        # Try to acquire the key
        acquired = await self.storage.create(
            idempotency_key,
            user_id,
            self.ttl_seconds,
        )

        if not acquired:
            # Race condition - another request just acquired it
            return JSONResponse(
                status_code=409,
                content={
                    "detail": "A request with this idempotency key is already being processed",
                    "idempotency_key": idempotency_key,
                },
            )

        # Process the request
        try:
            response = await call_next(request)

            # Cache successful responses (2xx)
            if 200 <= response.status_code < 300:
                # Read response body
                body = b""
                async for chunk in response.body_iterator:
                    body += chunk

                await self.storage.complete(
                    idempotency_key,
                    user_id,
                    response.status_code,
                    body.decode(),
                )

                # Return new response with same body
                return Response(
                    content=body,
                    status_code=response.status_code,
                    headers=dict(response.headers),
                    media_type=response.media_type,
                )
            else:
                # Failed request - allow retry
                await self.storage.fail(idempotency_key, user_id)
                return response

        except Exception:
            # Request failed - allow retry
            await self.storage.fail(idempotency_key, user_id)
            raise
