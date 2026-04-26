"""
Copper Mine Pydantic Models

Models for copper mine management (LIFF + Dashboard).

符合 CLAUDE.md 🔴:
- Pydantic V2 syntax (ConfigDict, from_attributes)
- Type hints for all fields
"""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

# =============================================================================
# Type Aliases
# =============================================================================

AllowedLevel = Literal["nine", "ten", "both"]

# =============================================================================
# Copper Mine Entity Models
# =============================================================================


class CopperMine(BaseModel):
    """Copper mine entity (unified for LIFF and Dashboard)"""

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
    # New fields for Dashboard integration
    season_id: UUID | None = None
    member_id: UUID | None = None
    # Tier tracking for flexible rule system
    claimed_tier: int | None = None
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
    claimed_tier: int | None = Field(None, alias="claimedTier", ge=1, le=10)

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
    claimed_tier: int | None = None


class CopperMineListResponse(BaseModel):
    """Response for copper mine list query"""

    mines: list[CopperMineResponse] = Field(default_factory=list)
    total: int = 0
    mine_counts_by_game_id: dict[str, int] = Field(default_factory=dict)  # {game_id: count}
    # Latest total_merit per owned game_id; lets the LIFF tier picker gray out
    # tiers the user can't yet meet without a round-trip to the server.
    merit_by_game_id: dict[str, int] = Field(default_factory=dict)
    max_allowed: int = 0
    has_source_data: bool = False
    current_game_season_tag: str | None = None
    available_counties: list[str] = Field(default_factory=list)


class RegisterCopperResponse(BaseModel):
    """Response after registering copper mine"""

    success: bool
    mine: CopperMineResponse | None = None
    message: str | None = None


# =============================================================================
# Dashboard Response Models (with joined member data)
# =============================================================================


class CopperMineOwnershipResponse(BaseModel):
    """Copper mine ownership for Dashboard display (with member info)"""

    id: str
    season_id: str
    member_id: str | None
    coord_x: int
    coord_y: int
    level: int
    applied_at: datetime
    created_at: datetime
    # P1 修復: 添加註冊來源欄位
    registered_via: Literal["liff", "dashboard"] = "dashboard"
    # Joined fields
    member_name: str
    member_group: str | None = None
    line_display_name: str | None = None


class CopperMineOwnershipListResponse(BaseModel):
    """Response for ownership list query"""

    ownerships: list[CopperMineOwnershipResponse] = []
    total: int = 0


# =============================================================================
# Copper Mine Rules Models
# =============================================================================


class CopperMineRule(BaseModel):
    """Copper mine rule entity"""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    alliance_id: UUID
    tier: int
    required_merit: int
    allowed_level: AllowedLevel
    created_at: datetime
    updated_at: datetime


class CopperMineRuleCreate(BaseModel):
    """Request to create a copper mine rule"""

    tier: int = Field(..., ge=1, le=10)
    required_merit: int = Field(..., gt=0)
    allowed_level: AllowedLevel = "both"


class CopperMineRuleUpdate(BaseModel):
    """Request to update a copper mine rule"""

    required_merit: int | None = Field(None, gt=0)
    allowed_level: AllowedLevel | None = None


class CopperMineRuleResponse(BaseModel):
    """Copper mine rule response"""

    id: str
    alliance_id: str
    tier: int
    required_merit: int
    allowed_level: AllowedLevel
    created_at: datetime
    updated_at: datetime


# =============================================================================
# Dashboard Request Models
# =============================================================================


class CopperMineOwnershipCreate(BaseModel):
    """Request to create a copper mine ownership (from Dashboard)"""

    member_id: str = Field(..., description="Member UUID")
    coord_x: int = Field(..., ge=0)
    coord_y: int = Field(..., ge=0)
    level: int = Field(..., ge=9, le=10)
    applied_at: datetime | None = None


class CopperMineOwnershipUpdate(BaseModel):
    """Request to update a copper mine ownership (for transferring reserved mines)"""

    member_id: str = Field(..., description="Member UUID to transfer to")
