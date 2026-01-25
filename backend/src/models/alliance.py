"""
Alliance Pydantic models

符合 CLAUDE.md: snake_case naming, type hints, Google-style docstrings
"""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


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

    Note: Trial system has moved to Season level (Season.is_trial, Season.activated_at)
    """

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    created_at: datetime
    updated_at: datetime

    # Season purchase fields
    purchased_seasons: int = 0
    used_seasons: int = 0
    recur_customer_id: str | None = None


class SeasonQuotaStatus(BaseModel):
    """Response model for season quota status API - Season-Based Trial System"""

    # Purchase information
    purchased_seasons: int = Field(description="Total number of purchased seasons")
    used_seasons: int = Field(description="Number of seasons already activated (excluding trial)")
    available_seasons: int = Field(description="Remaining seasons available for activation")

    # Trial information (from current season if applicable)
    has_trial_available: bool = Field(
        description="Whether user can use trial (never activated any season)"
    )
    current_season_is_trial: bool = Field(description="Whether current season is a trial season")
    trial_days_remaining: int | None = Field(
        None, description="Days remaining in trial (if current season is trial)"
    )
    trial_ends_at: str | None = Field(
        None, description="Trial end date (if current season is trial)"
    )

    # Capabilities
    can_activate_season: bool = Field(description="Whether user can activate a new season")
    can_write: bool = Field(description="Whether user can upload CSV to current season")
