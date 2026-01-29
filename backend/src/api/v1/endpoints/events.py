"""
Events API Endpoints

Battle event analytics endpoints.

Follows CLAUDE.md:
- API layer delegates to Service layer
- Uses Annotated dependency injection
- Proper error handling with exception chaining
- Typed response models for OpenAPI docs
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, File, Form, UploadFile

from src.api.v1.schemas.events import (
    CreateEventRequest,
    DistributionBinResponse,
    EventAnalyticsResponse,
    EventDetailResponse,
    EventGroupAnalyticsResponse,
    EventListItemResponse,
    EventMemberMetricResponse,
    EventSummaryResponse,
    EventUploadResponse,
    GroupEventStatsResponse,
    ProcessEventRequest,
    TopMemberResponse,
    UpdateEventRequest,
    ViolatorResponse,
)
from src.core.dependencies import (
    BattleEventServiceDep,
    CSVUploadServiceDep,
    SeasonServiceDep,
    UserIdDep,
)
from src.models.battle_event import BattleEventCreate, BattleEventUpdate, EventCategory

router = APIRouter(prefix="/events", tags=["events"])


@router.post("/upload-csv", response_model=EventUploadResponse)
async def upload_event_csv(
    user_id: UserIdDep,
    csv_service: CSVUploadServiceDep,
    season_service: SeasonServiceDep,
    season_id: Annotated[str, Form()],
    file: Annotated[UploadFile, File()],
    snapshot_date: Annotated[str | None, Form()] = None,
) -> EventUploadResponse:
    """
    Upload CSV file for battle event analysis.

    Unlike regular data management uploads, event CSV uploads:
    - Do NOT trigger period calculation
    - Can have multiple uploads on the same day
    - Are stored separately from regular uploads

    Args:
        season_id: Season UUID (as string from form)
        file: CSV file upload
        snapshot_date: Optional custom snapshot datetime (ISO format)

    Returns:
        Upload result with upload_id and statistics

    符合 CLAUDE.md 🟡: Global exception handlers eliminate try/except boilerplate
    """
    season_uuid = UUID(season_id)

    # Verify user access to season
    await season_service.verify_user_access(user_id, season_uuid)

    if not file.filename or not file.filename.endswith(".csv"):
        raise ValueError("File must be a CSV file")

    content = await file.read()
    csv_content = content.decode("utf-8")

    result = await csv_service.upload_csv(
        user_id=user_id,
        season_id=season_uuid,
        filename=file.filename,
        csv_content=csv_content,
        custom_snapshot_date=snapshot_date,
        upload_type="event",
    )

    return EventUploadResponse(
        upload_id=str(result["upload_id"]),
        season_id=str(result["season_id"]),
        snapshot_date=result["snapshot_date"],
        file_name=result["filename"],
        total_members=result["total_members"],
    )


@router.get("", response_model=list[EventListItemResponse])
async def list_events(
    season_id: UUID,
    user_id: UserIdDep,
    service: BattleEventServiceDep,
    season_service: SeasonServiceDep,
) -> list[EventListItemResponse]:
    """
    Get all events for a season.

    Query Parameters:
        season_id: Season UUID (required)

    Returns:
        List of events with basic info and computed stats
    """
    await season_service.verify_user_access(user_id, season_id)
    events = await service.get_events_by_season(season_id)
    return [EventListItemResponse.model_validate(e) for e in events]


@router.post("", response_model=EventDetailResponse, status_code=201)
async def create_event(
    season_id: UUID,
    body: CreateEventRequest,
    user_id: UserIdDep,
    service: BattleEventServiceDep,
    season_service: SeasonServiceDep,
) -> EventDetailResponse:
    """
    Create a new battle event.

    Query Parameters:
        season_id: Season UUID (required)

    Request Body:
        name: Event name
        event_type: Type of event
        description: Optional description

    Returns:
        Created event details
    """
    alliance_id = await season_service.verify_user_access(user_id, season_id)

    event_data = BattleEventCreate(
        season_id=season_id,
        alliance_id=alliance_id,
        name=body.name,
        event_type=body.event_type,
        description=body.description,
        created_by=user_id,
    )

    event = await service.create_event(event_data)
    return EventDetailResponse.model_validate(event)


@router.get("/{event_id}", response_model=EventDetailResponse)
async def get_event(
    event_id: UUID,
    user_id: UserIdDep,
    service: BattleEventServiceDep,
) -> EventDetailResponse:
    """
    Get event details by ID.

    Path Parameters:
        event_id: Event UUID

    Returns:
        Event details

    Raises:
        ValueError: Event not found
    """
    await service.verify_user_access(user_id, event_id)
    event = await service.get_event(event_id)

    if not event:
        raise ValueError("Event not found")

    return EventDetailResponse.model_validate(event)


@router.post("/{event_id}/process", response_model=EventDetailResponse)
async def process_event(
    event_id: UUID,
    body: ProcessEventRequest,
    user_id: UserIdDep,
    service: BattleEventServiceDep,
) -> EventDetailResponse:
    """
    Process event snapshots and calculate metrics.

    This endpoint should be called after uploading before/after CSV files.
    It calculates member participation and metrics.

    Path Parameters:
        event_id: Event UUID

    Request Body:
        before_upload_id: Before snapshot upload UUID
        after_upload_id: After snapshot upload UUID

    Returns:
        Updated event details with completed status

    符合 CLAUDE.md 🟡: Global exception handlers eliminate try/except boilerplate
    """
    await service.verify_user_access(user_id, event_id)

    event = await service.process_event_snapshots(
        event_id, body.before_upload_id, body.after_upload_id
    )
    return EventDetailResponse.model_validate(event)


@router.get("/{event_id}/summary", response_model=EventSummaryResponse)
async def get_event_summary(
    event_id: UUID,
    user_id: UserIdDep,
    service: BattleEventServiceDep,
) -> EventSummaryResponse:
    """
    Get event summary statistics.

    Path Parameters:
        event_id: Event UUID

    Returns:
        Event summary with participation stats and aggregates
    """
    await service.verify_user_access(user_id, event_id)
    summary = await service.get_event_summary(event_id)
    return EventSummaryResponse.model_validate(summary)


@router.get("/{event_id}/metrics", response_model=list[EventMemberMetricResponse])
async def get_event_metrics(
    event_id: UUID,
    user_id: UserIdDep,
    service: BattleEventServiceDep,
) -> list[EventMemberMetricResponse]:
    """
    Get all member metrics for an event.

    Path Parameters:
        event_id: Event UUID

    Returns:
        List of member metrics ordered by merit_diff descending
    """
    await service.verify_user_access(user_id, event_id)
    metrics = await service.get_event_metrics(event_id)
    return [EventMemberMetricResponse.model_validate(m) for m in metrics]


@router.get("/{event_id}/analytics", response_model=EventAnalyticsResponse)
async def get_event_analytics(
    event_id: UUID,
    user_id: UserIdDep,
    service: BattleEventServiceDep,
) -> EventAnalyticsResponse:
    """
    Get complete event analytics.

    Path Parameters:
        event_id: Event UUID

    Returns:
        Complete analytics with event, summary, metrics, and distribution

    Raises:
        ValueError: Event not found
    """
    await service.verify_user_access(user_id, event_id)

    event = await service.get_event(event_id)
    if not event:
        raise ValueError("Event not found")

    summary = await service.get_event_summary(event_id)
    metrics = await service.get_event_metrics(event_id)

    # Calculate distribution based on event type
    if event.event_type == EventCategory.SIEGE:
        # SIEGE: contribution + assist
        values = [m.contribution_diff + m.assist_diff for m in metrics]
    elif event.event_type == EventCategory.FORBIDDEN:
        # FORBIDDEN: power_diff for violators
        values = [m.power_diff for m in metrics if m.power_diff > 0]
    else:
        # BATTLE: merit_diff
        values = [m.merit_diff for m in metrics]

    merit_distribution = _calculate_metric_distribution(values)

    return EventAnalyticsResponse(
        event=EventDetailResponse.model_validate(event),
        summary=EventSummaryResponse.model_validate(summary),
        metrics=[EventMemberMetricResponse.model_validate(m) for m in metrics],
        merit_distribution=merit_distribution,
    )


@router.get("/{event_id}/group-analytics", response_model=EventGroupAnalyticsResponse)
async def get_event_group_analytics(
    event_id: UUID,
    user_id: UserIdDep,
    service: BattleEventServiceDep,
) -> EventGroupAnalyticsResponse:
    """
    Get group-level analytics for a battle event.

    Used for LINE Bot report preview with per-group statistics
    and top performer rankings.

    Path Parameters:
        event_id: Event UUID

    Returns:
        Group analytics with event info, summary, group stats, and top members
    """
    await service.verify_user_access(user_id, event_id)

    analytics = await service.get_event_group_analytics(event_id)
    if not analytics:
        raise ValueError("Event not found")

    return EventGroupAnalyticsResponse(
        event_id=str(analytics.event_id),
        event_name=analytics.event_name,
        event_type=analytics.event_type,
        event_start=analytics.event_start,
        event_end=analytics.event_end,
        summary=EventSummaryResponse.model_validate(analytics.summary),
        group_stats=[
            GroupEventStatsResponse(
                group_name=g.group_name,
                member_count=g.member_count,
                participated_count=g.participated_count,
                absent_count=g.absent_count,
                participation_rate=g.participation_rate,
                # BATTLE stats
                total_merit=g.total_merit,
                avg_merit=g.avg_merit,
                merit_min=g.merit_min,
                merit_max=g.merit_max,
                # SIEGE stats
                total_contribution=g.total_contribution,
                avg_contribution=g.avg_contribution,
                total_assist=g.total_assist,
                avg_assist=g.avg_assist,
                combined_min=g.combined_min,
                combined_max=g.combined_max,
                # FORBIDDEN stats
                violator_count=g.violator_count,
            )
            for g in analytics.group_stats
        ],
        top_members=[
            TopMemberResponse(
                rank=m.rank,
                member_name=m.member_name,
                group_name=m.group_name,
                score=m.score,
                merit_diff=m.merit_diff,
                contribution_diff=m.contribution_diff,
                assist_diff=m.assist_diff,
                line_display_name=m.line_display_name,
            )
            for m in analytics.top_members
        ],
        top_contributors=[
            TopMemberResponse(
                rank=m.rank,
                member_name=m.member_name,
                group_name=m.group_name,
                score=m.score,
                merit_diff=m.merit_diff,
                contribution_diff=m.contribution_diff,
                assist_diff=m.assist_diff,
                line_display_name=m.line_display_name,
            )
            for m in analytics.top_contributors
        ],
        top_assisters=[
            TopMemberResponse(
                rank=m.rank,
                member_name=m.member_name,
                group_name=m.group_name,
                score=m.score,
                merit_diff=m.merit_diff,
                contribution_diff=m.contribution_diff,
                assist_diff=m.assist_diff,
                line_display_name=m.line_display_name,
            )
            for m in analytics.top_assisters
        ],
        violators=[
            ViolatorResponse(
                rank=v.rank,
                member_name=v.member_name,
                group_name=v.group_name,
                power_diff=v.power_diff,
                line_display_name=v.line_display_name,
            )
            for v in analytics.violators
        ],
    )


@router.patch("/{event_id}", response_model=EventDetailResponse)
async def update_event(
    event_id: UUID,
    body: UpdateEventRequest,
    user_id: UserIdDep,
    service: BattleEventServiceDep,
) -> EventDetailResponse:
    """
    Update an event's basic information.

    Only owner or collaborator can update events.
    Only name, event_type, and description can be updated.

    Path Parameters:
        event_id: Event UUID

    Request Body:
        name: Optional new event name
        event_type: Optional new event type
        description: Optional new description

    Returns:
        Updated event details

    Raises:
        ValueError: Event not found
        PermissionError: User is not owner/collaborator
    """
    # Convert request to update model
    update_data = BattleEventUpdate(
        name=body.name,
        event_type=body.event_type,
        description=body.description,
    )

    event = await service.update_event(event_id, update_data, user_id)
    return EventDetailResponse.model_validate(event)


@router.delete("/{event_id}", status_code=204)
async def delete_event(
    event_id: UUID,
    user_id: UserIdDep,
    service: BattleEventServiceDep,
) -> None:
    """
    Delete an event.

    Path Parameters:
        event_id: Event UUID
    """
    await service.verify_user_access(user_id, event_id)
    await service.delete_event(event_id)


def _calculate_metric_distribution(values: list[int]) -> list[DistributionBinResponse]:
    """
    Calculate dynamic metric distribution bins.

    Works for any metric type (merit, contribution+assist, power_diff).

    Args:
        values: List of metric values

    Returns:
        List of distribution bins
    """
    if not values:
        return []

    # Filter out zeros for better distribution
    positive_values = [v for v in values if v > 0]
    if not positive_values:
        return [DistributionBinResponse(range="0", count=len(values))]

    min_val = min(positive_values)
    max_val = max(positive_values)

    # Handle edge case where all values are the same
    if min_val == max_val:
        return [DistributionBinResponse(range=_format_value(min_val), count=len(positive_values))]

    # Calculate nice bin width
    data_range = max_val - min_val
    raw_bin_width = data_range / 5  # Target 5 bins

    # Round to nice numbers
    magnitude = 10 ** max(0, len(str(int(raw_bin_width))) - 1) if raw_bin_width >= 1 else 1
    nice_widths = [1, 2, 5, 10, 20, 50, 100]
    bin_width = int(magnitude * min(nice_widths, key=lambda x: abs(x * magnitude - raw_bin_width)))
    bin_width = max(bin_width, 1000)  # Minimum 1K bins

    # Calculate bin start
    bin_start = (min_val // bin_width) * bin_width

    # Create bins
    bins: list[dict] = []
    current = bin_start
    while current < max_val:
        next_val = current + bin_width
        bins.append(
            {
                "range": f"{_format_value(current)}-{_format_value(next_val)}",
                "min_value": current,
                "max_value": next_val,
                "count": 0,
            }
        )
        current = next_val

    # Count values in each bin
    for val in positive_values:
        for bin_data in bins:
            if bin_data["min_value"] <= val < bin_data["max_value"]:
                bin_data["count"] += 1
                break
        else:
            if bins and val >= bins[-1]["min_value"]:
                bins[-1]["count"] += 1

    # Add zero count if any
    zero_count = sum(1 for v in values if v == 0)
    result = []
    if zero_count > 0:
        result.append(DistributionBinResponse(range="0", count=zero_count))

    result.extend([DistributionBinResponse(range=b["range"], count=b["count"]) for b in bins])
    return result


def _format_value(val: int) -> str:
    """Format value with K/M suffix."""
    if val >= 1_000_000:
        return f"{val / 1_000_000:.1f}M" if val % 1_000_000 != 0 else f"{val // 1_000_000}M"
    if val >= 1000:
        return f"{val / 1000:.0f}K" if val % 1000 == 0 else f"{val / 1000:.1f}K"
    return str(val)
