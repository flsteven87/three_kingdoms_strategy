"""
Alliance Collaborators API Endpoints

符合 CLAUDE.md:
- 🔴 API Layer: HTTP handling, validation, authentication only
- 🔴 Delegate ALL business logic to Service layer
- 🔴 Use Depends() for dependency injection
"""

import logging
from uuid import UUID

from fastapi import APIRouter, status

from src.core.dependencies import (
    AllianceCollaboratorServiceDep,
    PermissionServiceDep,
    UserIdDep,
)
from src.models.alliance_collaborator import (
    AllianceCollaboratorCreate,
    AllianceCollaboratorListResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["alliance-collaborators"])


@router.post(
    "/alliances/{alliance_id}/collaborators",
    status_code=status.HTTP_201_CREATED,
    summary="Add collaborator to alliance",
)
async def add_alliance_collaborator(
    alliance_id: UUID,
    data: AllianceCollaboratorCreate,
    current_user_id: UserIdDep,
    service: AllianceCollaboratorServiceDep,
):
    """
    Add a collaborator to alliance by email.

    Now supports inviting users who haven't registered yet!

    Requirements:
    - Current user must be a collaborator of the alliance
    - If email is registered: Add user immediately
    - If email not registered: Create pending invitation (auto-accept on registration)

    Returns:
    - 201: Collaborator added successfully OR invitation created
    - 403: Not a collaborator of alliance
    - 409: User already a collaborator OR invitation already exists

    符合 CLAUDE.md 🔴: API layer delegates to service
    """
    return await service.add_collaborator_by_email(
        current_user_id=current_user_id, alliance_id=alliance_id, email=data.email
    )


@router.get(
    "/alliances/{alliance_id}/collaborators",
    response_model=AllianceCollaboratorListResponse,
    summary="Get alliance collaborators",
)
async def get_alliance_collaborators(
    alliance_id: UUID,
    current_user_id: UserIdDep,
    service: AllianceCollaboratorServiceDep,
):
    """
    Get all collaborators of an alliance.

    Returns:
    - 200: List of collaborators
    - 403: Not a collaborator of alliance

    符合 CLAUDE.md 🔴: API layer delegates to service
    """
    collaborators = await service.get_alliance_collaborators(
        current_user_id, alliance_id
    )
    return AllianceCollaboratorListResponse(
        collaborators=collaborators, total=len(collaborators)
    )


@router.delete(
    "/alliances/{alliance_id}/collaborators/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Remove collaborator from alliance",
)
async def remove_alliance_collaborator(
    alliance_id: UUID,
    user_id: UUID,
    current_user_id: UserIdDep,
    service: AllianceCollaboratorServiceDep,
):
    """
    Remove a collaborator from alliance.

    Restrictions:
    - Cannot remove alliance owner
    - Cannot remove yourself

    Returns:
    - 204: Collaborator removed successfully
    - 400: Invalid operation (e.g., removing self)
    - 403: Permission denied

    符合 CLAUDE.md 🔴: API layer delegates to service
    """
    await service.remove_collaborator(current_user_id, alliance_id, user_id)
    return None


@router.post(
    "/collaborators/process-invitations",
    status_code=status.HTTP_200_OK,
    summary="Process pending invitations for current user",
)
async def process_pending_invitations(
    current_user_id: UserIdDep,
    service: AllianceCollaboratorServiceDep,
):
    """
    Process all pending invitations for the authenticated user.

    Should be called after user login to automatically add them to
    alliances they were invited to before registration.

    Returns:
    - 200: Number of invitations processed
    - 401: Not authenticated

    符合 CLAUDE.md 🔴: API layer delegates to service
    符合 CLAUDE.md 🟡: Global exception handlers eliminate try/except boilerplate
    """
    # Get user email from Service layer
    email = await service.get_user_email(current_user_id)

    if not email:
        logger.warning(f"User email not found for user_id: {current_user_id}")
        return {"processed_count": 0, "message": "User email not found"}

    # Process pending invitations
    processed_count = await service.process_pending_invitations(current_user_id, email)

    return {
        "processed_count": processed_count,
        "message": f"Processed {processed_count} pending invitations",
    }


@router.patch(
    "/alliances/{alliance_id}/collaborators/{user_id}/role",
    status_code=status.HTTP_200_OK,
    summary="Update collaborator role",
)
async def update_collaborator_role(
    alliance_id: UUID,
    user_id: UUID,
    new_role: str,
    current_user_id: UserIdDep,
    service: AllianceCollaboratorServiceDep,
):
    """
    Update a collaborator's role in alliance.

    Requirements:
    - Only owner can update roles
    - Cannot change owner's role
    - Cannot change your own role (prevent self-privilege escalation)
    - Valid roles: 'collaborator', 'member'

    Returns:
    - 200: Role updated successfully
    - 400: Invalid role or operation
    - 403: Permission denied (not owner)

    符合 CLAUDE.md 🔴: API layer delegates to service
    """
    return await service.update_collaborator_role(
        current_user_id, alliance_id, user_id, new_role
    )


@router.get(
    "/alliances/{alliance_id}/my-role",
    status_code=status.HTTP_200_OK,
    summary="Get current user's role in alliance",
)
async def get_my_role(
    alliance_id: UUID,
    current_user_id: UserIdDep,
    permission_service: PermissionServiceDep,
):
    """
    Get current user's role in alliance.

    Returns:
    - 200: {"role": "owner|collaborator|member"}

    Raises:
    - ValueError: User is not a member of this alliance

    符合 CLAUDE.md 🔴: API layer delegates to service
    符合 CLAUDE.md 🟡: Exception chaining with 'from e'
    """
    role = await permission_service.get_user_role(current_user_id, alliance_id)

    if role is None:
        raise ValueError("You are not a member of this alliance")

    return {"role": role}
