"""
CSV Upload Pydantic models

符合 CLAUDE.md: snake_case naming, type hints, Google-style docstrings
"""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

# Upload types:
# - 'regular': Data management uploads (daily snapshots, triggers period calculation)
# - 'event': Battle event analysis uploads (can have multiple per day, no period calculation)
UploadType = Literal["regular", "event"]


class CsvUploadBase(BaseModel):
    """Base CSV upload model with common fields"""

    snapshot_date: datetime = Field(..., description="Snapshot datetime parsed from filename")
    file_name: str = Field(..., min_length=1, max_length=255, description="Original filename")
    total_members: int = Field(0, ge=0, description="Total member count in this upload")
    upload_type: UploadType = Field(
        default="regular",
        description="Type of upload: 'regular' for data management, 'event' for battle events",
    )


class CsvUploadCreate(CsvUploadBase):
    """CSV upload creation model"""

    season_id: UUID = Field(..., description="Season ID")
    alliance_id: UUID = Field(..., description="Alliance ID")


class CsvUploadUpdate(BaseModel):
    """CSV upload update model"""

    total_members: int | None = Field(None, ge=0)


class CsvUpload(CsvUploadBase):
    """CSV upload model with all fields"""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    season_id: UUID
    alliance_id: UUID
    uploaded_at: datetime
    created_at: datetime
