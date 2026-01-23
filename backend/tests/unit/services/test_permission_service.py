"""
Unit Tests for PermissionService

Tests cover:
1. Role retrieval (get_user_role)
2. Permission checking (check_permission)
3. Permission enforcement (require_permission, require_owner, etc.)
4. Error handling and edge cases

符合 test-writing skill 規範:
- AAA pattern (Arrange-Act-Assert)
- Mocked repository dependencies
- Coverage: happy path + edge cases + error cases
"""

from unittest.mock import AsyncMock, MagicMock
from uuid import UUID

import pytest

from src.services.permission_service import PermissionService


@pytest.fixture
def user_id() -> UUID:
    """Fixed user UUID for testing"""
    return UUID("11111111-1111-1111-1111-111111111111")


@pytest.fixture
def alliance_id() -> UUID:
    """Fixed alliance UUID for testing"""
    return UUID("22222222-2222-2222-2222-222222222222")


@pytest.fixture
def mock_collaborator_repo() -> MagicMock:
    """Create mock collaborator repository"""
    return MagicMock()


@pytest.fixture
def permission_service(mock_collaborator_repo: MagicMock) -> PermissionService:
    """Create PermissionService with mocked repository"""
    service = PermissionService(quota_service=None)
    service._collaborator_repo = mock_collaborator_repo
    return service


class TestGetUserRole:
    """Tests for PermissionService.get_user_role"""

    # =========================================================================
    # Happy Path Tests
    # =========================================================================

    @pytest.mark.asyncio
    async def test_should_return_owner_role_when_user_is_owner(
        self,
        permission_service: PermissionService,
        mock_collaborator_repo: MagicMock,
        user_id: UUID,
        alliance_id: UUID,
    ):
        """Should return 'owner' when user is alliance owner"""
        # Arrange
        mock_collaborator_repo.get_collaborator_role = AsyncMock(return_value="owner")

        # Act
        result = await permission_service.get_user_role(user_id, alliance_id)

        # Assert
        assert result == "owner"
        mock_collaborator_repo.get_collaborator_role.assert_called_once_with(alliance_id, user_id)

    @pytest.mark.asyncio
    async def test_should_return_collaborator_role_when_user_is_collaborator(
        self,
        permission_service: PermissionService,
        mock_collaborator_repo: MagicMock,
        user_id: UUID,
        alliance_id: UUID,
    ):
        """Should return 'collaborator' when user is collaborator"""
        # Arrange
        mock_collaborator_repo.get_collaborator_role = AsyncMock(return_value="collaborator")

        # Act
        result = await permission_service.get_user_role(user_id, alliance_id)

        # Assert
        assert result == "collaborator"

    @pytest.mark.asyncio
    async def test_should_return_member_role_when_user_is_member(
        self,
        permission_service: PermissionService,
        mock_collaborator_repo: MagicMock,
        user_id: UUID,
        alliance_id: UUID,
    ):
        """Should return 'member' when user is regular member"""
        # Arrange
        mock_collaborator_repo.get_collaborator_role = AsyncMock(return_value="member")

        # Act
        result = await permission_service.get_user_role(user_id, alliance_id)

        # Assert
        assert result == "member"

    # =========================================================================
    # Edge Case Tests
    # =========================================================================

    @pytest.mark.asyncio
    async def test_should_return_none_when_user_not_member(
        self,
        permission_service: PermissionService,
        mock_collaborator_repo: MagicMock,
        user_id: UUID,
        alliance_id: UUID,
    ):
        """Should return None when user is not a member (ValueError from repo)"""
        # Arrange
        mock_collaborator_repo.get_collaborator_role = AsyncMock(
            side_effect=ValueError("User not found")
        )

        # Act
        result = await permission_service.get_user_role(user_id, alliance_id)

        # Assert
        assert result is None

    # =========================================================================
    # Error Case Tests
    # =========================================================================

    @pytest.mark.asyncio
    async def test_should_raise_runtime_error_when_repo_fails(
        self,
        permission_service: PermissionService,
        mock_collaborator_repo: MagicMock,
        user_id: UUID,
        alliance_id: UUID,
    ):
        """Should raise RuntimeError when repository operation fails"""
        # Arrange
        mock_collaborator_repo.get_collaborator_role = AsyncMock(
            side_effect=Exception("Database connection error")
        )

        # Act & Assert
        with pytest.raises(RuntimeError) as exc_info:
            await permission_service.get_user_role(user_id, alliance_id)
        assert "Failed to get user role" in str(exc_info.value)


class TestCheckPermission:
    """Tests for PermissionService.check_permission"""

    @pytest.mark.asyncio
    async def test_should_return_true_when_role_matches(
        self,
        permission_service: PermissionService,
        mock_collaborator_repo: MagicMock,
        user_id: UUID,
        alliance_id: UUID,
    ):
        """Should return True when user has one of the required roles"""
        # Arrange
        mock_collaborator_repo.get_collaborator_role = AsyncMock(return_value="owner")

        # Act
        result = await permission_service.check_permission(
            user_id, alliance_id, ["owner", "collaborator"]
        )

        # Assert
        assert result is True

    @pytest.mark.asyncio
    async def test_should_return_false_when_role_not_in_required(
        self,
        permission_service: PermissionService,
        mock_collaborator_repo: MagicMock,
        user_id: UUID,
        alliance_id: UUID,
    ):
        """Should return False when user role is not in required roles"""
        # Arrange
        mock_collaborator_repo.get_collaborator_role = AsyncMock(return_value="member")

        # Act
        result = await permission_service.check_permission(
            user_id, alliance_id, ["owner", "collaborator"]
        )

        # Assert
        assert result is False

    @pytest.mark.asyncio
    async def test_should_return_false_when_user_not_member(
        self,
        permission_service: PermissionService,
        mock_collaborator_repo: MagicMock,
        user_id: UUID,
        alliance_id: UUID,
    ):
        """Should return False when user is not a member"""
        # Arrange
        mock_collaborator_repo.get_collaborator_role = AsyncMock(
            side_effect=ValueError("Not found")
        )

        # Act
        result = await permission_service.check_permission(user_id, alliance_id, ["owner"])

        # Assert
        assert result is False


class TestRequirePermission:
    """Tests for PermissionService.require_permission"""

    @pytest.mark.asyncio
    async def test_should_pass_when_user_has_required_role(
        self,
        permission_service: PermissionService,
        mock_collaborator_repo: MagicMock,
        user_id: UUID,
        alliance_id: UUID,
    ):
        """Should not raise when user has required role"""
        # Arrange
        mock_collaborator_repo.get_collaborator_role = AsyncMock(return_value="collaborator")

        # Act & Assert - should not raise
        await permission_service.require_permission(
            user_id, alliance_id, ["owner", "collaborator"], "upload data"
        )

    @pytest.mark.asyncio
    async def test_should_raise_valueerror_when_user_not_member(
        self,
        permission_service: PermissionService,
        mock_collaborator_repo: MagicMock,
        user_id: UUID,
        alliance_id: UUID,
    ):
        """Should raise ValueError when user is not a member"""
        # Arrange
        mock_collaborator_repo.get_collaborator_role = AsyncMock(
            side_effect=ValueError("Not found")
        )

        # Act & Assert
        with pytest.raises(ValueError) as exc_info:
            await permission_service.require_permission(
                user_id, alliance_id, ["owner"], "delete alliance"
            )
        assert "not a member" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_should_raise_permissionerror_when_insufficient_role(
        self,
        permission_service: PermissionService,
        mock_collaborator_repo: MagicMock,
        user_id: UUID,
        alliance_id: UUID,
    ):
        """Should raise PermissionError when user lacks required role"""
        # Arrange
        mock_collaborator_repo.get_collaborator_role = AsyncMock(return_value="member")

        # Act & Assert
        with pytest.raises(PermissionError) as exc_info:
            await permission_service.require_permission(
                user_id, alliance_id, ["owner"], "manage collaborators"
            )
        assert "don't have permission" in str(exc_info.value)
        assert "manage collaborators" in str(exc_info.value)


class TestRequireOwner:
    """Tests for PermissionService.require_owner"""

    @pytest.mark.asyncio
    async def test_should_pass_when_user_is_owner(
        self,
        permission_service: PermissionService,
        mock_collaborator_repo: MagicMock,
        user_id: UUID,
        alliance_id: UUID,
    ):
        """Should not raise when user is owner"""
        # Arrange
        mock_collaborator_repo.get_collaborator_role = AsyncMock(return_value="owner")

        # Act & Assert - should not raise
        await permission_service.require_owner(user_id, alliance_id, "delete alliance")

    @pytest.mark.asyncio
    async def test_should_raise_when_user_is_collaborator(
        self,
        permission_service: PermissionService,
        mock_collaborator_repo: MagicMock,
        user_id: UUID,
        alliance_id: UUID,
    ):
        """Should raise PermissionError when user is collaborator, not owner"""
        # Arrange
        mock_collaborator_repo.get_collaborator_role = AsyncMock(return_value="collaborator")

        # Act & Assert
        with pytest.raises(PermissionError):
            await permission_service.require_owner(user_id, alliance_id, "delete alliance")


class TestRequireOwnerOrCollaborator:
    """Tests for PermissionService.require_owner_or_collaborator"""

    @pytest.mark.asyncio
    async def test_should_pass_when_user_is_owner(
        self,
        permission_service: PermissionService,
        mock_collaborator_repo: MagicMock,
        user_id: UUID,
        alliance_id: UUID,
    ):
        """Should not raise when user is owner"""
        # Arrange
        mock_collaborator_repo.get_collaborator_role = AsyncMock(return_value="owner")

        # Act & Assert
        await permission_service.require_owner_or_collaborator(user_id, alliance_id, "upload data")

    @pytest.mark.asyncio
    async def test_should_pass_when_user_is_collaborator(
        self,
        permission_service: PermissionService,
        mock_collaborator_repo: MagicMock,
        user_id: UUID,
        alliance_id: UUID,
    ):
        """Should not raise when user is collaborator"""
        # Arrange
        mock_collaborator_repo.get_collaborator_role = AsyncMock(return_value="collaborator")

        # Act & Assert
        await permission_service.require_owner_or_collaborator(user_id, alliance_id, "upload data")

    @pytest.mark.asyncio
    async def test_should_raise_when_user_is_member(
        self,
        permission_service: PermissionService,
        mock_collaborator_repo: MagicMock,
        user_id: UUID,
        alliance_id: UUID,
    ):
        """Should raise PermissionError when user is only member"""
        # Arrange
        mock_collaborator_repo.get_collaborator_role = AsyncMock(return_value="member")

        # Act & Assert
        with pytest.raises(PermissionError):
            await permission_service.require_owner_or_collaborator(
                user_id, alliance_id, "upload data"
            )


class TestConvenienceMethods:
    """Tests for permission convenience methods"""

    @pytest.mark.asyncio
    async def test_can_manage_collaborators_should_require_owner(
        self,
        permission_service: PermissionService,
        mock_collaborator_repo: MagicMock,
        user_id: UUID,
        alliance_id: UUID,
    ):
        """can_manage_collaborators should return True only for owner"""
        # Arrange - owner
        mock_collaborator_repo.get_collaborator_role = AsyncMock(return_value="owner")

        # Act
        result = await permission_service.can_manage_collaborators(user_id, alliance_id)

        # Assert
        assert result is True

    @pytest.mark.asyncio
    async def test_can_manage_collaborators_should_deny_collaborator(
        self,
        permission_service: PermissionService,
        mock_collaborator_repo: MagicMock,
        user_id: UUID,
        alliance_id: UUID,
    ):
        """can_manage_collaborators should return False for collaborator"""
        # Arrange
        mock_collaborator_repo.get_collaborator_role = AsyncMock(return_value="collaborator")

        # Act
        result = await permission_service.can_manage_collaborators(user_id, alliance_id)

        # Assert
        assert result is False

    @pytest.mark.asyncio
    async def test_can_upload_data_should_allow_owner_and_collaborator(
        self,
        permission_service: PermissionService,
        mock_collaborator_repo: MagicMock,
        user_id: UUID,
        alliance_id: UUID,
    ):
        """can_upload_data should allow both owner and collaborator"""
        for role in ["owner", "collaborator"]:
            # Arrange
            mock_collaborator_repo.get_collaborator_role = AsyncMock(return_value=role)

            # Act
            result = await permission_service.can_upload_data(user_id, alliance_id)

            # Assert
            assert result is True, f"Should allow {role}"

    @pytest.mark.asyncio
    async def test_can_view_data_should_allow_all_members(
        self,
        permission_service: PermissionService,
        mock_collaborator_repo: MagicMock,
        user_id: UUID,
        alliance_id: UUID,
    ):
        """can_view_data should allow all member types"""
        for role in ["owner", "collaborator", "member"]:
            # Arrange
            mock_collaborator_repo.get_collaborator_role = AsyncMock(return_value=role)

            # Act
            result = await permission_service.can_view_data(user_id, alliance_id)

            # Assert
            assert result is True, f"Should allow {role} to view data"


class TestRequireWritePermission:
    """Tests for PermissionService.require_write_permission"""

    @pytest.mark.asyncio
    async def test_should_check_role_and_quota(
        self,
        mock_collaborator_repo: MagicMock,
        user_id: UUID,
        alliance_id: UUID,
    ):
        """Should check both role and quota when both configured"""
        # Arrange
        mock_quota_service = MagicMock()
        mock_quota_service.require_write_access = AsyncMock()

        service = PermissionService(quota_service=mock_quota_service)
        service._collaborator_repo = mock_collaborator_repo
        mock_collaborator_repo.get_collaborator_role = AsyncMock(return_value="collaborator")

        # Act
        await service.require_write_permission(user_id, alliance_id, "upload CSV")

        # Assert - both checks should have been called
        mock_collaborator_repo.get_collaborator_role.assert_called_once()
        mock_quota_service.require_write_access.assert_called_once_with(
            alliance_id, "upload CSV"
        )

    @pytest.mark.asyncio
    async def test_should_check_quota_when_service_available(
        self,
        mock_collaborator_repo: MagicMock,
        user_id: UUID,
        alliance_id: UUID,
    ):
        """Should check quota when quota service is available"""
        # Arrange
        mock_quota_service = MagicMock()
        mock_quota_service.require_write_access = AsyncMock()

        service = PermissionService(quota_service=mock_quota_service)
        service._collaborator_repo = mock_collaborator_repo
        mock_collaborator_repo.get_collaborator_role = AsyncMock(return_value="owner")

        # Act
        await service.require_write_permission(user_id, alliance_id, "upload CSV")

        # Assert
        mock_quota_service.require_write_access.assert_called_once_with(
            alliance_id, "upload CSV"
        )
