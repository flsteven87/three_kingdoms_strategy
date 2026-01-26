"""
Events API Schemas

Request/Response models for battle event analytics endpoints.

Follows CLAUDE.md:
- Pydantic V2 syntax
- snake_case naming
- Clear type hints
"""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from src.models.battle_event import EventCategory, EventStatus

# ============================================================================
# Request Schemas
# ============================================================================


class CreateEventRequest(BaseModel):
    """Request body for creating a new battle event"""

    name: str = Field(..., min_length=1, max_length=100, description="Event name")
    event_type: EventCategory = Field(
        default=EventCategory.BATTLE,
        description="Event category: siege (攻城), forbidden (禁地), battle (戰役)"
    )
    description: str | None = Field(None, max_length=500, description="Event description")


class ProcessEventRequest(BaseModel):
    """Request body for processing event snapshots"""

    before_upload_id: UUID = Field(..., description="Before snapshot upload UUID")
    after_upload_id: UUID = Field(..., description="After snapshot upload UUID")


# ============================================================================
# Response Schemas
# ============================================================================


class EventUploadResponse(BaseModel):
    """Response for event CSV upload"""

    upload_id: str = Field(..., description="Created upload UUID")
    season_id: str = Field(..., description="Season UUID")
    snapshot_date: str = Field(..., description="Snapshot datetime (ISO format)")
    file_name: str = Field(..., description="Original filename")
    total_members: int = Field(..., description="Total members in this upload")


class EventListItemResponse(BaseModel):
    """Event list item for event cards"""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    event_type: EventCategory
    status: EventStatus
    event_start: datetime | None
    event_end: datetime | None
    created_at: datetime
    participation_rate: float | None = None
    total_merit: int | None = None
    mvp_name: str | None = None
    absent_count: int | None = None


class EventDetailResponse(BaseModel):
    """Detailed event information"""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    event_type: EventCategory
    description: str | None
    status: EventStatus
    event_start: datetime | None
    event_end: datetime | None
    before_upload_id: UUID | None
    after_upload_id: UUID | None
    created_at: datetime


class EventSummaryResponse(BaseModel):
    """Event summary statistics"""

    model_config = ConfigDict(from_attributes=True)

    total_members: int
    participated_count: int
    absent_count: int
    new_member_count: int
    participation_rate: float

    total_merit: int
    total_assist: int
    total_contribution: int
    avg_merit: float
    avg_assist: float

    mvp_member_id: UUID | None
    mvp_member_name: str | None
    mvp_merit: int | None


class EventMemberMetricResponse(BaseModel):
    """Individual member metrics for an event"""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    member_id: UUID
    member_name: str
    group_name: str | None

    contribution_diff: int
    merit_diff: int
    assist_diff: int
    donation_diff: int
    power_diff: int

    participated: bool
    is_new_member: bool
    is_absent: bool


class DistributionBinResponse(BaseModel):
    """Distribution histogram bin"""

    range: str
    count: int


class EventAnalyticsResponse(BaseModel):
    """Complete event analytics response"""

    event: EventDetailResponse
    summary: EventSummaryResponse
    metrics: list[EventMemberMetricResponse]
    merit_distribution: list[DistributionBinResponse]
