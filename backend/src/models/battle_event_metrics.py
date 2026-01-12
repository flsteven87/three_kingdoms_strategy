"""
Battle Event Metrics Pydantic models

戰役事件指標：儲存每個成員在特定事件中的表現差異

符合 CLAUDE.md: snake_case naming, type hints, Google-style docstrings
"""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class BattleEventMetricsBase(BaseModel):
    """Base battle event metrics model with common fields"""

    # Performance metrics (diffs between before/after snapshots)
    contribution_diff: int = Field(0, ge=0, description="Contribution difference")
    merit_diff: int = Field(0, ge=0, description="Merit difference")
    assist_diff: int = Field(0, ge=0, description="Assist difference")
    donation_diff: int = Field(0, ge=0, description="Donation difference")
    power_diff: int = Field(0, description="Power difference (can be negative)")

    # Participation flags (computed from diffs)
    participated: bool = Field(False, description="Whether member actively participated")
    is_new_member: bool = Field(False, description="Whether member only exists in after snapshot")
    is_absent: bool = Field(False, description="Whether member exists in before but has no activity")


class BattleEventMetricsCreate(BattleEventMetricsBase):
    """Battle event metrics creation model"""

    event_id: UUID = Field(..., description="Battle event ID")
    member_id: UUID = Field(..., description="Member ID")
    alliance_id: UUID = Field(..., description="Alliance ID")
    start_snapshot_id: UUID | None = Field(None, description="Before snapshot ID")
    end_snapshot_id: UUID | None = Field(None, description="After snapshot ID")


class BattleEventMetrics(BattleEventMetricsBase):
    """Battle event metrics model with all fields"""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    event_id: UUID
    member_id: UUID
    alliance_id: UUID
    start_snapshot_id: UUID | None
    end_snapshot_id: UUID | None
    created_at: datetime


class BattleEventMetricsWithMember(BattleEventMetrics):
    """Battle event metrics with member info for display"""

    member_name: str = Field(..., description="Member name")
    group_name: str | None = Field(None, description="Member group")


class EventSummary(BaseModel):
    """Summary statistics for a battle event"""

    model_config = ConfigDict(from_attributes=True)

    # Participation stats
    total_members: int = Field(..., description="Total members in snapshots")
    participated_count: int = Field(..., description="Members who participated")
    absent_count: int = Field(..., description="Members who didn't participate")
    new_member_count: int = Field(..., description="New members (only in after)")
    participation_rate: float = Field(..., ge=0, le=100, description="Participation rate percentage")

    # Aggregate metrics
    total_merit: int = Field(..., description="Sum of all merit diffs")
    total_assist: int = Field(..., description="Sum of all assist diffs")
    total_contribution: int = Field(..., description="Sum of all contribution diffs")
    avg_merit: float = Field(..., description="Average merit per participant")
    avg_assist: float = Field(..., description="Average assist per participant")

    # MVP info
    mvp_member_id: UUID | None = Field(None, description="Top performer member ID")
    mvp_member_name: str | None = Field(None, description="Top performer name")
    mvp_merit: int | None = Field(None, description="Top performer merit")


# =============================================================================
# Group Analytics Models (for LINE Bot report)
# =============================================================================


class GroupEventStats(BaseModel):
    """Statistics for a single group in a battle event"""

    group_name: str = Field(..., description="Group name (or '未分組' if null)")
    member_count: int = Field(..., ge=0, description="Total members in group")
    participated_count: int = Field(..., ge=0, description="Members who participated")
    absent_count: int = Field(..., ge=0, description="Members who were absent")
    participation_rate: float = Field(..., ge=0, le=100, description="Group participation rate")

    # Merit statistics (calculated from participants only)
    total_merit: int = Field(0, ge=0, description="Sum of merit diffs")
    avg_merit: float = Field(0, ge=0, description="Average merit per participant")
    merit_min: int = Field(0, ge=0, description="Minimum merit")
    merit_max: int = Field(0, ge=0, description="Maximum merit")


class TopMemberItem(BaseModel):
    """Top performer item for ranking display"""

    rank: int = Field(..., ge=1, description="Ranking position")
    member_name: str = Field(..., description="Member name (game ID)")
    group_name: str | None = Field(None, description="Member group")
    merit_diff: int = Field(..., ge=0, description="Merit earned in event")
    line_display_name: str | None = Field(None, description="LINE display name if bound")


class EventGroupAnalytics(BaseModel):
    """Complete group analytics for a battle event (used in LINE Bot report)"""

    # Event info
    event_id: UUID
    event_name: str
    event_type: str | None = None
    event_start: datetime | None = None
    event_end: datetime | None = None

    # Overall summary
    summary: EventSummary

    # Group-level statistics (sorted by total_merit desc)
    group_stats: list[GroupEventStats] = []

    # Top performers
    top_members: list[TopMemberItem] = []
