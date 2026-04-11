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

from src.models.csv_upload import CsvUpload
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
    def __init__(self, gte_calls: list, lt_calls: list):
        self._gte = gte_calls
        self._lt = lt_calls

    def from_(self, *_args, **_kwargs):
        return _QueryStub(self._gte, self._lt)


@pytest.fixture
def repo():
    """Fresh repository wired to a stub client that records filter calls."""
    r = CsvUploadRepository.__new__(CsvUploadRepository)
    r.table_name = "csv_uploads"
    r.model_class = CsvUpload
    r._gte_calls = []
    r._lt_calls = []
    r.client = _ClientStub(r._gte_calls, r._lt_calls)

    async def exec_async(fn):
        return fn()

    r._execute_async = exec_async
    return r


class TestGetByDateTimezone:
    """get_by_date must compute day boundaries in game timezone."""

    @pytest.mark.asyncio
    async def test_taipei_aware_input_buckets_by_taipei_day(self, repo):
        """
        A Taipei-local 00:30 datetime must produce a day window of
        [Taipei Feb 12 00:00, Taipei Feb 13 00:00).
        """
        alliance_id = uuid4()
        season_id = uuid4()
        # 2026-02-12 00:30 +08:00
        taipei_dt = datetime(2026, 2, 12, 0, 30, tzinfo=TAIPEI)

        await repo.get_by_date(alliance_id, season_id, taipei_dt)

        gte_col, gte_val = repo._gte_calls[-1]
        lt_col, lt_val = repo._lt_calls[-1]
        assert gte_col == "snapshot_date"
        assert lt_col == "snapshot_date"
        # Parse back to an aware datetime and confirm the Taipei day
        start = datetime.fromisoformat(gte_val)
        end = datetime.fromisoformat(lt_val)
        start_taipei = start.astimezone(TAIPEI)
        end_taipei = end.astimezone(TAIPEI)
        assert start_taipei == datetime(2026, 2, 12, 0, 0, tzinfo=TAIPEI)
        assert end_taipei == datetime(2026, 2, 13, 0, 0, tzinfo=TAIPEI)

    @pytest.mark.asyncio
    async def test_utc_input_still_bucketed_by_taipei_day(self, repo):
        """
        Even when the caller passes a UTC-aware datetime, the bucket must be
        a Taipei day (we must convert to game timezone first).

        This is the regression case: before the fix, `.replace(hour=0)`
        preserved the UTC tzinfo and produced a UTC day window, causing
        same-day dedup to fail across the 16:00 UTC / 00:00 Taipei boundary.
        """
        alliance_id = uuid4()
        season_id = uuid4()
        # UTC 2026-02-11 16:30 == Taipei 2026-02-12 00:30
        utc_dt = datetime(2026, 2, 11, 16, 30, tzinfo=UTC)

        await repo.get_by_date(alliance_id, season_id, utc_dt)

        _, gte_val = repo._gte_calls[-1]
        _, lt_val = repo._lt_calls[-1]
        start_taipei = datetime.fromisoformat(gte_val).astimezone(TAIPEI)
        end_taipei = datetime.fromisoformat(lt_val).astimezone(TAIPEI)
        assert start_taipei == datetime(2026, 2, 12, 0, 0, tzinfo=TAIPEI)
        assert end_taipei == datetime(2026, 2, 13, 0, 0, tzinfo=TAIPEI)

    @pytest.mark.asyncio
    async def test_utc_afternoon_upload_buckets_by_same_taipei_day(self, repo):
        """
        A Taipei afternoon upload (positive UTC-to-Taipei date rollover)
        must bucket by the correct Taipei day.
        """
        alliance_id = uuid4()
        season_id = uuid4()
        # Taipei 2026-02-12 14:00 == UTC 2026-02-12 06:00
        utc_dt = datetime(2026, 2, 12, 6, 0, tzinfo=UTC)

        await repo.get_by_date(alliance_id, season_id, utc_dt)

        _, gte_val = repo._gte_calls[-1]
        _, lt_val = repo._lt_calls[-1]
        start_taipei = datetime.fromisoformat(gte_val).astimezone(TAIPEI)
        end_taipei = datetime.fromisoformat(lt_val).astimezone(TAIPEI)
        assert start_taipei == datetime(2026, 2, 12, 0, 0, tzinfo=TAIPEI)
        assert end_taipei == datetime(2026, 2, 13, 0, 0, tzinfo=TAIPEI)
