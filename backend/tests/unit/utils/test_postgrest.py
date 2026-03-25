"""
Tests for PostgREST filter sanitization utility.

Covers:
- Strips commas (filter separator)
- Strips operator patterns (.eq., .neq., .like., etc.)
- Preserves normal search text
- Handles empty string
"""

from src.utils.postgrest import sanitize_postgrest_filter_input


class TestSanitizePostgrestFilterInput:
    """Tests for PostgREST filter input sanitization."""

    def test_strips_commas(self):
        assert sanitize_postgrest_filter_input("foo,bar") == "foobar"

    def test_strips_eq_operator(self):
        assert sanitize_postgrest_filter_input("name.eq.admin") == "nameadmin"

    def test_strips_ilike_operator(self):
        assert sanitize_postgrest_filter_input("name.ilike.%test%") == "name%test%"

    def test_strips_multiple_operators(self):
        result = sanitize_postgrest_filter_input("a.eq.1,b.neq.2")
        assert result == "a1b2"

    def test_preserves_normal_text(self):
        assert sanitize_postgrest_filter_input("hello world") == "hello world"

    def test_preserves_chinese_text(self):
        assert sanitize_postgrest_filter_input("三國志") == "三國志"

    def test_empty_string(self):
        assert sanitize_postgrest_filter_input("") == ""
