"""
Alliance Collaborator Service

符合 CLAUDE.md:
- 🔴 Service Layer: Business logic and workflow orchestration
- 🔴 NO direct database calls (use Repository)
- 🟡 Exception chaining with 'from e'
"""

import logging
from uuid import UUID

from fastapi import HTTPException, status

from src.core.database import get_supabase_client
from src.repositories.alliance_collaborator_repository import (
    AllianceCollaboratorRepository,
)
from src.repositories.pending_invitation_repository import PendingInvitationRepository
from src.services.permission_service import PermissionService

logger = logging.getLogger(__name__)


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
        self._invitation_repo = PendingInvitationRepository()
        self._permission_service = PermissionService()
        self._supabase = get_supabase_client()

    async def add_collaborator_by_email(
        self, current_user_id: UUID, alliance_id: UUID, email: str
    ) -> dict:
        """
        Add collaborator to alliance by email.

        Now supports inviting users who haven't registered yet!

        Business Rules:
        - Only owner can add new collaborators (enforced by permission check)
        - If user exists: Add immediately as 'member' role
        - If user doesn't exist: Create pending invitation with 'member' role

        Args:
            current_user_id: Current authenticated user
            alliance_id: Alliance to add collaborator to
            email: Email of user to add

        Returns:
            dict: Collaborator information or pending invitation

        Raises:
            HTTPException 403: Not a collaborator of alliance
            HTTPException 409: User already a collaborator or invitation exists
        """
        try:
            # 1. Verify current user is owner of alliance (permission check)
            await self._permission_service.require_owner(
                current_user_id, alliance_id, "add collaborators"
            )

            # 2. Look up user by email in auth.users
            result = self._supabase.auth.admin.list_users()
            users_list = result.users if hasattr(result, "users") else result
            users_array = list(users_list)
            target_user = next((u for u in users_array if u.email == email), None)

            # 3. If user not found, create pending invitation
            if not target_user:
                # Check if invitation already exists
                existing_invitation = await self._invitation_repo.check_existing_invitation(
                    alliance_id, email
                )

                if existing_invitation:
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail="Invitation already sent to this email. Waiting for user to register.",
                    )

                # Create new pending invitation
                invitation = await self._invitation_repo.create_invitation(
                    alliance_id=alliance_id,
                    invited_email=email,
                    invited_by=current_user_id,
                    role="member",
                )

                return {
                    "id": str(invitation.id),
                    "invited_email": email,
                    "role": invitation.role,
                    "invited_at": invitation.invited_at.isoformat(),
                    "status": "pending",
                    "is_pending_registration": True,
                    "message": "Invitation sent. User will be added when they register.",
                }

            # 4. User exists - add as collaborator immediately
            target_user_id = UUID(target_user.id)

            # Check if already a collaborator
            if await self._collaborator_repo.is_collaborator(alliance_id, target_user_id):
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="User is already a collaborator of this alliance",
                )

            # Add collaborator
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
        - Only owner can remove collaborators (enforced by permission check)
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
            # 1. Verify current user is owner (permission check)
            await self._permission_service.require_owner(
                current_user_id, alliance_id, "remove collaborators"
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
            return await self._collaborator_repo.remove_collaborator(alliance_id, target_user_id)

        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to remove collaborator",
            ) from e

    async def update_collaborator_role(
        self, current_user_id: UUID, alliance_id: UUID, target_user_id: UUID, new_role: str
    ) -> dict:
        """
        Update collaborator's role in alliance.

        Business Rules:
        - Only owner can update roles
        - Cannot change owner's role
        - Cannot change your own role (prevent self-privilege escalation)
        - Cannot promote to owner (owner transfer not yet supported)
        - Valid roles: 'collaborator', 'member'

        Args:
            current_user_id: Current authenticated user
            alliance_id: Alliance UUID
            target_user_id: User whose role to update
            new_role: New role ('collaborator' or 'member')

        Returns:
            dict: Updated collaborator information

        Raises:
            HTTPException 400: Invalid role or operation
            HTTPException 403: Permission denied
        """
        try:
            # 1. Verify current user is owner
            await self._permission_service.require_owner(
                current_user_id, alliance_id, "update collaborator roles"
            )

            # 2. Validate new role
            if new_role not in ["collaborator", "member"]:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid role. Must be 'collaborator' or 'member'",
                )

            # 3. Cannot promote to owner (not supported yet)
            if new_role == "owner":
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Cannot promote to owner. Owner transfer not yet supported.",
                )

            # 4. Cannot change your own role (prevent self-privilege modification)
            if current_user_id == target_user_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Cannot change your own role",
                )

            # 5. Cannot change owner's role
            target_role = await self._collaborator_repo.get_collaborator_role(
                alliance_id, target_user_id
            )
            if target_role == "owner":
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Cannot change owner's role",
                )

            # 6. Update role
            updated_collaborator = await self._collaborator_repo.update_role(
                alliance_id, target_user_id, new_role
            )

            return {
                "id": str(updated_collaborator.id),
                "user_id": str(updated_collaborator.user_id),
                "role": updated_collaborator.role,
                "updated_at": updated_collaborator.joined_at.isoformat(),
            }

        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to update collaborator role",
            ) from e

    async def get_user_email(self, user_id: UUID) -> str | None:
        """
        Get user email from Supabase Auth.

        Args:
            user_id: User UUID

        Returns:
            Email address or None if not found

        符合 CLAUDE.md 🔴: Service layer handles external API calls
        """
        try:
            user_response = self._supabase.auth.admin.get_user_by_id(str(user_id))
            return user_response.user.email if user_response and user_response.user else None
        except Exception as e:
            logger.error(f"Failed to get user email for {user_id}: {e}")
            return None

    async def process_pending_invitations(self, user_id: UUID, email: str) -> int:
        """
        Process all pending invitations for a newly registered user.

        This should be called after user registration/login to automatically
        add them to alliances they were invited to.

        Args:
            user_id: UUID of newly registered user
            email: Email address of the user

        Returns:
            Number of invitations processed

        符合 CLAUDE.md 🔴: Service layer orchestrates multi-step workflow
        """
        try:
            logger.info(f"Looking for pending invitations for: {email}")

            # 1. Get all pending invitations for this email
            pending_invitations = await self._invitation_repo.get_pending_by_email(email)

            if not pending_invitations:
                logger.info(f"No pending invitations found for: {email}")
                return 0

            logger.info(f"Found {len(pending_invitations)} pending invitation(s) for: {email}")
            processed_count = 0

            # 2. Process each invitation
            for invitation in pending_invitations:
                try:
                    logger.debug(f"Processing invitation to alliance_id: {invitation.alliance_id}")

                    # Check if already a collaborator (prevent duplicates)
                    is_existing = await self._collaborator_repo.is_collaborator(
                        invitation.alliance_id, user_id
                    )

                    if is_existing:
                        logger.warning(
                            "User already a collaborator, marking invitation as accepted"
                        )
                        await self._invitation_repo.mark_as_accepted(invitation.id)
                        processed_count += 1
                        continue

                    # Add user as collaborator
                    logger.debug(f"Adding user as collaborator with role: {invitation.role}")
                    await self._collaborator_repo.add_collaborator(
                        alliance_id=invitation.alliance_id,
                        user_id=user_id,
                        role=invitation.role,
                        invited_by=invitation.invited_by,
                    )

                    # Mark invitation as accepted
                    await self._invitation_repo.mark_as_accepted(invitation.id)
                    processed_count += 1
                    logger.debug("Successfully processed invitation")

                except Exception as e:
                    logger.error(f"Failed to process invitation: {e}")
                    # Continue processing other invitations even if one fails
                    continue

            logger.info(f"Processed {processed_count}/{len(pending_invitations)} invitations")
            return processed_count

        except Exception as e:
            logger.error(f"Error in process_pending_invitations: {e}")
            # Don't raise exception - this is a background process
            return 0

    async def get_alliance_collaborators(
        self, current_user_id: UUID, alliance_id: UUID
    ) -> list[dict]:
        """
        Get all collaborators of alliance with enriched user data.

        Args:
            current_user_id: Current authenticated user
            alliance_id: Alliance UUID

        Returns:
            list[dict]: List of collaborators with user_full_name and user_avatar_url

        Raises:
            HTTPException 403: Not a collaborator
        """
        try:
            # Verify permission
            if not await self._collaborator_repo.is_collaborator(alliance_id, current_user_id):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You are not a collaborator of this alliance",
                )

            collaborators = await self._collaborator_repo.get_alliance_collaborators(alliance_id)

            # Enrich with user metadata from Supabase Auth
            enriched_collaborators = []
            for collab in collaborators:
                user_id = collab.get("user_id")
                if not user_id:
                    enriched_collaborators.append(collab)
                    continue

                try:
                    user_response = self._supabase.auth.admin.get_user_by_id(str(user_id))

                    # Handle different response formats from Supabase Auth
                    user = None
                    if hasattr(user_response, "user"):
                        user = user_response.user
                    elif isinstance(user_response, dict) and "user" in user_response:
                        user = user_response["user"]
                    else:
                        user = user_response

                    if user:
                        # Extract email
                        email = (
                            getattr(user, "email", None)
                            if hasattr(user, "email")
                            else user.get("email")
                        )
                        if email:
                            collab["user_email"] = email

                        # Extract user metadata (full_name, avatar_url)
                        user_metadata = None
                        if hasattr(user, "user_metadata"):
                            user_metadata = user.user_metadata
                        elif isinstance(user, dict) and "user_metadata" in user:
                            user_metadata = user["user_metadata"]

                        if user_metadata and isinstance(user_metadata, dict):
                            full_name = user_metadata.get("full_name") or user_metadata.get("name")
                            avatar_url = user_metadata.get("avatar_url") or user_metadata.get(
                                "picture"
                            )

                            if full_name:
                                collab["user_full_name"] = full_name
                            if avatar_url:
                                collab["user_avatar_url"] = avatar_url

                except Exception as e:
                    logger.warning(f"Failed to fetch user metadata for {user_id}: {e}")

                enriched_collaborators.append(collab)

            return enriched_collaborators

        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to get alliance collaborators",
            ) from e
