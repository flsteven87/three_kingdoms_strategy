"""
Alliance Collaborator Pydantic models

符合 CLAUDE.md:
- 🟡 snake_case for ALL API fields
- 🟢 Google-style docstrings
- 🟢 Type hints
"""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


class AllianceCollaboratorBase(BaseModel):
    """Alliance collaborator base model"""

    role: str = Field(default="member", description="Collaborator role (owner/member)")


class AllianceCollaboratorCreate(BaseModel):
    """
    Create alliance collaborator request (by email).

    Client provides email address, backend resolves to user_id.
    """

    email: EmailStr = Field(..., description="Email of user to add as collaborator")
    role: str = Field(default="member", description="Role to assign")


class AllianceCollaboratorDB(BaseModel):
    """Alliance collaborator database model"""

    id: UUID
    alliance_id: UUID
    user_id: UUID
    role: str
    invited_by: UUID | None
    invited_at: datetime
    joined_at: datetime
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class AllianceCollaboratorResponse(BaseModel):
    """Alliance collaborator API response"""

    id: UUID
    alliance_id: UUID
    user_id: UUID
    role: str
    invited_by: UUID | None
    joined_at: datetime
    created_at: datetime

    # User info (from JOIN with auth.users)
    user_email: str | None = None
    user_name: str | None = None


class AllianceCollaboratorListResponse(BaseModel):
    """List of alliance collaborators response"""

    collaborators: list[AllianceCollaboratorResponse]
    total: int
