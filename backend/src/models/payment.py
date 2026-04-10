"""Payment models for checkout session creation."""

from pydantic import BaseModel, EmailStr


class CreateCheckoutSessionRequest(BaseModel):
    customer_email: EmailStr
    customer_name: str | None = None
    promotion_code: str | None = None
    success_url: str
    cancel_url: str | None = None


class CreateCheckoutSessionResponse(BaseModel):
    checkout_url: str
