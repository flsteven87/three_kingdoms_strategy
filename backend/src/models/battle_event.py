"""
Battle Event Pydantic models

戰役事件：追蹤特定戰役期間的成員表現（攻城戰、守城戰等）

符合 CLAUDE.md: snake_case naming, type hints, Google-style docstrings
"""

from datetime import datetime
from enum import Enum
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class EventStatus(str, Enum):
    """Event processing status"""

    DRAFT = "draft"
    ANALYZING = "analyzing"
    COMPLETED = "completed"


class EventCategory(str, Enum):
    """Event category determines participation logic and report focus"""

    SIEGE = "siege"           # 攻城事件: 貢獻/助攻為主
    FORBIDDEN = "forbidden"   # 禁地事件: 勢力值監控
    BATTLE = "battle"         # 戰役事件: 戰功為主


class BattleEventBase(BaseModel):
    """Base battle event model with common fields"""

    name: str = Field(..., min_length=1, max_length=100, description="Event name")
    event_type: EventCategory = Field(
        default=EventCategory.BATTLE,
        description="Event category determining participation logic"
    )
    description: str | None = Field(None, max_length=500, description="Event description")
    event_start: datetime | None = Field(None, description="Event start timestamp")
    event_end: datetime | None = Field(None, description="Event end timestamp")


class BattleEventCreate(BattleEventBase):
    """Battle event creation model"""

    season_id: UUID = Field(..., description="Season ID")
    alliance_id: UUID = Field(..., description="Alliance ID")
    created_by: UUID | None = Field(None, description="User ID who created this event")


class BattleEventUpdate(BaseModel):
    """Battle event update model - all fields optional"""

    name: str | None = Field(None, min_length=1, max_length=100)
    event_type: EventCategory | None = None
    description: str | None = None
    event_start: datetime | None = None
    event_end: datetime | None = None
    status: EventStatus | None = None
    before_upload_id: UUID | None = None
    after_upload_id: UUID | None = None


class BattleEvent(BattleEventBase):
    """Battle event model with all fields"""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    alliance_id: UUID
    season_id: UUID
    before_upload_id: UUID | None
    after_upload_id: UUID | None
    status: EventStatus
    created_at: datetime
    created_by: UUID | None


class BattleEventListItem(BaseModel):
    """Lightweight event model for list display"""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    event_type: EventCategory
    status: EventStatus
    event_start: datetime | None
    event_end: datetime | None
    created_at: datetime
    # Computed fields (from aggregation)
    participation_rate: float | None = None
    total_merit: int | None = None
    mvp_name: str | None = None
    absent_count: int | None = None
    absent_names: list[str] | None = None
    participant_names: list[str] | None = None
