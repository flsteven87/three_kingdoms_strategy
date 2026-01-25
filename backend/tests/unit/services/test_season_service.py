"""
Unit Tests for SeasonService

Tests cover:
1. Season retrieval (get_seasons, get_season, get_current_season)
2. Season creation (create_season)
3. Active season management (set_current_season)
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
    is_current: bool = False,
    activation_status: str = "activated",
) -> Season:
    """Factory for creating mock Season objects"""
    return Season(
        id=season_id,
        alliance_id=alliance_id,
        name=name,
        start_date=date(2025, 1, 1),
        end_date=None,
        is_current=is_current,
        activation_status=activation_status,
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
        mock_season_repo.get_by_alliance.assert_called_once_with(alliance_id, activated_only=False)

    @pytest.mark.asyncio
    async def test_should_return_only_active_seasons_when_activated_only_true(
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
        await season_service.get_seasons(user_id, activated_only=True)

        # Assert
        mock_season_repo.get_by_alliance.assert_called_once_with(alliance_id, activated_only=True)

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
# Tests for get_current_season
# =============================================================================


class TestGetActiveSeason:
    """Tests for SeasonService.get_current_season"""

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

        mock_season = create_mock_season(season_id, alliance_id, is_current=True)
        mock_season_repo.get_current_season = AsyncMock(return_value=mock_season)

        # Act
        result = await season_service.get_current_season(user_id)

        # Assert
        assert result is not None
        assert result.is_current is True
        mock_season_repo.get_current_season.assert_called_once_with(alliance_id)

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
        mock_season_repo.get_current_season = AsyncMock(return_value=None)

        # Act
        result = await season_service.get_current_season(user_id)

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
        mock_permission_service.require_role_permission = AsyncMock()

        season_data = SeasonCreate(
            alliance_id=alliance_id,
            name="S1",
            start_date=date(2025, 1, 1),
        )

        created_season = create_mock_season(uuid4(), alliance_id, "S1", activation_status="draft")
        mock_season_repo.create = AsyncMock(return_value=created_season)
        mock_season_repo.get_by_alliance = AsyncMock(return_value=[])  # No existing seasons

        # Act
        result = await season_service.create_season(user_id, season_data)

        # Assert
        assert result.name == "S1"
        mock_permission_service.require_role_permission.assert_called_once_with(
            user_id, alliance_id
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
# Tests for set_current_season
# =============================================================================


class TestSetCurrentSeason:
    """Tests for SeasonService.set_current_season"""

    @pytest.mark.asyncio
    async def test_should_set_activated_season_as_current(
        self,
        season_service: SeasonService,
        mock_season_repo: MagicMock,
        mock_alliance_repo: MagicMock,
        mock_permission_service: MagicMock,
        user_id: UUID,
        alliance_id: UUID,
        season_id: UUID,
    ):
        """Should set an activated season as current and unset others"""
        # Arrange
        mock_alliance = create_mock_alliance(alliance_id)
        mock_alliance_repo.get_by_collaborator = AsyncMock(return_value=mock_alliance)

        other_season_id = uuid4()
        target_season = create_mock_season(
            season_id, alliance_id, "S2", is_current=False, activation_status="activated"
        )
        other_season = create_mock_season(
            other_season_id, alliance_id, "S1", is_current=True, activation_status="activated"
        )

        mock_season_repo.get_by_id = AsyncMock(return_value=target_season)
        mock_season_repo.get_by_alliance = AsyncMock(return_value=[target_season, other_season])
        mock_season_repo.update = AsyncMock(return_value=target_season)
        mock_permission_service.require_role_permission = AsyncMock()

        # Act
        await season_service.set_current_season(user_id, season_id)

        # Assert - other season should have is_current set to False
        unset_calls = [
            call
            for call in mock_season_repo.update.call_args_list
            if call[0][1] == {"is_current": False}
        ]
        assert len(unset_calls) == 1
        assert unset_calls[0][0][0] == other_season_id

        # Assert - target season should have is_current set to True
        set_calls = [
            call
            for call in mock_season_repo.update.call_args_list
            if call[0][1] == {"is_current": True}
        ]
        assert len(set_calls) == 1
        assert set_calls[0][0][0] == season_id

    @pytest.mark.asyncio
    async def test_should_raise_valueerror_when_season_not_activated(
        self,
        season_service: SeasonService,
        mock_season_repo: MagicMock,
        mock_alliance_repo: MagicMock,
        user_id: UUID,
        alliance_id: UUID,
        season_id: UUID,
    ):
        """Should raise ValueError when trying to set draft season as current"""
        # Arrange
        mock_alliance = create_mock_alliance(alliance_id)
        mock_alliance_repo.get_by_collaborator = AsyncMock(return_value=mock_alliance)

        draft_season = create_mock_season(
            season_id, alliance_id, "S1", is_current=False, activation_status="draft"
        )
        mock_season_repo.get_by_id = AsyncMock(return_value=draft_season)

        # Act & Assert
        with pytest.raises(ValueError) as exc_info:
            await season_service.set_current_season(user_id, season_id)
        assert "activate" in str(exc_info.value).lower()

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
            await season_service.set_current_season(user_id, season_id)
        assert "no alliance" in str(exc_info.value)


# =============================================================================
# Tests for activate_season
# =============================================================================


class TestActivateSeason:
    """Tests for SeasonService.activate_season"""

    @pytest.fixture
    def mock_season_quota_service(self) -> MagicMock:
        """Create mock season quota service"""
        return MagicMock()

    @pytest.mark.asyncio
    async def test_should_activate_draft_season_using_trial(
        self,
        season_service: SeasonService,
        mock_season_repo: MagicMock,
        mock_alliance_repo: MagicMock,
        mock_season_quota_service: MagicMock,
        user_id: UUID,
        alliance_id: UUID,
        season_id: UUID,
    ):
        """Should activate draft season and use trial for first activation"""
        # Arrange
        mock_alliance = create_mock_alliance(alliance_id)
        mock_alliance_repo.get_by_collaborator = AsyncMock(return_value=mock_alliance)

        draft_season = create_mock_season(
            season_id, alliance_id, "S1", is_current=False, activation_status="draft"
        )
        mock_season_repo.get_by_id = AsyncMock(return_value=draft_season)
        mock_season_repo.get_by_alliance = AsyncMock(return_value=[])

        activated_season = create_mock_season(
            season_id, alliance_id, "S1", is_current=False, activation_status="activated"
        )
        mock_season_repo.update = AsyncMock(return_value=activated_season)

        # Mock quota service
        mock_season_quota_service.require_season_activation = AsyncMock()
        mock_season_quota_service.consume_season = AsyncMock(
            return_value=(0, True, "2026-02-08T00:00:00+00:00")
        )
        season_service._season_quota_service = mock_season_quota_service

        # Act
        result = await season_service.activate_season(user_id, season_id)

        # Assert
        assert result.success is True
        assert result.used_trial is True
        assert result.trial_ends_at is not None
        mock_season_quota_service.require_season_activation.assert_called_once_with(alliance_id)
        mock_season_quota_service.consume_season.assert_called_once_with(alliance_id)

    @pytest.mark.asyncio
    async def test_should_activate_draft_season_using_purchased_quota(
        self,
        season_service: SeasonService,
        mock_season_repo: MagicMock,
        mock_alliance_repo: MagicMock,
        mock_season_quota_service: MagicMock,
        user_id: UUID,
        alliance_id: UUID,
        season_id: UUID,
    ):
        """Should activate draft season using purchased quota"""
        # Arrange
        mock_alliance = create_mock_alliance(alliance_id)
        mock_alliance_repo.get_by_collaborator = AsyncMock(return_value=mock_alliance)

        draft_season = create_mock_season(
            season_id, alliance_id, "S2", is_current=False, activation_status="draft"
        )
        mock_season_repo.get_by_id = AsyncMock(return_value=draft_season)
        mock_season_repo.get_by_alliance = AsyncMock(return_value=[])

        activated_season = create_mock_season(
            season_id, alliance_id, "S2", is_current=False, activation_status="activated"
        )
        mock_season_repo.update = AsyncMock(return_value=activated_season)

        # Mock quota service - using purchased quota
        mock_season_quota_service.require_season_activation = AsyncMock()
        mock_season_quota_service.consume_season = AsyncMock(
            return_value=(4, False, None)  # 4 remaining, not trial
        )
        season_service._season_quota_service = mock_season_quota_service

        # Act
        result = await season_service.activate_season(user_id, season_id)

        # Assert
        assert result.success is True
        assert result.used_trial is False
        assert result.remaining_seasons == 4
        assert result.trial_ends_at is None

    @pytest.mark.asyncio
    async def test_should_raise_valueerror_when_season_already_activated(
        self,
        season_service: SeasonService,
        mock_season_repo: MagicMock,
        mock_alliance_repo: MagicMock,
        user_id: UUID,
        alliance_id: UUID,
        season_id: UUID,
    ):
        """Should raise ValueError when trying to activate non-draft season"""
        # Arrange
        mock_alliance = create_mock_alliance(alliance_id)
        mock_alliance_repo.get_by_collaborator = AsyncMock(return_value=mock_alliance)

        activated_season = create_mock_season(
            season_id, alliance_id, "S1", is_current=True, activation_status="activated"
        )
        mock_season_repo.get_by_id = AsyncMock(return_value=activated_season)

        # Act & Assert
        with pytest.raises(ValueError) as exc_info:
            await season_service.activate_season(user_id, season_id)
        assert "already activated" in str(exc_info.value)


# =============================================================================
# Tests for update_season
# =============================================================================


class TestUpdateSeason:
    """Tests for SeasonService.update_season"""

    @pytest.mark.asyncio
    async def test_should_update_draft_season_all_fields(
        self,
        season_service: SeasonService,
        mock_season_repo: MagicMock,
        mock_alliance_repo: MagicMock,
        mock_permission_service: MagicMock,
        user_id: UUID,
        alliance_id: UUID,
        season_id: UUID,
    ):
        """Should allow updating all fields for draft season"""
        # Arrange
        from src.models.season import SeasonUpdate

        mock_alliance = create_mock_alliance(alliance_id)
        mock_alliance_repo.get_by_collaborator = AsyncMock(return_value=mock_alliance)
        mock_permission_service.require_role_permission = AsyncMock()

        draft_season = create_mock_season(
            season_id, alliance_id, "Old Name", is_current=False, activation_status="draft"
        )
        mock_season_repo.get_by_id = AsyncMock(return_value=draft_season)
        mock_season_repo.get_by_alliance = AsyncMock(return_value=[draft_season])

        updated_season = create_mock_season(
            season_id, alliance_id, "New Name", is_current=False, activation_status="draft"
        )
        mock_season_repo.update = AsyncMock(return_value=updated_season)

        update_data = SeasonUpdate(name="New Name", start_date=date(2025, 2, 1))

        # Act
        result = await season_service.update_season(user_id, season_id, update_data)

        # Assert
        assert result.name == "New Name"
        mock_season_repo.update.assert_called_once()

    @pytest.mark.asyncio
    async def test_should_raise_when_updating_start_date_on_activated_season(
        self,
        season_service: SeasonService,
        mock_season_repo: MagicMock,
        mock_alliance_repo: MagicMock,
        mock_permission_service: MagicMock,
        user_id: UUID,
        alliance_id: UUID,
        season_id: UUID,
    ):
        """Should raise ValueError when trying to update start_date on activated season"""
        # Arrange
        from src.models.season import SeasonUpdate

        mock_alliance = create_mock_alliance(alliance_id)
        mock_alliance_repo.get_by_collaborator = AsyncMock(return_value=mock_alliance)
        mock_permission_service.require_role_permission = AsyncMock()

        activated_season = create_mock_season(
            season_id, alliance_id, "S1", is_current=True, activation_status="activated"
        )
        mock_season_repo.get_by_id = AsyncMock(return_value=activated_season)

        update_data = SeasonUpdate(start_date=date(2025, 3, 1))

        # Act & Assert
        with pytest.raises(ValueError) as exc_info:
            await season_service.update_season(user_id, season_id, update_data)
        assert "無法修改開始日期" in str(exc_info.value)


# =============================================================================
# Tests for delete_season
# =============================================================================


class TestDeleteSeason:
    """Tests for SeasonService.delete_season"""

    @pytest.mark.asyncio
    async def test_should_delete_draft_season(
        self,
        season_service: SeasonService,
        mock_season_repo: MagicMock,
        mock_alliance_repo: MagicMock,
        mock_permission_service: MagicMock,
        user_id: UUID,
        alliance_id: UUID,
        season_id: UUID,
    ):
        """Should successfully delete a draft season"""
        # Arrange
        mock_alliance = create_mock_alliance(alliance_id)
        mock_alliance_repo.get_by_collaborator = AsyncMock(return_value=mock_alliance)
        mock_permission_service.require_role_permission = AsyncMock()

        draft_season = create_mock_season(
            season_id, alliance_id, "S1", is_current=False, activation_status="draft"
        )
        mock_season_repo.get_by_id = AsyncMock(return_value=draft_season)
        mock_season_repo.delete = AsyncMock(return_value=True)

        # Act
        result = await season_service.delete_season(user_id, season_id)

        # Assert
        assert result is True
        mock_season_repo.delete.assert_called_once_with(season_id)

    @pytest.mark.asyncio
    async def test_should_raise_when_deleting_activated_season(
        self,
        season_service: SeasonService,
        mock_season_repo: MagicMock,
        mock_alliance_repo: MagicMock,
        user_id: UUID,
        alliance_id: UUID,
        season_id: UUID,
    ):
        """Should raise ValueError when trying to delete activated season"""
        # Arrange
        mock_alliance = create_mock_alliance(alliance_id)
        mock_alliance_repo.get_by_collaborator = AsyncMock(return_value=mock_alliance)

        activated_season = create_mock_season(
            season_id, alliance_id, "S1", is_current=True, activation_status="activated"
        )
        mock_season_repo.get_by_id = AsyncMock(return_value=activated_season)

        # Act & Assert
        with pytest.raises(ValueError) as exc_info:
            await season_service.delete_season(user_id, season_id)
        assert "已啟用" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_should_raise_when_deleting_completed_season(
        self,
        season_service: SeasonService,
        mock_season_repo: MagicMock,
        mock_alliance_repo: MagicMock,
        user_id: UUID,
        alliance_id: UUID,
        season_id: UUID,
    ):
        """Should raise ValueError when trying to delete completed season"""
        # Arrange
        mock_alliance = create_mock_alliance(alliance_id)
        mock_alliance_repo.get_by_collaborator = AsyncMock(return_value=mock_alliance)

        completed_season = create_mock_season(
            season_id, alliance_id, "S1", is_current=False, activation_status="completed"
        )
        mock_season_repo.get_by_id = AsyncMock(return_value=completed_season)

        # Act & Assert
        with pytest.raises(ValueError) as exc_info:
            await season_service.delete_season(user_id, season_id)
        assert "已完成" in str(exc_info.value)


# =============================================================================
# Tests for complete_season
# =============================================================================


class TestCompleteSeason:
    """Tests for SeasonService.complete_season"""

    @pytest.mark.asyncio
    async def test_should_complete_activated_season(
        self,
        season_service: SeasonService,
        mock_season_repo: MagicMock,
        mock_alliance_repo: MagicMock,
        mock_permission_service: MagicMock,
        user_id: UUID,
        alliance_id: UUID,
        season_id: UUID,
    ):
        """Should successfully complete an activated season"""
        # Arrange
        mock_alliance = create_mock_alliance(alliance_id)
        mock_alliance_repo.get_by_collaborator = AsyncMock(return_value=mock_alliance)
        mock_permission_service.require_role_permission = AsyncMock()

        activated_season = create_mock_season(
            season_id, alliance_id, "S1", is_current=False, activation_status="activated"
        )
        mock_season_repo.get_by_id = AsyncMock(return_value=activated_season)

        completed_season = create_mock_season(
            season_id, alliance_id, "S1", is_current=False, activation_status="completed"
        )
        mock_season_repo.update = AsyncMock(return_value=completed_season)

        # Act
        result = await season_service.complete_season(user_id, season_id)

        # Assert
        assert result.activation_status == "completed"
        mock_season_repo.update.assert_called_once()
        update_args = mock_season_repo.update.call_args[0]
        assert update_args[1]["activation_status"] == "completed"

    @pytest.mark.asyncio
    async def test_should_keep_current_when_completing_current_season(
        self,
        season_service: SeasonService,
        mock_season_repo: MagicMock,
        mock_alliance_repo: MagicMock,
        mock_permission_service: MagicMock,
        user_id: UUID,
        alliance_id: UUID,
        season_id: UUID,
    ):
        """Should keep is_current when completing the current season (for viewing)"""
        # Arrange
        mock_alliance = create_mock_alliance(alliance_id)
        mock_alliance_repo.get_by_collaborator = AsyncMock(return_value=mock_alliance)
        mock_permission_service.require_role_permission = AsyncMock()

        current_season = create_mock_season(
            season_id, alliance_id, "S1", is_current=True, activation_status="activated"
        )
        mock_season_repo.get_by_id = AsyncMock(return_value=current_season)

        # Note: is_current remains True (completed seasons can still be viewed)
        completed_season = create_mock_season(
            season_id, alliance_id, "S1", is_current=True, activation_status="completed"
        )
        mock_season_repo.update = AsyncMock(return_value=completed_season)

        # Act
        await season_service.complete_season(user_id, season_id)

        # Assert - only activation_status should be updated, not is_current
        update_args = mock_season_repo.update.call_args[0]
        assert update_args[1] == {"activation_status": "completed"}
        assert "is_current" not in update_args[1]

    @pytest.mark.asyncio
    async def test_should_raise_when_completing_draft_season(
        self,
        season_service: SeasonService,
        mock_season_repo: MagicMock,
        mock_alliance_repo: MagicMock,
        user_id: UUID,
        alliance_id: UUID,
        season_id: UUID,
    ):
        """Should raise ValueError when trying to complete a draft season"""
        # Arrange
        mock_alliance = create_mock_alliance(alliance_id)
        mock_alliance_repo.get_by_collaborator = AsyncMock(return_value=mock_alliance)

        draft_season = create_mock_season(
            season_id, alliance_id, "S1", is_current=False, activation_status="draft"
        )
        mock_season_repo.get_by_id = AsyncMock(return_value=draft_season)

        # Act & Assert
        with pytest.raises(ValueError) as exc_info:
            await season_service.complete_season(user_id, season_id)
        assert "activated" in str(exc_info.value).lower()
