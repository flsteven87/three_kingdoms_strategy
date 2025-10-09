"""
Alliance Collaborator Service

符合 CLAUDE.md:
- 🔴 Service Layer: Business logic and workflow orchestration
- 🔴 NO direct database calls (use Repository)
- 🟡 Exception chaining with 'from e'
"""

from uuid import UUID

from fastapi import HTTPException, status

from src.core.database import get_supabase_client
from src.repositories.alliance_collaborator_repository import (
    AllianceCollaboratorRepository,
)


class AllianceCollaboratorService:
    """
    Alliance collaborator service for managing collaboration.

    Responsibilities:
    - Add/remove collaborators
    - Verify permissions
    - Handle business logic
    """

    def __init__(self):
        self._collaborator_repo = AllianceCollaboratorRepository()
        self._supabase = get_supabase_client()

    async def add_collaborator_by_email(
        self, current_user_id: UUID, alliance_id: UUID, email: str
    ) -> dict:
        """
        Add collaborator to alliance by email.

        Business Rules:
        - Phase 1: Any collaborator can add new collaborators
        - Phase 2: Restrict to owner/admin only
        - User must be registered in auth.users
        - Cannot add duplicate collaborators

        Args:
            current_user_id: Current authenticated user
            alliance_id: Alliance to add collaborator to
            email: Email of user to add

        Returns:
            dict: Collaborator information

        Raises:
            HTTPException 403: Not a collaborator of alliance
            HTTPException 404: Email not found
            HTTPException 409: User already a collaborator
        """
        try:
            # 1. Verify current user is collaborator of alliance
            if not await self._collaborator_repo.is_collaborator(
                alliance_id, current_user_id
            ):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You are not a collaborator of this alliance",
                )

            # 2. Look up user by email in auth.users
            # Note: Using service_role client to access auth.users
            result = self._supabase.auth.admin.list_users()
            target_user = next((u for u in result if u.email == email), None)

            if not target_user:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="User with this email not found. Please ask them to register first.",
                )

            target_user_id = UUID(target_user.id)

            # 3. Check if already a collaborator
            if await self._collaborator_repo.is_collaborator(
                alliance_id, target_user_id
            ):
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="User is already a collaborator of this alliance",
                )

            # 4. Add collaborator
            collaborator = await self._collaborator_repo.add_collaborator(
                alliance_id=alliance_id,
                user_id=target_user_id,
                role="member",
                invited_by=current_user_id,
            )

            return {
                "id": str(collaborator.id),
                "user_id": str(collaborator.user_id),
                "email": email,
                "role": collaborator.role,
                "joined_at": collaborator.joined_at.isoformat(),
            }

        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to add collaborator",
            ) from e

    async def remove_collaborator(
        self, current_user_id: UUID, alliance_id: UUID, target_user_id: UUID
    ) -> bool:
        """
        Remove collaborator from alliance.

        Business Rules:
        - Phase 1: Any collaborator can remove others (except owner and self)
        - Phase 2: Restrict to owner/admin only
        - Cannot remove alliance owner
        - Cannot remove yourself

        Args:
            current_user_id: Current authenticated user
            alliance_id: Alliance UUID
            target_user_id: User to remove

        Returns:
            bool: True if successful

        Raises:
            HTTPException 403: Permission denied
            HTTPException 400: Invalid operation
        """
        try:
            # 1. Verify current user is collaborator
            if not await self._collaborator_repo.is_collaborator(
                alliance_id, current_user_id
            ):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You are not a collaborator of this alliance",
                )

            # 2. Cannot remove owner
            target_role = await self._collaborator_repo.get_collaborator_role(
                alliance_id, target_user_id
            )
            if target_role == "owner":
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Cannot remove alliance owner",
                )

            # 3. Cannot remove self
            if current_user_id == target_user_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Cannot remove yourself from alliance",
                )

            # 4. Remove collaborator
            return await self._collaborator_repo.remove_collaborator(
                alliance_id, target_user_id
            )

        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to remove collaborator",
            ) from e

    async def get_alliance_collaborators(
        self, current_user_id: UUID, alliance_id: UUID
    ) -> list[dict]:
        """
        Get all collaborators of alliance.

        Args:
            current_user_id: Current authenticated user
            alliance_id: Alliance UUID

        Returns:
            list[dict]: List of collaborators

        Raises:
            HTTPException 403: Not a collaborator
        """
        try:
            # Verify permission
            if not await self._collaborator_repo.is_collaborator(
                alliance_id, current_user_id
            ):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You are not a collaborator of this alliance",
                )

            return await self._collaborator_repo.get_alliance_collaborators(alliance_id)

        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to get alliance collaborators",
            ) from e
