"""
Authentication utilities for JWT token verification

符合 CLAUDE.md 🔴:
- Supabase JWT verification
- Extract user_id from token
- FastAPI dependency injection
"""

from typing import Annotated
from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

from src.core.config import settings

# Bearer token scheme
security = HTTPBearer()


def verify_supabase_token(token: str) -> dict:
    """
    Verify Supabase JWT token

    Args:
        token: JWT token string

    Returns:
        Decoded JWT payload

    Raises:
        HTTPException: If token is invalid or expired

    Reference: https://supabase.com/docs/guides/auth/server-side/verifying-jwts
    """
    try:
        # Decode JWT token using Supabase JWT secret
        payload = jwt.decode(
            token,
            settings.supabase_jwt_secret,
            algorithms=["HS256"],
            audience="authenticated",
        )

        return payload

    except JWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        ) from e


def get_current_user_id(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(security)],
) -> UUID:
    """
    Extract user ID from JWT token

    Args:
        credentials: HTTP Bearer credentials from request header

    Returns:
        User UUID from token payload

    Raises:
        HTTPException: If token is invalid or user_id not found

    Usage:
        @app.get("/endpoint")
        async def endpoint(user_id: UUID = Depends(get_current_user_id)):
            pass

    符合 CLAUDE.md 🔴: Provider Pattern for authentication
    """
    token = credentials.credentials

    # Verify token
    payload = verify_supabase_token(token)

    # Extract user ID (Supabase uses 'sub' claim)
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User ID not found in token",
        )

    try:
        return UUID(user_id)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user ID format",
        ) from e


# Optional: Get user with additional metadata
def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(security)],
) -> dict:
    """
    Get full user payload from JWT token

    Args:
        credentials: HTTP Bearer credentials

    Returns:
        Full JWT payload with user metadata

    Usage:
        @app.get("/endpoint")
        async def endpoint(user: dict = Depends(get_current_user)):
            user_id = user["sub"]
            email = user.get("email")
    """
    token = credentials.credentials
    return verify_supabase_token(token)
