"""Tests for PostgREST filter sanitization (moved to src.utils.postgrest).

These tests verify the same behavior through the canonical utility function.
Comprehensive tests live in tests/unit/utils/test_postgrest.py.
"""

from src.utils.postgrest import sanitize_postgrest_filter_input


class TestSanitizeSearchQuery:
    """Test that sanitize_postgrest_filter_input prevents PostgREST filter injection."""

    def test_comma_is_stripped(self):
        """Commas are PostgREST filter separators and must be removed."""
        malicious = "test%,line_user_id.eq.hacker"
        result = sanitize_postgrest_filter_input(malicious)
        assert "," not in result

    def test_operator_patterns_are_stripped(self):
        """PostgREST operator patterns like .eq. .ilike. must be removed."""
        assert ".eq." not in sanitize_postgrest_filter_input("test.eq.something")
        assert ".ilike." not in sanitize_postgrest_filter_input("a.ilike.b")
        assert ".or." not in sanitize_postgrest_filter_input("x.or.y")
        assert ".and." not in sanitize_postgrest_filter_input("x.and.y")
        assert ".in." not in sanitize_postgrest_filter_input("x.in.(1,2)")

    def test_combined_injection_attempt(self):
        """Combined comma + operator injection should be fully sanitized."""
        malicious = "test%,line_user_id.eq.hacker,admin.or.true"
        result = sanitize_postgrest_filter_input(malicious)
        assert "," not in result
        assert ".eq." not in result
        assert ".or." not in result

    def test_normal_chinese_query_passes_through(self):
        """Normal Chinese search terms should not be modified."""
        assert sanitize_postgrest_filter_input("玩家名稱") == "玩家名稱"

    def test_normal_alphanumeric_query_passes_through(self):
        """Normal alphanumeric search terms should not be modified."""
        assert sanitize_postgrest_filter_input("player123") == "player123"

    def test_empty_string(self):
        assert sanitize_postgrest_filter_input("") == ""

    def test_percent_signs_preserved(self):
        """Percent signs in normal queries should be preserved (used in LIKE patterns)."""
        assert sanitize_postgrest_filter_input("test%name") == "test%name"
