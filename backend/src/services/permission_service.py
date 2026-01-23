"""
Permission Service

符合 CLAUDE.md:
- 🔴 Service Layer: Business logic for permission checking
- 🔴 NO direct database calls (use Repository)
- 🟡 Exception chaining with 'from e'
- 🟡 Use native exceptions, not HTTPException

This service is the SINGLE ENTRY POINT for all permission checks:
- Role-based access control (owner, collaborator, member)
- Subscription-based write access control

Usage:
    # For write operations (role + subscription check)
    await permission_service.require_write_permission(user_id, alliance_id, "upload CSV")

    # For owner-only operations (no subscription check needed)
    await permission_service.require_owner(user_id, alliance_id, "delete alliance")
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING
from uuid import UUID

from src.repositories.alliance_collaborator_repository import (
    AllianceCollaboratorRepository,
)

if TYPE_CHECKING:
    from src.services.season_quota_service import SeasonQuotaService

logger = logging.getLogger(__name__)


class PermissionService:
    """
    Permission service for role-based and subscription-based access control.

    This is the SINGLE ENTRY POINT for all permission checks in the application.
    Other services should only depend on PermissionService, not SeasonQuotaService directly.

    Permission Matrix:
    - View data: any member (no subscription required)
    - Write operations: owner/collaborator + active subscription
    - Owner-only operations: owner only (no subscription required)
    """

    def __init__(self, quota_service: SeasonQuotaService | None = None):
        """
        Initialize permission service.

        Args:
            quota_service: Optional SeasonQuotaService instance.
                           If not provided, one will be created automatically.
        """
        self._collaborator_repo = AllianceCollaboratorRepository()

        # Lazy import to avoid circular dependency
        if quota_service is None:
            from src.services.season_quota_service import SeasonQuotaService

            self._quota_service: SeasonQuotaService = SeasonQuotaService()
        else:
            self._quota_service = quota_service

    async def get_user_role(self, user_id: UUID, alliance_id: UUID) -> str | None:
        """
        Get user's role in an alliance

        Args:
            user_id: User UUID
            alliance_id: Alliance UUID

        Returns:
            str | None: User's role ('owner', 'collaborator', 'member') or None if not a member

        Raises:
            RuntimeError: If repository operation fails
        """
        try:
            role = await self._collaborator_repo.get_collaborator_role(alliance_id, user_id)
            return role
        except ValueError:
            return None
        except Exception as e:
            logger.error(
                f"Failed to get user role - user_id={user_id}, alliance_id={alliance_id}, "
                f"error={type(e).__name__}: {str(e)}",
                exc_info=True,
            )
            raise RuntimeError(f"Failed to get user role: {type(e).__name__}") from e

    async def check_permission(
        self, user_id: UUID, alliance_id: UUID, required_roles: list[str]
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
        action: str = "perform this action",
    ) -> None:
        """
        Require user to have one of the specified roles

        Args:
            user_id: User UUID
            alliance_id: Alliance UUID
            required_roles: List of acceptable roles
            action: Description of the action being performed (for error message)

        Raises:
            ValueError: If user is not a member of the alliance
            PermissionError: If user doesn't have required permission

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
            raise ValueError("You are not a member of this alliance")

        if role not in required_roles:
            logger.warning(
                f"Permission denied - user_id={user_id}, role={role}, "
                f"required={required_roles}, action={action}"
            )
            raise PermissionError(
                f"You don't have permission to {action}. "
                f"Required role: {' or '.join(required_roles)}, your role: {role}"
            )

    async def require_owner(
        self, user_id: UUID, alliance_id: UUID, action: str = "perform this action"
    ) -> None:
        """
        Require user to be the alliance owner

        Convenience method for owner-only operations

        Args:
            user_id: User UUID
            alliance_id: Alliance UUID
            action: Description of the action

        Raises:
            ValueError: If user is not a member
            PermissionError: If user is not owner
        """
        await self.require_permission(user_id, alliance_id, ["owner"], action)

    async def require_owner_or_collaborator(
        self, user_id: UUID, alliance_id: UUID, action: str = "perform this action"
    ) -> None:
        """
        Require user to be owner or collaborator

        Convenience method for write operations

        Args:
            user_id: User UUID
            alliance_id: Alliance UUID
            action: Description of the action

        Raises:
            ValueError: If user is not a member
            PermissionError: If user is only a member (not owner/collaborator)
        """
        await self.require_permission(user_id, alliance_id, ["owner", "collaborator"], action)

    async def can_manage_collaborators(self, user_id: UUID, alliance_id: UUID) -> bool:
        """Check if user can manage collaborators (owner only)"""
        return await self.check_permission(user_id, alliance_id, ["owner"])

    async def can_upload_data(self, user_id: UUID, alliance_id: UUID) -> bool:
        """Check if user can upload CSV data (owner + collaborator)"""
        return await self.check_permission(user_id, alliance_id, ["owner", "collaborator"])

    async def can_manage_seasons(self, user_id: UUID, alliance_id: UUID) -> bool:
        """Check if user can manage seasons (owner + collaborator)"""
        return await self.check_permission(user_id, alliance_id, ["owner", "collaborator"])

    async def can_manage_weights(self, user_id: UUID, alliance_id: UUID) -> bool:
        """Check if user can manage hegemony weights (owner + collaborator)"""
        return await self.check_permission(user_id, alliance_id, ["owner", "collaborator"])

    async def can_view_data(self, user_id: UUID, alliance_id: UUID) -> bool:
        """Check if user can view data (all members)"""
        return await self.check_permission(
            user_id, alliance_id, ["owner", "collaborator", "member"]
        )

    async def require_write_permission(
        self, user_id: UUID, alliance_id: UUID, action: str = "perform this action"
    ) -> None:
        """
        Require user to have write permission (role + active subscription).

        This is the PRIMARY METHOD for checking write access. It combines:
        1. Role check: User must be owner or collaborator
        2. Subscription check: Alliance must have active trial or subscription

        All write operations should use this method for consistent permission enforcement.

        Args:
            user_id: User UUID
            alliance_id: Alliance UUID
            action: Description of the action being attempted (for error messages)

        Raises:
            ValueError: If user is not a member of the alliance
            PermissionError: If user doesn't have required role (owner/collaborator)
            SeasonQuotaExhaustedError: If trial/subscription has expired

        Example:
            >>> await permission_service.require_write_permission(
            ...     user_id,
            ...     alliance_id,
            ...     "upload CSV data"
            ... )
        """
        # Step 1: Check role (must be owner or collaborator)
        await self.require_owner_or_collaborator(user_id, alliance_id, action)

        # Step 2: Check quota (must be active)
        await self._quota_service.require_write_access(alliance_id, action)

    async def require_active_subscription(
        self, alliance_id: UUID, action: str = "perform this action"
    ) -> None:
        """
        Require alliance to have active subscription (subscription check only).

        Use this method when role has already been verified separately.
        For most cases, prefer require_write_permission() which combines both checks.

        Args:
            alliance_id: Alliance UUID
            action: Description of the action being attempted

        Raises:
            SeasonQuotaExhaustedError: If trial/subscription has expired
        """
        await self._quota_service.require_write_access(alliance_id, action)

    async def require_role_permission(
        self, user_id: UUID, alliance_id: UUID, action: str = "perform this action"
    ) -> None:
        """
        Require user to have write role (owner or collaborator) without subscription check.

        Use this for operations that don't require active subscription, such as:
        - Creating draft seasons
        - Updating season metadata
        - Viewing/editing existing data

        For operations that require subscription (like activating seasons),
        use require_write_permission() instead.

        Args:
            user_id: User UUID
            alliance_id: Alliance UUID
            action: Description of the action being attempted

        Raises:
            ValueError: If user is not a member of the alliance
            PermissionError: If user doesn't have required role (owner/collaborator)
        """
        await self.require_owner_or_collaborator(user_id, alliance_id, action)
