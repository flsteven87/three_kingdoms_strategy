"""
Unit Tests for SeasonService

Tests cover:
1. Season retrieval (get_seasons, get_season, get_active_season)
2. Season creation (create_season)
3. Active season management (set_active_season)
4. User access verification (verify_user_access)
5. Error handling and permission checking

符合 test-writing skill 規範:
- AAA pattern (Arrange-Act-Assert)
- Mocked repository dependencies
- Coverage: happy path + edge cases + error cases
"""

from datetime import date, datetime
from unittest.mock import AsyncMock, MagicMock
from uuid import UUID, uuid4

import pytest

from src.models.season import Season, SeasonCreate
from src.services.season_service import SeasonService

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
def season_id() -> UUID:
    """Fixed season UUID for testing"""
    return UUID("33333333-3333-3333-3333-333333333333")


@pytest.fixture
def mock_season_repo() -> MagicMock:
    """Create mock season repository"""
    return MagicMock()


@pytest.fixture
def mock_alliance_repo() -> MagicMock:
    """Create mock alliance repository"""
    return MagicMock()


@pytest.fixture
def mock_permission_service() -> MagicMock:
    """Create mock permission service"""
    return MagicMock()


@pytest.fixture
def season_service(
    mock_season_repo: MagicMock,
    mock_alliance_repo: MagicMock,
    mock_permission_service: MagicMock,
) -> SeasonService:
    """Create SeasonService with mocked dependencies"""
    service = SeasonService()
    service._repo = mock_season_repo
    service._alliance_repo = mock_alliance_repo
    service._permission_service = mock_permission_service
    return service


def create_mock_season(
    season_id: UUID,
    alliance_id: UUID,
    name: str = "S1",
    is_active: bool = True,
) -> Season:
    """Factory for creating mock Season objects"""
    return Season(
        id=season_id,
        alliance_id=alliance_id,
        name=name,
        start_date=date(2025, 1, 1),
        end_date=None,
        is_active=is_active,
        description=None,
        created_at=datetime.now(),
        updated_at=datetime.now(),
    )


def create_mock_alliance(alliance_id: UUID) -> MagicMock:
    """Factory for creating mock Alliance objects"""
    alliance = MagicMock()
    alliance.id = alliance_id
    return alliance


# =============================================================================
# Tests for verify_user_access
# =============================================================================


class TestVerifyUserAccess:
    """Tests for SeasonService.verify_user_access"""

    @pytest.mark.asyncio
    async def test_should_return_alliance_id_when_user_has_access(
        self,
        season_service: SeasonService,
        mock_season_repo: MagicMock,
        mock_permission_service: MagicMock,
        user_id: UUID,
        alliance_id: UUID,
        season_id: UUID,
    ):
        """Should return alliance_id when user has valid access"""
        # Arrange
        mock_season = create_mock_season(season_id, alliance_id)
        mock_season_repo.get_by_id = AsyncMock(return_value=mock_season)
        mock_permission_service.get_user_role = AsyncMock(return_value="owner")

        # Act
        result = await season_service.verify_user_access(user_id, season_id)

        # Assert
        assert result == alliance_id
        mock_season_repo.get_by_id.assert_called_once_with(season_id)
        mock_permission_service.get_user_role.assert_called_once_with(user_id, alliance_id)

    @pytest.mark.asyncio
    async def test_should_raise_valueerror_when_season_not_found(
        self,
        season_service: SeasonService,
        mock_season_repo: MagicMock,
        user_id: UUID,
        season_id: UUID,
    ):
        """Should raise ValueError when season doesn't exist"""
        # Arrange
        mock_season_repo.get_by_id = AsyncMock(return_value=None)

        # Act & Assert
        with pytest.raises(ValueError) as exc_info:
            await season_service.verify_user_access(user_id, season_id)
        assert "Season not found" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_should_raise_permissionerror_when_user_not_member(
        self,
        season_service: SeasonService,
        mock_season_repo: MagicMock,
        mock_permission_service: MagicMock,
        user_id: UUID,
        alliance_id: UUID,
        season_id: UUID,
    ):
        """Should raise PermissionError when user is not alliance member"""
        # Arrange
        mock_season = create_mock_season(season_id, alliance_id)
        mock_season_repo.get_by_id = AsyncMock(return_value=mock_season)
        mock_permission_service.get_user_role = AsyncMock(return_value=None)

        # Act & Assert
        with pytest.raises(PermissionError) as exc_info:
            await season_service.verify_user_access(user_id, season_id)
        assert "not a member" in str(exc_info.value)


# =============================================================================
# Tests for get_seasons
# =============================================================================


class TestGetSeasons:
    """Tests for SeasonService.get_seasons"""

    @pytest.mark.asyncio
    async def test_should_return_all_seasons_for_user_alliance(
        self,
        season_service: SeasonService,
        mock_season_repo: MagicMock,
        mock_alliance_repo: MagicMock,
        user_id: UUID,
        alliance_id: UUID,
    ):
        """Should return all seasons for user's alliance"""
        # Arrange
        mock_alliance = create_mock_alliance(alliance_id)
        mock_alliance_repo.get_by_collaborator = AsyncMock(return_value=mock_alliance)

        seasons = [
            create_mock_season(uuid4(), alliance_id, "S1"),
            create_mock_season(uuid4(), alliance_id, "S2"),
        ]
        mock_season_repo.get_by_alliance = AsyncMock(return_value=seasons)

        # Act
        result = await season_service.get_seasons(user_id)

        # Assert
        assert len(result) == 2
        mock_alliance_repo.get_by_collaborator.assert_called_once_with(user_id)
        mock_season_repo.get_by_alliance.assert_called_once_with(alliance_id, active_only=False)

    @pytest.mark.asyncio
    async def test_should_return_only_active_seasons_when_active_only_true(
        self,
        season_service: SeasonService,
        mock_season_repo: MagicMock,
        mock_alliance_repo: MagicMock,
        user_id: UUID,
        alliance_id: UUID,
    ):
        """Should filter to active seasons only when requested"""
        # Arrange
        mock_alliance = create_mock_alliance(alliance_id)
        mock_alliance_repo.get_by_collaborator = AsyncMock(return_value=mock_alliance)
        mock_season_repo.get_by_alliance = AsyncMock(return_value=[])

        # Act
        await season_service.get_seasons(user_id, active_only=True)

        # Assert
        mock_season_repo.get_by_alliance.assert_called_once_with(alliance_id, active_only=True)

    @pytest.mark.asyncio
    async def test_should_raise_valueerror_when_user_has_no_alliance(
        self,
        season_service: SeasonService,
        mock_alliance_repo: MagicMock,
        user_id: UUID,
    ):
        """Should raise ValueError when user has no alliance"""
        # Arrange
        mock_alliance_repo.get_by_collaborator = AsyncMock(return_value=None)

        # Act & Assert
        with pytest.raises(ValueError) as exc_info:
            await season_service.get_seasons(user_id)
        assert "no alliance" in str(exc_info.value)


# =============================================================================
# Tests for get_season
# =============================================================================


class TestGetSeason:
    """Tests for SeasonService.get_season"""

    @pytest.mark.asyncio
    async def test_should_return_season_when_user_owns_it(
        self,
        season_service: SeasonService,
        mock_season_repo: MagicMock,
        mock_alliance_repo: MagicMock,
        user_id: UUID,
        alliance_id: UUID,
        season_id: UUID,
    ):
        """Should return season when user is alliance member"""
        # Arrange
        mock_alliance = create_mock_alliance(alliance_id)
        mock_alliance_repo.get_by_collaborator = AsyncMock(return_value=mock_alliance)

        mock_season = create_mock_season(season_id, alliance_id)
        mock_season_repo.get_by_id = AsyncMock(return_value=mock_season)

        # Act
        result = await season_service.get_season(user_id, season_id)

        # Assert
        assert result.id == season_id
        assert result.alliance_id == alliance_id

    @pytest.mark.asyncio
    async def test_should_raise_valueerror_when_season_not_found(
        self,
        season_service: SeasonService,
        mock_season_repo: MagicMock,
        mock_alliance_repo: MagicMock,
        user_id: UUID,
        alliance_id: UUID,
        season_id: UUID,
    ):
        """Should raise ValueError when season doesn't exist"""
        # Arrange
        mock_alliance = create_mock_alliance(alliance_id)
        mock_alliance_repo.get_by_collaborator = AsyncMock(return_value=mock_alliance)
        mock_season_repo.get_by_id = AsyncMock(return_value=None)

        # Act & Assert
        with pytest.raises(ValueError) as exc_info:
            await season_service.get_season(user_id, season_id)
        assert "Season not found" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_should_raise_permissionerror_when_season_belongs_to_different_alliance(
        self,
        season_service: SeasonService,
        mock_season_repo: MagicMock,
        mock_alliance_repo: MagicMock,
        user_id: UUID,
        alliance_id: UUID,
        season_id: UUID,
    ):
        """Should raise PermissionError when season belongs to different alliance"""
        # Arrange
        mock_alliance = create_mock_alliance(alliance_id)
        mock_alliance_repo.get_by_collaborator = AsyncMock(return_value=mock_alliance)

        different_alliance_id = uuid4()
        mock_season = create_mock_season(season_id, different_alliance_id)
        mock_season_repo.get_by_id = AsyncMock(return_value=mock_season)

        # Act & Assert
        with pytest.raises(PermissionError) as exc_info:
            await season_service.get_season(user_id, season_id)
        assert "does not have permission" in str(exc_info.value)


# =============================================================================
# Tests for get_active_season
# =============================================================================


class TestGetActiveSeason:
    """Tests for SeasonService.get_active_season"""

    @pytest.mark.asyncio
    async def test_should_return_active_season_when_exists(
        self,
        season_service: SeasonService,
        mock_season_repo: MagicMock,
        mock_alliance_repo: MagicMock,
        user_id: UUID,
        alliance_id: UUID,
        season_id: UUID,
    ):
        """Should return active season when one exists"""
        # Arrange
        mock_alliance = create_mock_alliance(alliance_id)
        mock_alliance_repo.get_by_collaborator = AsyncMock(return_value=mock_alliance)

        mock_season = create_mock_season(season_id, alliance_id, is_active=True)
        mock_season_repo.get_active_season = AsyncMock(return_value=mock_season)

        # Act
        result = await season_service.get_active_season(user_id)

        # Assert
        assert result is not None
        assert result.is_active is True
        mock_season_repo.get_active_season.assert_called_once_with(alliance_id)

    @pytest.mark.asyncio
    async def test_should_return_none_when_no_active_season(
        self,
        season_service: SeasonService,
        mock_season_repo: MagicMock,
        mock_alliance_repo: MagicMock,
        user_id: UUID,
        alliance_id: UUID,
    ):
        """Should return None when no active season exists"""
        # Arrange
        mock_alliance = create_mock_alliance(alliance_id)
        mock_alliance_repo.get_by_collaborator = AsyncMock(return_value=mock_alliance)
        mock_season_repo.get_active_season = AsyncMock(return_value=None)

        # Act
        result = await season_service.get_active_season(user_id)

        # Assert
        assert result is None


# =============================================================================
# Tests for create_season
# =============================================================================


class TestCreateSeason:
    """Tests for SeasonService.create_season"""

    @pytest.mark.asyncio
    async def test_should_create_season_when_user_has_permission(
        self,
        season_service: SeasonService,
        mock_season_repo: MagicMock,
        mock_alliance_repo: MagicMock,
        mock_permission_service: MagicMock,
        user_id: UUID,
        alliance_id: UUID,
    ):
        """Should create season when user has owner/collaborator permission"""
        # Arrange
        mock_alliance = create_mock_alliance(alliance_id)
        mock_alliance_repo.get_by_collaborator = AsyncMock(return_value=mock_alliance)
        mock_permission_service.require_write_permission = AsyncMock()

        season_data = SeasonCreate(
            alliance_id=alliance_id,
            name="S1",
            start_date=date(2025, 1, 1),
        )

        created_season = create_mock_season(uuid4(), alliance_id, "S1")
        mock_season_repo.create = AsyncMock(return_value=created_season)

        # Act
        result = await season_service.create_season(user_id, season_data)

        # Assert
        assert result.name == "S1"
        mock_permission_service.require_write_permission.assert_called_once_with(
            user_id, alliance_id, "create seasons"
        )
        mock_season_repo.create.assert_called_once()

    @pytest.mark.asyncio
    async def test_should_raise_permissionerror_when_alliance_mismatch(
        self,
        season_service: SeasonService,
        mock_alliance_repo: MagicMock,
        user_id: UUID,
        alliance_id: UUID,
    ):
        """Should raise PermissionError when trying to create season for different alliance"""
        # Arrange
        mock_alliance = create_mock_alliance(alliance_id)
        mock_alliance_repo.get_by_collaborator = AsyncMock(return_value=mock_alliance)

        different_alliance_id = uuid4()
        season_data = SeasonCreate(
            alliance_id=different_alliance_id,
            name="S1",
            start_date=date(2025, 1, 1),
        )

        # Act & Assert
        with pytest.raises(PermissionError) as exc_info:
            await season_service.create_season(user_id, season_data)
        assert "different alliance" in str(exc_info.value)


# =============================================================================
# Tests for set_active_season
# =============================================================================


class TestSetActiveSeason:
    """Tests for SeasonService.set_active_season"""

    @pytest.mark.asyncio
    async def test_should_deactivate_other_seasons_and_activate_target(
        self,
        season_service: SeasonService,
        mock_season_repo: MagicMock,
        mock_alliance_repo: MagicMock,
        mock_permission_service: MagicMock,
        user_id: UUID,
        alliance_id: UUID,
        season_id: UUID,
    ):
        """Should deactivate all seasons and activate the target season"""
        # Arrange
        mock_alliance = create_mock_alliance(alliance_id)
        mock_alliance_repo.get_by_collaborator = AsyncMock(return_value=mock_alliance)

        target_season = create_mock_season(season_id, alliance_id, "S2", is_active=False)
        other_season = create_mock_season(uuid4(), alliance_id, "S1", is_active=True)

        mock_season_repo.get_by_id = AsyncMock(return_value=target_season)
        mock_season_repo.get_by_alliance = AsyncMock(return_value=[target_season, other_season])
        mock_season_repo.update = AsyncMock(return_value=target_season)
        mock_permission_service.require_owner_or_collaborator = AsyncMock()
        mock_permission_service.require_write_permission = AsyncMock()

        # Mock subscription service (added to service for write operations)
        mock_subscription_service = MagicMock()
        mock_subscription_service.require_write_access = AsyncMock()
        season_service._subscription_service = mock_subscription_service

        # Act
        await season_service.set_active_season(user_id, season_id)

        # Assert - other season should be deactivated
        deactivate_calls = [
            call
            for call in mock_season_repo.update.call_args_list
            if call[0][1] == {"is_active": False}
        ]
        assert len(deactivate_calls) >= 1

        # Assert - target season should be activated
        activate_calls = [
            call
            for call in mock_season_repo.update.call_args_list
            if call[0][1] == {"is_active": True}
        ]
        assert len(activate_calls) == 1
        assert activate_calls[0][0][0] == season_id

    @pytest.mark.asyncio
    async def test_should_raise_valueerror_when_user_has_no_alliance(
        self,
        season_service: SeasonService,
        mock_alliance_repo: MagicMock,
        user_id: UUID,
        season_id: UUID,
    ):
        """Should raise ValueError when user has no alliance"""
        # Arrange
        mock_alliance_repo.get_by_collaborator = AsyncMock(return_value=None)

        # Act & Assert
        with pytest.raises(ValueError) as exc_info:
            await season_service.set_active_season(user_id, season_id)
        assert "no alliance" in str(exc_info.value)
