"""
Season API Endpoints

符合 CLAUDE.md 🔴:
- API Layer delegates to Service Layer
- Uses 2025 Standard Annotated dependency injection
- Returns proper HTTP status codes
- JWT authentication required
符合 CLAUDE.md 🟡:
- Global exception handlers eliminate try/except boilerplate
"""

from uuid import UUID

from fastapi import APIRouter

from src.core.dependencies import SeasonServiceDep, UserIdDep
from src.models.season import Season, SeasonCreate, SeasonUpdate

router = APIRouter(prefix="/seasons", tags=["seasons"])


@router.get("", response_model=list[Season])
async def get_seasons(
    service: SeasonServiceDep,
    user_id: UserIdDep,
    active_only: bool = False,
):
    """
    Get all seasons for current user's alliance

    Args:
        service: Season service (injected)
        user_id: User UUID (from JWT token)
        active_only: Only return active seasons

    Returns:
        List of season instances

    Raises:
        ValueError: If user has no alliance

    符合 CLAUDE.md 🔴: API layer delegates to service
    """
    return await service.get_seasons(user_id, active_only=active_only)


@router.get("/active", response_model=Season | None)
async def get_active_season(
    service: SeasonServiceDep,
    user_id: UserIdDep,
):
    """
    Get active season for current user's alliance

    Args:
        service: Season service (injected)
        user_id: User UUID (from JWT token)

    Returns:
        Active season or None if not found

    Raises:
        ValueError: If user has no alliance

    符合 CLAUDE.md 🔴: API layer delegates to service
    """
    return await service.get_active_season(user_id)


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

    Args:
        season_data: Season creation data
        service: Season service (injected)
        user_id: User UUID (from JWT token)

    Returns:
        Created season instance

    Raises:
        ValueError: If user has no alliance
        PermissionError: If alliance_id doesn't match user's alliance

    符合 CLAUDE.md 🔴: API layer delegates to service
    符合 CLAUDE.md 🟡: Global exception handlers eliminate try/except boilerplate
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
    符合 CLAUDE.md 🟡: Global exception handlers eliminate try/except boilerplate
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


@router.post("/{season_id}/activate", response_model=Season)
async def activate_season(
    season_id: UUID,
    service: SeasonServiceDep,
    user_id: UserIdDep,
):
    """
    Set a season as active (deactivates all other seasons for the alliance)

    Args:
        season_id: Season UUID to activate
        service: Season service (injected)
        user_id: User UUID (from JWT token)

    Returns:
        Updated active season

    Raises:
        ValueError: If season not found or user has no alliance
        PermissionError: If user doesn't own the season

    符合 CLAUDE.md 🔴: API layer delegates to service
    """
    return await service.set_active_season(user_id, season_id)
