"""
Alliance Service Layer

符合 CLAUDE.md 🔴:
- Business logic layer
- Orchestrates repositories
- No direct database calls
"""

from uuid import UUID

from src.models.alliance import Alliance, AllianceCreate, AllianceUpdate
from src.repositories.alliance_collaborator_repository import (
    AllianceCollaboratorRepository,
)
from src.repositories.alliance_repository import AllianceRepository
from src.services.permission_service import PermissionService


class AllianceService:
    """
    Alliance business logic service

    Handles alliance CRUD operations and validation
    """

    def __init__(self):
        """Initialize alliance service with repositories"""
        self._repo = AllianceRepository()
        self._collaborator_repo = AllianceCollaboratorRepository()
        self._permission_service = PermissionService()

    async def get_user_alliance(self, user_id: UUID) -> Alliance | None:
        """
        Get user's alliance (via alliance_collaborators).

        Args:
            user_id: User UUID from authentication

        Returns:
            Alliance instance or None if not found

        Note:
            Changed from get_by_user_id() to get_by_collaborator()
        """
        return await self._repo.get_by_collaborator(user_id)

    async def create_alliance(self, user_id: UUID, alliance_data: AllianceCreate) -> Alliance:
        """
        Create new alliance and automatically add creator as owner.

        Args:
            user_id: User UUID from authentication
            alliance_data: Alliance creation data

        Returns:
            Created alliance instance

        Raises:
            ValueError: If user already has an alliance

        Note:
            Phase 1 Change:
            - No longer stores user_id in alliances table
            - Automatically adds creator to alliance_collaborators with role='owner'
        """
        # Check if user already has an alliance
        existing = await self._repo.get_by_collaborator(user_id)
        if existing:
            raise ValueError("User already has an alliance")

        # 1. Create alliance (no user_id field)
        data = alliance_data.model_dump()
        alliance = await self._repo.create(data)

        # 2. Add creator as owner in alliance_collaborators
        await self._collaborator_repo.add_collaborator(
            alliance_id=alliance.id,
            user_id=user_id,
            role="owner",
            invited_by=None,  # Owner is not invited by anyone
        )

        return alliance

    async def update_alliance(self, user_id: UUID, alliance_data: AllianceUpdate) -> Alliance:
        """
        Update user's alliance.

        Permission: owner + collaborator + active subscription

        Args:
            user_id: User UUID from authentication
            alliance_data: Alliance update data

        Returns:
            Updated alliance instance

        Raises:
            ValueError: If user has no alliance
            PermissionError: If user doesn't have permission
            SeasonQuotaExhaustedError: If trial/subscription has expired

        Note:
            Changed from get_by_user_id() to get_by_collaborator()
        """
        # Get user's alliance
        alliance = await self._repo.get_by_collaborator(user_id)
        if not alliance:
            raise ValueError("User has no alliance to update")

        # Verify write permission: role + subscription check
        await self._permission_service.require_write_permission(
            user_id, alliance.id, "update alliance settings"
        )

        # Update only provided fields
        update_data = alliance_data.model_dump(exclude_unset=True)

        return await self._repo.update(alliance.id, update_data)

    async def delete_alliance(self, user_id: UUID) -> bool:
        """
        Delete user's alliance (only owner can delete).

        Permission: owner only

        Args:
            user_id: User UUID from authentication

        Returns:
            True if deleted successfully

        Raises:
            ValueError: If user has no alliance
            HTTPException 403: If user is not owner

        Note:
            Phase 1 Change:
            - Verify user is owner via alliance_collaborators
            - CASCADE will automatically delete all collaborators
        """
        # Get user's alliance
        alliance = await self._repo.get_by_collaborator(user_id)
        if not alliance:
            raise ValueError("User has no alliance to delete")

        # Verify permission: only owner can delete alliance
        await self._permission_service.require_owner(user_id, alliance.id, "delete alliance")

        # Delete alliance (collaborators will be deleted via CASCADE)
        return await self._repo.delete(alliance.id)
