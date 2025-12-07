"""
Period Pydantic models

期間模型：定義兩個連續 CSV 上傳之間的時間段

符合 CLAUDE.md: snake_case naming, type hints, Google-style docstrings
"""

from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class PeriodBase(BaseModel):
    """Base period model with common fields"""

    start_date: date = Field(..., description="Period start date")
    end_date: date = Field(..., description="Period end date")
    days: int = Field(..., ge=1, description="Number of days in period")
    period_number: int = Field(..., ge=1, description="Period number within season")


class PeriodCreate(PeriodBase):
    """Period creation model"""

    season_id: UUID = Field(..., description="Season ID")
    alliance_id: UUID = Field(..., description="Alliance ID")
    start_upload_id: UUID | None = Field(None, description="Start CSV upload ID (None for first period)")
    end_upload_id: UUID = Field(..., description="End CSV upload ID")


class Period(PeriodBase):
    """Period model with all fields"""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    season_id: UUID
    alliance_id: UUID
    start_upload_id: UUID | None
    end_upload_id: UUID
    created_at: datetime


class PeriodWithUploads(Period):
    """Period with upload details for display"""

    start_snapshot_date: datetime | None = Field(None, description="Start upload snapshot date")
    end_snapshot_date: datetime = Field(..., description="End upload snapshot date")
