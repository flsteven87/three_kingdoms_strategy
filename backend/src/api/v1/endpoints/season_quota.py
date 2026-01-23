"""
Season Quota API Endpoints

API layer for season quota status and management.
Follows CLAUDE.md guidelines:
- API layer delegates to Service layer
- Uses Provider Pattern for dependency injection
- Uses @router.get("") pattern (no trailing slash)
"""

from fastapi import APIRouter

from src.core.dependencies import SeasonQuotaServiceDep, UserIdDep
from src.models.alliance import SeasonQuotaStatus

router = APIRouter(prefix="/season-quota", tags=["season-quota"])


@router.get("", response_model=SeasonQuotaStatus)
async def get_season_quota_status(
    service: SeasonQuotaServiceDep,
    user_id: UserIdDep,
):
    """
    Get current user's alliance season quota status.

    Returns detailed information about trial/season quota including:
    - Trial status and days remaining
    - Purchased and used seasons
    - Whether new seasons can be activated
    """
    return await service.get_quota_status(user_id)
