"""
Member Period Metrics Pydantic models

成員期間指標：儲存每個成員在每個期間的計算結果（diff + 每日均）

符合 CLAUDE.md: snake_case naming, type hints, Google-style docstrings
"""

from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class MemberPeriodMetricsBase(BaseModel):
    """Base member period metrics model with common fields"""

    # Period diff values (當期增量)
    contribution_diff: int = Field(0, ge=0, description="Contribution difference in period")
    merit_diff: int = Field(0, ge=0, description="Merit difference in period")
    assist_diff: int = Field(0, ge=0, description="Assist difference in period")
    donation_diff: int = Field(0, ge=0, description="Donation difference in period")
    power_diff: int = Field(0, description="Power difference in period (can be negative)")

    # Daily averages (每日均值)
    daily_contribution: Decimal = Field(
        Decimal("0"), ge=0, description="Daily average contribution"
    )
    daily_merit: Decimal = Field(Decimal("0"), ge=0, description="Daily average merit")
    daily_assist: Decimal = Field(Decimal("0"), ge=0, description="Daily average assist")
    daily_donation: Decimal = Field(Decimal("0"), ge=0, description="Daily average donation")

    # Ranking data
    start_rank: int | None = Field(
        None, ge=1, description="Rank at period start (None for new members)"
    )
    end_rank: int = Field(..., ge=1, description="Rank at period end")
    rank_change: int | None = Field(None, description="Rank change (positive = improved)")

    # End state snapshot
    end_power: int = Field(0, ge=0, description="Power value at period end")
    end_state: str | None = Field(None, max_length=50, description="State at period end")
    end_group: str | None = Field(None, max_length=50, description="Group at period end")

    # Status flags
    is_new_member: bool = Field(False, description="Whether member joined during this period")


class MemberPeriodMetricsCreate(MemberPeriodMetricsBase):
    """Member period metrics creation model"""

    period_id: UUID = Field(..., description="Period ID")
    member_id: UUID = Field(..., description="Member ID")
    alliance_id: UUID = Field(..., description="Alliance ID")
    start_snapshot_id: UUID | None = Field(
        None, description="Start snapshot ID (None for new members)"
    )
    end_snapshot_id: UUID = Field(..., description="End snapshot ID")


class MemberPeriodMetrics(MemberPeriodMetricsBase):
    """Member period metrics model with all fields"""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    period_id: UUID
    member_id: UUID
    alliance_id: UUID
    start_snapshot_id: UUID | None
    end_snapshot_id: UUID
    created_at: datetime


class MemberPeriodMetricsWithMember(MemberPeriodMetrics):
    """Member period metrics with member name for display"""

    member_name: str = Field(..., description="Member name")


class MemberPeriodMetricsSummary(BaseModel):
    """Summary of period metrics for display"""

    model_config = ConfigDict(from_attributes=True)

    member_id: UUID
    member_name: str
    daily_contribution: Decimal
    daily_merit: Decimal
    daily_assist: Decimal
    daily_donation: Decimal
    rank_change: int | None
    end_rank: int
    is_new_member: bool
