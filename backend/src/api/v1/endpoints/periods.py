"""
Period Metrics API Endpoints

符合 CLAUDE.md 🔴:
- API layer delegates to Service layer
- Uses Annotated dependency injection
- Proper error handling with exception chaining
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from src.core.auth import get_current_user_id
from src.core.dependencies import get_period_metrics_service
from src.services.period_metrics_service import PeriodMetricsService
from src.services.permission_service import PermissionService

router = APIRouter(prefix="/periods", tags=["periods"])

# Type aliases for dependency injection
CurrentUserIdDep = Annotated[UUID, Depends(get_current_user_id)]
PeriodMetricsServiceDep = Annotated[PeriodMetricsService, Depends(get_period_metrics_service)]


@router.post("/seasons/{season_id}/recalculate")
async def recalculate_season_periods(
    season_id: UUID,
    user_id: CurrentUserIdDep,
    service: PeriodMetricsServiceDep,
) -> dict:
    """
    Recalculate all periods for a specific season.

    This will:
    1. Delete all existing periods and metrics for this season
    2. Recalculate based on current CSV uploads

    Permission: owner + collaborator

    Returns:
        Recalculation summary with period and metric counts
    """
    from src.repositories.season_repository import SeasonRepository

    # Get season to verify it exists and get alliance_id
    season_repo = SeasonRepository()
    season = await season_repo.get_by_id(season_id)

    if not season:
        raise HTTPException(status_code=404, detail="Season not found")

    # Verify permission: owner or collaborator can recalculate
    permission_service = PermissionService()
    await permission_service.require_owner_or_collaborator(
        user_id, season.alliance_id, "recalculate period metrics"
    )

    # Perform recalculation for this specific season
    try:
        periods = await service.calculate_periods_for_season(season_id)
        return {
            "success": True,
            "season_id": str(season_id),
            "season_name": season.name,
            "periods_created": len(periods),
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to recalculate periods: {str(e)}",
        ) from e


@router.get("")
async def get_periods_by_season(
    season_id: UUID,
    user_id: CurrentUserIdDep,
    service: PeriodMetricsServiceDep,
) -> list[dict]:
    """
    Get all periods for a season.

    Args:
        season_id: Season UUID

    Returns:
        List of periods ordered by period_number
    """
    # Verify user has access to this season's alliance
    from src.repositories.season_repository import SeasonRepository

    season_repo = SeasonRepository()
    season = await season_repo.get_by_id(season_id)

    if not season:
        raise HTTPException(status_code=404, detail="Season not found")

    permission_service = PermissionService()
    role = await permission_service.get_user_role(user_id, season.alliance_id)

    if role is None:
        raise HTTPException(
            status_code=403,
            detail="You are not a member of this alliance",
        )

    periods = await service.get_periods_by_season(season_id)
    return [
        {
            "id": str(p.id),
            "season_id": str(p.season_id),
            "period_number": p.period_number,
            "start_date": p.start_date.isoformat(),
            "end_date": p.end_date.isoformat(),
            "days": p.days,
            "start_upload_id": str(p.start_upload_id) if p.start_upload_id else None,
            "end_upload_id": str(p.end_upload_id),
        }
        for p in periods
    ]


@router.get("/{period_id}/metrics")
async def get_period_metrics(
    period_id: UUID,
    user_id: CurrentUserIdDep,
    service: PeriodMetricsServiceDep,
) -> list[dict]:
    """
    Get all member metrics for a period.

    Args:
        period_id: Period UUID

    Returns:
        List of member metrics with rankings and daily averages
    """
    # Get period to verify access
    from src.repositories.period_repository import PeriodRepository

    period_repo = PeriodRepository()
    period = await period_repo.get_by_id(period_id)

    if not period:
        raise HTTPException(status_code=404, detail="Period not found")

    permission_service = PermissionService()
    role = await permission_service.get_user_role(user_id, period.alliance_id)

    if role is None:
        raise HTTPException(
            status_code=403,
            detail="You are not a member of this alliance",
        )

    return await service.get_period_metrics(period_id)
