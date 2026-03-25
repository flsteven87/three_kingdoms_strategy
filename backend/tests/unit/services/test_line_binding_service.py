"""
Unit Tests for LineBindingService — Regression tests for refactored methods.

Tests cover:
1. get_group_binding() — thin wrapper around repository
2. get_current_season_id() — returns season.id or None
3. get_line_names_for_game_ids() — builds dict from bindings
4. enrich_analytics_with_line_names() — deduplication, mutation, empty lists

符合 test-writing skill 規範:
- AAA pattern (Arrange-Act-Assert)
- Mocked repository dependencies
- Coverage: happy path + edge cases + failure cases
"""

from datetime import datetime
from unittest.mock import AsyncMock, MagicMock
from uuid import UUID

import pytest

from src.models.battle_event_metrics import (
    EventGroupAnalytics,
    EventSummary,
    TopMemberItem,
    ViolatorItem,
)
from src.models.line_binding import LineGroupBinding
from src.services.line_binding_service import LineBindingService

# =============================================================================
# Fixtures
# =============================================================================

ALLIANCE_ID = UUID("22222222-2222-2222-2222-222222222222")
SEASON_ID = UUID("33333333-3333-3333-3333-333333333333")
GROUP_ID = "Cgroup1234"


def _make_group_binding(alliance_id: UUID = ALLIANCE_ID) -> LineGroupBinding:
    """Factory for a LineGroupBinding model instance."""
    now = datetime.now()
    return LineGroupBinding(
        id=UUID("11111111-1111-1111-1111-111111111111"),
        alliance_id=alliance_id,
        line_group_id=GROUP_ID,
        group_name="蜀漢同盟",
        group_picture_url=None,
        bound_by_line_user_id="Uabc123",
        is_active=True,
        is_test=False,
        bound_at=now,
        created_at=now,
        updated_at=now,
    )


def _make_season_mock(season_id: UUID = SEASON_ID) -> MagicMock:
    """Factory for a mock Season object with .id attribute."""
    season = MagicMock()
    season.id = season_id
    return season


@pytest.fixture
def mock_repository() -> MagicMock:
    """Mock LineBindingRepository."""
    return MagicMock()


@pytest.fixture
def mock_season_repo() -> MagicMock:
    """Mock SeasonRepository."""
    return MagicMock()


@pytest.fixture
def service(mock_repository: MagicMock, mock_season_repo: MagicMock) -> LineBindingService:
    """Create LineBindingService with mocked dependencies."""
    svc = LineBindingService(repository=mock_repository)
    svc._season_repo = mock_season_repo
    return svc


# =============================================================================
# Tests for get_group_binding()
# =============================================================================


class TestGetGroupBinding:
    """Tests for LineBindingService.get_group_binding()."""

    @pytest.mark.asyncio
    async def test_returns_binding_when_found(
        self, service: LineBindingService, mock_repository: MagicMock
    ):
        """Should return the LineGroupBinding from the repository."""
        expected = _make_group_binding()
        mock_repository.get_group_binding_by_line_group_id = AsyncMock(return_value=expected)

        result = await service.get_group_binding(GROUP_ID)

        mock_repository.get_group_binding_by_line_group_id.assert_called_once_with(GROUP_ID)
        assert result is expected

    @pytest.mark.asyncio
    async def test_returns_none_when_not_found(
        self, service: LineBindingService, mock_repository: MagicMock
    ):
        """Should return None when no binding exists for that group ID."""
        mock_repository.get_group_binding_by_line_group_id = AsyncMock(return_value=None)

        result = await service.get_group_binding("Cunknown_group")

        assert result is None

    @pytest.mark.asyncio
    async def test_passes_group_id_verbatim_to_repository(
        self, service: LineBindingService, mock_repository: MagicMock
    ):
        """Should forward the exact group ID string to the repository."""
        mock_repository.get_group_binding_by_line_group_id = AsyncMock(return_value=None)
        specific_id = "Cspecific_line_group_id_xyz"

        await service.get_group_binding(specific_id)

        mock_repository.get_group_binding_by_line_group_id.assert_called_once_with(specific_id)


# =============================================================================
# Tests for get_current_season_id()
# =============================================================================


class TestGetCurrentSeasonId:
    """Tests for LineBindingService.get_current_season_id()."""

    @pytest.mark.asyncio
    async def test_returns_season_id_when_season_exists(
        self, service: LineBindingService, mock_season_repo: MagicMock
    ):
        """Should return the season's UUID when a current season is found."""
        mock_season_repo.get_current_season = AsyncMock(return_value=_make_season_mock(SEASON_ID))

        result = await service.get_current_season_id(ALLIANCE_ID)

        mock_season_repo.get_current_season.assert_called_once_with(ALLIANCE_ID)
        assert result == SEASON_ID

    @pytest.mark.asyncio
    async def test_returns_none_when_no_current_season(
        self, service: LineBindingService, mock_season_repo: MagicMock
    ):
        """Should return None when no current season exists for the alliance."""
        mock_season_repo.get_current_season = AsyncMock(return_value=None)

        result = await service.get_current_season_id(ALLIANCE_ID)

        assert result is None

    @pytest.mark.asyncio
    async def test_passes_alliance_id_to_repo(
        self, service: LineBindingService, mock_season_repo: MagicMock
    ):
        """Should forward the alliance_id to the season repository."""
        other_alliance = UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
        mock_season_repo.get_current_season = AsyncMock(return_value=None)

        await service.get_current_season_id(other_alliance)

        mock_season_repo.get_current_season.assert_called_once_with(other_alliance)


# =============================================================================
# Tests for get_line_names_for_game_ids()
# =============================================================================


class TestGetLineNamesForGameIds:
    """Tests for LineBindingService.get_line_names_for_game_ids()."""

    def _make_binding_mock(self, game_id: str, display_name: str) -> MagicMock:
        b = MagicMock()
        b.game_id = game_id
        b.line_display_name = display_name
        return b

    @pytest.mark.asyncio
    async def test_returns_dict_mapping_game_id_to_display_name(
        self, service: LineBindingService, mock_repository: MagicMock
    ):
        """Should return {game_id: line_display_name} for each binding."""
        bindings = [
            self._make_binding_mock("張飛", "BigBro"),
            self._make_binding_mock("關羽", "RedFace"),
        ]
        mock_repository.get_member_bindings_by_game_ids = AsyncMock(return_value=bindings)

        result = await service.get_line_names_for_game_ids(ALLIANCE_ID, ["張飛", "關羽"])

        assert result == {"張飛": "BigBro", "關羽": "RedFace"}

    @pytest.mark.asyncio
    async def test_returns_empty_dict_when_no_bindings(
        self, service: LineBindingService, mock_repository: MagicMock
    ):
        """Should return an empty dict when repository returns no bindings."""
        mock_repository.get_member_bindings_by_game_ids = AsyncMock(return_value=[])

        result = await service.get_line_names_for_game_ids(ALLIANCE_ID, ["未綁定成員"])

        assert result == {}

    @pytest.mark.asyncio
    async def test_passes_correct_args_to_repository(
        self, service: LineBindingService, mock_repository: MagicMock
    ):
        """Should pass alliance_id and game_ids correctly to the repository."""
        mock_repository.get_member_bindings_by_game_ids = AsyncMock(return_value=[])
        game_ids = ["A", "B", "C"]

        await service.get_line_names_for_game_ids(ALLIANCE_ID, game_ids)

        mock_repository.get_member_bindings_by_game_ids.assert_called_once_with(
            alliance_id=ALLIANCE_ID,
            game_ids=game_ids,
        )


# =============================================================================
# Tests for enrich_analytics_with_line_names()
# =============================================================================


def _make_top_member(member_name: str, rank: int = 1) -> TopMemberItem:
    return TopMemberItem(
        rank=rank,
        member_name=member_name,
        score=1000,
        line_display_name=None,
    )


def _make_violator(member_name: str, rank: int = 1) -> ViolatorItem:
    return ViolatorItem(
        rank=rank,
        member_name=member_name,
        power_diff=500,
        line_display_name=None,
    )


def _make_analytics(
    top_members: list[TopMemberItem] | None = None,
    top_contributors: list[TopMemberItem] | None = None,
    top_assisters: list[TopMemberItem] | None = None,
    violators: list[ViolatorItem] | None = None,
) -> EventGroupAnalytics:
    summary = EventSummary(
        total_members=0,
        participated_count=0,
        absent_count=0,
        new_member_count=0,
        participation_rate=0.0,
        total_merit=0,
        avg_merit=0.0,
        total_assist=0,
        avg_assist=0.0,
        total_contribution=0,
        avg_contribution=0.0,
        violator_count=0,
    )
    return EventGroupAnalytics(
        event_id=UUID("eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee"),
        event_name="Test Event",
        summary=summary,
        top_members=top_members or [],
        top_contributors=top_contributors or [],
        top_assisters=top_assisters or [],
        violators=violators or [],
    )


class TestEnrichAnalyticsWithLineNames:
    """Tests for LineBindingService.enrich_analytics_with_line_names()."""

    @pytest.mark.asyncio
    async def test_mutates_line_display_name_on_top_members(
        self, service: LineBindingService, mock_repository: MagicMock
    ):
        """Should set line_display_name on top_members entries that have a binding."""
        analytics = _make_analytics(top_members=[_make_top_member("張飛")])
        binding = MagicMock()
        binding.game_id = "張飛"
        binding.line_display_name = "BigBro"
        mock_repository.get_member_bindings_by_game_ids = AsyncMock(return_value=[binding])

        await service.enrich_analytics_with_line_names(ALLIANCE_ID, analytics)

        assert analytics.top_members[0].line_display_name == "BigBro"

    @pytest.mark.asyncio
    async def test_mutates_violators_line_display_name(
        self, service: LineBindingService, mock_repository: MagicMock
    ):
        """Should set line_display_name on violators entries."""
        analytics = _make_analytics(violators=[_make_violator("曹操")])
        binding = MagicMock()
        binding.game_id = "曹操"
        binding.line_display_name = "CaoCao"
        mock_repository.get_member_bindings_by_game_ids = AsyncMock(return_value=[binding])

        await service.enrich_analytics_with_line_names(ALLIANCE_ID, analytics)

        assert analytics.violators[0].line_display_name == "CaoCao"

    @pytest.mark.asyncio
    async def test_deduplicates_game_ids_before_fetching(
        self, service: LineBindingService, mock_repository: MagicMock
    ):
        """Should deduplicate game_ids so the same name is only fetched once."""
        # Same member appears in both top_members and top_contributors
        analytics = _make_analytics(
            top_members=[_make_top_member("張飛", rank=1)],
            top_contributors=[_make_top_member("張飛", rank=1)],
        )
        mock_repository.get_member_bindings_by_game_ids = AsyncMock(return_value=[])

        await service.enrich_analytics_with_line_names(ALLIANCE_ID, analytics)

        call_args = mock_repository.get_member_bindings_by_game_ids.call_args
        fetched_ids = call_args.kwargs.get("game_ids") or call_args.args[1]
        # After deduplication, "張飛" should appear exactly once
        assert fetched_ids.count("張飛") == 1

    @pytest.mark.asyncio
    async def test_returns_immediately_when_all_lists_empty(
        self, service: LineBindingService, mock_repository: MagicMock
    ):
        """Should not call repository at all when there are no members in any list."""
        analytics = _make_analytics()
        mock_repository.get_member_bindings_by_game_ids = AsyncMock(return_value=[])

        await service.enrich_analytics_with_line_names(ALLIANCE_ID, analytics)

        mock_repository.get_member_bindings_by_game_ids.assert_not_called()

    @pytest.mark.asyncio
    async def test_leaves_none_for_unbound_members(
        self, service: LineBindingService, mock_repository: MagicMock
    ):
        """Members without a LINE binding should keep line_display_name as None."""
        analytics = _make_analytics(top_members=[_make_top_member("無名氏")])
        # Repository returns no bindings for "無名氏"
        mock_repository.get_member_bindings_by_game_ids = AsyncMock(return_value=[])

        await service.enrich_analytics_with_line_names(ALLIANCE_ID, analytics)

        assert analytics.top_members[0].line_display_name is None

    @pytest.mark.asyncio
    async def test_enriches_all_four_ranking_lists(
        self, service: LineBindingService, mock_repository: MagicMock
    ):
        """Should enrich top_members, top_contributors, top_assisters, and violators."""
        analytics = _make_analytics(
            top_members=[_make_top_member("A")],
            top_contributors=[_make_top_member("B")],
            top_assisters=[_make_top_member("C")],
            violators=[_make_violator("D")],
        )

        def _binding(game_id: str, name: str) -> MagicMock:
            b = MagicMock()
            b.game_id = game_id
            b.line_display_name = name
            return b

        mock_repository.get_member_bindings_by_game_ids = AsyncMock(
            return_value=[
                _binding("A", "Line-A"),
                _binding("B", "Line-B"),
                _binding("C", "Line-C"),
                _binding("D", "Line-D"),
            ]
        )

        await service.enrich_analytics_with_line_names(ALLIANCE_ID, analytics)

        assert analytics.top_members[0].line_display_name == "Line-A"
        assert analytics.top_contributors[0].line_display_name == "Line-B"
        assert analytics.top_assisters[0].line_display_name == "Line-C"
        assert analytics.violators[0].line_display_name == "Line-D"
