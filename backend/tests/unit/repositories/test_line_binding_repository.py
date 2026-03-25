"""Tests for LineBindingRepository input sanitization."""

from src.repositories.line_binding_repository import LineBindingRepository


class TestSanitizeSearchQuery:
    """Test that _sanitize_search_query prevents PostgREST filter injection."""

    def test_comma_is_stripped(self):
        """Commas are PostgREST filter separators and must be removed."""
        malicious = "test%,line_user_id.eq.hacker"
        result = LineBindingRepository._sanitize_search_query(malicious)
        assert "," not in result

    def test_operator_patterns_are_stripped(self):
        """PostgREST operator patterns like .eq. .ilike. must be removed."""
        assert ".eq." not in LineBindingRepository._sanitize_search_query("test.eq.something")
        assert ".ilike." not in LineBindingRepository._sanitize_search_query("a.ilike.b")
        assert ".or." not in LineBindingRepository._sanitize_search_query("x.or.y")
        assert ".and." not in LineBindingRepository._sanitize_search_query("x.and.y")
        assert ".in." not in LineBindingRepository._sanitize_search_query("x.in.(1,2)")

    def test_combined_injection_attempt(self):
        """Combined comma + operator injection should be fully sanitized."""
        malicious = "test%,line_user_id.eq.hacker,admin.or.true"
        result = LineBindingRepository._sanitize_search_query(malicious)
        assert "," not in result
        assert ".eq." not in result
        assert ".or." not in result

    def test_normal_chinese_query_passes_through(self):
        """Normal Chinese search terms should not be modified."""
        assert LineBindingRepository._sanitize_search_query("玩家名稱") == "玩家名稱"

    def test_normal_alphanumeric_query_passes_through(self):
        """Normal alphanumeric search terms should not be modified."""
        assert LineBindingRepository._sanitize_search_query("player123") == "player123"

    def test_empty_string(self):
        assert LineBindingRepository._sanitize_search_query("") == ""

    def test_percent_signs_preserved(self):
        """Percent signs in normal queries should be preserved (used in LIKE patterns)."""
        assert LineBindingRepository._sanitize_search_query("test%name") == "test%name"
