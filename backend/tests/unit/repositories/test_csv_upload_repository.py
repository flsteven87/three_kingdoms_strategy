"""
Tests for CsvUploadRepository timezone handling.

Verifies that get_by_date correctly computes same-day boundaries
in the game timezone (Asia/Taipei) rather than UTC.
"""

from datetime import UTC, datetime
from unittest.mock import MagicMock
from uuid import uuid4
from zoneinfo import ZoneInfo

import pytest

from src.repositories.csv_upload_repository import CsvUploadRepository

TAIPEI = ZoneInfo("Asia/Taipei")


class _QueryStub:
    """Minimal stand-in for the Supabase query builder that records gte/lt calls."""

    def __init__(self, gte_calls: list, lt_calls: list):
        self._gte = gte_calls
        self._lt = lt_calls

    def select(self, *_args, **_kwargs):
        return self

    def eq(self, *_args, **_kwargs):
        return self

    def gte(self, column, value):
        self._gte.append((column, value))
        return self

    def lt(self, column, value):
        self._lt.append((column, value))
        return self

    def limit(self, *_args, **_kwargs):
        return self

    def execute(self):
        result = MagicMock()
        result.data = []
        return result


class _ClientStub:
    def __init__(self):
        self.gte_calls: list[tuple[str, str]] = []
        self.lt_calls: list[tuple[str, str]] = []

    def from_(self, *_args, **_kwargs):
        return _QueryStub(self.gte_calls, self.lt_calls)


@pytest.fixture
def repo_with_client() -> tuple[CsvUploadRepository, _ClientStub]:
    """
    Return a fresh repository wired to a stub client. The stub is returned
    alongside the repo so tests can introspect the recorded filter calls
    without attaching test state to the repository instance.
    """
    repo = CsvUploadRepository()
    client = _ClientStub()
    repo.client = client  # type: ignore[assignment]

    async def exec_async(fn):
        return fn()

    repo._execute_async = exec_async  # type: ignore[method-assign]
    return repo, client


class TestGetByDateTimezone:
    """get_by_date must compute day boundaries in game timezone."""

    @pytest.mark.asyncio
    async def test_taipei_aware_input_buckets_by_taipei_day(self, repo_with_client):
        """A Taipei-local 00:30 datetime produces a Taipei-day window."""
        repo, client = repo_with_client
        taipei_dt = datetime(2026, 2, 12, 0, 30, tzinfo=TAIPEI)

        await repo.get_by_date(uuid4(), uuid4(), taipei_dt)

        start_taipei, end_taipei = _taipei_window(client)
        assert start_taipei == datetime(2026, 2, 12, 0, 0, tzinfo=TAIPEI)
        assert end_taipei == datetime(2026, 2, 13, 0, 0, tzinfo=TAIPEI)

    @pytest.mark.asyncio
    async def test_utc_input_still_bucketed_by_taipei_day(self, repo_with_client):
        """
        Regression case: before the fix, `.replace(hour=0)` preserved UTC
        tzinfo and produced a UTC day window, so a Taipei midnight upload
        (16:00 UTC previous day) bucketed into the wrong day.
        """
        repo, client = repo_with_client
        # UTC 2026-02-11 16:30 == Taipei 2026-02-12 00:30
        utc_dt = datetime(2026, 2, 11, 16, 30, tzinfo=UTC)

        await repo.get_by_date(uuid4(), uuid4(), utc_dt)

        start_taipei, end_taipei = _taipei_window(client)
        assert start_taipei == datetime(2026, 2, 12, 0, 0, tzinfo=TAIPEI)
        assert end_taipei == datetime(2026, 2, 13, 0, 0, tzinfo=TAIPEI)

    @pytest.mark.asyncio
    async def test_utc_afternoon_upload_buckets_by_same_taipei_day(
        self, repo_with_client
    ):
        """A Taipei afternoon upload buckets into the same Taipei day."""
        repo, client = repo_with_client
        # UTC 2026-02-12 06:00 == Taipei 2026-02-12 14:00
        utc_dt = datetime(2026, 2, 12, 6, 0, tzinfo=UTC)

        await repo.get_by_date(uuid4(), uuid4(), utc_dt)

        start_taipei, end_taipei = _taipei_window(client)
        assert start_taipei == datetime(2026, 2, 12, 0, 0, tzinfo=TAIPEI)
        assert end_taipei == datetime(2026, 2, 13, 0, 0, tzinfo=TAIPEI)


def _taipei_window(client: _ClientStub) -> tuple[datetime, datetime]:
    """Decode the most recent (gte, lt) filter pair back to Taipei datetimes."""
    gte_col, gte_val = client.gte_calls[-1]
    lt_col, lt_val = client.lt_calls[-1]
    assert gte_col == "snapshot_date"
    assert lt_col == "snapshot_date"
    start = datetime.fromisoformat(gte_val).astimezone(TAIPEI)
    end = datetime.fromisoformat(lt_val).astimezone(TAIPEI)
    return start, end
