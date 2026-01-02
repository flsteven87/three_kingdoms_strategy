"""
LINE Authentication Utilities

Handles LINE webhook signature verification and authentication.

符合 CLAUDE.md 🔴:
- Security functions for webhook validation
- Annotated dependency injection pattern
"""

import base64
import hashlib
import hmac
import logging
from typing import Annotated

from fastapi import Depends, Header, HTTPException, Request, status

from src.core.config import Settings, get_settings

logger = logging.getLogger(__name__)


def verify_line_signature(
    body: bytes,
    signature: str,
    channel_secret: str
) -> bool:
    """
    Verify LINE webhook signature using HMAC-SHA256

    Args:
        body: Raw request body bytes
        signature: X-Line-Signature header value
        channel_secret: LINE channel secret

    Returns:
        True if signature is valid, False otherwise
    """
    hash_value = hmac.new(
        channel_secret.encode("utf-8"),
        body,
        hashlib.sha256
    ).digest()

    expected_signature = base64.b64encode(hash_value).decode("utf-8")

    return hmac.compare_digest(signature, expected_signature)


async def verify_webhook_signature(
    request: Request,
    x_line_signature: Annotated[str, Header()],
    settings: Settings = Depends(get_settings)
) -> bytes:
    """
    FastAPI dependency to verify LINE webhook signature

    Args:
        request: FastAPI request
        x_line_signature: LINE signature header
        settings: Application settings

    Returns:
        Request body bytes (for further processing)

    Raises:
        HTTPException 401: If LINE Bot not configured
        HTTPException 400: If signature verification fails
    """
    if not settings.line_bot_enabled:
        logger.error("LINE Bot not configured")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="LINE Bot not configured"
        )

    body = await request.body()

    if not verify_line_signature(
        body=body,
        signature=x_line_signature,
        channel_secret=settings.line_channel_secret  # type: ignore
    ):
        logger.warning("Invalid LINE webhook signature")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid signature"
        )

    return body


# Type alias for dependency injection
WebhookBodyDep = Annotated[bytes, Depends(verify_webhook_signature)]


def get_line_bot_api():
    """
    Get LINE Bot API client (lazy initialization)

    Returns:
        LineBotApi instance or None if not configured

    Note: Import line-bot-sdk only when needed to avoid
    import errors if package not installed
    """
    settings = get_settings()

    if not settings.line_bot_enabled:
        return None

    try:
        from linebot.v3.messaging import (
            ApiClient,
            Configuration,
            MessagingApi,
        )

        configuration = Configuration(
            access_token=settings.line_access_token  # type: ignore
        )
        api_client = ApiClient(configuration)
        return MessagingApi(api_client)
    except ImportError:
        logger.warning("line-bot-sdk not installed")
        return None


def create_liff_url(liff_id: str, group_id: str) -> str:
    """
    Create LIFF URL with group ID parameter

    Args:
        liff_id: LIFF ID
        group_id: LINE group ID

    Returns:
        Full LIFF URL with parameters
    """
    return f"https://liff.line.me/{liff_id}?g={group_id}"
