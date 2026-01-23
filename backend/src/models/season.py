"""
Season Pydantic models

符合 CLAUDE.md: snake_case naming, type hints, Google-style docstrings
"""

from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

# Activation status type for season purchase system
ActivationStatus = Literal["draft", "activated", "completed"]


class SeasonBase(BaseModel):
    """Base season model with common fields"""

    name: str = Field(..., min_length=1, max_length=100, description="Season name")
    start_date: date = Field(..., description="Season start date")
    end_date: date | None = Field(None, description="Season end date (NULL = ongoing)")
    is_current: bool = Field(False, description="Whether this is the current selected season")
    activation_status: ActivationStatus = Field(
        "draft", description="Season activation status: draft/activated/completed"
    )
    description: str | None = Field(None, max_length=500, description="Season description")

    @field_validator("end_date")
    @classmethod
    def validate_date_range(cls, v: date | None, info) -> date | None:
        """Validate end_date is after start_date"""
        if v is not None and "start_date" in info.data:
            start_date = info.data["start_date"]
            if v < start_date:
                raise ValueError("end_date must be after start_date")
        return v


class SeasonCreate(BaseModel):
    """Season creation model - always starts as draft"""

    alliance_id: UUID = Field(..., description="Alliance ID")
    name: str = Field(..., min_length=1, max_length=100, description="Season name")
    start_date: date = Field(..., description="Season start date")
    end_date: date | None = Field(None, description="Season end date (NULL = ongoing)")
    description: str | None = Field(None, max_length=500, description="Season description")

    @field_validator("end_date")
    @classmethod
    def validate_date_range(cls, v: date | None, info) -> date | None:
        """Validate end_date is after start_date"""
        if v is not None and "start_date" in info.data:
            start_date = info.data["start_date"]
            if v < start_date:
                raise ValueError("end_date must be after start_date")
        return v


class SeasonUpdate(BaseModel):
    """Season update model"""

    name: str | None = Field(None, min_length=1, max_length=100)
    start_date: date | None = None
    end_date: date | None = None
    description: str | None = Field(None, max_length=500)


class Season(SeasonBase):
    """Season model with all fields"""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    alliance_id: UUID
    created_at: datetime
    updated_at: datetime


class SeasonActivateResponse(BaseModel):
    """Response model for season activation"""

    success: bool
    season: "Season"
    remaining_seasons: int = Field(description="Remaining available seasons after activation")
    used_trial: bool = Field(description="Whether trial was used for this activation")
