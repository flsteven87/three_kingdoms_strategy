"""
Alliance Pydantic models

符合 CLAUDE.md: snake_case naming, type hints, Google-style docstrings
"""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

# Subscription status type for season purchase system
# - trial: Within 14-day trial period
# - active: Trial active OR has available seasons
# - expired: Trial expired AND no available seasons
SubscriptionStatus = Literal["trial", "active", "expired"]


class AllianceBase(BaseModel):
    """Base alliance model with common fields"""

    name: str = Field(..., min_length=1, max_length=100, description="Alliance name")
    server_name: str | None = Field(None, max_length=100, description="Game server name")


class AllianceCreate(AllianceBase):
    """
    Alliance creation model (Client-side)

    Note: user_id is NOT included here - it's extracted from JWT token on the server.
    符合 CLAUDE.md 🔴: Security best practice - never trust client-provided user_id
    """

    pass


class AllianceUpdate(BaseModel):
    """Alliance update model"""

    name: str | None = Field(None, min_length=1, max_length=100)
    server_name: str | None = Field(None, max_length=100)


class Alliance(AllianceBase):
    """
    Alliance model with all fields.

    Note: user_id has been removed - use alliance_collaborators table instead
    """

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    created_at: datetime
    updated_at: datetime

    # Trial fields
    subscription_status: SubscriptionStatus = "trial"
    trial_started_at: datetime | None = None
    trial_ends_at: datetime | None = None

    # Season purchase fields
    purchased_seasons: int = 0
    used_seasons: int = 0
    recur_customer_id: str | None = None


class SubscriptionStatusResponse(BaseModel):
    """Response model for subscription status API - Season Purchase System"""

    # Overall status
    status: SubscriptionStatus
    is_active: bool = Field(description="Whether can activate new seasons (trial or has seasons)")

    # Trial information
    is_trial: bool = Field(description="Whether currently in trial period")
    is_trial_active: bool = Field(description="Whether trial is still valid")
    trial_days_remaining: int | None = Field(description="Days remaining in trial")
    trial_ends_at: str | None = Field(description="Trial end date (ISO format)")

    # Season purchase information
    purchased_seasons: int = Field(description="Total purchased seasons")
    used_seasons: int = Field(description="Seasons already used")
    available_seasons: int = Field(description="Remaining available seasons")

    # Activation capability
    can_activate_season: bool = Field(
        description="Whether user can activate a new season (trial active OR has available seasons)"
    )
