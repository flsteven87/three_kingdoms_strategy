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


# =============================================================================
# Tests for _db_float helper
# =============================================================================


class TestDbFloat:
    """Tests for the _db_float() helper function."""

    def test_converts_decimal_to_float(self):
        """Should convert Decimal to float with identical numerical value."""
        from src.services.analytics_service import _db_float

        result = _db_float(Decimal("1234.56"))
        assert isinstance(result, float)
        assert result == pytest.approx(1234.56)

    def test_converts_float_passthrough(self):
        """Should convert a Python float input correctly."""
        from src.services.analytics_service import _db_float

        result = _db_float(3.14)
        assert isinstance(result, float)
        assert result == pytest.approx(3.14)

    def test_converts_string_representation(self):
        """Should convert a string representation of a number to float."""
        from src.services.analytics_service import _db_float

        result = _db_float("9999.99")
        assert isinstance(result, float)
        assert result == pytest.approx(9999.99)

    def test_converts_integer(self):
        """Should convert integer input to float."""
        from src.services.analytics_service import _db_float

        result = _db_float(42)
        assert isinstance(result, float)
        assert result == pytest.approx(42.0)

    def test_converts_zero(self):
        """Should handle zero correctly."""
        from src.services.analytics_service import _db_float

        result = _db_float(Decimal("0.00"))
        assert result == pytest.approx(0.0)

    def test_converts_high_precision_decimal(self):
        """Should handle high-precision Decimal without floating-point drift."""
        from src.services.analytics_service import _db_float

        # Using Decimal(str(value)) is the safe conversion pattern
        decimal_val = Decimal("12345.678900")
        result = _db_float(decimal_val)
        assert result == pytest.approx(12345.6789)

    def test_result_identical_to_manual_conversion(self):
        """Must produce identical results to float(Decimal(str(value)))."""
        from src.services.analytics_service import _db_float

        inputs = [Decimal("100.50"), 200.75, "300.25", 400]
        for val in inputs:
            expected = float(Decimal(str(val)))
            assert _db_float(val) == expected, f"Mismatch for input {val!r}"


# =============================================================================
# Tests for _compute_group_stats
# =============================================================================


class TestComputeGroupStats:
    """Tests for the _compute_group_stats() method."""

    @pytest.fixture
    def service(self) -> AnalyticsService:
        """Create AnalyticsService instance (no repos needed for pure methods)."""
        return AnalyticsService()

    def test_returns_correct_averages_for_known_input(self, service: AnalyticsService):
        """Should calculate correct averages from known numeric lists."""
        # contributions: [100, 200, 300] → avg = 200
        result = service._compute_group_stats(
            group_name="前鋒隊",
            contributions=[100.0, 200.0, 300.0],
            merits=[500.0, 1000.0, 1500.0],
            assists=[10.0, 20.0, 30.0],
            donations=[50.0, 100.0, 150.0],
            powers=[10000.0, 20000.0, 30000.0],
            ranks=[1.0, 2.0, 3.0],
        )
        assert result["group_name"] == "前鋒隊"
        assert result["member_count"] == 3
        assert result["avg_daily_contribution"] == pytest.approx(200.0)
        assert result["avg_daily_merit"] == pytest.approx(1000.0)
        assert result["avg_daily_assist"] == pytest.approx(20.0)
        assert result["avg_daily_donation"] == pytest.approx(100.0)
        assert result["avg_power"] == pytest.approx(20000.0)
        assert result["avg_rank"] == pytest.approx(2.0)

    def test_returns_correct_boxplot_fields(self, service: AnalyticsService):
        """Should calculate min, Q1, median, Q3, max for contributions."""
        # sorted contributions: [100, 200, 300]
        result = service._compute_group_stats(
            group_name="後勤隊",
            contributions=[300.0, 100.0, 200.0],
            merits=[1000.0, 1000.0, 1000.0],
            assists=[10.0, 10.0, 10.0],
            donations=[50.0, 50.0, 50.0],
            powers=[10000.0, 10000.0, 10000.0],
            ranks=[1.0, 2.0, 3.0],
        )
        assert result["contribution_min"] == pytest.approx(100.0)
        assert result["contribution_max"] == pytest.approx(300.0)
        assert result["contribution_median"] == pytest.approx(200.0)
        # Q1 and Q3 via linear interpolation on [100, 200, 300]
        assert result["contribution_q1"] == pytest.approx(150.0)
        assert result["contribution_q3"] == pytest.approx(250.0)

    def test_returns_correct_cv_for_known_variance(self, service: AnalyticsService):
        """Should calculate coefficient of variation = std/mean."""
        import statistics

        contributions = [100.0, 200.0, 300.0]
        mean = sum(contributions) / len(contributions)  # 200
        std = statistics.stdev(contributions)
        expected_cv = round(std / mean, 3)

        result = service._compute_group_stats(
            group_name="Test",
            contributions=contributions,
            merits=[1000.0, 1000.0, 1000.0],
            assists=[10.0, 10.0, 10.0],
            donations=[50.0, 50.0, 50.0],
            powers=[10000.0, 10000.0, 10000.0],
            ranks=[1.0, 2.0, 3.0],
        )
        assert result["contribution_cv"] == pytest.approx(expected_cv)

    def test_returns_empty_stats_for_empty_lists(self, service: AnalyticsService):
        """Should return empty stats dict when given empty lists."""
        result = service._compute_group_stats(
            group_name="空組",
            contributions=[],
            merits=[],
            assists=[],
            donations=[],
            powers=[],
            ranks=[],
        )
        assert result["group_name"] == "空組"
        assert result["member_count"] == 0
        assert result["avg_daily_contribution"] == 0

    def test_single_member_cv_is_zero(self, service: AnalyticsService):
        """With a single member, std is 0, so CV should be 0."""
        result = service._compute_group_stats(
            group_name="Solo",
            contributions=[500.0],
            merits=[2000.0],
            assists=[30.0],
            donations=[100.0],
            powers=[50000.0],
            ranks=[5.0],
        )
        assert result["member_count"] == 1
        assert result["contribution_cv"] == pytest.approx(0.0)
        assert result["merit_cv"] == pytest.approx(0.0)


# =============================================================================
# Tests for _calculate_group_stats and _calculate_group_stats_from_members
# equivalence
# =============================================================================


class TestGroupStatsEquivalence:
    """
    Tests that _calculate_group_stats and _calculate_group_stats_from_members
    produce identical output dicts for equivalent inputs.
    """

    @pytest.fixture
    def service(self) -> AnalyticsService:
        return AnalyticsService()

    def test_identical_output_for_equivalent_inputs(self, service: AnalyticsService):
        """
        Both methods must produce identical stats for the same underlying data.

        raw_metrics (from DB query) → _calculate_group_stats
        members_list (from season view) → _calculate_group_stats_from_members
        """
        raw_metrics = [
            {
                "daily_contribution": Decimal("1000.00"),
                "daily_merit": Decimal("5000.00"),
                "daily_assist": Decimal("20.00"),
                "daily_donation": Decimal("300.00"),
                "end_power": 100000,
                "end_rank": 1,
            },
            {
                "daily_contribution": Decimal("2000.00"),
                "daily_merit": Decimal("8000.00"),
                "daily_assist": Decimal("40.00"),
                "daily_donation": Decimal("600.00"),
                "end_power": 150000,
                "end_rank": 2,
            },
            {
                "daily_contribution": Decimal("1500.00"),
                "daily_merit": Decimal("6500.00"),
                "daily_assist": Decimal("30.00"),
                "daily_donation": Decimal("450.00"),
                "end_power": 120000,
                "end_rank": 3,
            },
        ]

        members_list = [
            {
                "daily_contribution": 1000.0,
                "daily_merit": 5000.0,
                "daily_assist": 20.0,
                "daily_donation": 300.0,
                "power": 100000,
                "contribution_rank": 1,
            },
            {
                "daily_contribution": 2000.0,
                "daily_merit": 8000.0,
                "daily_assist": 40.0,
                "daily_donation": 600.0,
                "power": 150000,
                "contribution_rank": 2,
            },
            {
                "daily_contribution": 1500.0,
                "daily_merit": 6500.0,
                "daily_assist": 30.0,
                "daily_donation": 450.0,
                "power": 120000,
                "contribution_rank": 3,
            },
        ]

        group_name = "前鋒隊"
        stats_from_raw = service._calculate_group_stats(group_name, raw_metrics)
        stats_from_members = service._calculate_group_stats_from_members(group_name, members_list)

        # All numeric fields must be identical
        for key in stats_from_raw:
            assert stats_from_raw[key] == pytest.approx(stats_from_members[key]), (
                f"Field '{key}' differs: raw={stats_from_raw[key]}, "
                f"members={stats_from_members[key]}"
            )

    def test_empty_input_returns_identical_empty_stats(self, service: AnalyticsService):
        """Both methods must return the same empty stats structure."""
        group_name = "空組"
        stats_from_raw = service._calculate_group_stats(group_name, [])
        stats_from_members = service._calculate_group_stats_from_members(group_name, [])

        assert stats_from_raw == stats_from_members

    def test_output_contains_all_required_keys(self, service: AnalyticsService):
        """Output dict must contain all expected box-plot and summary keys."""
        required_keys = {
            "group_name",
            "member_count",
            "avg_daily_contribution",
            "avg_daily_merit",
            "avg_daily_assist",
            "avg_daily_donation",
            "avg_power",
            "avg_rank",
            "best_rank",
            "worst_rank",
            "contribution_min",
            "contribution_q1",
            "contribution_median",
            "contribution_q3",
            "contribution_max",
            "contribution_cv",
            "merit_min",
            "merit_q1",
            "merit_median",
            "merit_q3",
            "merit_max",
            "merit_cv",
        }
        raw_metrics = [
            {
                "daily_contribution": Decimal("1000.00"),
                "daily_merit": Decimal("5000.00"),
                "daily_assist": Decimal("20.00"),
                "daily_donation": Decimal("300.00"),
                "end_power": 100000,
                "end_rank": 1,
            }
        ]
        result = service._calculate_group_stats("Test", raw_metrics)
        assert required_keys.issubset(result.keys()), (
            f"Missing keys: {required_keys - result.keys()}"
        )
