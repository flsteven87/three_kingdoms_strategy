"""
Unit Tests for AllianceService

Tests cover:
1. Getting user's alliance (get_user_alliance)
2. Creating alliance with owner setup (create_alliance)
3. Updating alliance with permission checks (update_alliance)
4. Deleting alliance with owner-only restriction (delete_alliance)

符合 test-writing skill 規範:
- AAA pattern (Arrange-Act-Assert)
- Mocked repository dependencies
- Coverage: happy path + edge cases + error cases
"""

from datetime import datetime
from unittest.mock import AsyncMock, MagicMock
from uuid import UUID

import pytest

from src.models.alliance import Alliance, AllianceCreate, AllianceUpdate
from src.services.alliance_service import AllianceService

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
def mock_alliance_repo() -> MagicMock:
    """Create mock alliance repository"""
    return MagicMock()


@pytest.fixture
def mock_collaborator_repo() -> MagicMock:
    """Create mock collaborator repository"""
    return MagicMock()


@pytest.fixture
def mock_permission_service() -> MagicMock:
    """Create mock permission service"""
    return MagicMock()


@pytest.fixture
def alliance_service(
    mock_alliance_repo: MagicMock,
    mock_collaborator_repo: MagicMock,
    mock_permission_service: MagicMock,
) -> AllianceService:
    """Create AllianceService with mocked dependencies"""
    service = AllianceService()
    service._repo = mock_alliance_repo
    service._collaborator_repo = mock_collaborator_repo
    service._permission_service = mock_permission_service
    return service


def create_mock_alliance(
    alliance_id: UUID,
    name: str = "Test Alliance",
    server_name: str | None = "Server 1",
) -> Alliance:
    """Factory for creating mock Alliance objects"""
    now = datetime.now()
    return Alliance(
        id=alliance_id,
        name=name,
        server_name=server_name,
        created_at=now,
        updated_at=now,
        subscription_status="trial",
        trial_started_at=now,
        trial_ends_at=now,
    )


# =============================================================================
# Tests for get_user_alliance
# =============================================================================


class TestGetUserAlliance:
    """Tests for AllianceService.get_user_alliance"""

    @pytest.mark.asyncio
    async def test_should_return_alliance_when_user_has_one(
        self,
        alliance_service: AllianceService,
        mock_alliance_repo: MagicMock,
        user_id: UUID,
        alliance_id: UUID,
    ):
        """Should return alliance when user is a member"""
        # Arrange
        mock_alliance = create_mock_alliance(alliance_id)
        mock_alliance_repo.get_by_collaborator = AsyncMock(return_value=mock_alliance)

        # Act
        result = await alliance_service.get_user_alliance(user_id)

        # Assert
        assert result is not None
        assert result.id == alliance_id
        mock_alliance_repo.get_by_collaborator.assert_called_once_with(user_id)

    @pytest.mark.asyncio
    async def test_should_return_none_when_user_has_no_alliance(
        self,
        alliance_service: AllianceService,
        mock_alliance_repo: MagicMock,
        user_id: UUID,
    ):
        """Should return None when user has no alliance"""
        # Arrange
        mock_alliance_repo.get_by_collaborator = AsyncMock(return_value=None)

        # Act
        result = await alliance_service.get_user_alliance(user_id)

        # Assert
        assert result is None


# =============================================================================
# Tests for create_alliance
# =============================================================================


class TestCreateAlliance:
    """Tests for AllianceService.create_alliance"""

    @pytest.mark.asyncio
    async def test_should_create_alliance_and_add_owner(
        self,
        alliance_service: AllianceService,
        mock_alliance_repo: MagicMock,
        mock_collaborator_repo: MagicMock,
        user_id: UUID,
        alliance_id: UUID,
    ):
        """Should create alliance and add creator as owner"""
        # Arrange
        mock_alliance_repo.get_by_collaborator = AsyncMock(return_value=None)
        mock_alliance = create_mock_alliance(alliance_id, name="New Alliance")
        mock_alliance_repo.create = AsyncMock(return_value=mock_alliance)
        mock_collaborator_repo.add_collaborator = AsyncMock()

        alliance_data = AllianceCreate(name="New Alliance", server_name="Server 1")

        # Act
        result = await alliance_service.create_alliance(user_id, alliance_data)

        # Assert
        assert result.name == "New Alliance"
        mock_alliance_repo.create.assert_called_once()
        mock_collaborator_repo.add_collaborator.assert_called_once_with(
            alliance_id=alliance_id,
            user_id=user_id,
            role="owner",
            invited_by=None,
        )

    @pytest.mark.asyncio
    async def test_should_raise_valueerror_when_user_already_has_alliance(
        self,
        alliance_service: AllianceService,
        mock_alliance_repo: MagicMock,
        user_id: UUID,
        alliance_id: UUID,
    ):
        """Should raise ValueError when user already has an alliance"""
        # Arrange
        existing_alliance = create_mock_alliance(alliance_id)
        mock_alliance_repo.get_by_collaborator = AsyncMock(return_value=existing_alliance)

        alliance_data = AllianceCreate(name="New Alliance")

        # Act & Assert
        with pytest.raises(ValueError) as exc_info:
            await alliance_service.create_alliance(user_id, alliance_data)
        assert "already has an alliance" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_should_create_alliance_without_server_name(
        self,
        alliance_service: AllianceService,
        mock_alliance_repo: MagicMock,
        mock_collaborator_repo: MagicMock,
        user_id: UUID,
        alliance_id: UUID,
    ):
        """Should create alliance without server_name (optional field)"""
        # Arrange
        mock_alliance_repo.get_by_collaborator = AsyncMock(return_value=None)
        mock_alliance = create_mock_alliance(alliance_id, name="Minimal Alliance", server_name=None)
        mock_alliance_repo.create = AsyncMock(return_value=mock_alliance)
        mock_collaborator_repo.add_collaborator = AsyncMock()

        alliance_data = AllianceCreate(name="Minimal Alliance")

        # Act
        result = await alliance_service.create_alliance(user_id, alliance_data)

        # Assert
        assert result.name == "Minimal Alliance"
        assert result.server_name is None


# =============================================================================
# Tests for update_alliance
# =============================================================================


class TestUpdateAlliance:
    """Tests for AllianceService.update_alliance"""

    @pytest.mark.asyncio
    async def test_should_update_alliance_when_user_has_permission(
        self,
        alliance_service: AllianceService,
        mock_alliance_repo: MagicMock,
        mock_permission_service: MagicMock,
        user_id: UUID,
        alliance_id: UUID,
    ):
        """Should update alliance when user has write permission"""
        # Arrange
        existing_alliance = create_mock_alliance(alliance_id)
        mock_alliance_repo.get_by_collaborator = AsyncMock(return_value=existing_alliance)
        mock_permission_service.require_write_permission = AsyncMock()

        updated_alliance = create_mock_alliance(alliance_id, name="Updated Name")
        mock_alliance_repo.update = AsyncMock(return_value=updated_alliance)

        update_data = AllianceUpdate(name="Updated Name")

        # Act
        result = await alliance_service.update_alliance(user_id, update_data)

        # Assert
        assert result.name == "Updated Name"
        mock_permission_service.require_write_permission.assert_called_once_with(
            user_id, alliance_id, "update alliance settings"
        )
        mock_alliance_repo.update.assert_called_once()

    @pytest.mark.asyncio
    async def test_should_raise_valueerror_when_user_has_no_alliance(
        self,
        alliance_service: AllianceService,
        mock_alliance_repo: MagicMock,
        user_id: UUID,
    ):
        """Should raise ValueError when user has no alliance"""
        # Arrange
        mock_alliance_repo.get_by_collaborator = AsyncMock(return_value=None)

        update_data = AllianceUpdate(name="New Name")

        # Act & Assert
        with pytest.raises(ValueError) as exc_info:
            await alliance_service.update_alliance(user_id, update_data)
        assert "no alliance to update" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_should_raise_permissionerror_when_user_lacks_permission(
        self,
        alliance_service: AllianceService,
        mock_alliance_repo: MagicMock,
        mock_permission_service: MagicMock,
        user_id: UUID,
        alliance_id: UUID,
    ):
        """Should raise PermissionError when user lacks write permission"""
        # Arrange
        existing_alliance = create_mock_alliance(alliance_id)
        mock_alliance_repo.get_by_collaborator = AsyncMock(return_value=existing_alliance)
        mock_permission_service.require_write_permission = AsyncMock(
            side_effect=PermissionError("No permission")
        )

        update_data = AllianceUpdate(name="New Name")

        # Act & Assert
        with pytest.raises(PermissionError):
            await alliance_service.update_alliance(user_id, update_data)

    @pytest.mark.asyncio
    async def test_should_only_update_provided_fields(
        self,
        alliance_service: AllianceService,
        mock_alliance_repo: MagicMock,
        mock_permission_service: MagicMock,
        user_id: UUID,
        alliance_id: UUID,
    ):
        """Should only update fields that are provided"""
        # Arrange
        existing_alliance = create_mock_alliance(
            alliance_id, name="Old Name", server_name="Old Server"
        )
        mock_alliance_repo.get_by_collaborator = AsyncMock(return_value=existing_alliance)
        mock_permission_service.require_write_permission = AsyncMock()
        mock_alliance_repo.update = AsyncMock(return_value=existing_alliance)

        # Only update name, not server_name
        update_data = AllianceUpdate(name="New Name")

        # Act
        await alliance_service.update_alliance(user_id, update_data)

        # Assert - verify update called with only name field
        call_args = mock_alliance_repo.update.call_args
        update_dict = call_args[0][1]
        assert "name" in update_dict
        assert "server_name" not in update_dict


# =============================================================================
# Tests for delete_alliance
# =============================================================================


class TestDeleteAlliance:
    """Tests for AllianceService.delete_alliance"""

    @pytest.mark.asyncio
    async def test_should_delete_alliance_when_user_is_owner(
        self,
        alliance_service: AllianceService,
        mock_alliance_repo: MagicMock,
        mock_permission_service: MagicMock,
        user_id: UUID,
        alliance_id: UUID,
    ):
        """Should delete alliance when user is owner"""
        # Arrange
        existing_alliance = create_mock_alliance(alliance_id)
        mock_alliance_repo.get_by_collaborator = AsyncMock(return_value=existing_alliance)
        mock_permission_service.require_owner = AsyncMock()
        mock_alliance_repo.delete = AsyncMock(return_value=True)

        # Act
        result = await alliance_service.delete_alliance(user_id)

        # Assert
        assert result is True
        mock_permission_service.require_owner.assert_called_once_with(
            user_id, alliance_id, "delete alliance"
        )
        mock_alliance_repo.delete.assert_called_once_with(alliance_id)

    @pytest.mark.asyncio
    async def test_should_raise_valueerror_when_user_has_no_alliance(
        self,
        alliance_service: AllianceService,
        mock_alliance_repo: MagicMock,
        user_id: UUID,
    ):
        """Should raise ValueError when user has no alliance"""
        # Arrange
        mock_alliance_repo.get_by_collaborator = AsyncMock(return_value=None)

        # Act & Assert
        with pytest.raises(ValueError) as exc_info:
            await alliance_service.delete_alliance(user_id)
        assert "no alliance to delete" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_should_raise_permissionerror_when_user_is_not_owner(
        self,
        alliance_service: AllianceService,
        mock_alliance_repo: MagicMock,
        mock_permission_service: MagicMock,
        user_id: UUID,
        alliance_id: UUID,
    ):
        """Should raise PermissionError when user is not owner"""
        # Arrange
        existing_alliance = create_mock_alliance(alliance_id)
        mock_alliance_repo.get_by_collaborator = AsyncMock(return_value=existing_alliance)
        mock_permission_service.require_owner = AsyncMock(
            side_effect=PermissionError("Only owner can delete")
        )

        # Act & Assert
        with pytest.raises(PermissionError):
            await alliance_service.delete_alliance(user_id)
