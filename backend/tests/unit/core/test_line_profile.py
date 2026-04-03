"""Tests for LINE profile fetching helper."""

from unittest.mock import MagicMock, patch

from src.core.line_auth import get_group_member_display_name


class TestGetGroupMemberDisplayName:
    @patch("src.core.line_auth.get_line_bot_api")
    def test_returns_display_name(self, mock_get_api):
        mock_api = MagicMock()
        mock_profile = MagicMock()
        mock_profile.display_name = "張飛"
        mock_api.get_group_member_profile.return_value = mock_profile
        mock_get_api.return_value = mock_api

        result = get_group_member_display_name("group123", "user456")

        assert result == "張飛"
        mock_api.get_group_member_profile.assert_called_once_with("group123", "user456")

    @patch("src.core.line_auth.get_line_bot_api")
    def test_returns_none_when_api_unavailable(self, mock_get_api):
        mock_get_api.return_value = None

        result = get_group_member_display_name("group123", "user456")

        assert result is None

    @patch("src.core.line_auth.get_line_bot_api")
    def test_returns_none_on_api_error(self, mock_get_api):
        mock_api = MagicMock()
        mock_api.get_group_member_profile.side_effect = Exception("API error")
        mock_get_api.return_value = mock_api

        result = get_group_member_display_name("group123", "user456")

        assert result is None
