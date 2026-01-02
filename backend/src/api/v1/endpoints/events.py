"""
Events API Endpoints

Battle event analytics endpoints.

Follows CLAUDE.md:
- API layer delegates to Service layer
- Uses Annotated dependency injection
- Proper error handling with exception chaining
- Typed response models for OpenAPI docs
"""

from uuid import UUID

from fastapi import APIRouter

from src.api.v1.schemas.events import (
    CreateEventRequest,
    DistributionBinResponse,
    EventAnalyticsResponse,
    EventDetailResponse,
    EventListItemResponse,
    EventMemberMetricResponse,
    EventSummaryResponse,
    ProcessEventRequest,
)
from src.core.dependencies import BattleEventServiceDep, SeasonServiceDep, UserIdDep
from src.models.battle_event import BattleEventCreate

router = APIRouter(prefix="/events", tags=["events"])


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

    # Calculate merit distribution
    merit_distribution = _calculate_merit_distribution([m.merit_diff for m in metrics])

    return EventAnalyticsResponse(
        event=EventDetailResponse.model_validate(event),
        summary=EventSummaryResponse.model_validate(summary),
        metrics=[EventMemberMetricResponse.model_validate(m) for m in metrics],
        merit_distribution=merit_distribution,
    )


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


def _calculate_merit_distribution(merits: list[int]) -> list[DistributionBinResponse]:
    """
    Calculate dynamic merit distribution bins.

    Args:
        merits: List of merit diff values

    Returns:
        List of distribution bins
    """
    if not merits:
        return []

    # Filter out zeros for better distribution
    positive_merits = [m for m in merits if m > 0]
    if not positive_merits:
        return [DistributionBinResponse(range="0", count=len(merits))]

    min_val = min(positive_merits)
    max_val = max(positive_merits)

    # Handle edge case where all values are the same
    if min_val == max_val:
        return [DistributionBinResponse(range=_format_value(min_val), count=len(positive_merits))]

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
        bins.append({
            "range": f"{_format_value(current)}-{_format_value(next_val)}",
            "min_value": current,
            "max_value": next_val,
            "count": 0,
        })
        current = next_val

    # Count values in each bin
    for merit in positive_merits:
        for bin_data in bins:
            if bin_data["min_value"] <= merit < bin_data["max_value"]:
                bin_data["count"] += 1
                break
        else:
            if bins and merit >= bins[-1]["min_value"]:
                bins[-1]["count"] += 1

    # Add zero count if any
    zero_count = sum(1 for m in merits if m == 0)
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
