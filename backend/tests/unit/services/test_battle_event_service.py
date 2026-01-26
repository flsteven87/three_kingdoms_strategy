"""
Unit Tests for BattleEventService

Tests cover:
1. verify_user_access - access verification
2. create_event - event creation
3. get_event - event retrieval
4. delete_event - event deletion
5. _calculate_event_summary - summary calculation
6. _calculate_group_stats - group statistics

符合 test-writing skill 規範:
- AAA pattern (Arrange-Act-Assert)
- Mocked repository dependencies
- Coverage: happy path + edge cases + error cases
"""

from datetime import datetime
from unittest.mock import AsyncMock, MagicMock
from uuid import UUID, uuid4

import pytest

from src.models.battle_event import BattleEvent, BattleEventCreate, EventCategory, EventStatus
from src.models.battle_event_metrics import BattleEventMetricsWithMember
from src.services.battle_event_service import BattleEventService

# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def user_id() -> UUID:
    """Fixed user UUID for testing"""
    return UUID("11111111-1111-1111-1111-111111111111")


@pytest.fixture
def alliance_id() -> UUID:
    """Fixed alliance UUID for testing"""
    return UUID("22222222-2222-2222-2222-222222222222")


@pytest.fixture
def event_id() -> UUID:
    """Fixed event UUID for testing"""
    return UUID("33333333-3333-3333-3333-333333333333")


@pytest.fixture
def season_id() -> UUID:
    """Fixed season UUID for testing"""
    return UUID("44444444-4444-4444-4444-444444444444")


@pytest.fixture
def mock_event_repo() -> MagicMock:
    """Create mock BattleEventRepository"""
    return MagicMock()


@pytest.fixture
def mock_metrics_repo() -> MagicMock:
    """Create mock BattleEventMetricsRepository"""
    return MagicMock()


@pytest.fixture
def mock_snapshot_repo() -> MagicMock:
    """Create mock MemberSnapshotRepository"""
    return MagicMock()


@pytest.fixture
def mock_upload_repo() -> MagicMock:
    """Create mock CsvUploadRepository"""
    return MagicMock()


@pytest.fixture
def mock_permission_service() -> MagicMock:
    """Create mock PermissionService"""
    return MagicMock()


@pytest.fixture
def battle_event_service(
    mock_event_repo: MagicMock,
    mock_metrics_repo: MagicMock,
    mock_snapshot_repo: MagicMock,
    mock_upload_repo: MagicMock,
    mock_permission_service: MagicMock,
) -> BattleEventService:
    """Create BattleEventService with mocked dependencies"""
    service = BattleEventService()
    service._event_repo = mock_event_repo
    service._metrics_repo = mock_metrics_repo
    service._snapshot_repo = mock_snapshot_repo
    service._upload_repo = mock_upload_repo
    service._permission_service = mock_permission_service
    return service


def create_mock_event(
    event_id: UUID,
    alliance_id: UUID,
    name: str = "Test Battle",
    status: EventStatus = EventStatus.DRAFT,
    event_type: EventCategory = EventCategory.BATTLE,
) -> BattleEvent:
    """Factory for creating mock BattleEvent objects"""
    return BattleEvent(
        id=event_id,
        alliance_id=alliance_id,
        season_id=uuid4(),
        name=name,
        event_type=event_type,
        status=status,
        event_start=datetime(2025, 1, 1),
        event_end=datetime(2025, 1, 2),
        before_upload_id=None,
        after_upload_id=None,
        description=None,
        created_at=datetime.now(),
        created_by=uuid4(),
    )


def create_mock_metrics_with_member(
    member_id: UUID,
    member_name: str,
    group_name: str | None,
    merit_diff: int,
    participated: bool,
    is_new_member: bool = False,
    is_absent: bool = False,
    contribution_diff: int = 1000,
    assist_diff: int = 50,
    power_diff: int = 500,
) -> BattleEventMetricsWithMember:
    """Factory for creating mock BattleEventMetricsWithMember"""
    return BattleEventMetricsWithMember(
        id=uuid4(),
        event_id=uuid4(),
        member_id=member_id,
        alliance_id=uuid4(),
        start_snapshot_id=uuid4(),
        end_snapshot_id=uuid4(),
        contribution_diff=contribution_diff,
        merit_diff=merit_diff,
        assist_diff=assist_diff,
        donation_diff=100,
        power_diff=power_diff,
        participated=participated,
        is_new_member=is_new_member,
        is_absent=is_absent,
        created_at=datetime.now(),
        member_name=member_name,
        group_name=group_name,
    )


# =============================================================================
# Tests for verify_user_access
# =============================================================================


class TestVerifyUserAccess:
    """Tests for verify_user_access method"""

    @pytest.mark.asyncio
    async def test_should_return_alliance_id_when_user_has_access(
        self,
        battle_event_service: BattleEventService,
        mock_event_repo: MagicMock,
        mock_permission_service: MagicMock,
        user_id: UUID,
        event_id: UUID,
        alliance_id: UUID,
    ):
        """Should return alliance_id when user has access to event"""
        # Arrange
        mock_event = create_mock_event(event_id, alliance_id)
        mock_event_repo.get_by_id = AsyncMock(return_value=mock_event)
        mock_permission_service.get_user_role = AsyncMock(return_value="member")

        # Act
        result = await battle_event_service.verify_user_access(user_id, event_id)

        # Assert
        assert result == alliance_id
        mock_event_repo.get_by_id.assert_called_once_with(event_id)
        mock_permission_service.get_user_role.assert_called_once_with(user_id, alliance_id)

    @pytest.mark.asyncio
    async def test_should_raise_error_when_event_not_found(
        self,
        battle_event_service: BattleEventService,
        mock_event_repo: MagicMock,
        user_id: UUID,
        event_id: UUID,
    ):
        """Should raise ValueError when event not found"""
        # Arrange
        mock_event_repo.get_by_id = AsyncMock(return_value=None)

        # Act & Assert
        with pytest.raises(ValueError, match="Event not found"):
            await battle_event_service.verify_user_access(user_id, event_id)

    @pytest.mark.asyncio
    async def test_should_raise_error_when_user_not_member(
        self,
        battle_event_service: BattleEventService,
        mock_event_repo: MagicMock,
        mock_permission_service: MagicMock,
        user_id: UUID,
        event_id: UUID,
        alliance_id: UUID,
    ):
        """Should raise PermissionError when user is not alliance member"""
        # Arrange
        mock_event = create_mock_event(event_id, alliance_id)
        mock_event_repo.get_by_id = AsyncMock(return_value=mock_event)
        mock_permission_service.get_user_role = AsyncMock(return_value=None)

        # Act & Assert
        with pytest.raises(PermissionError, match="You are not a member"):
            await battle_event_service.verify_user_access(user_id, event_id)


# =============================================================================
# Tests for create_event
# =============================================================================


class TestCreateEvent:
    """Tests for create_event method"""

    @pytest.mark.asyncio
    async def test_should_create_event_successfully(
        self,
        battle_event_service: BattleEventService,
        mock_event_repo: MagicMock,
        mock_permission_service: MagicMock,
        alliance_id: UUID,
        season_id: UUID,
    ):
        """Should create event when quota is available"""
        # Arrange
        event_data = BattleEventCreate(
            alliance_id=alliance_id,
            season_id=season_id,
            name="Test Battle",
            event_type=EventCategory.BATTLE,
        )
        expected_event = create_mock_event(uuid4(), alliance_id, "Test Battle")

        mock_permission_service.require_active_quota = AsyncMock()
        mock_event_repo.create = AsyncMock(return_value=expected_event)

        # Act
        result = await battle_event_service.create_event(event_data)

        # Assert
        assert result.name == "Test Battle"
        mock_permission_service.require_active_quota.assert_called_once_with(
            alliance_id, "create battle events"
        )
        mock_event_repo.create.assert_called_once_with(event_data)

    @pytest.mark.asyncio
    async def test_should_propagate_quota_error(
        self,
        battle_event_service: BattleEventService,
        mock_permission_service: MagicMock,
        alliance_id: UUID,
        season_id: UUID,
    ):
        """Should propagate SeasonQuotaExhaustedError"""
        # Arrange
        from src.core.exceptions import SeasonQuotaExhaustedError

        event_data = BattleEventCreate(
            alliance_id=alliance_id,
            season_id=season_id,
            name="Test Battle",
            event_type=EventCategory.BATTLE,
        )
        mock_permission_service.require_active_quota = AsyncMock(
            side_effect=SeasonQuotaExhaustedError()
        )

        # Act & Assert
        with pytest.raises(SeasonQuotaExhaustedError):
            await battle_event_service.create_event(event_data)


# =============================================================================
# Tests for get_event
# =============================================================================


class TestGetEvent:
    """Tests for get_event method"""

    @pytest.mark.asyncio
    async def test_should_return_event_when_found(
        self,
        battle_event_service: BattleEventService,
        mock_event_repo: MagicMock,
        event_id: UUID,
        alliance_id: UUID,
    ):
        """Should return event when found"""
        # Arrange
        expected_event = create_mock_event(event_id, alliance_id)
        mock_event_repo.get_by_id = AsyncMock(return_value=expected_event)

        # Act
        result = await battle_event_service.get_event(event_id)

        # Assert
        assert result == expected_event
        mock_event_repo.get_by_id.assert_called_once_with(event_id)

    @pytest.mark.asyncio
    async def test_should_return_none_when_not_found(
        self,
        battle_event_service: BattleEventService,
        mock_event_repo: MagicMock,
        event_id: UUID,
    ):
        """Should return None when event not found"""
        # Arrange
        mock_event_repo.get_by_id = AsyncMock(return_value=None)

        # Act
        result = await battle_event_service.get_event(event_id)

        # Assert
        assert result is None


# =============================================================================
# Tests for delete_event
# =============================================================================


class TestDeleteEvent:
    """Tests for delete_event method"""

    @pytest.mark.asyncio
    async def test_should_delete_event_successfully(
        self,
        battle_event_service: BattleEventService,
        mock_event_repo: MagicMock,
        mock_permission_service: MagicMock,
        event_id: UUID,
        alliance_id: UUID,
    ):
        """Should delete event when found and quota available"""
        # Arrange
        mock_event = create_mock_event(event_id, alliance_id)
        mock_event_repo.get_by_id = AsyncMock(return_value=mock_event)
        mock_permission_service.require_active_quota = AsyncMock()
        mock_event_repo.delete = AsyncMock(return_value=True)

        # Act
        result = await battle_event_service.delete_event(event_id)

        # Assert
        assert result is True
        mock_permission_service.require_active_quota.assert_called_once_with(
            alliance_id, "delete battle events"
        )
        mock_event_repo.delete.assert_called_once_with(event_id)

    @pytest.mark.asyncio
    async def test_should_raise_error_when_event_not_found(
        self,
        battle_event_service: BattleEventService,
        mock_event_repo: MagicMock,
        event_id: UUID,
    ):
        """Should raise ValueError when event not found"""
        # Arrange
        mock_event_repo.get_by_id = AsyncMock(return_value=None)

        # Act & Assert
        with pytest.raises(ValueError, match="Event not found"):
            await battle_event_service.delete_event(event_id)


# =============================================================================
# Tests for _calculate_event_summary
# =============================================================================


class TestCalculateEventSummary:
    """Tests for _calculate_event_summary method"""

    @pytest.mark.asyncio
    async def test_should_calculate_summary_correctly(
        self,
        battle_event_service: BattleEventService,
        mock_metrics_repo: MagicMock,
        event_id: UUID,
    ):
        """Should calculate correct summary from metrics"""
        # Arrange
        metrics = [
            create_mock_metrics_with_member(
                uuid4(), "張飛", "前鋒隊", 50000, participated=True
            ),
            create_mock_metrics_with_member(
                uuid4(), "關羽", "前鋒隊", 45000, participated=True
            ),
            create_mock_metrics_with_member(
                uuid4(), "趙雲", "後勤隊", 0, participated=False, is_absent=True
            ),
            create_mock_metrics_with_member(
                uuid4(), "新成員", "後勤隊", 0, participated=False, is_new_member=True
            ),
        ]
        mock_metrics_repo.get_by_event_with_member = AsyncMock(return_value=metrics)

        # Act
        result = await battle_event_service._calculate_event_summary(event_id)

        # Assert
        assert result.total_members == 4
        assert result.participated_count == 2
        assert result.absent_count == 1
        assert result.new_member_count == 1
        # Participation rate excludes new members: 2 / 3 = 66.7%
        assert result.participation_rate == 66.7
        assert result.total_merit == 95000
        assert result.mvp_member_name == "張飛"
        assert result.mvp_merit == 50000

    @pytest.mark.asyncio
    async def test_should_return_empty_summary_when_no_metrics(
        self,
        battle_event_service: BattleEventService,
        mock_metrics_repo: MagicMock,
        event_id: UUID,
    ):
        """Should return empty summary when no metrics"""
        # Arrange
        mock_metrics_repo.get_by_event_with_member = AsyncMock(return_value=[])

        # Act
        result = await battle_event_service._calculate_event_summary(event_id)

        # Assert
        assert result.total_members == 0
        assert result.participated_count == 0
        assert result.participation_rate == 0.0
        assert result.mvp_member_id is None
        assert result.mvp_member_name is None


# =============================================================================
# Tests for _calculate_group_stats
# =============================================================================


class TestCalculateGroupStats:
    """Tests for _calculate_group_stats method"""

    def test_should_calculate_group_stats_correctly(
        self, battle_event_service: BattleEventService
    ):
        """Should calculate correct stats for a group"""
        # Arrange
        metrics = [
            create_mock_metrics_with_member(
                uuid4(), "張飛", "前鋒隊", 50000, participated=True
            ),
            create_mock_metrics_with_member(
                uuid4(), "關羽", "前鋒隊", 45000, participated=True
            ),
            create_mock_metrics_with_member(
                uuid4(), "趙雲", "前鋒隊", 0, participated=False, is_absent=True
            ),
        ]

        # Act
        result = battle_event_service._calculate_group_stats("前鋒隊", metrics)

        # Assert
        assert result.group_name == "前鋒隊"
        assert result.member_count == 3
        assert result.participated_count == 2
        assert result.absent_count == 1
        assert result.participation_rate == 66.7
        assert result.total_merit == 95000
        assert result.avg_merit == 47500.0
        assert result.merit_min == 45000
        assert result.merit_max == 50000

    def test_should_exclude_new_members_from_stats(
        self, battle_event_service: BattleEventService
    ):
        """Should exclude new members from participation calculation"""
        # Arrange
        metrics = [
            create_mock_metrics_with_member(
                uuid4(), "張飛", "前鋒隊", 50000, participated=True
            ),
            create_mock_metrics_with_member(
                uuid4(), "新人", "前鋒隊", 0, participated=False, is_new_member=True
            ),
        ]

        # Act
        result = battle_event_service._calculate_group_stats("前鋒隊", metrics)

        # Assert
        assert result.member_count == 1  # Excludes new member
        assert result.participated_count == 1
        assert result.participation_rate == 100.0

    def test_should_handle_empty_group(self, battle_event_service: BattleEventService):
        """Should handle empty group gracefully"""
        # Arrange
        metrics: list[BattleEventMetricsWithMember] = []

        # Act
        result = battle_event_service._calculate_group_stats("空組", metrics)

        # Assert
        assert result.member_count == 0
        assert result.participation_rate == 0.0
        assert result.total_merit == 0


# =============================================================================
# Tests for _determine_participation
# =============================================================================


class TestDetermineParticipation:
    """Tests for category-specific participation logic"""

    def test_siege_participation_with_contribution(
        self, battle_event_service: BattleEventService
    ):
        """SIEGE: Should mark as participated when contribution > 0"""
        # Act
        participated, is_absent = battle_event_service._determine_participation(
            EventCategory.SIEGE,
            contribution_diff=1000,
            merit_diff=0,
            assist_diff=0,
            power_diff=0,
        )

        # Assert
        assert participated is True
        assert is_absent is False

    def test_siege_participation_with_assist(
        self, battle_event_service: BattleEventService
    ):
        """SIEGE: Should mark as participated when assist > 0"""
        # Act
        participated, is_absent = battle_event_service._determine_participation(
            EventCategory.SIEGE,
            contribution_diff=0,
            merit_diff=0,
            assist_diff=500,
            power_diff=0,
        )

        # Assert
        assert participated is True
        assert is_absent is False

    def test_siege_absent_when_no_contribution_or_assist(
        self, battle_event_service: BattleEventService
    ):
        """SIEGE: Should mark as absent when no contribution and no assist"""
        # Act
        participated, is_absent = battle_event_service._determine_participation(
            EventCategory.SIEGE,
            contribution_diff=0,
            merit_diff=5000,  # Merit doesn't count for siege
            assist_diff=0,
            power_diff=0,
        )

        # Assert
        assert participated is False
        assert is_absent is True

    def test_forbidden_never_marks_participation(
        self, battle_event_service: BattleEventService
    ):
        """FORBIDDEN: Should never mark participation (only tracks violators)"""
        # Act
        participated, is_absent = battle_event_service._determine_participation(
            EventCategory.FORBIDDEN,
            contribution_diff=1000,
            merit_diff=5000,
            assist_diff=500,
            power_diff=100,  # Violator
        )

        # Assert
        assert participated is False
        assert is_absent is False  # No absent tracking for forbidden

    def test_battle_participation_with_merit(
        self, battle_event_service: BattleEventService
    ):
        """BATTLE: Should mark as participated when merit > 0"""
        # Act
        participated, is_absent = battle_event_service._determine_participation(
            EventCategory.BATTLE,
            contribution_diff=1000,  # Doesn't count for battle
            merit_diff=5000,
            assist_diff=500,  # Doesn't count for battle
            power_diff=0,
        )

        # Assert
        assert participated is True
        assert is_absent is False

    def test_battle_absent_when_no_merit(
        self, battle_event_service: BattleEventService
    ):
        """BATTLE: Should mark as absent when merit = 0"""
        # Act
        participated, is_absent = battle_event_service._determine_participation(
            EventCategory.BATTLE,
            contribution_diff=1000,
            merit_diff=0,
            assist_diff=500,
            power_diff=0,
        )

        # Assert
        assert participated is False
        assert is_absent is True
