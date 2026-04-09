"""
Unit Tests for CopperMineService._validate_rule

Tests cover:
1. Snapshot validation - reject when no snapshot exists (PR #9 fix)
2. Merit validation - reject when merit is insufficient
3. Level validation - reject when level doesn't match rule
4. Mine count validation - reject when exceeding max allowed
5. Edge cases - no rules, no member_id/season_id
6. LIFF mine list metadata - source-of-truth readiness and searchable counties

符合 test-writing skill 規範:
- AAA pattern (Arrange-Act-Assert)
- Mocked repository dependencies
- Coverage: happy path + edge cases + error cases
"""

from datetime import datetime
from unittest.mock import AsyncMock, MagicMock
from uuid import UUID

import pytest
from fastapi import HTTPException

from src.services.copper_mine_service import CopperMineService

# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def alliance_id() -> UUID:
    """Fixed alliance UUID for testing"""
    return UUID("22222222-2222-2222-2222-222222222222")


@pytest.fixture
def season_id() -> UUID:
    """Fixed season UUID for testing"""
    return UUID("33333333-3333-3333-3333-333333333333")


@pytest.fixture
def member_id() -> UUID:
    """Fixed member UUID for testing"""
    return UUID("44444444-4444-4444-4444-444444444444")


@pytest.fixture
def mock_copper_mine_repo() -> MagicMock:
    """Create mock CopperMineRepository"""
    repo = MagicMock()
    repo.count_member_mines = AsyncMock(return_value=0)
    repo.get_claimed_tiers = AsyncMock(return_value=set())
    repo.get_mines_by_alliance = AsyncMock(return_value=[])
    repo.get_mine_by_coords = AsyncMock(return_value=None)
    return repo


@pytest.fixture
def mock_rule_repo() -> MagicMock:
    """Create mock CopperMineRuleRepository"""
    repo = MagicMock()
    return repo


@pytest.fixture
def mock_snapshot_repo() -> MagicMock:
    """Create mock MemberSnapshotRepository"""
    repo = MagicMock()
    return repo


@pytest.fixture
def mock_line_binding_repo() -> MagicMock:
    """Create mock LineBindingRepository"""
    repo = MagicMock()
    repo.get_group_binding_by_line_group_id = AsyncMock()
    repo.get_member_bindings_by_line_user = AsyncMock(return_value=[])
    return repo


@pytest.fixture
def mock_season_repo() -> MagicMock:
    """Create mock SeasonRepository"""
    repo = MagicMock()
    repo.get_current_season = AsyncMock(return_value=None)
    repo.get_by_id = AsyncMock(return_value=None)
    return repo


@pytest.fixture
def mock_coordinate_repo() -> MagicMock:
    """Create mock CopperMineCoordinateRepository"""
    repo = MagicMock()
    repo.has_data = AsyncMock(return_value=False)
    repo.list_searchable_counties = AsyncMock(return_value=[])
    repo.get_by_coords = AsyncMock(return_value=None)
    return repo


@pytest.fixture
def copper_mine_service(
    mock_copper_mine_repo: MagicMock,
    mock_rule_repo: MagicMock,
    mock_snapshot_repo: MagicMock,
) -> CopperMineService:
    """Create CopperMineService with mocked repositories"""
    service = CopperMineService(
        repository=mock_copper_mine_repo,
        rule_repository=mock_rule_repo,
        snapshot_repository=mock_snapshot_repo,
    )
    return service


@pytest.fixture
def copper_mine_list_service(
    mock_copper_mine_repo: MagicMock,
    mock_rule_repo: MagicMock,
    mock_line_binding_repo: MagicMock,
    mock_season_repo: MagicMock,
    mock_coordinate_repo: MagicMock,
) -> CopperMineService:
    """Create CopperMineService with mocked dependencies for list queries"""
    service = CopperMineService(
        repository=mock_copper_mine_repo,
        line_binding_repository=mock_line_binding_repo,
        season_repository=mock_season_repo,
        rule_repository=mock_rule_repo,
        coordinate_repository=mock_coordinate_repo,
    )
    return service


def create_mock_rule(
    tier: int = 1,
    required_merit: int = 100000,
    allowed_level: str = "both",
) -> MagicMock:
    """Factory for creating mock copper mine rule"""
    rule = MagicMock()
    rule.tier = tier
    rule.required_merit = required_merit
    rule.allowed_level = allowed_level
    return rule


def create_mock_snapshot(
    total_merit: int = 500000,
    group_name: str = "前鋒隊",
) -> MagicMock:
    """Factory for creating mock member snapshot"""
    snapshot = MagicMock()
    snapshot.total_merit = total_merit
    snapshot.group_name = group_name
    return snapshot


def create_mock_mine(
    game_id: str = "Jason",
    coord_x: int = 123,
    coord_y: int = 456,
    level: int = 9,
) -> MagicMock:
    """Factory for creating mock copper mine records"""
    mine = MagicMock()
    mine.id = UUID("55555555-5555-5555-5555-555555555555")
    mine.game_id = game_id
    mine.coord_x = coord_x
    mine.coord_y = coord_y
    mine.level = level
    mine.status = "active"
    mine.notes = None
    mine.registered_at = datetime(2026, 4, 9, 12, 0, 0)
    return mine


def create_mock_coordinate(
    coord_x: int = 123,
    coord_y: int = 456,
    county: str = "巴郡",
    district: str = "江州",
    level: int = 9,
) -> MagicMock:
    """Factory for creating mock source-of-truth coordinate records"""
    coordinate = MagicMock()
    coordinate.coord_x = coord_x
    coordinate.coord_y = coord_y
    coordinate.county = county
    coordinate.district = district
    coordinate.level = level
    return coordinate


# =============================================================================
# Test Classes
# =============================================================================


class TestValidateRuleNoSnapshot:
    """
    Tests for PR #9 fix: _validate_rule should reject when no snapshot exists

    Bug fixed: Previously, when snapshot was None, the code skipped merit
    validation and allowed users to register copper mines without any
    uploaded CSV data.
    """

    @pytest.mark.asyncio
    async def test_should_reject_when_no_snapshot_exists(
        self,
        copper_mine_service: CopperMineService,
        mock_rule_repo: MagicMock,
        mock_snapshot_repo: MagicMock,
        mock_copper_mine_repo: MagicMock,
        alliance_id: UUID,
        season_id: UUID,
        member_id: UUID,
    ):
        """
        PR #9 核心測試：當成員沒有快照時應該拒絕申請

        This is the main test for the PR #9 fix. When a member has no
        snapshot (no CSV upload containing their data), the copper mine
        registration should be rejected.
        """
        # Arrange
        rules = [create_mock_rule(tier=1, required_merit=100000)]
        mock_rule_repo.get_rules_by_alliance = AsyncMock(return_value=rules)
        mock_rule_repo.get_rule_by_tier = AsyncMock(return_value=rules[0])
        mock_copper_mine_repo.count_member_mines = AsyncMock(return_value=0)
        mock_snapshot_repo.get_latest_by_member_in_season = AsyncMock(return_value=None)

        # Act & Assert
        with pytest.raises(HTTPException) as exc_info:
            await copper_mine_service._validate_rule(
                alliance_id=alliance_id,
                member_id=member_id,
                season_id=season_id,
                level=9,
            )

        assert exc_info.value.status_code == 403
        assert "戰功不存在" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_should_pass_when_snapshot_exists_with_enough_merit(
        self,
        copper_mine_service: CopperMineService,
        mock_rule_repo: MagicMock,
        mock_snapshot_repo: MagicMock,
        mock_copper_mine_repo: MagicMock,
        alliance_id: UUID,
        season_id: UUID,
        member_id: UUID,
    ):
        """當成員有足夠戰功的快照時應該通過驗證"""
        # Arrange
        rules = [create_mock_rule(tier=1, required_merit=100000, allowed_level="both")]
        mock_rule_repo.get_rules_by_alliance = AsyncMock(return_value=rules)
        mock_rule_repo.get_rule_by_tier = AsyncMock(return_value=rules[0])
        mock_copper_mine_repo.count_member_mines = AsyncMock(return_value=0)
        mock_snapshot_repo.get_latest_by_member_in_season = AsyncMock(
            return_value=create_mock_snapshot(total_merit=500000)
        )

        # Act & Assert - should not raise
        await copper_mine_service._validate_rule(
            alliance_id=alliance_id,
            member_id=member_id,
            season_id=season_id,
            level=9,
        )


class TestValidateRuleMeritRequirement:
    """Tests for merit requirement validation"""

    @pytest.mark.asyncio
    async def test_should_reject_when_merit_insufficient(
        self,
        copper_mine_service: CopperMineService,
        mock_rule_repo: MagicMock,
        mock_snapshot_repo: MagicMock,
        mock_copper_mine_repo: MagicMock,
        alliance_id: UUID,
        season_id: UUID,
        member_id: UUID,
    ):
        """當成員戰功不足時應該拒絕申請"""
        # Arrange
        rules = [create_mock_rule(tier=1, required_merit=100000)]
        mock_rule_repo.get_rules_by_alliance = AsyncMock(return_value=rules)
        mock_rule_repo.get_rule_by_tier = AsyncMock(return_value=rules[0])
        mock_copper_mine_repo.count_member_mines = AsyncMock(return_value=0)
        # Member has only 50000 merit, but rule requires 100000
        mock_snapshot_repo.get_latest_by_member_in_season = AsyncMock(
            return_value=create_mock_snapshot(total_merit=50000)
        )

        # Act & Assert
        with pytest.raises(HTTPException) as exc_info:
            await copper_mine_service._validate_rule(
                alliance_id=alliance_id,
                member_id=member_id,
                season_id=season_id,
                level=9,
            )

        assert exc_info.value.status_code == 403
        assert "總戰功不足" in exc_info.value.detail
        assert "100,000" in exc_info.value.detail  # required
        assert "50,000" in exc_info.value.detail  # current

    @pytest.mark.asyncio
    async def test_should_pass_when_merit_exactly_meets_requirement(
        self,
        copper_mine_service: CopperMineService,
        mock_rule_repo: MagicMock,
        mock_snapshot_repo: MagicMock,
        mock_copper_mine_repo: MagicMock,
        alliance_id: UUID,
        season_id: UUID,
        member_id: UUID,
    ):
        """當成員戰功剛好達標時應該通過"""
        # Arrange
        rules = [create_mock_rule(tier=1, required_merit=100000, allowed_level="both")]
        mock_rule_repo.get_rules_by_alliance = AsyncMock(return_value=rules)
        mock_rule_repo.get_rule_by_tier = AsyncMock(return_value=rules[0])
        mock_copper_mine_repo.count_member_mines = AsyncMock(return_value=0)
        mock_snapshot_repo.get_latest_by_member_in_season = AsyncMock(
            return_value=create_mock_snapshot(total_merit=100000)
        )

        # Act & Assert - should not raise
        await copper_mine_service._validate_rule(
            alliance_id=alliance_id,
            member_id=member_id,
            season_id=season_id,
            level=9,
        )


class TestValidateRuleLevelRestriction:
    """Tests for level restriction validation"""

    @pytest.mark.asyncio
    async def test_should_reject_level_9_when_only_level_10_allowed(
        self,
        copper_mine_service: CopperMineService,
        mock_rule_repo: MagicMock,
        mock_snapshot_repo: MagicMock,
        mock_copper_mine_repo: MagicMock,
        alliance_id: UUID,
        season_id: UUID,
        member_id: UUID,
    ):
        """當規則只允許 10 級銅礦時，申請 9 級應該被拒絕"""
        # Arrange
        rules = [create_mock_rule(tier=1, required_merit=100000, allowed_level="ten")]
        mock_rule_repo.get_rules_by_alliance = AsyncMock(return_value=rules)
        mock_rule_repo.get_rule_by_tier = AsyncMock(return_value=rules[0])
        mock_copper_mine_repo.count_member_mines = AsyncMock(return_value=0)
        mock_snapshot_repo.get_latest_by_member_in_season = AsyncMock(
            return_value=create_mock_snapshot(total_merit=500000)
        )

        # Act & Assert
        with pytest.raises(HTTPException) as exc_info:
            await copper_mine_service._validate_rule(
                alliance_id=alliance_id,
                member_id=member_id,
                season_id=season_id,
                level=9,  # Trying to register level 9
            )

        assert exc_info.value.status_code == 403
        assert "10級" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_should_reject_level_10_when_only_level_9_allowed(
        self,
        copper_mine_service: CopperMineService,
        mock_rule_repo: MagicMock,
        mock_snapshot_repo: MagicMock,
        mock_copper_mine_repo: MagicMock,
        alliance_id: UUID,
        season_id: UUID,
        member_id: UUID,
    ):
        """當規則只允許 9 級銅礦時，申請 10 級應該被拒絕"""
        # Arrange
        rules = [create_mock_rule(tier=1, required_merit=100000, allowed_level="nine")]
        mock_rule_repo.get_rules_by_alliance = AsyncMock(return_value=rules)
        mock_rule_repo.get_rule_by_tier = AsyncMock(return_value=rules[0])
        mock_copper_mine_repo.count_member_mines = AsyncMock(return_value=0)
        mock_snapshot_repo.get_latest_by_member_in_season = AsyncMock(
            return_value=create_mock_snapshot(total_merit=500000)
        )

        # Act & Assert
        with pytest.raises(HTTPException) as exc_info:
            await copper_mine_service._validate_rule(
                alliance_id=alliance_id,
                member_id=member_id,
                season_id=season_id,
                level=10,  # Trying to register level 10
            )

        assert exc_info.value.status_code == 403
        assert "9級" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_should_pass_any_level_when_both_allowed(
        self,
        copper_mine_service: CopperMineService,
        mock_rule_repo: MagicMock,
        mock_snapshot_repo: MagicMock,
        mock_copper_mine_repo: MagicMock,
        alliance_id: UUID,
        season_id: UUID,
        member_id: UUID,
    ):
        """當規則允許 9 或 10 級時，兩種等級都應該通過"""
        # Arrange
        rules = [create_mock_rule(tier=1, required_merit=100000, allowed_level="both")]
        mock_rule_repo.get_rules_by_alliance = AsyncMock(return_value=rules)
        mock_rule_repo.get_rule_by_tier = AsyncMock(return_value=rules[0])
        mock_copper_mine_repo.count_member_mines = AsyncMock(return_value=0)
        mock_snapshot_repo.get_latest_by_member_in_season = AsyncMock(
            return_value=create_mock_snapshot(total_merit=500000)
        )

        # Act & Assert - both levels should pass
        for level in [9, 10]:
            await copper_mine_service._validate_rule(
                alliance_id=alliance_id,
                member_id=member_id,
                season_id=season_id,
                level=level,
            )


class TestValidateRuleMineCountLimit:
    """Tests for mine count limit validation"""

    @pytest.mark.asyncio
    async def test_should_reject_when_max_mines_reached(
        self,
        copper_mine_service: CopperMineService,
        mock_rule_repo: MagicMock,
        mock_copper_mine_repo: MagicMock,
        alliance_id: UUID,
        season_id: UUID,
        member_id: UUID,
    ):
        """當成員已達銅礦上限時應該拒絕申請"""
        # Arrange - 2 rules = max 2 mines, member already has 2
        rules = [
            create_mock_rule(tier=1, required_merit=100000),
            create_mock_rule(tier=2, required_merit=200000),
        ]
        mock_rule_repo.get_rules_by_alliance = AsyncMock(return_value=rules)
        mock_copper_mine_repo.get_claimed_tiers = AsyncMock(return_value={1, 2})

        # Act & Assert
        with pytest.raises(HTTPException) as exc_info:
            await copper_mine_service._validate_rule(
                alliance_id=alliance_id,
                member_id=member_id,
                season_id=season_id,
                level=9,
            )

        assert exc_info.value.status_code == 403
        assert "已達銅礦上限" in exc_info.value.detail
        assert "2/2" in exc_info.value.detail


class TestValidateRuleNoRules:
    """Tests for edge case when no rules are configured"""

    @pytest.mark.asyncio
    async def test_should_reject_when_no_rules_configured(
        self,
        copper_mine_service: CopperMineService,
        mock_rule_repo: MagicMock,
        alliance_id: UUID,
        season_id: UUID,
        member_id: UUID,
    ):
        """當同盟沒有設定任何規則時應該拒絕申請"""
        # Arrange - no rules
        mock_rule_repo.get_rules_by_alliance = AsyncMock(return_value=[])

        # Act & Assert
        with pytest.raises(HTTPException) as exc_info:
            await copper_mine_service._validate_rule(
                alliance_id=alliance_id,
                member_id=member_id,
                season_id=season_id,
                level=9,
            )

        assert exc_info.value.status_code == 403
        assert "尚未設定銅礦規則" in exc_info.value.detail


class TestValidateRuleNoMemberOrSeason:
    """Tests for edge case when member_id or season_id is None"""

    @pytest.mark.asyncio
    async def test_should_only_validate_level_when_member_id_is_none(
        self,
        copper_mine_service: CopperMineService,
        mock_rule_repo: MagicMock,
        alliance_id: UUID,
        season_id: UUID,
    ):
        """當 member_id 為 None 時，只驗證等級（用於無法識別成員的情況）"""
        # Arrange
        rules = [create_mock_rule(tier=1, required_merit=100000, allowed_level="both")]
        mock_rule_repo.get_rules_by_alliance = AsyncMock(return_value=rules)

        # Act & Assert - should not raise (level validation only)
        await copper_mine_service._validate_rule(
            alliance_id=alliance_id,
            member_id=None,  # Unknown member
            season_id=season_id,
            level=9,
        )

    @pytest.mark.asyncio
    async def test_should_reject_wrong_level_even_when_member_unknown(
        self,
        copper_mine_service: CopperMineService,
        mock_rule_repo: MagicMock,
        alliance_id: UUID,
        season_id: UUID,
    ):
        """即使成員未知，等級不符合時也應該拒絕"""
        # Arrange
        rules = [create_mock_rule(tier=1, required_merit=100000, allowed_level="ten")]
        mock_rule_repo.get_rules_by_alliance = AsyncMock(return_value=rules)

        # Act & Assert
        with pytest.raises(HTTPException) as exc_info:
            await copper_mine_service._validate_rule(
                alliance_id=alliance_id,
                member_id=None,
                season_id=season_id,
                level=9,  # Level 9 not allowed
            )

        assert exc_info.value.status_code == 403
        assert "10 級" in exc_info.value.detail


class TestIsLevelAllowed:
    """Tests for _is_level_allowed helper method"""

    def test_should_allow_level_9_when_nine_specified(
        self,
        copper_mine_service: CopperMineService,
    ):
        """allowed_level='nine' 應該只允許 9 級"""
        assert copper_mine_service._is_level_allowed(9, "nine") is True
        assert copper_mine_service._is_level_allowed(10, "nine") is False

    def test_should_allow_level_10_when_ten_specified(
        self,
        copper_mine_service: CopperMineService,
    ):
        """allowed_level='ten' 應該只允許 10 級"""
        assert copper_mine_service._is_level_allowed(10, "ten") is True
        assert copper_mine_service._is_level_allowed(9, "ten") is False

    def test_should_allow_both_levels_when_both_specified(
        self,
        copper_mine_service: CopperMineService,
    ):
        """allowed_level='both' 應該允許 9 和 10 級"""
        assert copper_mine_service._is_level_allowed(9, "both") is True
        assert copper_mine_service._is_level_allowed(10, "both") is True


class TestGetMinesListMetadata:
    """Tests for LIFF mine list source-of-truth metadata."""

    @pytest.mark.asyncio
    async def test_should_include_source_of_truth_metadata_for_current_season(
        self,
        copper_mine_list_service: CopperMineService,
        mock_copper_mine_repo: MagicMock,
        mock_rule_repo: MagicMock,
        mock_line_binding_repo: MagicMock,
        mock_season_repo: MagicMock,
        mock_coordinate_repo: MagicMock,
        alliance_id: UUID,
        season_id: UUID,
    ):
        """Should expose current-season source-of-truth readiness and counties."""
        # Arrange
        line_group_id = "Cgroup123"
        line_user_id = "Uuser123"
        mock_line_binding_repo.get_group_binding_by_line_group_id.return_value = MagicMock(
            alliance_id=alliance_id
        )
        mock_line_binding_repo.get_member_bindings_by_line_user.return_value = [
            MagicMock(game_id="Jason"),
            MagicMock(game_id="Alice"),
        ]
        mock_season_repo.get_current_season.return_value = MagicMock(id=season_id)
        mock_season_repo.get_by_id.return_value = MagicMock(game_season_tag="PK23")
        mock_copper_mine_repo.get_mines_by_alliance.return_value = [
            create_mock_mine(game_id="Jason")
        ]
        mock_rule_repo.get_rules_by_alliance = AsyncMock(
            return_value=[
                create_mock_rule(tier=1),
                create_mock_rule(tier=2),
            ]
        )
        mock_coordinate_repo.has_data.return_value = True
        mock_coordinate_repo.list_searchable_counties.return_value = ["巴郡", "漢中郡"]

        # Act
        result = await copper_mine_list_service.get_mines_list(line_group_id, line_user_id)

        # Assert
        assert result.has_source_data is True
        assert result.current_game_season_tag == "PK23"
        assert result.available_counties == ["巴郡", "漢中郡"]
        assert result.max_allowed == 2
        assert result.mine_counts_by_game_id == {"Jason": 1, "Alice": 0}
        mock_coordinate_repo.list_searchable_counties.assert_awaited_once_with(
            "PK23", level_filter=[9, 10]
        )

    @pytest.mark.asyncio
    async def test_should_return_empty_counties_when_source_of_truth_not_ready(
        self,
        copper_mine_list_service: CopperMineService,
        mock_copper_mine_repo: MagicMock,
        mock_rule_repo: MagicMock,
        mock_line_binding_repo: MagicMock,
        mock_season_repo: MagicMock,
        mock_coordinate_repo: MagicMock,
        alliance_id: UUID,
        season_id: UUID,
    ):
        """Should keep counties empty when the current season has no source data."""
        # Arrange
        mock_line_binding_repo.get_group_binding_by_line_group_id.return_value = MagicMock(
            alliance_id=alliance_id
        )
        mock_season_repo.get_current_season.return_value = MagicMock(id=season_id)
        mock_season_repo.get_by_id.return_value = MagicMock(game_season_tag="PK24")
        mock_copper_mine_repo.get_mines_by_alliance.return_value = []
        mock_rule_repo.get_rules_by_alliance = AsyncMock(return_value=[create_mock_rule(tier=1)])
        mock_coordinate_repo.has_data.return_value = False

        # Act
        result = await copper_mine_list_service.get_mines_list("Cgroup123", "Uuser123")

        # Assert
        assert result.has_source_data is False
        assert result.current_game_season_tag == "PK24"
        assert result.available_counties == []
        mock_coordinate_repo.list_searchable_counties.assert_not_awaited()


class TestLookupCopperCoordinate:
    """Tests for single-coordinate lookup in LIFF."""

    @pytest.mark.asyncio
    async def test_should_return_source_of_truth_metadata_when_coordinate_exists(
        self,
        copper_mine_list_service: CopperMineService,
        mock_line_binding_repo: MagicMock,
        mock_season_repo: MagicMock,
        mock_coordinate_repo: MagicMock,
        alliance_id: UUID,
        season_id: UUID,
    ):
        """Should include county and level when source-of-truth data exists."""
        mock_line_binding_repo.get_group_binding_by_line_group_id.return_value = MagicMock(
            alliance_id=alliance_id
        )
        mock_season_repo.get_current_season.return_value = MagicMock(id=season_id)
        mock_season_repo.get_by_id.return_value = MagicMock(game_season_tag="PK23")
        mock_coordinate_repo.has_data.return_value = True
        mock_coordinate_repo.get_by_coords.return_value = create_mock_coordinate(level=10)

        result = await copper_mine_list_service.lookup_copper_coordinate("Cgroup123", 123, 456)

        assert result.coord_x == 123
        assert result.coord_y == 456
        assert result.county == "巴郡"
        assert result.district == "江州"
        assert result.level == 10
        assert result.is_taken is False
        assert result.can_register is True
        assert result.requires_manual_level is False
        assert result.message is None

    @pytest.mark.asyncio
    async def test_should_return_validation_message_when_coordinate_missing_from_source_data(
        self,
        copper_mine_list_service: CopperMineService,
        mock_line_binding_repo: MagicMock,
        mock_season_repo: MagicMock,
        mock_coordinate_repo: MagicMock,
        alliance_id: UUID,
        season_id: UUID,
    ):
        """Should reject coordinates missing from source-of-truth data."""
        mock_line_binding_repo.get_group_binding_by_line_group_id.return_value = MagicMock(
            alliance_id=alliance_id
        )
        mock_season_repo.get_current_season.return_value = MagicMock(id=season_id)
        mock_season_repo.get_by_id.return_value = MagicMock(game_season_tag="PK23")
        mock_coordinate_repo.has_data.return_value = True
        mock_coordinate_repo.get_by_coords.return_value = None

        result = await copper_mine_list_service.lookup_copper_coordinate("Cgroup123", 999, 888)

        assert result.coord_x == 999
        assert result.coord_y == 888
        assert result.county is None
        assert result.level is None
        assert result.can_register is False
        assert result.requires_manual_level is False
        assert "PK23" in (result.message or "")

    @pytest.mark.asyncio
    async def test_should_require_manual_level_when_source_data_unavailable(
        self,
        copper_mine_list_service: CopperMineService,
        mock_line_binding_repo: MagicMock,
        mock_season_repo: MagicMock,
        mock_coordinate_repo: MagicMock,
        alliance_id: UUID,
        season_id: UUID,
    ):
        """Should allow registration with manual level when no source-of-truth exists."""
        mock_line_binding_repo.get_group_binding_by_line_group_id.return_value = MagicMock(
            alliance_id=alliance_id
        )
        mock_season_repo.get_current_season.return_value = MagicMock(id=season_id)
        mock_season_repo.get_by_id.return_value = MagicMock(game_season_tag="PK24")
        mock_coordinate_repo.has_data.return_value = False

        result = await copper_mine_list_service.lookup_copper_coordinate("Cgroup123", 321, 654)

        assert result.coord_x == 321
        assert result.coord_y == 654
        assert result.county is None
        assert result.level is None
        assert result.can_register is True
        assert result.requires_manual_level is True
