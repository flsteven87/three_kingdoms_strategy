"""
Period Metrics API Endpoints

符合 CLAUDE.md 🔴:
- API layer delegates to Service layer
- Uses Annotated dependency injection
- Proper error handling with exception chaining
"""

from uuid import UUID

from fastapi import APIRouter

from src.core.dependencies import (
    PeriodMetricsServiceDep,
    PermissionServiceDep,
    SeasonServiceDep,
    UserIdDep,
)

router = APIRouter(prefix="/periods", tags=["periods"])


@router.post("/seasons/{season_id}/recalculate")
async def recalculate_season_periods(
    season_id: UUID,
    user_id: UserIdDep,
    service: PeriodMetricsServiceDep,
    season_service: SeasonServiceDep,
    permission_service: PermissionServiceDep,
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
    # Verify access and get alliance_id
    alliance_id = await season_service.verify_user_access(user_id, season_id)

    # Verify permission: owner or collaborator can recalculate
    await permission_service.require_owner_or_collaborator(
        user_id, alliance_id, "recalculate period metrics"
    )

    # Perform recalculation for this specific season
    periods = await service.calculate_periods_for_season(season_id)
    return {
        "success": True,
        "season_id": str(season_id),
        "periods_created": len(periods),
    }


@router.get("")
async def get_periods_by_season(
    season_id: UUID,
    user_id: UserIdDep,
    service: PeriodMetricsServiceDep,
    season_service: SeasonServiceDep,
) -> list[dict]:
    """
    Get all periods for a season.

    Args:
        season_id: Season UUID

    Returns:
        List of periods ordered by period_number
    """
    # Verify user has access to this season
    await season_service.verify_user_access(user_id, season_id)

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
    user_id: UserIdDep,
    service: PeriodMetricsServiceDep,
) -> list[dict]:
    """
    Get all member metrics for a period.

    Args:
        period_id: Period UUID

    Returns:
        List of member metrics with rankings and daily averages
    """
    # Verify user has access to this period
    await service.verify_user_access(user_id, period_id)

    return await service.get_period_metrics(period_id)
