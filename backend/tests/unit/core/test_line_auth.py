"""
Unit Tests for LINE Authentication Utilities

Covers:
- verify_line_signature(): valid HMAC-SHA256, wrong secret, tampered body,
  empty body, empty signature
- verify_liff_id_token(): LINE verify endpoint success and failure paths
- create_liff_url(): URL structure, liff_id and group_id embedded correctly
- create_event_report_liff_url(): URL structure, all three parameters present
- LineGroupInfo: attribute storage, None values
"""

import base64
import hashlib
import hmac as hmac_module
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import httpx
import pytest
from fastapi import HTTPException

from src.core.line_auth import (
    LineGroupInfo,
    create_event_report_liff_url,
    create_liff_url,
    verify_liff_id_token,
    verify_line_signature,
)

# =============================================================================
# Helpers
# =============================================================================


def _compute_signature(body: bytes, secret: str) -> str:
    """Compute a valid LINE HMAC-SHA256 Base64 signature."""
    digest = hmac_module.new(secret.encode("utf-8"), body, hashlib.sha256).digest()
    return base64.b64encode(digest).decode("utf-8")


# =============================================================================
# TestVerifyLineSignature
# =============================================================================


class TestVerifyLineSignature:
    """Tests for verify_line_signature()."""

    def test_valid_signature_returns_true(self):
        """Should return True when the signature matches the body and secret."""
        body = b'{"events": []}'
        secret = "my-channel-secret"
        signature = _compute_signature(body, secret)

        assert verify_line_signature(body, signature, secret) is True


class TestVerifyLiffIdToken:
    """Tests for verify_liff_id_token()."""

    @pytest.mark.asyncio
    async def test_returns_payload_when_line_accepts_token(self):
        settings = SimpleNamespace(line_channel_id="2001234567")
        response = httpx.Response(
            200,
            json={"sub": "U123456", "aud": "2001234567"},
            request=httpx.Request("POST", "https://api.line.me/oauth2/v2.1/verify"),
        )

        with patch("src.core.line_auth.httpx.AsyncClient.post", new=AsyncMock(return_value=response)):
            payload = await verify_liff_id_token("token", "U123456", settings)

        assert payload["sub"] == "U123456"

    @pytest.mark.asyncio
    async def test_raises_when_subject_mismatches_expected_user(self):
        settings = SimpleNamespace(line_channel_id="2001234567")
        response = httpx.Response(
            200,
            json={"sub": "Uother", "aud": "2001234567"},
            request=httpx.Request("POST", "https://api.line.me/oauth2/v2.1/verify"),
        )

        with patch("src.core.line_auth.httpx.AsyncClient.post", new=AsyncMock(return_value=response)):
            with pytest.raises(HTTPException) as exc_info:
                await verify_liff_id_token("token", "U123456", settings)

        assert exc_info.value.status_code == 403

    @pytest.mark.asyncio
    async def test_raises_when_line_rejects_token(self):
        settings = SimpleNamespace(line_channel_id="2001234567")
        response = httpx.Response(
            400,
            json={"error": "invalid id_token"},
            request=httpx.Request("POST", "https://api.line.me/oauth2/v2.1/verify"),
        )

        with patch("src.core.line_auth.httpx.AsyncClient.post", new=AsyncMock(return_value=response)):
            with pytest.raises(HTTPException) as exc_info:
                await verify_liff_id_token("token", "U123456", settings)

        assert exc_info.value.status_code == 401

    def test_wrong_secret_returns_false(self):
        """Should return False when the secret used to verify differs from the signing secret."""
        body = b'{"events": []}'
        correct_secret = "correct-secret"
        wrong_secret = "wrong-secret"
        signature = _compute_signature(body, correct_secret)

        assert verify_line_signature(body, signature, wrong_secret) is False

    def test_tampered_body_returns_false(self):
        """Should return False when the body has been modified after signing."""
        original_body = b'{"events": []}'
        tampered_body = b'{"events": [{"type": "injected"}]}'
        secret = "my-channel-secret"
        signature = _compute_signature(original_body, secret)

        assert verify_line_signature(tampered_body, signature, secret) is False

    def test_empty_body_with_valid_signature(self):
        """Should accept an empty body and validate its correct signature."""
        body = b""
        secret = "my-channel-secret"
        signature = _compute_signature(body, secret)

        assert verify_line_signature(body, signature, secret) is True

    def test_empty_signature_returns_false(self):
        """Should return False for an empty signature string."""
        body = b'{"events": []}'
        secret = "my-channel-secret"

        assert verify_line_signature(body, "", secret) is False

    def test_signature_with_wrong_algorithm_returns_false(self):
        """A signature computed with a different algorithm should fail verification."""
        body = b'{"events": []}'
        secret = "my-channel-secret"
        # Use MD5 instead of SHA256
        bad_digest = hmac_module.new(secret.encode("utf-8"), body, hashlib.md5).digest()
        bad_signature = base64.b64encode(bad_digest).decode("utf-8")

        assert verify_line_signature(body, bad_signature, secret) is False

    def test_binary_body_is_handled(self):
        """Should handle non-UTF-8 binary bodies correctly."""
        body = bytes(range(256))
        secret = "my-channel-secret"
        signature = _compute_signature(body, secret)

        assert verify_line_signature(body, signature, secret) is True

    def test_unicode_secret_is_handled(self):
        """Should work when the channel secret contains non-ASCII characters."""
        body = b'{"events": []}'
        secret = "密鑰secret"
        signature = _compute_signature(body, secret)

        assert verify_line_signature(body, signature, secret) is True


# =============================================================================
# TestCreateLiffUrl
# =============================================================================


class TestCreateLiffUrl:
    """Tests for create_liff_url()."""

    def test_returns_correct_url_structure(self):
        """Should return a URL starting with the LIFF base domain."""
        result = create_liff_url(liff_id="1234567890-abcdefgh", group_id="C9876543210")

        assert result.startswith("https://liff.line.me/")

    def test_liff_id_is_embedded_in_url(self):
        """Should include the liff_id in the URL path."""
        result = create_liff_url(liff_id="1234567890-abcdefgh", group_id="C9876543210")

        assert "1234567890-abcdefgh" in result

    def test_group_id_is_query_param(self):
        """Should pass the group_id as the 'g' query parameter."""
        result = create_liff_url(liff_id="liff-id", group_id="Cgroup123")

        assert "g=Cgroup123" in result

    def test_exact_url_format(self):
        """Should produce the exact expected URL."""
        result = create_liff_url(liff_id="9876543210-xxxxxxxx", group_id="Cabc123")

        assert result == "https://liff.line.me/9876543210-xxxxxxxx?g=Cabc123"

    def test_different_liff_ids_produce_different_urls(self):
        """Different liff_ids should produce distinct URLs."""
        url_a = create_liff_url("liff-a", "group-1")
        url_b = create_liff_url("liff-b", "group-1")

        assert url_a != url_b

    def test_different_group_ids_produce_different_urls(self):
        """Different group_ids should produce distinct URLs."""
        url_a = create_liff_url("liff-1", "group-a")
        url_b = create_liff_url("liff-1", "group-b")

        assert url_a != url_b


# =============================================================================
# TestCreateEventReportLiffUrl
# =============================================================================


class TestCreateEventReportLiffUrl:
    """Tests for create_event_report_liff_url()."""

    def test_returns_correct_url_structure(self):
        """Should return a URL starting with the LIFF base domain."""
        result = create_event_report_liff_url(
            liff_id="liff-id", group_id="Cgroup123", event_id="event-uuid"
        )

        assert result.startswith("https://liff.line.me/")

    def test_liff_id_embedded_in_url(self):
        """Should include the liff_id in the URL path."""
        result = create_event_report_liff_url("liff-abc", "Cg1", "ev1")

        assert "liff-abc" in result

    def test_group_id_query_param(self):
        """Should include the group_id as the 'g' query parameter."""
        result = create_event_report_liff_url("liff-abc", "Cg1", "ev1")

        assert "g=Cg1" in result

    def test_event_id_query_param(self):
        """Should include the event_id as the 'e' query parameter."""
        result = create_event_report_liff_url("liff-abc", "Cg1", "event-uuid-456")

        assert "e=event-uuid-456" in result

    def test_exact_url_format(self):
        """Should produce the exact expected URL."""
        result = create_event_report_liff_url(
            liff_id="1111-2222",
            group_id="Cgroup",
            event_id="evtid",
        )

        assert result == "https://liff.line.me/1111-2222?g=Cgroup&e=evtid"

    def test_different_event_ids_produce_different_urls(self):
        """Different event IDs should produce distinct report URLs."""
        url_a = create_event_report_liff_url("liff-1", "grp", "event-a")
        url_b = create_event_report_liff_url("liff-1", "grp", "event-b")

        assert url_a != url_b

    def test_group_and_event_params_both_present(self):
        """Both 'g' and 'e' query parameters must appear in the URL."""
        result = create_event_report_liff_url("liff-x", "Cg99", "ev99")

        assert "g=" in result
        assert "e=" in result


# =============================================================================
# TestLineGroupInfo
# =============================================================================


class TestLineGroupInfo:
    """Tests for LineGroupInfo data holder."""

    def test_stores_name_and_picture_url(self):
        """Should store name and picture_url as provided."""
        info = LineGroupInfo(name="三國同盟", picture_url="https://example.com/pic.jpg")

        assert info.name == "三國同盟"
        assert info.picture_url == "https://example.com/pic.jpg"

    def test_accepts_none_for_name(self):
        """Should allow None for name (group may not expose a name)."""
        info = LineGroupInfo(name=None, picture_url="https://example.com/pic.jpg")

        assert info.name is None

    def test_accepts_none_for_picture_url(self):
        """Should allow None for picture_url (group may not have a picture)."""
        info = LineGroupInfo(name="群組名稱", picture_url=None)

        assert info.picture_url is None

    def test_both_fields_none(self):
        """Should allow both fields to be None simultaneously."""
        info = LineGroupInfo(name=None, picture_url=None)

        assert info.name is None
        assert info.picture_url is None

    def test_name_can_contain_unicode(self):
        """Should handle full-width / CJK characters in group name."""
        info = LineGroupInfo(name="三國志戰略版第一同盟", picture_url=None)

        assert info.name == "三國志戰略版第一同盟"
