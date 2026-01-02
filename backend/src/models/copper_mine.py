"""
Copper Mine Pydantic Models

Models for LIFF copper mine management feature.

符合 CLAUDE.md 🔴:
- Pydantic V2 syntax (ConfigDict, from_attributes)
- Type hints for all fields
"""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

# =============================================================================
# Copper Mine Entity Models
# =============================================================================


class CopperMine(BaseModel):
    """Copper mine entity"""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    alliance_id: UUID
    registered_by_line_user_id: str
    game_id: str
    coord_x: int
    coord_y: int
    level: int
    status: str = "active"
    notes: str | None = None
    registered_at: datetime
    updated_at: datetime


# =============================================================================
# Request Models (from LIFF)
# =============================================================================


class CopperMineCreate(BaseModel):
    """Request to register a copper mine (from LIFF)"""

    line_group_id: str = Field(..., alias="groupId")
    line_user_id: str = Field(..., alias="userId")
    game_id: str = Field(..., alias="gameId", min_length=1, max_length=100)
    coord_x: int = Field(..., alias="coordX", ge=0)
    coord_y: int = Field(..., alias="coordY", ge=0)
    level: int = Field(..., ge=1, le=10)
    notes: str | None = Field(None, max_length=500)

    model_config = ConfigDict(populate_by_name=True)


# =============================================================================
# Response Models
# =============================================================================


class CopperMineResponse(BaseModel):
    """Copper mine for LIFF display"""

    id: str
    game_id: str
    coord_x: int
    coord_y: int
    level: int
    status: str
    notes: str | None = None
    registered_at: datetime


class CopperMineListResponse(BaseModel):
    """Response for copper mine list query"""

    mines: list[CopperMineResponse] = []
    total: int = 0


class RegisterCopperResponse(BaseModel):
    """Response after registering copper mine"""

    success: bool
    mine: CopperMineResponse | None = None
    message: str | None = None
