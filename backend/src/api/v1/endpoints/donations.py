"""
Donations API Endpoints

Donation event CRUD and member donation calculation.

Follows CLAUDE.md:
- API layer delegates to Service layer
- Typed response models
- Uses public service methods (no private member access)
- Permission checks on all endpoints
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends

from src.api.v1.schemas.donations import (
    CreateDonationRequest,
    DonationDetailResponse,
    DonationListResponse,
    DonationMemberInfoResponse,
    DonationTargetOverrideRequest,
)
from src.core.dependencies import UserIdDep
from src.models.donation import DonationCreate
from src.services.donation_service import DonationService

router = APIRouter(prefix="/donations", tags=["donations"])


# ============================================================================
# Dependency Injection
# ============================================================================


def get_donation_service() -> DonationService:
    """Get donation service instance"""
    return DonationService()


DonationServiceDep = Annotated[DonationService, Depends(get_donation_service)]


# ============================================================================
# Endpoints
# ============================================================================


@router.get("", response_model=list[DonationListResponse])
async def get_donations(
    alliance_id: UUID,
    season_id: UUID,
    user_id: UserIdDep,
    service: DonationServiceDep,
) -> list[DonationListResponse]:
    """
    Get all donation events for an alliance in a season

    Query Parameters:
        alliance_id: Alliance UUID
        season_id: Season UUID

    Returns:
        List of donation events ordered by creation time (newest first)
    """
    await service.require_alliance_access(user_id, alliance_id)
    donations = await service.get_donations_by_alliance_and_season(alliance_id, season_id)
    return [DonationListResponse.model_validate(d) for d in donations]


@router.post("", response_model=DonationListResponse)
async def create_donation(
    alliance_id: UUID,
    season_id: UUID,
    body: CreateDonationRequest,
    user_id: UserIdDep,
    service: DonationServiceDep,
) -> DonationListResponse:
    """
    Create new donation event

    Query Parameters:
        alliance_id: Alliance UUID
        season_id: Season UUID

    Request Body:
        title: Event title
        type: 'regular' or 'penalty'
        deadline: Deadline datetime
        target_amount: Default target for all members
        description: Optional event description

    Returns:
        Created donation event
    """
    await service.require_alliance_access(user_id, alliance_id)

    donation_data = DonationCreate(
        season_id=season_id,
        alliance_id=alliance_id,
        title=body.title,
        type=body.type,
        deadline=body.deadline,
        target_amount=body.target_amount,
        description=body.description,
        created_by=user_id,
    )

    donation = await service.create_donation(donation_data)
    return DonationListResponse.model_validate(donation)


@router.get("/{donation_id}", response_model=DonationDetailResponse)
async def get_donation_detail(
    donation_id: UUID,
    user_id: UserIdDep,
    service: DonationServiceDep,
    target_amount: int | None = None,
) -> DonationDetailResponse:
    """
    Get donation event with member donation details

    Returns per-member data from the end snapshot:
    - If type is REGULAR: targets come from stored `target_amount`
    - If type is PENALTY: targets come from per-member overrides

    Path Parameters:
        donation_id: Donation UUID

    Query Parameters:
        target_amount: Optional override for REGULAR type; ignored for PENALTY

    Returns:
        Donation event with member donation info
    """
    # Verify user has access (🔴 CRITICAL: was missing in original PR)
    await service.verify_donation_access(user_id, donation_id)

    donation_with_info = await service.get_donation_with_info(donation_id, target_amount)

    return DonationDetailResponse(
        id=donation_with_info.id,
        season_id=donation_with_info.season_id,
        alliance_id=donation_with_info.alliance_id,
        title=donation_with_info.title,
        type=donation_with_info.type,
        deadline=donation_with_info.deadline,
        target_amount=donation_with_info.target_amount,
        description=donation_with_info.description,
        status=donation_with_info.status,
        created_at=donation_with_info.created_at,
        created_by=donation_with_info.created_by,
        updated_at=donation_with_info.updated_at,
        member_info=[
            DonationMemberInfoResponse(**info.model_dump())
            for info in donation_with_info.member_info
        ],
    )


@router.post("/{donation_id}/targets", status_code=204)
async def upsert_member_target_override(
    donation_id: UUID,
    body: DonationTargetOverrideRequest,
    user_id: UserIdDep,
    service: DonationServiceDep,
) -> None:
    """
    Insert or update a per-member target override for a donation.

    Path Parameters:
        donation_id: Donation UUID

    Body:
        member_id: Member UUID
        target_amount: Override target for this member

    Returns:
        No content on success (204)
    """
    await service.set_member_target_override(
        donation_id=donation_id,
        member_id=body.member_id,
        target_amount=body.target_amount,
        user_id=user_id,
    )


@router.delete("/{donation_id}", status_code=204)
async def delete_donation(
    donation_id: UUID,
    user_id: UserIdDep,
    service: DonationServiceDep,
) -> None:
    """Delete a donation event"""
    await service.delete_donation(donation_id, user_id)


@router.delete("/{donation_id}/targets/{member_id}", status_code=204)
async def delete_member_target_override(
    donation_id: UUID,
    member_id: UUID,
    user_id: UserIdDep,
    service: DonationServiceDep,
) -> None:
    """Delete a member's target override for a donation"""
    await service.delete_member_target_override(donation_id, member_id, user_id)
