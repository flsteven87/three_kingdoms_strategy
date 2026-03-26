from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class ContactFormCreate(BaseModel):
    email: EmailStr
    category: str = Field(..., pattern="^(bug|feature|payment|other)$")
    message: str = Field(..., min_length=10, max_length=2000)


class ContactForm(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: str
    category: str
    message: str
    created_at: datetime


class ContactFormResponse(BaseModel):
    success: bool = True
