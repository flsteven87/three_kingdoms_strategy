"""
Unit Tests for get_line_group_member_ids() — LINE API helper.

Tests cover:
1. Single-page response (no pagination)
2. Multi-page pagination (follows `next` token)
3. Returns empty set when bot not configured
4. Returns empty set when LINE API raises an exception
"""

from unittest.mock import MagicMock, patch

import pytest

from src.core.line_auth import get_line_group_member_ids

GROUP_ID = "Cgroup1234"


def _make_members_response(member_ids: list[str], next_token: str | None = None) -> MagicMock:
    """Factory for a MembersIdsResponse-like object."""
    resp = MagicMock()
    resp.member_ids = member_ids
    resp.next = next_token
    return resp


class TestGetLineGroupMemberIds:
    """Tests for get_line_group_member_ids()."""

    @pytest.mark.asyncio
    async def test_single_page_returns_all_ids(self):
        """Should return all member IDs from a single-page response."""
        mock_api = MagicMock()
        mock_api.get_group_members_ids.return_value = _make_members_response(
            ["Uaaa", "Ubbb", "Uccc"]
        )

        with patch("src.core.line_auth.get_line_bot_api", return_value=mock_api):
            result = await get_line_group_member_ids(GROUP_ID)

        assert result == {"Uaaa", "Ubbb", "Uccc"}
        mock_api.get_group_members_ids.assert_called_once_with(GROUP_ID)

    @pytest.mark.asyncio
    async def test_pagination_follows_next_token(self):
        """Should paginate until next is None and return all IDs."""
        mock_api = MagicMock()
        mock_api.get_group_members_ids.side_effect = [
            _make_members_response(["Uaaa", "Ubbb"], next_token="token1"),
            _make_members_response(["Uccc"], next_token=None),
        ]

        with patch("src.core.line_auth.get_line_bot_api", return_value=mock_api):
            result = await get_line_group_member_ids(GROUP_ID)

        assert result == {"Uaaa", "Ubbb", "Uccc"}
        assert mock_api.get_group_members_ids.call_count == 2
        mock_api.get_group_members_ids.assert_any_call(GROUP_ID)
        mock_api.get_group_members_ids.assert_any_call(GROUP_ID, start="token1")

    @pytest.mark.asyncio
    async def test_returns_empty_when_bot_not_configured(self):
        """Should return empty set when LINE Bot API is not available."""
        with patch("src.core.line_auth.get_line_bot_api", return_value=None):
            result = await get_line_group_member_ids(GROUP_ID)

        assert result == set()

    @pytest.mark.asyncio
    async def test_returns_empty_on_api_exception(self):
        """Should return empty set and not raise when LINE API fails."""
        mock_api = MagicMock()
        mock_api.get_group_members_ids.side_effect = Exception("LINE API error")

        with patch("src.core.line_auth.get_line_bot_api", return_value=mock_api):
            result = await get_line_group_member_ids(GROUP_ID)

        assert result == set()
