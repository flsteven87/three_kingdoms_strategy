"""
Authentication service for JWT token validation and user management.

Provides high-performance JWT validation with caching and proper error handling.
"""

import time
from functools import lru_cache

from fastapi import HTTPException, status
from jose import JWTError, jwt

from src.core.config import settings
from src.models.user import AuthenticatedUser, TokenClaims, UserSession


class AuthenticationError(Exception):
    """Base exception for authentication errors."""

    pass


class TokenExpiredError(AuthenticationError):
    """Token has expired."""

    pass


class TokenInvalidError(AuthenticationError):
    """Token is invalid or malformed."""

    pass


class AuthService:
    """
    High-performance authentication service.

    Features:
    - Local JWT validation without Supabase API calls
    - Token caching for performance
    - Proper error handling and logging
    - Type-safe user models
    """

    def __init__(self):
        """Initialize auth service with configuration."""
        self.jwt_secret = settings.supabase_jwt_secret
        self.jwt_algorithms = ["HS256"]
        self._token_cache: dict[str, tuple[TokenClaims, float]] = {}
        self._cache_ttl = 300  # 5 minutes cache TTL

    def _extract_token(self, authorization: str | None) -> str:
        """
        Extract JWT token from Authorization header.

        Args:
            authorization: Authorization header value

        Returns:
            JWT token string

        Raises:
            TokenInvalidError: If header format is invalid
        """
        if not authorization:
            raise TokenInvalidError("Authorization header missing")

        if not authorization.startswith("Bearer "):
            raise TokenInvalidError("Invalid authorization header format")

        token = authorization[7:]  # Remove "Bearer " prefix
        if not token:
            raise TokenInvalidError("Empty token")

        return token

    def _validate_jwt_token(self, token: str) -> TokenClaims:
        """
        Validate JWT token and extract claims.

        Args:
            token: JWT token string

        Returns:
            Validated token claims

        Raises:
            TokenInvalidError: If token is invalid
            TokenExpiredError: If token is expired
        """
        # Check cache first
        cache_key = token[:50]  # Use first 50 chars as cache key
        if cache_key in self._token_cache:
            cached_claims, cached_at = self._token_cache[cache_key]
            if time.time() - cached_at < self._cache_ttl:
                return cached_claims
            else:
                # Remove expired cache entry
                del self._token_cache[cache_key]

        try:
            # Decode JWT token
            payload = jwt.decode(
                token,
                self.jwt_secret,
                algorithms=self.jwt_algorithms,
                options={"verify_aud": False},  # Supabase doesn't always set aud
            )

            # Validate required claims
            if "sub" not in payload:
                raise TokenInvalidError("Token missing subject claim")

            # Parse claims into structured model
            claims = TokenClaims(**payload)

            # Check expiration
            if claims.is_expired:
                raise TokenExpiredError("Token has expired")

            # Cache valid token
            self._token_cache[cache_key] = (claims, time.time())

            return claims

        except jwt.ExpiredSignatureError as e:
            raise TokenExpiredError("Token signature has expired") from e
        except jwt.InvalidTokenError as e:
            raise TokenInvalidError(f"Invalid token: {str(e)}") from e
        except JWTError as e:
            raise TokenInvalidError(f"JWT decode error: {str(e)}") from e
        except ValueError as e:
            raise TokenInvalidError(f"Token claims validation error: {str(e)}") from e

    def authenticate_user(self, authorization: str | None) -> AuthenticatedUser:
        """
        Authenticate user from Authorization header.

        Args:
            authorization: Authorization header value

        Returns:
            Authenticated user model

        Raises:
            HTTPException: If authentication fails
        """
        try:
            # Extract and validate token
            token = self._extract_token(authorization)
            claims = self._validate_jwt_token(token)

            # Convert to user model
            user = claims.to_authenticated_user()

            return user

        except TokenExpiredError as e:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token expired",
                headers={"WWW-Authenticate": "Bearer"},
            ) from e
        except TokenInvalidError as e:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication credentials",
                headers={"WWW-Authenticate": "Bearer"},
            ) from e
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Could not validate credentials",
                headers={"WWW-Authenticate": "Bearer"},
            ) from e

    def authenticate_user_session(self, authorization: str | None) -> UserSession:
        """
        Authenticate user and return full session information.

        Args:
            authorization: Authorization header value

        Returns:
            User session with token information

        Raises:
            HTTPException: If authentication fails
        """
        try:
            token = self._extract_token(authorization)
            claims = self._validate_jwt_token(token)
            user = claims.to_authenticated_user()

            return UserSession(
                user=user,
                access_token=token,
                expires_at=claims.expires_at,
                issued_at=claims.issued_at,
                session_id=claims.session_id,
            )

        except (TokenExpiredError, TokenInvalidError):
            # Re-raise auth-specific exceptions as HTTP exceptions
            return self.authenticate_user(authorization)  # Will raise HTTPException

    def authenticate_optional(self, authorization: str | None) -> AuthenticatedUser | None:
        """
        Authenticate user optionally (return None if not authenticated).

        Args:
            authorization: Authorization header value

        Returns:
            Authenticated user or None
        """
        if not authorization:
            return None

        try:
            return self.authenticate_user(authorization)
        except HTTPException:
            return None

    def cleanup_cache(self) -> None:
        """Clean up expired cache entries."""
        current_time = time.time()
        expired_keys = [
            key
            for key, (_, cached_at) in self._token_cache.items()
            if current_time - cached_at >= self._cache_ttl
        ]

        for key in expired_keys:
            del self._token_cache[key]


# Global auth service instance
@lru_cache(maxsize=1)
def get_auth_service() -> AuthService:
    """Get singleton auth service instance."""
    return AuthService()
