"""
Alliance Pydantic models

符合 CLAUDE.md: snake_case naming, type hints, Google-style docstrings
"""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


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

    id: UUID
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
