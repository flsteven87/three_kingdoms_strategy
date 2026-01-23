"""
Donations API Schemas

Request/Response models for donation event endpoints.

Follows CLAUDE.md:
- Pydantic V2 syntax
- snake_case naming
- Clear type hints
"""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from src.models.donation import DonationStatus, DonationType

# ============================================================================
# Request Schemas
# ============================================================================


class CreateDonationRequest(BaseModel):
    """Request body for creating a new donation event"""

    title: str = Field(..., min_length=1, max_length=100, description="Event title")
    type: DonationType = Field(..., description="Regular or penalty type")
    deadline: datetime = Field(..., description="Deadline datetime")
    target_amount: int = Field(0, ge=0, description="Default target for all members (regular type)")
    description: str | None = Field(None, description="Optional event description")


class DonationTargetOverrideRequest(BaseModel):
    """Request body for per-member target override"""

    member_id: UUID = Field(..., description="Member UUID")
    target_amount: int = Field(..., ge=0, description="Override target amount for the member")


# ============================================================================
# Response Schemas
# ============================================================================


class DonationListResponse(BaseModel):
    """Donation event for list display"""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    season_id: UUID
    alliance_id: UUID
    title: str
    type: DonationType
    deadline: datetime
    target_amount: int
    description: str | None
    status: DonationStatus
    created_at: datetime
    created_by: UUID | None
    updated_at: datetime


class DonationMemberInfoResponse(BaseModel):
    """Member donation info"""

    member_id: UUID
    member_name: str
    target_amount: int
    donated_amount: int


class DonationDetailResponse(BaseModel):
    """Donation event with member donation details"""

    id: UUID
    season_id: UUID
    alliance_id: UUID
    title: str
    type: DonationType
    deadline: datetime
    target_amount: int
    description: str | None
    status: DonationStatus
    created_at: datetime
    created_by: UUID | None
    updated_at: datetime
    member_info: list[DonationMemberInfoResponse]
