"""
Donation Pydantic models

捐獻事件：追蹤同盟捐獻與懲罰事件
"""

from datetime import datetime
from enum import Enum
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class DonationType(str, Enum):
    """Donation event type"""

    REGULAR = "regular"  # 一般捐獻 - unified target
    PENALTY = "penalty"  # 懲罰性捐獻 - individual targets


class DonationStatus(str, Enum):
    """Donation event status"""

    ACTIVE = "active"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class DonationBase(BaseModel):
    """Base donation event model"""

    title: str = Field(..., min_length=1, max_length=100, description="Event title")
    type: DonationType = Field(..., description="Regular or penalty type")
    description: str | None = Field(None, description="Event description")
    deadline: datetime = Field(..., description="Deadline datetime")
    target_amount: int = Field(0, ge=0, description="Default target for all members (regular type)")
    status: DonationStatus = Field(default=DonationStatus.ACTIVE, description="Event status")


class DonationCreate(DonationBase):
    """Donation event creation model"""

    season_id: UUID = Field(..., description="Season ID")
    alliance_id: UUID = Field(..., description="Alliance ID")
    created_by: UUID | None = Field(None, description="User ID who created this")


class Donation(DonationBase):
    """Donation event model with all fields"""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    alliance_id: UUID
    season_id: UUID
    created_by: UUID | None
    created_at: datetime
    updated_at: datetime


class DonationMemberInfo(BaseModel):
    """Individual member donation info"""

    member_id: UUID = Field(..., description="Member UUID")
    member_name: str = Field(..., description="Member name")
    target_amount: int = Field(..., description="Target amount")
    donated_amount: int = Field(..., description="Actual donation (diff)")


class DonationWithInfo(Donation):
    """Donation event with member donation details"""

    member_info: list[DonationMemberInfo] = Field(
        default_factory=list, description="List of member donations"
    )


class DonationTarget(BaseModel):
    """Per-member target override for a donation event"""

    model_config = ConfigDict(from_attributes=True)

    id: UUID | None = Field(None, description="Target override ID")
    donation_event_id: UUID = Field(..., description="Donation event ID")
    alliance_id: UUID = Field(..., description="Alliance ID")
    member_id: UUID = Field(..., description="Member UUID")
    target_amount: int = Field(..., ge=0, description="Override target amount")
    created_at: datetime | None = Field(
        default=None, description="Timestamp when override was created"
    )
    updated_at: datetime | None = Field(
        default=None, description="Timestamp when override was updated"
    )
