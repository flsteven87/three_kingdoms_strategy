"""
Analytics API Schemas

Pydantic models for analytics API request/response validation.

Follows CLAUDE.md:
- Pydantic V2 syntax with ConfigDict
- snake_case field names
- Explicit type hints
"""

from datetime import date

from pydantic import BaseModel, ConfigDict, Field


class MemberListItem(BaseModel):
    """Member item for analytics selector dropdown"""

    model_config = ConfigDict(from_attributes=True)

    id: str = Field(..., description="Member UUID as string")
    name: str = Field(..., description="Member display name")
    is_active: bool = Field(..., description="Whether member is currently active")
    contribution_rank: int | None = Field(None, description="Latest contribution rank")
    group: str | None = Field(None, description="Current group assignment")


class MemberTrendItem(BaseModel):
    """Single period data point for member trend chart"""

    model_config = ConfigDict(from_attributes=True)

    # Period identification
    period_id: str = Field(..., description="Period UUID as string")
    period_number: int = Field(..., ge=1, description="Period number within season")
    period_label: str = Field(..., description="Display label (e.g., '10/02-10/09')")
    start_date: date = Field(..., description="Period start date")
    end_date: date = Field(..., description="Period end date")
    days: int = Field(..., ge=1, description="Number of days in period")

    # Daily averages
    daily_contribution: float = Field(..., ge=0, description="Daily average contribution")
    daily_merit: float = Field(..., ge=0, description="Daily average merit")
    daily_assist: float = Field(..., ge=0, description="Daily average assist")
    daily_donation: float = Field(..., ge=0, description="Daily average donation")

    # Period totals (diff values)
    contribution_diff: int = Field(..., description="Total contribution gained in period")
    merit_diff: int = Field(..., description="Total merit gained in period")
    assist_diff: int = Field(..., description="Total assists in period")
    donation_diff: int = Field(..., description="Total donation in period")
    power_diff: int = Field(..., description="Power change in period (can be negative)")

    # Rank info
    start_rank: int | None = Field(None, description="Rank at period start (None for new members)")
    end_rank: int = Field(..., description="Rank at period end")
    rank_change: int | None = Field(None, description="Rank change (positive = improved)")

    # State info
    end_power: int = Field(..., description="Power at period end")
    end_state: str | None = Field(None, description="State/region at period end")
    end_group: str | None = Field(None, description="Group assignment at period end")
    is_new_member: bool = Field(..., description="Whether this is member's first period")

    # Alliance averages for comparison
    alliance_avg_contribution: float = Field(0, description="Alliance avg daily contribution")
    alliance_avg_merit: float = Field(0, description="Alliance avg daily merit")
    alliance_avg_assist: float = Field(0, description="Alliance avg daily assist")
    alliance_avg_donation: float = Field(0, description="Alliance avg daily donation")
    alliance_avg_power: float = Field(0, description="Alliance avg power")
    alliance_member_count: int = Field(0, description="Total members in alliance for this period")


class SeasonSummaryResponse(BaseModel):
    """Season-to-date summary for a member"""

    model_config = ConfigDict(from_attributes=True)

    # Period counts
    period_count: int = Field(..., ge=0, description="Number of periods included")
    total_days: int = Field(..., ge=0, description="Total days across all periods")

    # Season totals
    total_contribution: int = Field(..., description="Total contribution across season")
    total_merit: int = Field(..., description="Total merit across season")
    total_assist: int = Field(..., description="Total assists across season")
    total_donation: int = Field(..., description="Total donation across season")
    total_power_change: int = Field(..., description="Net power change across season")

    # Season daily averages
    avg_daily_contribution: float = Field(..., ge=0, description="Average daily contribution")
    avg_daily_merit: float = Field(..., ge=0, description="Average daily merit")
    avg_daily_assist: float = Field(..., ge=0, description="Average daily assist")
    avg_daily_donation: float = Field(..., ge=0, description="Average daily donation")

    # Current status
    current_rank: int = Field(..., description="Current rank (from latest period)")
    rank_change_season: int | None = Field(None, description="Rank change since season start")
    current_power: int = Field(..., description="Current power (from latest period)")
    current_group: str | None = Field(None, description="Current group assignment")
    current_state: str | None = Field(None, description="Current state/region")


class AllianceAveragesResponse(BaseModel):
    """Alliance-wide average metrics for a period"""

    model_config = ConfigDict(from_attributes=True)

    member_count: int = Field(..., ge=0, description="Number of members included")
    avg_daily_contribution: float = Field(..., ge=0, description="Average daily contribution")
    avg_daily_merit: float = Field(..., ge=0, description="Average daily merit")
    avg_daily_assist: float = Field(..., ge=0, description="Average daily assist")
    avg_daily_donation: float = Field(..., ge=0, description="Average daily donation")


class AllianceTrendItem(BaseModel):
    """Alliance averages for a single period"""

    model_config = ConfigDict(from_attributes=True)

    period_id: str = Field(..., description="Period UUID as string")
    period_number: int = Field(..., ge=1, description="Period number within season")
    period_label: str = Field(..., description="Display label")
    member_count: int = Field(..., ge=0, description="Number of members")
    avg_daily_contribution: float = Field(..., ge=0)
    avg_daily_merit: float = Field(..., ge=0)
    avg_daily_assist: float = Field(..., ge=0)
    avg_daily_donation: float = Field(..., ge=0)


class MemberMetricsSnapshot(BaseModel):
    """Member metrics for a single period comparison"""

    model_config = ConfigDict(from_attributes=True)

    daily_contribution: float = Field(..., ge=0)
    daily_merit: float = Field(..., ge=0)
    daily_assist: float = Field(..., ge=0)
    daily_donation: float = Field(..., ge=0)
    end_rank: int = Field(..., ge=1)
    rank_change: int | None = Field(None)
    end_power: int = Field(..., ge=0)
    power_diff: int = Field(...)
    is_new_member: bool = Field(...)


class AllianceMetricsAverage(BaseModel):
    """Alliance average metrics for comparison"""

    model_config = ConfigDict(from_attributes=True)

    daily_contribution: float = Field(..., ge=0)
    daily_merit: float = Field(..., ge=0)
    daily_assist: float = Field(..., ge=0)
    daily_donation: float = Field(..., ge=0)


class MemberComparisonResponse(BaseModel):
    """Member metrics with alliance averages for comparison"""

    model_config = ConfigDict(from_attributes=True)

    member: MemberMetricsSnapshot = Field(..., description="Member's metrics")
    alliance_avg: AllianceMetricsAverage = Field(..., description="Alliance averages")
    total_members: int = Field(..., ge=0, description="Total members in comparison")
