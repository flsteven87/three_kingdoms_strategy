"""
User authentication models.

Pydantic models for JWT validation and user session management.
"""

from datetime import UTC, datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


class TokenClaims(BaseModel):
    """
    JWT token claims from Supabase.

    Parsed from JWT token payload.
    """

    sub: UUID = Field(..., description="User ID (subject)")
    email: EmailStr | None = Field(None, description="User email")
    aud: str | None = Field(None, description="Audience")
    exp: int = Field(..., description="Expiration timestamp")
    iat: int = Field(..., description="Issued at timestamp")
    iss: str | None = Field(None, description="Issuer")
    session_id: str | None = Field(None, alias="session_id", description="Session ID")
    role: str | None = Field(None, description="User role")

    @property
    def expires_at(self) -> datetime:
        """Get expiration datetime (UTC-aware)."""
        return datetime.fromtimestamp(self.exp, tz=UTC)

    @property
    def issued_at(self) -> datetime:
        """Get issued at datetime (UTC-aware)."""
        return datetime.fromtimestamp(self.iat, tz=UTC)

    @property
    def is_expired(self) -> bool:
        """Check if token is expired (UTC-aware comparison)."""
        return datetime.now(UTC) > self.expires_at

    def to_authenticated_user(self) -> "AuthenticatedUser":
        """Convert token claims to authenticated user."""
        return AuthenticatedUser(
            id=self.sub,
            email=self.email,
            role=self.role,
        )


class AuthenticatedUser(BaseModel):
    """
    Authenticated user model.

    Minimal user information extracted from JWT token.
    """

    id: UUID = Field(..., description="User ID")
    email: EmailStr | None = Field(None, description="User email")
    role: str | None = Field(None, description="User role")


class UserSession(BaseModel):
    """
    User session with token information.

    Extended model including token metadata.
    """

    user: AuthenticatedUser = Field(..., description="Authenticated user")
    access_token: str = Field(..., description="JWT access token")
    expires_at: datetime = Field(..., description="Token expiration time")
    issued_at: datetime = Field(..., description="Token issued time")
    session_id: str | None = Field(None, description="Session ID")
