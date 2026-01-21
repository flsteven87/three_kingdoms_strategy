"""
Copper Mine API Endpoints

API layer for copper mine rules and ownership management (Dashboard).

符合 CLAUDE.md 🔴:
- API layer delegates to Service layer
- Uses Provider Pattern for dependency injection
- Uses @router.get("") pattern (no trailing slash)
- Specific routes (/rules) MUST come before parametric routes
"""

from uuid import UUID

from fastapi import APIRouter, Query

from src.core.dependencies import (
    AllianceServiceDep,
    CopperMineRuleServiceDep,
    CopperMineServiceDep,
    SeasonServiceDep,
    UserIdDep,
)
from src.models.copper_mine import (
    CopperMineOwnershipCreate,
    CopperMineOwnershipListResponse,
    CopperMineOwnershipResponse,
    CopperMineOwnershipUpdate,
    CopperMineRuleCreate,
    CopperMineRuleResponse,
    CopperMineRuleUpdate,
)

router = APIRouter(prefix="/copper-mines", tags=["copper-mines"])


# =============================================================================
# Copper Mine Rules Endpoints
# =============================================================================


@router.get("/rules", response_model=list[CopperMineRuleResponse])
async def get_rules(
    rule_service: CopperMineRuleServiceDep,
    alliance_service: AllianceServiceDep,
    user_id: UserIdDep,
):
    """
    Get all copper mine rules for current user's alliance.

    Returns rules sorted by tier (ascending).
    """
    alliance = await alliance_service.get_user_alliance(user_id)
    return await rule_service.get_rules(alliance.id)


@router.post("/rules", response_model=CopperMineRuleResponse, status_code=201)
async def create_rule(
    data: CopperMineRuleCreate,
    rule_service: CopperMineRuleServiceDep,
    alliance_service: AllianceServiceDep,
    user_id: UserIdDep,
):
    """
    Create a new copper mine rule.

    Validates:
    - Tier must be sequential (next available tier)
    - Required merit must be greater than previous tier
    """
    alliance = await alliance_service.get_user_alliance(user_id)
    return await rule_service.create_rule(
        alliance_id=alliance.id,
        tier=data.tier,
        required_merit=data.required_merit,
        allowed_level=data.allowed_level,
    )


@router.patch("/rules/{rule_id}", response_model=CopperMineRuleResponse)
async def update_rule(
    rule_id: UUID,
    data: CopperMineRuleUpdate,
    rule_service: CopperMineRuleServiceDep,
    alliance_service: AllianceServiceDep,
    user_id: UserIdDep,
):
    """
    Update a copper mine rule.

    Validates:
    - Required merit must be > previous tier and < next tier
    """
    alliance = await alliance_service.get_user_alliance(user_id)
    return await rule_service.update_rule(
        rule_id=rule_id,
        alliance_id=alliance.id,
        required_merit=data.required_merit,
        allowed_level=data.allowed_level,
    )


@router.delete("/rules/{rule_id}", status_code=204)
async def delete_rule(
    rule_id: UUID,
    rule_service: CopperMineRuleServiceDep,
    alliance_service: AllianceServiceDep,
    user_id: UserIdDep,
):
    """
    Delete a copper mine rule.

    Only allows deleting the highest tier rule to maintain sequence.
    """
    alliance = await alliance_service.get_user_alliance(user_id)
    await rule_service.delete_rule(rule_id=rule_id, alliance_id=alliance.id)


# =============================================================================
# Copper Mine Ownerships Endpoints
# =============================================================================


@router.get("/ownerships", response_model=CopperMineOwnershipListResponse)
async def get_ownerships(
    mine_service: CopperMineServiceDep,
    alliance_service: AllianceServiceDep,
    season_service: SeasonServiceDep,
    user_id: UserIdDep,
    season_id: UUID = Query(..., description="Season UUID"),
):
    """
    Get copper mine ownerships for a season.

    Returns ownerships with member info (name, group, LINE display name).
    """
    # Verify user access to season
    await season_service.verify_user_access(user_id, season_id)

    alliance = await alliance_service.get_user_alliance(user_id)
    ownerships = await mine_service.get_ownerships_by_season(
        season_id=season_id,
        alliance_id=alliance.id,
    )

    return CopperMineOwnershipListResponse(
        ownerships=ownerships,
        total=len(ownerships),
    )


@router.post("/ownerships", response_model=CopperMineOwnershipResponse, status_code=201)
async def create_ownership(
    data: CopperMineOwnershipCreate,
    mine_service: CopperMineServiceDep,
    alliance_service: AllianceServiceDep,
    season_service: SeasonServiceDep,
    user_id: UserIdDep,
    season_id: UUID = Query(..., description="Season UUID"),
):
    """
    Create a copper mine ownership.

    Validates:
    - Member exists
    - Coordinates not already taken in this season
    """
    # Verify user access to season
    await season_service.verify_user_access(user_id, season_id)

    alliance = await alliance_service.get_user_alliance(user_id)

    # Handle reserved copper mines (use None for member_id)
    member_uuid = None if data.member_id == "reserved" else UUID(data.member_id)

    return await mine_service.create_ownership(
        season_id=season_id,
        alliance_id=alliance.id,
        member_id=member_uuid,
        coord_x=data.coord_x,
        coord_y=data.coord_y,
        level=data.level,
        applied_at=data.applied_at,
    )


@router.delete("/ownerships/{ownership_id}", status_code=204)
async def delete_ownership(
    ownership_id: UUID,
    mine_service: CopperMineServiceDep,
    alliance_service: AllianceServiceDep,
    user_id: UserIdDep,
):
    """
    Delete a copper mine ownership.

    Verifies the ownership belongs to user's alliance.
    """
    alliance = await alliance_service.get_user_alliance(user_id)
    await mine_service.delete_ownership(
        ownership_id=ownership_id,
        alliance_id=alliance.id,
    )


@router.patch("/ownerships/{ownership_id}", response_model=CopperMineOwnershipResponse)
async def update_ownership(
    ownership_id: UUID,
    data: CopperMineOwnershipUpdate,
    mine_service: CopperMineServiceDep,
    alliance_service: AllianceServiceDep,
    season_service: SeasonServiceDep,
    user_id: UserIdDep,
    season_id: UUID = Query(..., description="Season UUID"),
):
    """
    Update a copper mine ownership (for transferring reserved mines to members).

    Validates:
    - Member exists
    - Ownership belongs to user's alliance
    """
    # Verify user access to season
    await season_service.verify_user_access(user_id, season_id)

    alliance = await alliance_service.get_user_alliance(user_id)

    # Convert member_id string to UUID
    member_uuid = UUID(data.member_id)

    return await mine_service.update_ownership(
        ownership_id=ownership_id,
        season_id=season_id,
        alliance_id=alliance.id,
        member_id=member_uuid,
    )
