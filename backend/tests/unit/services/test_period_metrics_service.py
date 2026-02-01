"""
Unit Tests for PeriodMetricsService - power_diff calculation

Tests cover:
1. _build_first_period_metrics: power_diff should be 0 for new members
2. _build_period_metrics: power_diff should be end - start for existing members

Bug fix verification:
- power_diff for first period members was incorrectly set to power_value
- This caused total_power_change to be inflated in season summary

符合 test-writing skill 規範:
- AAA pattern (Arrange-Act-Assert)
- Coverage: happy path + edge cases
"""

from datetime import datetime
from uuid import UUID, uuid4

import pytest

from src.models.member_snapshot import MemberSnapshot
from src.services.period_metrics_service import PeriodMetricsService

# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def period_id() -> UUID:
    """Fixed period UUID for testing"""
    return UUID("11111111-1111-1111-1111-111111111111")


@pytest.fixture
def alliance_id() -> UUID:
    """Fixed alliance UUID for testing"""
    return UUID("22222222-2222-2222-2222-222222222222")


@pytest.fixture
def member_id() -> UUID:
    """Fixed member UUID for testing"""
    return UUID("33333333-3333-3333-3333-333333333333")


@pytest.fixture
def upload_id() -> UUID:
    """Fixed upload UUID for testing"""
    return UUID("44444444-4444-4444-4444-444444444444")


@pytest.fixture
def period_metrics_service() -> PeriodMetricsService:
    """Create PeriodMetricsService instance"""
    return PeriodMetricsService()


def _create_snapshot(
    member_id: UUID,
    csv_upload_id: UUID,
    power_value: int = 50000,
    total_contribution: int = 10000,
    total_merit: int = 5000,
    total_assist: int = 3000,
    total_donation: int = 2000,
    contribution_rank: int = 5,
    state: str = "荊州",
    group_name: str = "前鋒隊",
    member_name: str = "測試成員",
    alliance_id: UUID | None = None,
) -> MemberSnapshot:
    """Helper to create MemberSnapshot for testing"""
    return MemberSnapshot(
        id=uuid4(),
        csv_upload_id=csv_upload_id,
        member_id=member_id,
        alliance_id=alliance_id or uuid4(),
        member_name=member_name,
        contribution_rank=contribution_rank,
        weekly_contribution=1000,
        weekly_merit=500,
        weekly_assist=300,
        weekly_donation=200,
        total_contribution=total_contribution,
        total_merit=total_merit,
        total_assist=total_assist,
        total_donation=total_donation,
        power_value=power_value,
        state=state,
        group_name=group_name,
        created_at=datetime.now(),
    )


# =============================================================================
# Tests for _build_first_period_metrics (new member / first period)
# =============================================================================


class TestBuildFirstPeriodMetrics:
    """Tests for first period metrics calculation"""

    def test_power_diff_should_be_zero_for_first_period(
        self,
        period_metrics_service: PeriodMetricsService,
        period_id: UUID,
        alliance_id: UUID,
        member_id: UUID,
        upload_id: UUID,
    ):
        """
        power_diff for first period should be 0, not power_value.

        Rationale:
        - power_value is an instantaneous state, not a cumulative value
        - We cannot calculate "change" without a previous snapshot
        - Setting power_diff = power_value incorrectly inflates total_power_change
        """
        # Arrange
        end_snapshot = _create_snapshot(
            member_id=member_id,
            csv_upload_id=upload_id,
            power_value=50000,  # 5萬勢力
        )
        days = 7

        # Act
        result = period_metrics_service._build_first_period_metrics(
            period_id=period_id,
            alliance_id=alliance_id,
            end_snapshot=end_snapshot,
            days=days,
        )

        # Assert
        assert result["power_diff"] == 0, (
            "power_diff should be 0 for first period (cannot calculate change without start snapshot)"
        )

    def test_cumulative_values_use_total_as_diff(
        self,
        period_metrics_service: PeriodMetricsService,
        period_id: UUID,
        alliance_id: UUID,
        member_id: UUID,
        upload_id: UUID,
    ):
        """
        Cumulative values (contribution, merit, assist, donation) should use
        total as diff, assuming start from 0.
        """
        # Arrange
        end_snapshot = _create_snapshot(
            member_id=member_id,
            csv_upload_id=upload_id,
            total_contribution=10000,
            total_merit=5000,
            total_assist=3000,
            total_donation=2000,
        )
        days = 7

        # Act
        result = period_metrics_service._build_first_period_metrics(
            period_id=period_id,
            alliance_id=alliance_id,
            end_snapshot=end_snapshot,
            days=days,
        )

        # Assert - cumulative values should use total as diff
        assert result["contribution_diff"] == 10000
        assert result["merit_diff"] == 5000
        assert result["assist_diff"] == 3000
        assert result["donation_diff"] == 2000

    def test_is_new_member_flag_is_true(
        self,
        period_metrics_service: PeriodMetricsService,
        period_id: UUID,
        alliance_id: UUID,
        member_id: UUID,
        upload_id: UUID,
    ):
        """First period metrics should have is_new_member = True"""
        # Arrange
        end_snapshot = _create_snapshot(member_id=member_id, csv_upload_id=upload_id)
        days = 7

        # Act
        result = period_metrics_service._build_first_period_metrics(
            period_id=period_id,
            alliance_id=alliance_id,
            end_snapshot=end_snapshot,
            days=days,
        )

        # Assert
        assert result["is_new_member"] is True


# =============================================================================
# Tests for _build_period_metrics (existing member)
# =============================================================================


class TestBuildPeriodMetrics:
    """Tests for existing member period metrics calculation"""

    def test_power_diff_is_end_minus_start(
        self,
        period_metrics_service: PeriodMetricsService,
        period_id: UUID,
        alliance_id: UUID,
        member_id: UUID,
    ):
        """power_diff should be calculated as end_power - start_power"""
        # Arrange
        start_upload_id = uuid4()
        end_upload_id = uuid4()

        start_snapshot = _create_snapshot(
            member_id=member_id,
            csv_upload_id=start_upload_id,
            power_value=50000,  # 5萬
        )
        end_snapshot = _create_snapshot(
            member_id=member_id,
            csv_upload_id=end_upload_id,
            power_value=48000,  # 4.8萬 (下降)
        )
        days = 7

        # Act
        result = period_metrics_service._build_period_metrics(
            period_id=period_id,
            alliance_id=alliance_id,
            start_snapshot=start_snapshot,
            end_snapshot=end_snapshot,
            days=days,
        )

        # Assert
        assert result["power_diff"] == -2000, (
            "power_diff should be end - start = 48000 - 50000 = -2000"
        )

    def test_power_diff_can_be_positive(
        self,
        period_metrics_service: PeriodMetricsService,
        period_id: UUID,
        alliance_id: UUID,
        member_id: UUID,
    ):
        """power_diff can be positive when power increases"""
        # Arrange
        start_upload_id = uuid4()
        end_upload_id = uuid4()

        start_snapshot = _create_snapshot(
            member_id=member_id,
            csv_upload_id=start_upload_id,
            power_value=50000,
        )
        end_snapshot = _create_snapshot(
            member_id=member_id,
            csv_upload_id=end_upload_id,
            power_value=55000,  # 增加 5000
        )
        days = 7

        # Act
        result = period_metrics_service._build_period_metrics(
            period_id=period_id,
            alliance_id=alliance_id,
            start_snapshot=start_snapshot,
            end_snapshot=end_snapshot,
            days=days,
        )

        # Assert
        assert result["power_diff"] == 5000

    def test_is_new_member_flag_is_false(
        self,
        period_metrics_service: PeriodMetricsService,
        period_id: UUID,
        alliance_id: UUID,
        member_id: UUID,
    ):
        """Existing member metrics should have is_new_member = False"""
        # Arrange
        start_upload_id = uuid4()
        end_upload_id = uuid4()

        start_snapshot = _create_snapshot(member_id=member_id, csv_upload_id=start_upload_id)
        end_snapshot = _create_snapshot(member_id=member_id, csv_upload_id=end_upload_id)
        days = 7

        # Act
        result = period_metrics_service._build_period_metrics(
            period_id=period_id,
            alliance_id=alliance_id,
            start_snapshot=start_snapshot,
            end_snapshot=end_snapshot,
            days=days,
        )

        # Assert
        assert result["is_new_member"] is False
