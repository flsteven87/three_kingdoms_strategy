"""
Permission Service

符合 CLAUDE.md:
- 🔴 Service Layer: Business logic for permission checking
- 🔴 NO direct database calls (use Repository)
- 🟡 Exception chaining with 'from e'
"""

import logging
from uuid import UUID

from fastapi import HTTPException, status

from src.repositories.alliance_collaborator_repository import (
    AllianceCollaboratorRepository,
)

logger = logging.getLogger(__name__)


class PermissionService:
    """
    Permission service for role-based access control

    Provides centralized permission checking across the application.
    All permission checks should go through this service for consistency.
    """

    def __init__(self):
        """Initialize permission service with repository"""
        self._collaborator_repo = AllianceCollaboratorRepository()

    async def get_user_role(self, user_id: UUID, alliance_id: UUID) -> str | None:
        """
        Get user's role in an alliance

        Args:
            user_id: User UUID
            alliance_id: Alliance UUID

        Returns:
            str | None: User's role ('owner', 'collaborator', 'member') or None if not a member

        Raises:
            HTTPException: If repository operation fails
        """
        try:
            role = await self._collaborator_repo.get_collaborator_role(alliance_id, user_id)
            return role
        except ValueError:
            return None
        except HTTPException:
            raise
        except Exception as e:
            logger.error(
                f"Failed to get user role - user_id={user_id}, alliance_id={alliance_id}, "
                f"error={type(e).__name__}: {str(e)}",
                exc_info=True
            )
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to get user role: {type(e).__name__}"
            ) from e

    async def check_permission(
        self,
        user_id: UUID,
        alliance_id: UUID,
        required_roles: list[str]
    ) -> bool:
        """
        Check if user has one of the required roles

        Args:
            user_id: User UUID
            alliance_id: Alliance UUID
            required_roles: List of acceptable roles (e.g., ['owner', 'collaborator'])

        Returns:
            bool: True if user has one of the required roles

        Example:
            >>> can_upload = await permission_service.check_permission(
            ...     user_id,
            ...     alliance_id,
            ...     ['owner', 'collaborator']
            ... )
        """
        role = await self.get_user_role(user_id, alliance_id)
        return role in required_roles if role else False

    async def require_permission(
        self,
        user_id: UUID,
        alliance_id: UUID,
        required_roles: list[str],
        action: str = "perform this action"
    ) -> None:
        """
        Require user to have one of the specified roles, raise 403 if not

        Args:
            user_id: User UUID
            alliance_id: Alliance UUID
            required_roles: List of acceptable roles
            action: Description of the action being performed (for error message)

        Raises:
            HTTPException 403: If user doesn't have required permission
            HTTPException 404: If user is not a member of the alliance

        Example:
            >>> await permission_service.require_permission(
            ...     user_id,
            ...     alliance_id,
            ...     ['owner', 'collaborator'],
            ...     "upload CSV files"
            ... )
        """
        role = await self.get_user_role(user_id, alliance_id)

        if role is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="You are not a member of this alliance"
            )

        if role not in required_roles:
            logger.warning(
                f"Permission denied - user_id={user_id}, role={role}, "
                f"required={required_roles}, action={action}"
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"You don't have permission to {action}. Required role: {' or '.join(required_roles)}, your role: {role}"
            )

    async def require_owner(
        self,
        user_id: UUID,
        alliance_id: UUID,
        action: str = "perform this action"
    ) -> None:
        """
        Require user to be the alliance owner

        Convenience method for owner-only operations

        Args:
            user_id: User UUID
            alliance_id: Alliance UUID
            action: Description of the action

        Raises:
            HTTPException 403: If user is not owner
        """
        await self.require_permission(user_id, alliance_id, ['owner'], action)

    async def require_owner_or_collaborator(
        self,
        user_id: UUID,
        alliance_id: UUID,
        action: str = "perform this action"
    ) -> None:
        """
        Require user to be owner or collaborator

        Convenience method for write operations

        Args:
            user_id: User UUID
            alliance_id: Alliance UUID
            action: Description of the action

        Raises:
            HTTPException 403: If user is only a member
        """
        await self.require_permission(
            user_id,
            alliance_id,
            ['owner', 'collaborator'],
            action
        )

    async def can_manage_collaborators(self, user_id: UUID, alliance_id: UUID) -> bool:
        """Check if user can manage collaborators (owner only)"""
        return await self.check_permission(user_id, alliance_id, ['owner'])

    async def can_upload_data(self, user_id: UUID, alliance_id: UUID) -> bool:
        """Check if user can upload CSV data (owner + collaborator)"""
        return await self.check_permission(user_id, alliance_id, ['owner', 'collaborator'])

    async def can_manage_seasons(self, user_id: UUID, alliance_id: UUID) -> bool:
        """Check if user can manage seasons (owner + collaborator)"""
        return await self.check_permission(user_id, alliance_id, ['owner', 'collaborator'])

    async def can_manage_weights(self, user_id: UUID, alliance_id: UUID) -> bool:
        """Check if user can manage hegemony weights (owner + collaborator)"""
        return await self.check_permission(user_id, alliance_id, ['owner', 'collaborator'])

    async def can_view_data(self, user_id: UUID, alliance_id: UUID) -> bool:
        """Check if user can view data (all members)"""
        return await self.check_permission(
            user_id,
            alliance_id,
            ['owner', 'collaborator', 'member']
        )
