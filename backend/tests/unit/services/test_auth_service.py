"""
Tests for AuthService

Covers:
- Token extraction from Authorization header
- JWT validation (valid, expired, invalid, wrong secret)
- Token caching behavior
- authenticate_user, authenticate_optional, cleanup_cache
"""

import time
from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException
from jose import jwt

from src.services.auth_service import (
    AuthService,
    TokenExpiredError,
    TokenInvalidError,
)

# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def auth_service():
    """Create AuthService with a test JWT secret."""
    service = AuthService()
    service.jwt_secret = "test-secret-key-for-unit-tests"
    service._cache_ttl = 300
    return service


@pytest.fixture
def valid_jwt_payload(user_id):
    """JWT payload that represents a valid, non-expired token."""
    return {
        "sub": str(user_id),
        "email": "test@example.com",
        "exp": int(time.time()) + 3600,
        "iat": int(time.time()),
        "aud": "authenticated",
        "role": "authenticated",
    }


def _encode_token(payload: dict, secret: str) -> str:
    return jwt.encode(payload, secret, algorithm="HS256")


# =============================================================================
# _extract_token
# =============================================================================


class TestExtractToken:
    """Test Authorization header parsing."""

    def test_extracts_bearer_token(self, auth_service):
        token = auth_service._extract_token("Bearer abc123")
        assert token == "abc123"

    def test_raises_on_missing_header(self, auth_service):
        with pytest.raises(TokenInvalidError, match="missing"):
            auth_service._extract_token(None)

    def test_raises_on_invalid_format(self, auth_service):
        with pytest.raises(TokenInvalidError, match="format"):
            auth_service._extract_token("Basic abc123")

    def test_raises_on_empty_token(self, auth_service):
        with pytest.raises(TokenInvalidError, match="Empty"):
            auth_service._extract_token("Bearer ")


# =============================================================================
# _validate_jwt_token
# =============================================================================


class TestValidateJwtToken:
    """Test JWT validation logic."""

    def test_validates_good_token(self, auth_service, valid_jwt_payload):
        token = _encode_token(valid_jwt_payload, auth_service.jwt_secret)
        claims = auth_service._validate_jwt_token(token)
        assert str(claims.sub) == valid_jwt_payload["sub"]
        assert claims.email == valid_jwt_payload["email"]

    def test_caches_validated_token(self, auth_service, valid_jwt_payload):
        token = _encode_token(valid_jwt_payload, auth_service.jwt_secret)
        auth_service._validate_jwt_token(token)
        assert len(auth_service._token_cache) == 1

        # Second call hits cache
        claims = auth_service._validate_jwt_token(token)
        assert str(claims.sub) == valid_jwt_payload["sub"]

    def test_raises_on_expired_token(self, auth_service, valid_jwt_payload):
        valid_jwt_payload["exp"] = int(time.time()) - 3600
        token = _encode_token(valid_jwt_payload, auth_service.jwt_secret)

        with pytest.raises((TokenExpiredError, TokenInvalidError)):
            auth_service._validate_jwt_token(token)

    def test_raises_on_wrong_secret(self, auth_service, valid_jwt_payload):
        token = _encode_token(valid_jwt_payload, "wrong-secret")

        with pytest.raises(TokenInvalidError):
            auth_service._validate_jwt_token(token)

    def test_raises_on_missing_sub(self, auth_service):
        payload = {"exp": int(time.time()) + 3600, "iat": int(time.time())}
        token = _encode_token(payload, auth_service.jwt_secret)

        with pytest.raises(TokenInvalidError, match="subject"):
            auth_service._validate_jwt_token(token)

    def test_raises_on_garbage_token(self, auth_service):
        with pytest.raises(TokenInvalidError):
            auth_service._validate_jwt_token("not.a.real.jwt")


# =============================================================================
# authenticate_user
# =============================================================================


class TestAuthenticateUser:
    """Test public authenticate_user method."""

    def test_returns_authenticated_user(self, auth_service, valid_jwt_payload):
        token = _encode_token(valid_jwt_payload, auth_service.jwt_secret)
        user = auth_service.authenticate_user(f"Bearer {token}")
        assert str(user.id) == valid_jwt_payload["sub"]
        assert user.email == valid_jwt_payload["email"]

    def test_raises_http_401_on_missing_header(self, auth_service):
        with pytest.raises(HTTPException) as exc_info:
            auth_service.authenticate_user(None)
        assert exc_info.value.status_code == 401

    def test_raises_http_401_on_expired_token(self, auth_service, valid_jwt_payload):
        valid_jwt_payload["exp"] = int(time.time()) - 3600
        token = _encode_token(valid_jwt_payload, auth_service.jwt_secret)

        with pytest.raises(HTTPException) as exc_info:
            auth_service.authenticate_user(f"Bearer {token}")
        assert exc_info.value.status_code == 401


# =============================================================================
# authenticate_optional
# =============================================================================


class TestAuthenticateOptional:
    """Test optional authentication."""

    def test_returns_none_when_no_header(self, auth_service):
        result = auth_service.authenticate_optional(None)
        assert result is None

    def test_returns_none_on_invalid_token(self, auth_service):
        result = auth_service.authenticate_optional("Bearer invalid.token.here")
        assert result is None

    def test_returns_user_on_valid_token(self, auth_service, valid_jwt_payload):
        token = _encode_token(valid_jwt_payload, auth_service.jwt_secret)
        result = auth_service.authenticate_optional(f"Bearer {token}")
        assert result is not None
        assert str(result.id) == valid_jwt_payload["sub"]


# =============================================================================
# cleanup_cache
# =============================================================================


class TestCleanupCache:
    """Test cache cleanup."""

    def test_removes_expired_entries(self, auth_service):
        auth_service._token_cache["old_key"] = (MagicMock(), time.time() - 600)
        auth_service._token_cache["fresh_key"] = (MagicMock(), time.time())

        auth_service.cleanup_cache()

        assert "old_key" not in auth_service._token_cache
        assert "fresh_key" in auth_service._token_cache

    def test_no_error_on_empty_cache(self, auth_service):
        auth_service.cleanup_cache()
