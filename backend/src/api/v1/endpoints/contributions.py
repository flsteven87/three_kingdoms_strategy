"""
Contributions API Endpoints

Contribution event CRUD and member contribution calculation.

Follows CLAUDE.md:
- API layer delegates to Service layer
- Typed response models
- Global exception handlers eliminate try/except boilerplate
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends

from src.api.v1.schemas.contributions import (
    ContributionDetailResponse,
    ContributionInfoResponse,
    ContributionListResponse,
    CreateContributionRequest,
    ContributionTargetOverrideRequest,
)
from src.core.dependencies import UserIdDep
from src.models.contribution import ContributionCreate
from src.services.contribution_service import ContributionService

router = APIRouter(prefix="/contributions", tags=["contributions"])


# ============================================================================
# Dependency Injection
# ============================================================================


def get_contribution_service() -> ContributionService:
    """Get contribution service instance"""
    return ContributionService()


ContributionServiceDep = Annotated[
    ContributionService, Depends(get_contribution_service)
]


# ============================================================================
# Endpoints
# ============================================================================


@router.get("", response_model=list[ContributionListResponse])
async def get_contributions(
    alliance_id: UUID,
    season_id: UUID,
    user_id: UserIdDep,
    service: ContributionServiceDep,
) -> list[ContributionListResponse]:
    """
    Get all contribution events for an alliance in a season

    Query Parameters:
        alliance_id: Alliance UUID
        season_id: Season UUID

    Returns:
        List of contribution events ordered by creation time (newest first)

    符合 CLAUDE.md 🟡: Global exception handlers eliminate try/except boilerplate
    """
    # Verify user has access to this alliance
    await service._permission_service.verify_user_access(user_id, alliance_id)

    contributions = await service.get_contributions_by_alliance_and_season(
        alliance_id, season_id
    )
    return [ContributionListResponse.model_validate(c) for c in contributions]


@router.post("", response_model=ContributionListResponse)
async def create_contribution(
    alliance_id: UUID,
    season_id: UUID,
    body: CreateContributionRequest,
    user_id: UserIdDep,
    service: ContributionServiceDep,
) -> ContributionListResponse:
    """
    Create new contribution event

    Query Parameters:
        alliance_id: Alliance UUID
        season_id: Season UUID

    Request Body:
        title: Event title
        type: 'alliance' or 'punishment'
        deadline: Deadline datetime
        target_contribution: Default target for all members

    Returns:
        Created contribution event

    符合 CLAUDE.md 🟡: Global exception handlers eliminate try/except boilerplate
    """
    # Verify user has access to this alliance
    await service._permission_service.verify_alliance_access(user_id, alliance_id)

    contribution_data = ContributionCreate(
        season_id=season_id,
        alliance_id=alliance_id,
        title=body.title,
        type=body.type,
        deadline=body.deadline,
        target_contribution=body.target_contribution,
        created_by=user_id,
    )

    contribution = await service.create_contribution(contribution_data)
    return ContributionListResponse.model_validate(contribution)


@router.get("/{contribution_id}", response_model=ContributionDetailResponse)
async def get_contribution_detail(
    contribution_id: UUID,
    user_id: UserIdDep,
    service: ContributionServiceDep,
) -> ContributionDetailResponse:
    """
    Get contribution event with member contribution details

    Returns per-member data from the end snapshot:
    - If type is ALLIANCE: targets come from stored `target_contribution`
    - If type is PUNISHMENT: targets come from per-member overrides

    Path Parameters:
        contribution_id: Contribution UUID

    Query Parameters:
        target_contribution: Optional override for ALLIANCE type; ignored for PUNISHMENT

    Returns:
        Contribution event with member contribution info

    符合 CLAUDE.md 🟡: Global exception handlers eliminate try/except boilerplate
    """
    await service.verify_user_access(user_id, contribution_id)

    contribution_with_info = await service.get_contribution_with_info(
        contribution_id, target_contribution
    )

    return ContributionDetailResponse(
        id=contribution_with_info.id,
        season_id=contribution_with_info.season_id,
        alliance_id=contribution_with_info.alliance_id,
        title=contribution_with_info.title,
        type=contribution_with_info.type,
        deadline=contribution_with_info.deadline,
        target_contribution=contribution_with_info.target_contribution,
        created_at=contribution_with_info.created_at,
        created_by=contribution_with_info.created_by,
        contribution_info=[
            ContributionInfoResponse.model_validate(info)
            for info in contribution_with_info.contribution_info
        ],
    )


@router.post("/{contribution_id}/targets", status_code=204)
async def upsert_member_target_override(
    contribution_id: UUID,
    body: ContributionTargetOverrideRequest,
    user_id: UserIdDep,
    service: ContributionServiceDep,
) -> None:
    """
    Insert or update a per-member target override for a contribution.

    Path Parameters:
        contribution_id: Contribution UUID

    Body:
        member_id: Member UUID
        target_contribution: Override target for this member

    Returns:
        No content on success (204)
    """
    await service.set_member_target_override(
        contribution_id=contribution_id,
        member_id=body.member_id,
        target_contribution=body.target_contribution,
        user_id=user_id,
    )


@router.delete("/{contribution_id}", status_code=204)
async def delete_contribution(
    contribution_id: UUID,
    user_id: UserIdDep,
    service: ContributionServiceDep,
) -> None:
    """Delete a contribution event"""
    await service.delete_contribution(contribution_id, user_id)


@router.delete("/{contribution_id}/targets/{member_id}", status_code=204)
async def delete_member_target_override(
    contribution_id: UUID,
    member_id: UUID,
    user_id: UserIdDep,
    service: ContributionServiceDep,
) -> None:
    """Delete a member's target override for a contribution"""
    await service.delete_member_target_override(contribution_id, member_id, user_id)
