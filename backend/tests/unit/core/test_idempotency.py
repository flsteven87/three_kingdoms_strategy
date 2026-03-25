"""
Unit Tests for Idempotency Infrastructure

Covers:
- IdempotencyRecord.is_expired(): past/future/boundary expires_at
- InMemoryIdempotencyStorage:
    create()         — new key, duplicate key, expired-then-recreate
    get()            — existing, missing, auto-purges expired on get
    complete()       — transitions PROCESSING → COMPLETED
    fail()           — deletes record (allows retry)
    cleanup_expired() — counts and removes expired records
    max_size eviction — oldest entry evicted when at capacity
- IdempotencyMiddleware._should_process():
    matching method + path, non-matching method, non-matching path
"""

from datetime import UTC, datetime, timedelta
from unittest.mock import MagicMock

import pytest

from src.core.idempotency import (
    IdempotencyMiddleware,
    IdempotencyRecord,
    IdempotencyStatus,
    InMemoryIdempotencyStorage,
)

# =============================================================================
# Helpers
# =============================================================================


def _make_record(
    key: str = "test-key",
    user_id: str = "user-1",
    status: IdempotencyStatus = IdempotencyStatus.PROCESSING,
    offset_seconds: int = 3600,
) -> IdempotencyRecord:
    """Build an IdempotencyRecord with expires_at = now + offset_seconds."""
    now = datetime.now(UTC)
    return IdempotencyRecord(
        key=key,
        user_id=user_id,
        status=status,
        status_code=None,
        response_body=None,
        created_at=now,
        expires_at=now + timedelta(seconds=offset_seconds),
    )


def _make_expired_record(**kwargs) -> IdempotencyRecord:
    return _make_record(offset_seconds=-1, **kwargs)


def _make_middleware() -> IdempotencyMiddleware:
    """Build a middleware instance without a real ASGI app."""
    storage = InMemoryIdempotencyStorage()
    return IdempotencyMiddleware(app=MagicMock(), storage=storage)


def _make_request(method: str, path: str) -> MagicMock:
    """Return a mock Request with the given method and URL path."""
    req = MagicMock()
    req.method = method
    req.url.path = path
    return req


# =============================================================================
# TestIdempotencyRecord
# =============================================================================


class TestIdempotencyRecord:
    """Tests for IdempotencyRecord.is_expired()."""

    def test_not_expired_when_expires_in_the_future(self):
        """Should return False for a record that has not yet expired."""
        record = _make_record(offset_seconds=3600)

        assert record.is_expired() is False

    def test_expired_when_expires_in_the_past(self):
        """Should return True for a record whose expiry has passed."""
        record = _make_expired_record()

        assert record.is_expired() is True

    def test_boundary_just_expired(self):
        """A record expiring 1 second ago should be considered expired."""
        now = datetime.now(UTC)
        record = IdempotencyRecord(
            key="k",
            user_id="u",
            status=IdempotencyStatus.PROCESSING,
            status_code=None,
            response_body=None,
            created_at=now - timedelta(seconds=10),
            expires_at=now - timedelta(seconds=1),
        )

        assert record.is_expired() is True

    def test_boundary_far_future(self):
        """A record expiring far in the future should definitely not be expired."""
        record = _make_record(offset_seconds=86400 * 365)

        assert record.is_expired() is False

    def test_status_does_not_affect_expiry(self):
        """is_expired() depends only on expires_at, not the status field."""
        completed = _make_record(
            status=IdempotencyStatus.COMPLETED, offset_seconds=3600
        )
        assert completed.is_expired() is False

        failed_expired = _make_record(
            status=IdempotencyStatus.FAILED, offset_seconds=-1
        )
        assert failed_expired.is_expired() is True


# =============================================================================
# TestInMemoryIdempotencyStorageCreate
# =============================================================================


class TestInMemoryIdempotencyStorageCreate:
    """Tests for InMemoryIdempotencyStorage.create()."""

    @pytest.mark.asyncio
    async def test_create_new_key_returns_true(self):
        """Should return True when the key is brand new."""
        storage = InMemoryIdempotencyStorage()

        result = await storage.create("key-1", "user-1", ttl_seconds=3600)

        assert result is True

    @pytest.mark.asyncio
    async def test_create_duplicate_key_returns_false(self):
        """Should return False when the key already exists and is not expired."""
        storage = InMemoryIdempotencyStorage()
        await storage.create("key-1", "user-1", ttl_seconds=3600)

        result = await storage.create("key-1", "user-1", ttl_seconds=3600)

        assert result is False

    @pytest.mark.asyncio
    async def test_different_users_same_key_are_independent(self):
        """Keys are scoped per user — same key for two users should both succeed."""
        storage = InMemoryIdempotencyStorage()
        await storage.create("shared-key", "user-1", ttl_seconds=3600)

        result = await storage.create("shared-key", "user-2", ttl_seconds=3600)

        assert result is True

    @pytest.mark.asyncio
    async def test_create_after_expiry_returns_true(self):
        """Should allow re-creation of an expired key."""
        storage = InMemoryIdempotencyStorage()
        # Manually insert an expired record
        composite = "user-1:key-exp"
        now = datetime.now(UTC)
        storage._store[composite] = IdempotencyRecord(
            key="key-exp",
            user_id="user-1",
            status=IdempotencyStatus.PROCESSING,
            status_code=None,
            response_body=None,
            created_at=now - timedelta(seconds=10),
            expires_at=now - timedelta(seconds=1),
        )

        result = await storage.create("key-exp", "user-1", ttl_seconds=3600)

        assert result is True

    @pytest.mark.asyncio
    async def test_created_record_has_processing_status(self):
        """Newly created record should have PROCESSING status."""
        storage = InMemoryIdempotencyStorage()
        await storage.create("key-1", "user-1", ttl_seconds=3600)

        record = await storage.get("key-1", "user-1")

        assert record is not None
        assert record.status == IdempotencyStatus.PROCESSING


# =============================================================================
# TestInMemoryIdempotencyStorageGet
# =============================================================================


class TestInMemoryIdempotencyStorageGet:
    """Tests for InMemoryIdempotencyStorage.get()."""

    @pytest.mark.asyncio
    async def test_get_existing_record_returns_it(self):
        """Should return the record that was previously created."""
        storage = InMemoryIdempotencyStorage()
        await storage.create("key-1", "user-1", ttl_seconds=3600)

        record = await storage.get("key-1", "user-1")

        assert record is not None
        assert record.key == "key-1"
        assert record.user_id == "user-1"

    @pytest.mark.asyncio
    async def test_get_missing_key_returns_none(self):
        """Should return None for a key that was never created."""
        storage = InMemoryIdempotencyStorage()

        record = await storage.get("nonexistent", "user-1")

        assert record is None

    @pytest.mark.asyncio
    async def test_get_purges_and_returns_none_for_expired(self):
        """get() should auto-delete expired records and return None."""
        storage = InMemoryIdempotencyStorage()
        composite = "user-1:key-old"
        now = datetime.now(UTC)
        storage._store[composite] = IdempotencyRecord(
            key="key-old",
            user_id="user-1",
            status=IdempotencyStatus.COMPLETED,
            status_code=200,
            response_body='{"ok": true}',
            created_at=now - timedelta(hours=2),
            expires_at=now - timedelta(hours=1),
        )

        record = await storage.get("key-old", "user-1")

        assert record is None
        assert composite not in storage._store

    @pytest.mark.asyncio
    async def test_get_wrong_user_returns_none(self):
        """Keys are user-scoped; different user should not see the record."""
        storage = InMemoryIdempotencyStorage()
        await storage.create("key-1", "user-1", ttl_seconds=3600)

        record = await storage.get("key-1", "user-2")

        assert record is None


# =============================================================================
# TestInMemoryIdempotencyStorageComplete
# =============================================================================


class TestInMemoryIdempotencyStorageComplete:
    """Tests for InMemoryIdempotencyStorage.complete()."""

    @pytest.mark.asyncio
    async def test_complete_transitions_to_completed(self):
        """Should update status to COMPLETED and store response data."""
        storage = InMemoryIdempotencyStorage()
        await storage.create("key-1", "user-1", ttl_seconds=3600)

        await storage.complete("key-1", "user-1", status_code=201, response_body='{"id":1}')

        record = await storage.get("key-1", "user-1")
        assert record is not None
        assert record.status == IdempotencyStatus.COMPLETED
        assert record.status_code == 201
        assert record.response_body == '{"id":1}'

    @pytest.mark.asyncio
    async def test_complete_preserves_original_timestamps(self):
        """Completing a record should not change created_at or expires_at."""
        storage = InMemoryIdempotencyStorage()
        await storage.create("key-1", "user-1", ttl_seconds=3600)
        original = await storage.get("key-1", "user-1")
        assert original is not None

        await storage.complete("key-1", "user-1", status_code=200, response_body="{}")

        updated = await storage.get("key-1", "user-1")
        assert updated is not None
        assert updated.created_at == original.created_at
        assert updated.expires_at == original.expires_at

    @pytest.mark.asyncio
    async def test_complete_on_missing_key_is_noop(self):
        """Completing a non-existent key should not raise an error."""
        storage = InMemoryIdempotencyStorage()

        # Should not raise
        await storage.complete("ghost-key", "user-1", status_code=200, response_body="{}")


# =============================================================================
# TestInMemoryIdempotencyStorageFail
# =============================================================================


class TestInMemoryIdempotencyStorageFail:
    """Tests for InMemoryIdempotencyStorage.fail()."""

    @pytest.mark.asyncio
    async def test_fail_removes_record(self):
        """Failing a key should delete it so retries are permitted."""
        storage = InMemoryIdempotencyStorage()
        await storage.create("key-1", "user-1", ttl_seconds=3600)

        await storage.fail("key-1", "user-1")

        record = await storage.get("key-1", "user-1")
        assert record is None

    @pytest.mark.asyncio
    async def test_fail_allows_subsequent_create(self):
        """After fail(), create() should succeed for the same key."""
        storage = InMemoryIdempotencyStorage()
        await storage.create("key-1", "user-1", ttl_seconds=3600)
        await storage.fail("key-1", "user-1")

        result = await storage.create("key-1", "user-1", ttl_seconds=3600)

        assert result is True

    @pytest.mark.asyncio
    async def test_fail_on_missing_key_is_noop(self):
        """Failing a non-existent key should not raise an error."""
        storage = InMemoryIdempotencyStorage()

        # Should not raise
        await storage.fail("ghost-key", "user-1")


# =============================================================================
# TestInMemoryIdempotencyStorageCleanupExpired
# =============================================================================


class TestInMemoryIdempotencyStorageCleanupExpired:
    """Tests for InMemoryIdempotencyStorage.cleanup_expired()."""

    @pytest.mark.asyncio
    async def test_cleanup_returns_zero_when_nothing_expired(self):
        """Should return 0 when all stored records are still valid."""
        storage = InMemoryIdempotencyStorage()
        await storage.create("key-1", "user-1", ttl_seconds=3600)

        count = await storage.cleanup_expired()

        assert count == 0

    @pytest.mark.asyncio
    async def test_cleanup_removes_expired_records_and_returns_count(self):
        """Should delete all expired records and return the correct count."""
        storage = InMemoryIdempotencyStorage()
        now = datetime.now(UTC)

        # Two expired records
        for i in range(2):
            key = f"expired-{i}"
            composite = f"user-1:{key}"
            storage._store[composite] = IdempotencyRecord(
                key=key,
                user_id="user-1",
                status=IdempotencyStatus.PROCESSING,
                status_code=None,
                response_body=None,
                created_at=now - timedelta(hours=2),
                expires_at=now - timedelta(hours=1),
            )

        # One valid record
        await storage.create("valid-key", "user-1", ttl_seconds=3600)

        count = await storage.cleanup_expired()

        assert count == 2
        assert len(storage._store) == 1

    @pytest.mark.asyncio
    async def test_cleanup_empty_storage_returns_zero(self):
        """Should return 0 on an empty store without error."""
        storage = InMemoryIdempotencyStorage()

        count = await storage.cleanup_expired()

        assert count == 0


# =============================================================================
# TestInMemoryIdempotencyStorageMaxSizeEviction
# =============================================================================


class TestInMemoryIdempotencyStorageMaxSizeEviction:
    """Tests for max_size eviction behaviour in InMemoryIdempotencyStorage."""

    @pytest.mark.asyncio
    async def test_oldest_entry_evicted_at_capacity(self):
        """When max_size is reached, the oldest entry should be removed."""
        storage = InMemoryIdempotencyStorage(max_size=3)
        await storage.create("key-1", "user-1", ttl_seconds=3600)
        await storage.create("key-2", "user-1", ttl_seconds=3600)
        await storage.create("key-3", "user-1", ttl_seconds=3600)

        # Adding a fourth entry should evict the first
        await storage.create("key-4", "user-1", ttl_seconds=3600)

        assert len(storage._store) == 3
        assert await storage.get("key-1", "user-1") is None
        assert await storage.get("key-4", "user-1") is not None

    @pytest.mark.asyncio
    async def test_store_never_exceeds_max_size(self):
        """Store size should never grow beyond max_size, even under heavy inserts."""
        max_size = 5
        storage = InMemoryIdempotencyStorage(max_size=max_size)

        for i in range(20):
            await storage.create(f"key-{i}", "user-1", ttl_seconds=3600)

        assert len(storage._store) <= max_size


# =============================================================================
# TestIdempotencyMiddlewareShouldProcess
# =============================================================================


class TestIdempotencyMiddlewareShouldProcess:
    """Tests for IdempotencyMiddleware._should_process()."""

    def test_returns_true_for_post_on_uploads(self):
        """POST /api/v1/uploads should be flagged for idempotency handling."""
        middleware = _make_middleware()
        request = _make_request("POST", "/api/v1/uploads")

        assert middleware._should_process(request) is True

    def test_returns_true_for_post_on_events(self):
        """POST /api/v1/events should be flagged for idempotency handling."""
        middleware = _make_middleware()
        request = _make_request("POST", "/api/v1/events")

        assert middleware._should_process(request) is True

    def test_returns_true_for_post_on_seasons(self):
        """POST /api/v1/seasons should be flagged for idempotency handling."""
        middleware = _make_middleware()
        request = _make_request("POST", "/api/v1/seasons")

        assert middleware._should_process(request) is True

    def test_returns_true_for_patch_on_idempotent_path(self):
        """PATCH on a monitored path should also be flagged."""
        middleware = _make_middleware()
        request = _make_request("PATCH", "/api/v1/events/123")

        assert middleware._should_process(request) is True

    def test_returns_true_for_delete_on_idempotent_path(self):
        """DELETE on a monitored path should also be flagged."""
        middleware = _make_middleware()
        request = _make_request("DELETE", "/api/v1/seasons/abc")

        assert middleware._should_process(request) is True

    def test_returns_false_for_get_on_idempotent_path(self):
        """GET is read-only and should never require idempotency."""
        middleware = _make_middleware()
        request = _make_request("GET", "/api/v1/uploads")

        assert middleware._should_process(request) is False

    def test_returns_false_for_post_on_non_idempotent_path(self):
        """POST on an unregistered path should not be flagged."""
        middleware = _make_middleware()
        request = _make_request("POST", "/api/v1/analytics/members/trend")

        assert middleware._should_process(request) is False

    def test_returns_false_for_put_method(self):
        """PUT is not in IDEMPOTENT_METHODS and should not be flagged."""
        middleware = _make_middleware()
        request = _make_request("PUT", "/api/v1/uploads")

        assert middleware._should_process(request) is False

    def test_returns_true_for_subpath_of_registered_prefix(self):
        """A subpath that starts with a registered prefix should match."""
        middleware = _make_middleware()
        request = _make_request("POST", "/api/v1/uploads/12345/process")

        assert middleware._should_process(request) is True

    def test_returns_false_for_unrelated_path(self):
        """A completely unrelated path should not be flagged."""
        middleware = _make_middleware()
        request = _make_request("POST", "/health")

        assert middleware._should_process(request) is False
