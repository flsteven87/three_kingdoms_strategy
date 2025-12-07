"""
Analytics API Endpoints

Member performance analytics for charts and dashboards.

Follows CLAUDE.md:
- API layer delegates to Service layer
- Uses Annotated dependency injection
- Proper error handling with exception chaining
- Typed response models for OpenAPI docs
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query

from src.api.v1.schemas.analytics import (
    AllianceAveragesResponse,
    AllianceTrendItem,
    GroupAnalyticsResponse,
    GroupComparisonItem,
    GroupListItem,
    MemberComparisonResponse,
    MemberListItem,
    MemberTrendItem,
    SeasonSummaryResponse,
)
from src.core.auth import get_current_user_id
from src.repositories.member_repository import MemberRepository
from src.repositories.period_repository import PeriodRepository
from src.repositories.season_repository import SeasonRepository
from src.services.analytics_service import AnalyticsService
from src.services.permission_service import PermissionService

router = APIRouter(prefix="/analytics", tags=["analytics"])

# Type aliases for dependency injection
CurrentUserIdDep = Annotated[UUID, Depends(get_current_user_id)]


def get_analytics_service() -> AnalyticsService:
    """Get analytics service instance"""
    return AnalyticsService()


AnalyticsServiceDep = Annotated[AnalyticsService, Depends(get_analytics_service)]


async def _verify_season_access(user_id: UUID, season_id: UUID) -> UUID:
    """
    Verify user has access to the season and return alliance_id.
    Raises HTTPException if not authorized.
    """
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

    return season.alliance_id


async def _verify_period_access(user_id: UUID, period_id: UUID) -> UUID:
    """
    Verify user has access to the period and return alliance_id.
    Raises HTTPException if not authorized.
    """
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

    return period.alliance_id


@router.get("/members", response_model=list[MemberListItem])
async def get_members(
    season_id: UUID,
    user_id: CurrentUserIdDep,
    service: AnalyticsServiceDep,
    active_only: bool = Query(True, description="Only return active members"),
) -> list[MemberListItem]:
    """
    Get all members for analytics member selector.

    Query Parameters:
        season_id: Season UUID (required)
        active_only: Only return active members (default: True)

    Returns:
        List of members with id, name, contribution_rank, and group
    """
    alliance_id = await _verify_season_access(user_id, season_id)
    data = await service.get_members_for_analytics(alliance_id, active_only, season_id)
    return [MemberListItem(**item) for item in data]


@router.get("/members/{member_id}/trend", response_model=list[MemberTrendItem])
async def get_member_trend(
    member_id: UUID,
    season_id: UUID,
    user_id: CurrentUserIdDep,
    service: AnalyticsServiceDep,
) -> list[MemberTrendItem]:
    """
    Get member's performance trend across all periods in a season.

    Each period includes alliance averages for comparison charts.
    Frontend can expand this data to daily points using start_date/end_date.

    Path Parameters:
        member_id: Member UUID

    Query Parameters:
        season_id: Season UUID (required)

    Returns:
        List of period metrics with daily averages, diffs, rank info,
        and alliance averages for comparison
    """
    alliance_id = await _verify_season_access(user_id, season_id)

    # Verify member belongs to this alliance
    member_repo = MemberRepository()
    member = await member_repo.get_by_id(member_id)

    if not member or member.alliance_id != alliance_id:
        raise HTTPException(status_code=404, detail="Member not found")

    data = await service.get_member_trend(member_id, season_id)
    return [MemberTrendItem(**item) for item in data]


@router.get("/members/{member_id}/summary", response_model=SeasonSummaryResponse)
async def get_member_season_summary(
    member_id: UUID,
    season_id: UUID,
    user_id: CurrentUserIdDep,
    service: AnalyticsServiceDep,
) -> SeasonSummaryResponse:
    """
    Get member's season-to-date summary (aggregated across all periods).

    Path Parameters:
        member_id: Member UUID

    Query Parameters:
        season_id: Season UUID (required)

    Returns:
        Season summary with totals and averages
    """
    alliance_id = await _verify_season_access(user_id, season_id)

    # Verify member belongs to this alliance
    member_repo = MemberRepository()
    member = await member_repo.get_by_id(member_id)

    if not member or member.alliance_id != alliance_id:
        raise HTTPException(status_code=404, detail="Member not found")

    summary = await service.get_season_summary(member_id, season_id)

    if not summary:
        raise HTTPException(
            status_code=404,
            detail="No metrics data available for this member in this season",
        )

    return SeasonSummaryResponse(**summary)


@router.get("/members/{member_id}/comparison", response_model=MemberComparisonResponse)
async def get_member_comparison(
    member_id: UUID,
    period_id: UUID,
    user_id: CurrentUserIdDep,
    service: AnalyticsServiceDep,
) -> MemberComparisonResponse:
    """
    Get member metrics for a period with alliance averages for comparison.

    Path Parameters:
        member_id: Member UUID

    Query Parameters:
        period_id: Period UUID (required)

    Returns:
        Member metrics and alliance averages for comparison
    """
    await _verify_period_access(user_id, period_id)

    result = await service.get_member_with_comparison(member_id, period_id)

    if not result:
        raise HTTPException(
            status_code=404,
            detail="Member metrics not found for this period",
        )

    return MemberComparisonResponse(**result)


@router.get("/periods/{period_id}/averages", response_model=AllianceAveragesResponse)
async def get_period_averages(
    period_id: UUID,
    user_id: CurrentUserIdDep,
    service: AnalyticsServiceDep,
) -> AllianceAveragesResponse:
    """
    Get alliance average metrics for a specific period.

    Path Parameters:
        period_id: Period UUID

    Returns:
        Alliance averages for daily metrics
    """
    await _verify_period_access(user_id, period_id)

    result = await service.get_period_alliance_averages(period_id)
    return AllianceAveragesResponse(**result)


@router.get("/alliance/trend", response_model=list[AllianceTrendItem])
async def get_alliance_trend(
    season_id: UUID,
    user_id: CurrentUserIdDep,
    service: AnalyticsServiceDep,
) -> list[AllianceTrendItem]:
    """
    Get alliance averages for each period in a season.

    Query Parameters:
        season_id: Season UUID (required)

    Returns:
        List of period averages with member counts
    """
    await _verify_season_access(user_id, season_id)
    data = await service.get_alliance_trend_averages(season_id)
    return [AllianceTrendItem(**item) for item in data]


@router.get("/seasons/{season_id}/averages", response_model=AllianceAveragesResponse)
async def get_season_averages(
    season_id: UUID,
    user_id: CurrentUserIdDep,
    service: AnalyticsServiceDep,
) -> AllianceAveragesResponse:
    """
    Get alliance average and median metrics for season-to-date.

    Uses snapshot totals / season_days for accurate season daily averages.
    This is the correct comparison baseline for "賽季以來" view mode.

    Path Parameters:
        season_id: Season UUID

    Returns:
        Alliance averages and medians for daily metrics
    """
    await _verify_season_access(user_id, season_id)
    result = await service.get_season_alliance_averages(season_id)
    return AllianceAveragesResponse(**result)


# =============================================================================
# Group Analytics Endpoints
# =============================================================================


@router.get("/groups", response_model=list[GroupListItem])
async def get_groups(
    season_id: UUID,
    user_id: CurrentUserIdDep,
    service: AnalyticsServiceDep,
) -> list[GroupListItem]:
    """
    Get list of all groups with member counts for a season.

    Query Parameters:
        season_id: Season UUID (required)

    Returns:
        List of groups with name and member_count
    """
    await _verify_season_access(user_id, season_id)
    data = await service.get_groups_list(season_id)
    return [GroupListItem(**item) for item in data]


@router.get("/groups/comparison", response_model=list[GroupComparisonItem])
async def get_groups_comparison(
    season_id: UUID,
    user_id: CurrentUserIdDep,
    service: AnalyticsServiceDep,
    view: str = Query("latest", description="View mode: 'latest' for latest period, 'season' for season average"),
) -> list[GroupComparisonItem]:
    """
    Get comparison data for all groups in a season.

    Used for group ranking and comparison charts.

    Query Parameters:
        season_id: Season UUID (required)
        view: View mode - 'latest' (default) or 'season'

    Returns:
        List of group comparison items sorted by avg_daily_merit descending
    """
    await _verify_season_access(user_id, season_id)
    data = await service.get_groups_comparison(season_id, view=view)
    return [GroupComparisonItem(**item) for item in data]


@router.get("/groups/{group_name}", response_model=GroupAnalyticsResponse)
async def get_group_analytics(
    group_name: str,
    season_id: UUID,
    user_id: CurrentUserIdDep,
    service: AnalyticsServiceDep,
    view: str = Query("latest", description="View mode: 'latest' for latest period, 'season' for season average"),
) -> GroupAnalyticsResponse:
    """
    Get complete analytics for a specific group.

    Includes stats, members list, trend data, and alliance averages for comparison.

    Path Parameters:
        group_name: Group name (URL encoded for special characters)

    Query Parameters:
        season_id: Season UUID (required)
        view: View mode - 'latest' (default) or 'season'

    Returns:
        Complete group analytics response
    """
    from urllib.parse import unquote

    await _verify_season_access(user_id, season_id)

    # Decode URL-encoded group name
    decoded_group_name = unquote(group_name)

    data = await service.get_group_analytics(season_id, decoded_group_name, view=view)

    if not data["members"]:
        raise HTTPException(
            status_code=404,
            detail=f"Group '{decoded_group_name}' not found or has no members in this season",
        )

    return GroupAnalyticsResponse(**data)
