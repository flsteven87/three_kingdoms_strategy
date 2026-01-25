"""
Unit Tests for AllianceCollaboratorService

Tests cover:
1. add_collaborator_by_email - add collaborator or create invitation
2. remove_collaborator - remove collaborator from alliance
3. update_collaborator_role - update collaborator's role
4. get_user_email - get user email from auth
5. process_pending_invitations - process pending invitations
6. get_alliance_collaborators - get alliance collaborators with enriched data

符合 test-writing skill 規範:
- AAA pattern (Arrange-Act-Assert)
- Mocked repository dependencies
- Coverage: happy path + edge cases + error cases
"""

from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock
from uuid import UUID, uuid4

import pytest
from fastapi import HTTPException

from src.models.alliance_collaborator import AllianceCollaboratorDB
from src.models.pending_invitation import PendingInvitation
from src.services.alliance_collaborator_service import AllianceCollaboratorService

# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def owner_user_id() -> UUID:
    """Fixed owner user UUID for testing"""
    return UUID("11111111-1111-1111-1111-111111111111")


@pytest.fixture
def target_user_id() -> UUID:
    """Fixed target user UUID for testing"""
    return UUID("22222222-2222-2222-2222-222222222222")


@pytest.fixture
def alliance_id() -> UUID:
    """Fixed alliance UUID for testing"""
    return UUID("33333333-3333-3333-3333-333333333333")


@pytest.fixture
def mock_collaborator_repo() -> MagicMock:
    """Create mock AllianceCollaboratorRepository"""
    return MagicMock()


@pytest.fixture
def mock_invitation_repo() -> MagicMock:
    """Create mock PendingInvitationRepository"""
    return MagicMock()


@pytest.fixture
def mock_permission_service() -> MagicMock:
    """Create mock PermissionService"""
    return MagicMock()


@pytest.fixture
def mock_supabase() -> MagicMock:
    """Create mock Supabase client"""
    return MagicMock()


@pytest.fixture
def collaborator_service(
    mock_collaborator_repo: MagicMock,
    mock_invitation_repo: MagicMock,
    mock_permission_service: MagicMock,
    mock_supabase: MagicMock,
) -> AllianceCollaboratorService:
    """Create AllianceCollaboratorService with mocked dependencies"""
    service = AllianceCollaboratorService()
    service._collaborator_repo = mock_collaborator_repo
    service._invitation_repo = mock_invitation_repo
    service._permission_service = mock_permission_service
    service._supabase = mock_supabase
    return service


def create_mock_collaborator(
    user_id: UUID,
    alliance_id: UUID,
    role: str = "member",
) -> AllianceCollaboratorDB:
    """Factory for creating mock AllianceCollaboratorDB objects"""
    now = datetime.now()
    return AllianceCollaboratorDB(
        id=uuid4(),
        alliance_id=alliance_id,
        user_id=user_id,
        role=role,
        invited_by=uuid4(),
        invited_at=now,
        joined_at=now,
        created_at=now,
        updated_at=now,
    )


def create_mock_pending_invitation(
    alliance_id: UUID,
    email: str = "invited@example.com",
    role: str = "member",
) -> PendingInvitation:
    """Factory for creating mock PendingInvitation objects"""
    now = datetime.now()
    return PendingInvitation(
        id=uuid4(),
        alliance_id=alliance_id,
        invited_email=email,
        invited_by=uuid4(),
        role=role,
        invitation_token=uuid4(),
        invited_at=now,
        expires_at=now + timedelta(days=7),
        accepted_at=None,
        status="pending",
    )


def create_mock_supabase_user(user_id: UUID, email: str) -> MagicMock:
    """Factory for creating mock Supabase user"""
    user = MagicMock()
    user.id = str(user_id)
    user.email = email
    user.user_metadata = {"full_name": "Test User", "avatar_url": "https://example.com/avatar.png"}
    return user


# =============================================================================
# Tests for add_collaborator_by_email
# =============================================================================


class TestAddCollaboratorByEmail:
    """Tests for add_collaborator_by_email method"""

    @pytest.mark.asyncio
    async def test_should_add_existing_user_as_collaborator(
        self,
        collaborator_service: AllianceCollaboratorService,
        mock_permission_service: MagicMock,
        mock_supabase: MagicMock,
        mock_collaborator_repo: MagicMock,
        owner_user_id: UUID,
        target_user_id: UUID,
        alliance_id: UUID,
    ):
        """Should add existing user as collaborator"""
        # Arrange
        email = "existing@example.com"
        mock_user = create_mock_supabase_user(target_user_id, email)
        mock_collaborator = create_mock_collaborator(target_user_id, alliance_id)

        mock_permission_service.require_owner = AsyncMock()
        mock_supabase.auth.admin.list_users.return_value.users = [mock_user]
        mock_collaborator_repo.is_collaborator = AsyncMock(return_value=False)
        mock_collaborator_repo.add_collaborator = AsyncMock(return_value=mock_collaborator)

        # Act
        result = await collaborator_service.add_collaborator_by_email(
            owner_user_id, alliance_id, email
        )

        # Assert
        assert "user_id" in result
        assert result["email"] == email
        mock_collaborator_repo.add_collaborator.assert_called_once()

    @pytest.mark.asyncio
    async def test_should_create_invitation_for_non_existing_user(
        self,
        collaborator_service: AllianceCollaboratorService,
        mock_permission_service: MagicMock,
        mock_supabase: MagicMock,
        mock_invitation_repo: MagicMock,
        owner_user_id: UUID,
        alliance_id: UUID,
    ):
        """Should create pending invitation for non-existing user"""
        # Arrange
        email = "newuser@example.com"
        mock_invitation = create_mock_pending_invitation(alliance_id, email)

        mock_permission_service.require_owner = AsyncMock()
        mock_supabase.auth.admin.list_users.return_value.users = []  # No existing user
        mock_invitation_repo.check_existing_invitation = AsyncMock(return_value=None)
        mock_invitation_repo.create_invitation = AsyncMock(return_value=mock_invitation)

        # Act
        result = await collaborator_service.add_collaborator_by_email(
            owner_user_id, alliance_id, email
        )

        # Assert
        assert result["status"] == "pending"
        assert result["is_pending_registration"] is True
        assert result["invited_email"] == email
        mock_invitation_repo.create_invitation.assert_called_once()

    @pytest.mark.asyncio
    async def test_should_raise_409_when_user_already_collaborator(
        self,
        collaborator_service: AllianceCollaboratorService,
        mock_permission_service: MagicMock,
        mock_supabase: MagicMock,
        mock_collaborator_repo: MagicMock,
        owner_user_id: UUID,
        target_user_id: UUID,
        alliance_id: UUID,
    ):
        """Should raise HTTPException 409 when user is already a collaborator"""
        # Arrange
        email = "existing@example.com"
        mock_user = create_mock_supabase_user(target_user_id, email)

        mock_permission_service.require_owner = AsyncMock()
        mock_supabase.auth.admin.list_users.return_value.users = [mock_user]
        mock_collaborator_repo.is_collaborator = AsyncMock(return_value=True)

        # Act & Assert
        with pytest.raises(HTTPException) as exc_info:
            await collaborator_service.add_collaborator_by_email(
                owner_user_id, alliance_id, email
            )
        assert exc_info.value.status_code == 409
        assert "already a collaborator" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_should_raise_409_when_invitation_exists(
        self,
        collaborator_service: AllianceCollaboratorService,
        mock_permission_service: MagicMock,
        mock_supabase: MagicMock,
        mock_invitation_repo: MagicMock,
        owner_user_id: UUID,
        alliance_id: UUID,
    ):
        """Should raise HTTPException 409 when invitation already exists"""
        # Arrange
        email = "invited@example.com"
        existing_invitation = create_mock_pending_invitation(alliance_id, email)

        mock_permission_service.require_owner = AsyncMock()
        mock_supabase.auth.admin.list_users.return_value.users = []
        mock_invitation_repo.check_existing_invitation = AsyncMock(
            return_value=existing_invitation
        )

        # Act & Assert
        with pytest.raises(HTTPException) as exc_info:
            await collaborator_service.add_collaborator_by_email(
                owner_user_id, alliance_id, email
            )
        assert exc_info.value.status_code == 409
        assert "Invitation already sent" in exc_info.value.detail


# =============================================================================
# Tests for remove_collaborator
# =============================================================================


class TestRemoveCollaborator:
    """Tests for remove_collaborator method"""

    @pytest.mark.asyncio
    async def test_should_remove_collaborator_successfully(
        self,
        collaborator_service: AllianceCollaboratorService,
        mock_permission_service: MagicMock,
        mock_collaborator_repo: MagicMock,
        owner_user_id: UUID,
        target_user_id: UUID,
        alliance_id: UUID,
    ):
        """Should remove collaborator when owner requests"""
        # Arrange
        mock_permission_service.require_owner = AsyncMock()
        mock_collaborator_repo.get_collaborator_role = AsyncMock(return_value="member")
        mock_collaborator_repo.remove_collaborator = AsyncMock(return_value=True)

        # Act
        result = await collaborator_service.remove_collaborator(
            owner_user_id, alliance_id, target_user_id
        )

        # Assert
        assert result is True
        mock_collaborator_repo.remove_collaborator.assert_called_once_with(
            alliance_id, target_user_id
        )

    @pytest.mark.asyncio
    async def test_should_raise_403_when_trying_to_remove_owner(
        self,
        collaborator_service: AllianceCollaboratorService,
        mock_permission_service: MagicMock,
        mock_collaborator_repo: MagicMock,
        owner_user_id: UUID,
        target_user_id: UUID,
        alliance_id: UUID,
    ):
        """Should raise HTTPException 403 when trying to remove owner"""
        # Arrange
        mock_permission_service.require_owner = AsyncMock()
        mock_collaborator_repo.get_collaborator_role = AsyncMock(return_value="owner")

        # Act & Assert
        with pytest.raises(HTTPException) as exc_info:
            await collaborator_service.remove_collaborator(
                owner_user_id, alliance_id, target_user_id
            )
        assert exc_info.value.status_code == 403
        assert "Cannot remove alliance owner" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_should_raise_400_when_trying_to_remove_self(
        self,
        collaborator_service: AllianceCollaboratorService,
        mock_permission_service: MagicMock,
        mock_collaborator_repo: MagicMock,
        owner_user_id: UUID,
        alliance_id: UUID,
    ):
        """Should raise HTTPException 400 when trying to remove yourself"""
        # Arrange
        mock_permission_service.require_owner = AsyncMock()
        mock_collaborator_repo.get_collaborator_role = AsyncMock(return_value="member")

        # Act & Assert
        with pytest.raises(HTTPException) as exc_info:
            await collaborator_service.remove_collaborator(
                owner_user_id, alliance_id, owner_user_id  # Same user
            )
        assert exc_info.value.status_code == 400
        assert "Cannot remove yourself" in exc_info.value.detail


# =============================================================================
# Tests for update_collaborator_role
# =============================================================================


class TestUpdateCollaboratorRole:
    """Tests for update_collaborator_role method"""

    @pytest.mark.asyncio
    async def test_should_update_role_successfully(
        self,
        collaborator_service: AllianceCollaboratorService,
        mock_permission_service: MagicMock,
        mock_collaborator_repo: MagicMock,
        owner_user_id: UUID,
        target_user_id: UUID,
        alliance_id: UUID,
    ):
        """Should update collaborator role successfully"""
        # Arrange
        updated_collaborator = create_mock_collaborator(target_user_id, alliance_id, "collaborator")

        mock_permission_service.require_owner = AsyncMock()
        mock_collaborator_repo.get_collaborator_role = AsyncMock(return_value="member")
        mock_collaborator_repo.update_role = AsyncMock(return_value=updated_collaborator)

        # Act
        result = await collaborator_service.update_collaborator_role(
            owner_user_id, alliance_id, target_user_id, "collaborator"
        )

        # Assert
        assert result["role"] == "collaborator"
        mock_collaborator_repo.update_role.assert_called_once()

    @pytest.mark.asyncio
    async def test_should_raise_400_for_invalid_role(
        self,
        collaborator_service: AllianceCollaboratorService,
        mock_permission_service: MagicMock,
        owner_user_id: UUID,
        target_user_id: UUID,
        alliance_id: UUID,
    ):
        """Should raise HTTPException 400 for invalid role"""
        # Arrange
        mock_permission_service.require_owner = AsyncMock()

        # Act & Assert
        with pytest.raises(HTTPException) as exc_info:
            await collaborator_service.update_collaborator_role(
                owner_user_id, alliance_id, target_user_id, "invalid_role"
            )
        assert exc_info.value.status_code == 400
        assert "Invalid role" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_should_raise_400_when_changing_own_role(
        self,
        collaborator_service: AllianceCollaboratorService,
        mock_permission_service: MagicMock,
        owner_user_id: UUID,
        alliance_id: UUID,
    ):
        """Should raise HTTPException 400 when trying to change own role"""
        # Arrange
        mock_permission_service.require_owner = AsyncMock()

        # Act & Assert
        with pytest.raises(HTTPException) as exc_info:
            await collaborator_service.update_collaborator_role(
                owner_user_id, alliance_id, owner_user_id, "collaborator"
            )
        assert exc_info.value.status_code == 400
        assert "Cannot change your own role" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_should_raise_403_when_changing_owner_role(
        self,
        collaborator_service: AllianceCollaboratorService,
        mock_permission_service: MagicMock,
        mock_collaborator_repo: MagicMock,
        owner_user_id: UUID,
        target_user_id: UUID,
        alliance_id: UUID,
    ):
        """Should raise HTTPException 403 when trying to change owner's role"""
        # Arrange
        mock_permission_service.require_owner = AsyncMock()
        mock_collaborator_repo.get_collaborator_role = AsyncMock(return_value="owner")

        # Act & Assert
        with pytest.raises(HTTPException) as exc_info:
            await collaborator_service.update_collaborator_role(
                owner_user_id, alliance_id, target_user_id, "member"
            )
        assert exc_info.value.status_code == 403
        assert "Cannot change owner's role" in exc_info.value.detail


# =============================================================================
# Tests for get_user_email
# =============================================================================


class TestGetUserEmail:
    """Tests for get_user_email method"""

    @pytest.mark.asyncio
    async def test_should_return_email_when_user_found(
        self,
        collaborator_service: AllianceCollaboratorService,
        mock_supabase: MagicMock,
        target_user_id: UUID,
    ):
        """Should return email when user is found"""
        # Arrange
        expected_email = "user@example.com"
        mock_user_response = MagicMock()
        mock_user_response.user = MagicMock()
        mock_user_response.user.email = expected_email
        mock_supabase.auth.admin.get_user_by_id.return_value = mock_user_response

        # Act
        result = await collaborator_service.get_user_email(target_user_id)

        # Assert
        assert result == expected_email

    @pytest.mark.asyncio
    async def test_should_return_none_when_user_not_found(
        self,
        collaborator_service: AllianceCollaboratorService,
        mock_supabase: MagicMock,
        target_user_id: UUID,
    ):
        """Should return None when user is not found"""
        # Arrange
        mock_supabase.auth.admin.get_user_by_id.return_value = None

        # Act
        result = await collaborator_service.get_user_email(target_user_id)

        # Assert
        assert result is None


# =============================================================================
# Tests for process_pending_invitations
# =============================================================================


class TestProcessPendingInvitations:
    """Tests for process_pending_invitations method"""

    @pytest.mark.asyncio
    async def test_should_process_invitations_successfully(
        self,
        collaborator_service: AllianceCollaboratorService,
        mock_invitation_repo: MagicMock,
        mock_collaborator_repo: MagicMock,
        target_user_id: UUID,
        alliance_id: UUID,
    ):
        """Should process pending invitations and add user as collaborator"""
        # Arrange
        email = "newuser@example.com"
        invitation = create_mock_pending_invitation(alliance_id, email)

        mock_invitation_repo.get_pending_by_email = AsyncMock(return_value=[invitation])
        mock_collaborator_repo.is_collaborator = AsyncMock(return_value=False)
        mock_collaborator_repo.add_collaborator = AsyncMock()
        mock_invitation_repo.mark_as_accepted = AsyncMock()

        # Act
        result = await collaborator_service.process_pending_invitations(target_user_id, email)

        # Assert
        assert result == 1
        mock_collaborator_repo.add_collaborator.assert_called_once()
        mock_invitation_repo.mark_as_accepted.assert_called_once()

    @pytest.mark.asyncio
    async def test_should_return_zero_when_no_pending_invitations(
        self,
        collaborator_service: AllianceCollaboratorService,
        mock_invitation_repo: MagicMock,
        target_user_id: UUID,
    ):
        """Should return 0 when no pending invitations exist"""
        # Arrange
        email = "noninvited@example.com"
        mock_invitation_repo.get_pending_by_email = AsyncMock(return_value=[])

        # Act
        result = await collaborator_service.process_pending_invitations(target_user_id, email)

        # Assert
        assert result == 0

    @pytest.mark.asyncio
    async def test_should_handle_already_collaborator_case(
        self,
        collaborator_service: AllianceCollaboratorService,
        mock_invitation_repo: MagicMock,
        mock_collaborator_repo: MagicMock,
        target_user_id: UUID,
        alliance_id: UUID,
    ):
        """Should mark invitation as accepted if user is already collaborator"""
        # Arrange
        email = "existing@example.com"
        invitation = create_mock_pending_invitation(alliance_id, email)

        mock_invitation_repo.get_pending_by_email = AsyncMock(return_value=[invitation])
        mock_collaborator_repo.is_collaborator = AsyncMock(return_value=True)
        mock_invitation_repo.mark_as_accepted = AsyncMock()

        # Act
        result = await collaborator_service.process_pending_invitations(target_user_id, email)

        # Assert
        assert result == 1
        mock_invitation_repo.mark_as_accepted.assert_called_once()
        mock_collaborator_repo.add_collaborator.assert_not_called()


# =============================================================================
# Tests for get_alliance_collaborators
# =============================================================================


class TestGetAllianceCollaborators:
    """Tests for get_alliance_collaborators method"""

    @pytest.mark.asyncio
    async def test_should_return_collaborators_with_enriched_data(
        self,
        collaborator_service: AllianceCollaboratorService,
        mock_collaborator_repo: MagicMock,
        mock_supabase: MagicMock,
        owner_user_id: UUID,
        target_user_id: UUID,
        alliance_id: UUID,
    ):
        """Should return collaborators with user metadata"""
        # Arrange
        collaborator_data = {
            "id": str(uuid4()),
            "user_id": str(target_user_id),
            "role": "member",
        }
        mock_user_response = MagicMock()
        mock_user_response.user = MagicMock()
        mock_user_response.user.email = "member@example.com"
        mock_user_response.user.user_metadata = {
            "full_name": "Test Member",
            "avatar_url": "https://example.com/avatar.png",
        }

        mock_collaborator_repo.is_collaborator = AsyncMock(return_value=True)
        mock_collaborator_repo.get_alliance_collaborators = AsyncMock(
            return_value=[collaborator_data]
        )
        mock_supabase.auth.admin.get_user_by_id.return_value = mock_user_response

        # Act
        result = await collaborator_service.get_alliance_collaborators(
            owner_user_id, alliance_id
        )

        # Assert
        assert len(result) == 1
        assert result[0]["user_email"] == "member@example.com"
        assert result[0]["user_full_name"] == "Test Member"

    @pytest.mark.asyncio
    async def test_should_raise_403_when_not_collaborator(
        self,
        collaborator_service: AllianceCollaboratorService,
        mock_collaborator_repo: MagicMock,
        owner_user_id: UUID,
        alliance_id: UUID,
    ):
        """Should raise HTTPException 403 when user is not a collaborator"""
        # Arrange
        mock_collaborator_repo.is_collaborator = AsyncMock(return_value=False)

        # Act & Assert
        with pytest.raises(HTTPException) as exc_info:
            await collaborator_service.get_alliance_collaborators(owner_user_id, alliance_id)
        assert exc_info.value.status_code == 403
        assert "not a collaborator" in exc_info.value.detail
