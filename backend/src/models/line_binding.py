"""
LINE Binding Pydantic Models

Models for LINE Bot integration feature.

符合 CLAUDE.md 🔴:
- Pydantic V2 syntax (ConfigDict, from_attributes)
- Type hints for all fields
"""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

# =============================================================================
# Binding Code Models
# =============================================================================


class LineBindingCodeCreate(BaseModel):
    """Request to generate a binding code (no fields needed, alliance_id from auth)"""

    pass


class LineBindingCode(BaseModel):
    """Binding code entity"""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    alliance_id: UUID
    code: str
    created_by: UUID
    expires_at: datetime
    used_at: datetime | None = None
    created_at: datetime


class LineBindingCodeResponse(BaseModel):
    """Binding code response for API"""

    code: str
    expires_at: datetime
    created_at: datetime


# =============================================================================
# Group Binding Models
# =============================================================================


class LineGroupBindingCreate(BaseModel):
    """Internal: Create group binding after code validation"""

    alliance_id: UUID
    line_group_id: str = Field(..., max_length=64)
    group_name: str | None = Field(None, max_length=255)
    bound_by_line_user_id: str = Field(..., max_length=64)


class LineGroupBinding(BaseModel):
    """Group binding entity"""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    alliance_id: UUID
    line_group_id: str
    group_name: str | None = None
    bound_by_line_user_id: str
    is_active: bool = True
    bound_at: datetime
    created_at: datetime
    updated_at: datetime


class LineGroupBindingResponse(BaseModel):
    """Group binding response with member count"""

    id: UUID
    alliance_id: UUID
    line_group_id: str
    group_name: str | None
    bound_at: datetime
    is_active: bool
    member_count: int = 0


# =============================================================================
# Member LINE Binding Models
# =============================================================================


class MemberLineBindingCreate(BaseModel):
    """Request to bind LINE user to game ID (from LIFF)"""

    line_group_id: str = Field(..., alias="groupId")
    line_user_id: str = Field(..., alias="userId")
    line_display_name: str = Field(..., alias="displayName")
    game_id: str = Field(..., alias="gameId", min_length=1, max_length=100)

    model_config = ConfigDict(populate_by_name=True)


class MemberLineBinding(BaseModel):
    """Member LINE binding entity"""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    alliance_id: UUID
    member_id: UUID | None = None
    line_user_id: str
    line_display_name: str
    game_id: str
    is_verified: bool = False
    bound_at: datetime
    created_at: datetime
    updated_at: datetime


class RegisteredAccount(BaseModel):
    """Registered account info for LIFF display"""

    game_id: str
    display_name: str | None = None
    created_at: datetime


class MemberInfoResponse(BaseModel):
    """Response for LIFF member info query"""

    has_registered: bool
    registered_ids: list[RegisteredAccount] = []
    alliance_name: str | None = None


class RegisterMemberResponse(BaseModel):
    """Response after registering game ID"""

    has_registered: bool
    registered_ids: list[RegisteredAccount] = []


# =============================================================================
# Binding Status Response (for Web App)
# =============================================================================


class LineBindingStatusResponse(BaseModel):
    """Combined binding status response for Settings page"""

    is_bound: bool
    binding: LineGroupBindingResponse | None = None
    pending_code: LineBindingCodeResponse | None = None


# =============================================================================
# Webhook Models
# =============================================================================


class LineWebhookEvent(BaseModel):
    """LINE webhook event (simplified)"""

    type: str
    reply_token: str | None = Field(None, alias="replyToken")
    source: dict
    message: dict | None = None
    timestamp: int

    model_config = ConfigDict(populate_by_name=True)


class LineWebhookRequest(BaseModel):
    """LINE webhook request body"""

    events: list[LineWebhookEvent]
    destination: str | None = None
