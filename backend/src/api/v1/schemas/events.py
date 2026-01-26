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

    # Category-specific MVP
    mvp_member_id: UUID | None
    mvp_member_name: str | None
    mvp_merit: int | None  # For BATTLE
    mvp_contribution: int | None  # For SIEGE
    mvp_assist: int | None  # For SIEGE
    mvp_combined_score: int | None  # For SIEGE (contribution + assist)

    # Forbidden zone specific
    violator_count: int = 0  # Members with power increase


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


# ============================================================================
# Group Analytics Schemas (for LINE Bot report preview)
# ============================================================================


class GroupEventStatsResponse(BaseModel):
    """Statistics for a single group in a battle event (category-aware)"""

    group_name: str
    member_count: int
    participated_count: int
    absent_count: int
    participation_rate: float

    # BATTLE event stats
    total_merit: int = 0
    avg_merit: float = 0
    merit_min: int = 0
    merit_max: int = 0

    # SIEGE event stats
    total_contribution: int = 0
    avg_contribution: float = 0
    total_assist: int = 0
    avg_assist: float = 0
    combined_min: int = 0
    combined_max: int = 0

    # FORBIDDEN event stats
    violator_count: int = 0


class TopMemberResponse(BaseModel):
    """Top performer item for ranking display (category-aware)"""

    rank: int
    member_name: str
    group_name: str | None

    # Primary score for ranking (used by all types)
    score: int

    # Category-specific fields
    merit_diff: int | None = None  # BATTLE
    contribution_diff: int | None = None  # SIEGE
    assist_diff: int | None = None  # SIEGE

    line_display_name: str | None = None


class ViolatorResponse(BaseModel):
    """Violator item for FORBIDDEN events"""

    rank: int
    member_name: str
    group_name: str | None
    power_diff: int
    line_display_name: str | None = None


class EventGroupAnalyticsResponse(BaseModel):
    """Complete group analytics for a battle event (used in LINE Bot report)"""

    event_id: str
    event_name: str
    event_type: EventCategory | None = None
    event_start: datetime | None = None
    event_end: datetime | None = None
    summary: EventSummaryResponse
    group_stats: list[GroupEventStatsResponse]

    # Top performers (for BATTLE and SIEGE events)
    top_members: list[TopMemberResponse] = []

    # Violators (for FORBIDDEN events only)
    violators: list[ViolatorResponse] = []
