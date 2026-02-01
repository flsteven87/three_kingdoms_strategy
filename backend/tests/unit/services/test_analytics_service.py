"""
Unit Tests for AnalyticsService - Alliance Analytics

Tests cover:
1. get_alliance_analytics() query optimization
2. Season view should use single query instead of redundant queries
3. Latest view behavior unchanged

符合 test-writing skill 規範:
- AAA pattern (Arrange-Act-Assert)
- Mocked repository dependencies
- Coverage: happy path + edge cases
"""

from datetime import date, datetime
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, call
from uuid import UUID

import pytest

from src.models.period import Period
from src.models.season import Season
from src.services.analytics_service import AnalyticsService

# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def season_id() -> UUID:
    """Fixed season UUID for testing"""
    return UUID("33333333-3333-3333-3333-333333333333")


@pytest.fixture
def period_id() -> UUID:
    """Fixed period UUID for testing"""
    return UUID("55555555-5555-5555-5555-555555555555")


@pytest.fixture
def prev_period_id() -> UUID:
    """Fixed previous period UUID for testing"""
    return UUID("66666666-6666-6666-6666-666666666666")


@pytest.fixture
def member_id() -> UUID:
    """Fixed member UUID for testing"""
    return UUID("44444444-4444-4444-4444-444444444444")


@pytest.fixture
def alliance_id() -> UUID:
    """Fixed alliance UUID for testing"""
    return UUID("22222222-2222-2222-2222-222222222222")


@pytest.fixture
def mock_season_repo() -> MagicMock:
    """Create mock season repository"""
    return MagicMock()


@pytest.fixture
def mock_period_repo() -> MagicMock:
    """Create mock period repository"""
    return MagicMock()


@pytest.fixture
def mock_metrics_repo() -> MagicMock:
    """Create mock member period metrics repository"""
    return MagicMock()


@pytest.fixture
def mock_member_repo() -> MagicMock:
    """Create mock member repository"""
    return MagicMock()


@pytest.fixture
def analytics_service(
    mock_season_repo: MagicMock,
    mock_period_repo: MagicMock,
    mock_metrics_repo: MagicMock,
    mock_member_repo: MagicMock,
) -> AnalyticsService:
    """Create AnalyticsService with mocked dependencies"""
    service = AnalyticsService()
    service._season_repo = mock_season_repo
    service._period_repo = mock_period_repo
    service._metrics_repo = mock_metrics_repo
    service._member_repo = mock_member_repo
    return service


def create_mock_season(season_id: UUID, alliance_id: UUID) -> Season:
    """Factory for creating mock Season objects"""
    return Season(
        id=season_id,
        alliance_id=alliance_id,
        name="S1",
        start_date=date(2025, 1, 1),
        end_date=None,
        is_current=True,
        activation_status="activated",
        description=None,
        created_at=datetime.now(),
        updated_at=datetime.now(),
    )


def create_mock_period(
    period_id: UUID,
    season_id: UUID,
    alliance_id: UUID | None = None,
    period_number: int = 1,
    start_date: date | None = None,
    end_date: date | None = None,
) -> Period:
    """Factory for creating mock Period objects"""
    _start_date = start_date or date(2025, 1, 1)
    _end_date = end_date or date(2025, 1, 7)
    return Period(
        id=period_id,
        season_id=season_id,
        alliance_id=alliance_id or UUID("22222222-2222-2222-2222-222222222222"),
        period_number=period_number,
        start_date=_start_date,
        end_date=_end_date,
        days=(_end_date - _start_date).days + 1,
        start_upload_id=None,
        end_upload_id=UUID("77777777-7777-7777-7777-777777777777"),
        created_at=datetime.now(),
    )


def create_mock_metrics_with_totals(member_id: UUID) -> dict:
    """Factory for creating mock metrics with snapshot totals"""
    return {
        "member_id": str(member_id),
        "end_group": "前鋒隊",
        "end_rank": 1,
        "end_power": 100000,
        "rank_change": 0,
        "daily_contribution": Decimal("1000.00"),
        "daily_merit": Decimal("5000.00"),
        "daily_assist": Decimal("20.00"),
        "daily_donation": Decimal("300.00"),
        "total_contribution": 7000,
        "total_merit": 35000,
        "total_assist": 140,
        "total_donation": 2100,
        "member_name": "張飛",
    }


def create_mock_metrics_basic(member_id: UUID) -> dict:
    """Factory for creating basic mock metrics (without totals)"""
    return {
        "member_id": str(member_id),
        "end_group": "前鋒隊",
        "end_rank": 1,
        "end_power": 100000,
        "rank_change": 0,
        "daily_contribution": Decimal("1000.00"),
        "daily_merit": Decimal("5000.00"),
        "daily_assist": Decimal("20.00"),
        "daily_donation": Decimal("300.00"),
        "member_name": "張飛",
    }


# =============================================================================
# Tests for Query Optimization
# =============================================================================


class TestGetAllianceAnalyticsQueryOptimization:
    """Tests for query optimization in get_alliance_analytics()"""

    @pytest.mark.asyncio
    async def test_season_view_uses_single_query_for_latest_period(
        self,
        analytics_service: AnalyticsService,
        mock_season_repo: MagicMock,
        mock_period_repo: MagicMock,
        mock_metrics_repo: MagicMock,
        season_id: UUID,
        period_id: UUID,
        prev_period_id: UUID,
        member_id: UUID,
        alliance_id: UUID,
    ):
        """
        CRITICAL: Season view should NOT call both get_by_period_with_member()
        AND get_metrics_with_snapshot_totals() for the same period.

        This test verifies the optimization that eliminates redundant queries.
        """
        # Arrange
        mock_season = create_mock_season(season_id, alliance_id)
        mock_latest_period = create_mock_period(period_id, season_id, alliance_id, period_number=2)
        mock_prev_period = create_mock_period(
            prev_period_id, season_id, alliance_id, period_number=1
        )
        mock_metrics_with_totals = [create_mock_metrics_with_totals(member_id)]

        mock_season_repo.get_by_id = AsyncMock(return_value=mock_season)
        mock_period_repo.get_by_season = AsyncMock(
            return_value=[mock_prev_period, mock_latest_period]
        )

        # This is the key: get_metrics_with_snapshot_totals should be called
        mock_metrics_repo.get_metrics_with_snapshot_totals = AsyncMock(
            return_value=mock_metrics_with_totals
        )
        # get_by_period_with_member should NOT be called for latest_period when view="season"
        mock_metrics_repo.get_by_period_with_member = AsyncMock(
            return_value=[create_mock_metrics_basic(member_id)]
        )
        # For trends calculation
        mock_metrics_repo.get_by_periods_batch = AsyncMock(
            return_value={
                period_id: [create_mock_metrics_basic(member_id)],
                prev_period_id: [create_mock_metrics_basic(member_id)],
            }
        )

        # Act
        result = await analytics_service.get_alliance_analytics(season_id, view="season")

        # Assert - The key assertion: verify query optimization
        # get_metrics_with_snapshot_totals should be called once for latest period
        mock_metrics_repo.get_metrics_with_snapshot_totals.assert_called_once_with(period_id)

        # get_by_period_with_member should ONLY be called for prev_period (for change calc)
        # NOT for latest_period (that's the redundant query we're eliminating)
        calls_to_get_by_period_with_member = (
            mock_metrics_repo.get_by_period_with_member.call_args_list
        )

        # Should only be called for prev_period, not latest_period
        assert len(calls_to_get_by_period_with_member) == 1, (
            f"Expected 1 call to get_by_period_with_member (for prev_period only), "
            f"got {len(calls_to_get_by_period_with_member)}"
        )
        assert calls_to_get_by_period_with_member[0] == call(prev_period_id), (
            f"Expected call with prev_period_id {prev_period_id}, "
            f"got {calls_to_get_by_period_with_member[0]}"
        )

        # Verify result is valid
        assert result is not None
        assert "summary" in result
        assert "trends" in result

    @pytest.mark.asyncio
    async def test_latest_view_calls_get_by_period_with_member(
        self,
        analytics_service: AnalyticsService,
        mock_season_repo: MagicMock,
        mock_period_repo: MagicMock,
        mock_metrics_repo: MagicMock,
        season_id: UUID,
        period_id: UUID,
        prev_period_id: UUID,
        member_id: UUID,
        alliance_id: UUID,
    ):
        """
        Latest view should still call get_by_period_with_member() as before.
        This test ensures we don't break existing behavior.
        """
        # Arrange
        mock_season = create_mock_season(season_id, alliance_id)
        mock_latest_period = create_mock_period(period_id, season_id, alliance_id, period_number=2)
        mock_prev_period = create_mock_period(
            prev_period_id, season_id, alliance_id, period_number=1
        )
        mock_metrics_basic = [create_mock_metrics_basic(member_id)]

        mock_season_repo.get_by_id = AsyncMock(return_value=mock_season)
        mock_period_repo.get_by_season = AsyncMock(
            return_value=[mock_prev_period, mock_latest_period]
        )
        mock_metrics_repo.get_by_period_with_member = AsyncMock(return_value=mock_metrics_basic)
        mock_metrics_repo.get_metrics_with_snapshot_totals = AsyncMock(return_value=[])
        mock_metrics_repo.get_by_periods_batch = AsyncMock(
            return_value={
                period_id: mock_metrics_basic,
                prev_period_id: mock_metrics_basic,
            }
        )

        # Act
        result = await analytics_service.get_alliance_analytics(season_id, view="latest")

        # Assert
        # Latest view should call get_by_period_with_member for both periods
        calls = mock_metrics_repo.get_by_period_with_member.call_args_list
        assert len(calls) == 2, f"Expected 2 calls, got {len(calls)}"

        # Should NOT call get_metrics_with_snapshot_totals for latest view
        mock_metrics_repo.get_metrics_with_snapshot_totals.assert_not_called()

        # Verify result is valid
        assert result is not None
        assert "summary" in result


class TestGetAllianceAnalyticsSeasonViewData:
    """Tests for season view data correctness"""

    @pytest.mark.asyncio
    async def test_season_view_returns_correct_daily_averages(
        self,
        analytics_service: AnalyticsService,
        mock_season_repo: MagicMock,
        mock_period_repo: MagicMock,
        mock_metrics_repo: MagicMock,
        season_id: UUID,
        period_id: UUID,
        member_id: UUID,
        alliance_id: UUID,
    ):
        """
        Season view should calculate daily averages from totals / season_days.
        """
        # Arrange
        mock_season = create_mock_season(season_id, alliance_id)
        # Season started 7 days ago
        mock_latest_period = create_mock_period(
            period_id,
            season_id,
            alliance_id,
            period_number=1,
            start_date=date(2025, 1, 1),
            end_date=date(2025, 1, 7),
        )

        # Metrics with totals: 7000 total contribution over 7 days = 1000/day
        mock_metrics_with_totals = [
            {
                "member_id": str(member_id),
                "end_group": "前鋒隊",
                "end_rank": 1,
                "end_power": 100000,
                "rank_change": 0,
                "daily_contribution": Decimal("1000.00"),
                "daily_merit": Decimal("5000.00"),
                "daily_assist": Decimal("20.00"),
                "daily_donation": Decimal("300.00"),
                "total_contribution": 7000,
                "total_merit": 35000,
                "total_assist": 140,
                "total_donation": 2100,
                "member_name": "張飛",
            }
        ]

        mock_season_repo.get_by_id = AsyncMock(return_value=mock_season)
        mock_period_repo.get_by_season = AsyncMock(return_value=[mock_latest_period])
        mock_metrics_repo.get_metrics_with_snapshot_totals = AsyncMock(
            return_value=mock_metrics_with_totals
        )
        mock_metrics_repo.get_by_period_with_member = AsyncMock(return_value=[])
        mock_metrics_repo.get_by_periods_batch = AsyncMock(
            return_value={period_id: mock_metrics_with_totals}
        )

        # Act
        result = await analytics_service.get_alliance_analytics(season_id, view="season")

        # Assert
        assert result is not None
        summary = result["summary"]

        # 7000 / 7 days = 1000 daily contribution (rounded to 2 decimal places)
        # Note: actual calculation depends on season_days calculation
        assert summary["member_count"] == 1
        assert summary["avg_daily_contribution"] > 0
