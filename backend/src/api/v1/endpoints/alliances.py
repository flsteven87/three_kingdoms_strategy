"""
Alliance API Endpoints

符合 CLAUDE.md 🔴:
- API Layer delegates to Service Layer
- Uses 2025 Standard Annotated dependency injection pattern
- Returns proper HTTP status codes
- JWT authentication required
符合 CLAUDE.md 🟡:
- Global exception handlers eliminate try/except boilerplate
- Type-safe dependency injection with reusable aliases
"""

from fastapi import APIRouter

from src.core.dependencies import AllianceServiceDep, UserIdDep
from src.models.alliance import Alliance, AllianceCreate, AllianceUpdate

router = APIRouter(prefix="/alliances", tags=["alliances"])


@router.get("", response_model=Alliance | None)
async def get_user_alliance(
    service: AllianceServiceDep,
    user_id: UserIdDep,
):
    """
    Get current user's alliance

    Args:
        service: Alliance service (injected)
        user_id: User UUID (from JWT token)

    Returns:
        Alliance instance or None if not found

    符合 CLAUDE.md 🔴: API layer delegates to service
    """
    return await service.get_user_alliance(user_id)


@router.post("", response_model=Alliance, status_code=201)
async def create_alliance(
    alliance_data: AllianceCreate,
    service: AllianceServiceDep,
    user_id: UserIdDep,
):
    """
    Create new alliance for current user

    Args:
        alliance_data: Alliance creation data
        service: Alliance service (injected)
        user_id: User UUID (from JWT token)

    Returns:
        Created alliance instance

    Raises:
        ValueError: If user already has an alliance (handled by global exception handler)

    符合 CLAUDE.md 🔴: API layer delegates to service
    符合 CLAUDE.md 🟡: No try/except needed - global handler converts exceptions
    """
    # user_id comes from JWT token (符合 CLAUDE.md 🔴: Security - never trust client)
    return await service.create_alliance(user_id, alliance_data)


@router.patch("", response_model=Alliance)
async def update_alliance(
    alliance_data: AllianceUpdate,
    service: AllianceServiceDep,
    user_id: UserIdDep,
):
    """
    Update current user's alliance

    Args:
        alliance_data: Alliance update data
        service: Alliance service (injected)
        user_id: User UUID (from JWT token)

    Returns:
        Updated alliance instance

    Raises:
        ValueError: If user has no alliance (handled by global exception handler)

    符合 CLAUDE.md 🔴: API layer delegates to service
    符合 CLAUDE.md 🟡: No try/except needed - global handler converts exceptions
    """
    return await service.update_alliance(user_id, alliance_data)


@router.delete("", status_code=204)
async def delete_alliance(
    service: AllianceServiceDep,
    user_id: UserIdDep,
):
    """
    Delete current user's alliance

    Args:
        service: Alliance service (injected)
        user_id: User UUID (from JWT token)

    Raises:
        ValueError: If user has no alliance (handled by global exception handler)

    符合 CLAUDE.md 🔴: API layer delegates to service
    符合 CLAUDE.md 🟡: No try/except needed - global handler converts exceptions
    """
    await service.delete_alliance(user_id)
