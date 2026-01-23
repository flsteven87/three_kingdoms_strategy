"""
Season API Endpoints - Season Purchase System

符合 CLAUDE.md 🔴:
- API Layer delegates to Service Layer
- Uses 2025 Standard Annotated dependency injection
- Returns proper HTTP status codes
- JWT authentication required
符合 CLAUDE.md 🟡:
- Global exception handlers eliminate try/except boilerplate

Key endpoints:
- POST /seasons/{id}/activate - Activate a draft season (consume season credit)
- POST /seasons/{id}/set-current - Set an activated season as current
- POST /seasons/{id}/complete - Mark a season as completed
"""

from uuid import UUID

from fastapi import APIRouter

from src.core.dependencies import SeasonServiceDep, UserIdDep
from src.models.season import Season, SeasonActivateResponse, SeasonCreate, SeasonUpdate

router = APIRouter(prefix="/seasons", tags=["seasons"])


@router.get("", response_model=list[Season])
async def get_seasons(
    service: SeasonServiceDep,
    user_id: UserIdDep,
    activated_only: bool = False,
):
    """
    Get all seasons for current user's alliance

    Args:
        service: Season service (injected)
        user_id: User UUID (from JWT token)
        activated_only: Only return activated seasons (not draft/completed)

    Returns:
        List of season instances

    Raises:
        ValueError: If user has no alliance

    符合 CLAUDE.md 🔴: API layer delegates to service
    """
    return await service.get_seasons(user_id, activated_only=activated_only)


@router.get("/current", response_model=Season | None)
async def get_current_season(
    service: SeasonServiceDep,
    user_id: UserIdDep,
):
    """
    Get current (selected) season for current user's alliance

    Args:
        service: Season service (injected)
        user_id: User UUID (from JWT token)

    Returns:
        Current season or None if not found

    Raises:
        ValueError: If user has no alliance

    符合 CLAUDE.md 🔴: API layer delegates to service
    """
    return await service.get_current_season(user_id)


@router.get("/{season_id}", response_model=Season)
async def get_season(
    season_id: UUID,
    service: SeasonServiceDep,
    user_id: UserIdDep,
):
    """
    Get specific season by ID

    Args:
        season_id: Season UUID
        service: Season service (injected)
        user_id: User UUID (from JWT token)

    Returns:
        Season instance

    Raises:
        ValueError: If season not found or user has no alliance
        PermissionError: If user doesn't own the season

    符合 CLAUDE.md 🔴: API layer delegates to service
    """
    return await service.get_season(user_id, season_id)


@router.post("", response_model=Season, status_code=201)
async def create_season(
    season_data: SeasonCreate,
    service: SeasonServiceDep,
    user_id: UserIdDep,
):
    """
    Create new season for current user's alliance

    New seasons are created as 'draft' status.
    User must call /activate to consume a season credit and activate it.

    Args:
        season_data: Season creation data
        service: Season service (injected)
        user_id: User UUID (from JWT token)

    Returns:
        Created season instance (draft status)

    Raises:
        ValueError: If user has no alliance
        PermissionError: If alliance_id doesn't match user's alliance

    符合 CLAUDE.md 🔴: API layer delegates to service
    """
    return await service.create_season(user_id, season_data)


@router.patch("/{season_id}", response_model=Season)
async def update_season(
    season_id: UUID,
    season_data: SeasonUpdate,
    service: SeasonServiceDep,
    user_id: UserIdDep,
):
    """
    Update existing season

    Args:
        season_id: Season UUID
        season_data: Season update data
        service: Season service (injected)
        user_id: User UUID (from JWT token)

    Returns:
        Updated season instance

    Raises:
        ValueError: If season not found or user has no alliance
        PermissionError: If user doesn't own the season

    符合 CLAUDE.md 🔴: API layer delegates to service
    """
    return await service.update_season(user_id, season_id, season_data)


@router.delete("/{season_id}", status_code=204)
async def delete_season(
    season_id: UUID,
    service: SeasonServiceDep,
    user_id: UserIdDep,
):
    """
    Delete season (hard delete, CASCADE will remove related data)

    Args:
        season_id: Season UUID
        service: Season service (injected)
        user_id: User UUID (from JWT token)

    Raises:
        ValueError: If season not found or user has no alliance
        PermissionError: If user doesn't own the season

    符合 CLAUDE.md 🔴: API layer delegates to service
    """
    await service.delete_season(user_id, season_id)


@router.post("/{season_id}/activate", response_model=SeasonActivateResponse)
async def activate_season(
    season_id: UUID,
    service: SeasonServiceDep,
    user_id: UserIdDep,
):
    """
    Activate a draft season (consume season credit or use trial)

    This changes the season status from 'draft' to 'activated'.
    - If trial is active: free activation
    - If trial expired: consumes one purchased season

    After activation, the season can be set as current using /set-current.

    Args:
        season_id: Season UUID to activate
        service: Season service (injected)
        user_id: User UUID (from JWT token)

    Returns:
        SeasonActivateResponse with activation result and remaining seasons

    Raises:
        ValueError: If season not found or not in draft status
        PermissionError: If user doesn't own the season
        SubscriptionExpiredError: If no available seasons

    符合 CLAUDE.md 🔴: API layer delegates to service
    """
    return await service.activate_season(user_id, season_id)


@router.post("/{season_id}/set-current", response_model=Season)
async def set_current_season(
    season_id: UUID,
    service: SeasonServiceDep,
    user_id: UserIdDep,
):
    """
    Set an activated season as current (selected for display)

    Only activated seasons can be set as current.
    This unsets the current flag on all other seasons for the alliance.

    Args:
        season_id: Season UUID to set as current
        service: Season service (injected)
        user_id: User UUID (from JWT token)

    Returns:
        Updated current season

    Raises:
        ValueError: If season not found or not activated
        PermissionError: If user doesn't own the season

    符合 CLAUDE.md 🔴: API layer delegates to service
    """
    return await service.set_current_season(user_id, season_id)


@router.post("/{season_id}/complete", response_model=Season)
async def complete_season(
    season_id: UUID,
    service: SeasonServiceDep,
    user_id: UserIdDep,
):
    """
    Mark a season as completed

    Args:
        season_id: Season UUID to complete
        service: Season service (injected)
        user_id: User UUID (from JWT token)

    Returns:
        Updated season

    Raises:
        ValueError: If season not found or not activated
        PermissionError: If user doesn't own the season

    符合 CLAUDE.md 🔴: API layer delegates to service
    """
    return await service.complete_season(user_id, season_id)
