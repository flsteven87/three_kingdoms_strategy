"""
Unit Tests for Date Helper Functions

Covers format_date_key():
- datetime object — naive, timezone-aware, midnight, end-of-day
- date object — plain date, first-of-month, last-of-year
- Output format is exactly YYYY-MM-DD
- Zero-padding for single-digit month and day
- Edge cases: leap day, year boundary
- TypeError raised for non-date inputs (int, str, None, dict)
"""

from datetime import UTC, date, datetime

import pytest

from src.core.utils.date_helpers import format_date_key

# =============================================================================
# TestFormatDateKey
# =============================================================================


class TestFormatDateKey:
    """Tests for format_date_key()."""

    # --- Happy path: datetime inputs ---

    def test_naive_datetime_formats_correctly(self):
        """Should format a naive datetime to YYYY-MM-DD."""
        dt = datetime(2025, 10, 9, 10, 13, 9)

        assert format_date_key(dt) == "2025-10-09"

    def test_aware_datetime_formats_correctly(self):
        """Should format a timezone-aware datetime to YYYY-MM-DD."""
        dt = datetime(2025, 10, 9, 10, 13, 9, tzinfo=UTC)

        assert format_date_key(dt) == "2025-10-09"

    def test_datetime_midnight(self):
        """Should handle midnight (00:00:00) without date drift."""
        dt = datetime(2025, 1, 1, 0, 0, 0)

        assert format_date_key(dt) == "2025-01-01"

    def test_datetime_end_of_day(self):
        """Should handle end-of-day (23:59:59) without date drift."""
        dt = datetime(2025, 12, 31, 23, 59, 59)

        assert format_date_key(dt) == "2025-12-31"

    # --- Happy path: date inputs ---

    def test_date_object_formats_correctly(self):
        """Should format a plain date object to YYYY-MM-DD."""
        d = date(2025, 10, 9)

        assert format_date_key(d) == "2025-10-09"

    def test_first_of_month(self):
        """Should correctly format the first day of a month."""
        d = date(2025, 6, 1)

        assert format_date_key(d) == "2025-06-01"

    def test_last_day_of_year(self):
        """Should correctly format December 31."""
        d = date(2025, 12, 31)

        assert format_date_key(d) == "2025-12-31"

    # --- Output format assertions ---

    def test_output_is_exactly_ten_characters(self):
        """YYYY-MM-DD is always exactly 10 characters."""
        result = format_date_key(date(2025, 3, 5))

        assert len(result) == 10

    def test_month_is_zero_padded(self):
        """Single-digit months should be zero-padded."""
        result = format_date_key(date(2025, 3, 15))

        assert result[5:7] == "03"

    def test_day_is_zero_padded(self):
        """Single-digit days should be zero-padded."""
        result = format_date_key(date(2025, 11, 5))

        assert result[8:10] == "05"

    def test_format_contains_hyphens_in_correct_positions(self):
        """Output should use hyphens at positions 4 and 7."""
        result = format_date_key(date(2025, 8, 20))

        assert result[4] == "-"
        assert result[7] == "-"

    # --- Edge cases ---

    def test_leap_day(self):
        """Should handle February 29 on a leap year."""
        d = date(2024, 2, 29)

        assert format_date_key(d) == "2024-02-29"

    def test_year_boundary_new_year(self):
        """Should handle January 1 of a new year correctly."""
        d = date(2026, 1, 1)

        assert format_date_key(d) == "2026-01-01"

    def test_datetime_subclass_of_date_is_accepted(self):
        """datetime is a subclass of date; both branches must be handled."""
        dt = datetime(2025, 5, 20, 12, 0, 0)

        # Should not raise and should produce the date portion
        assert format_date_key(dt) == "2025-05-20"

    # --- Error cases ---

    def test_raises_type_error_for_integer(self):
        """Should raise TypeError when passed an integer."""
        with pytest.raises(TypeError):
            format_date_key(20251009)  # type: ignore[arg-type]

    def test_raises_type_error_for_string(self):
        """Should raise TypeError when passed a date string."""
        with pytest.raises(TypeError):
            format_date_key("2025-10-09")  # type: ignore[arg-type]

    def test_raises_type_error_for_none(self):
        """Should raise TypeError when passed None."""
        with pytest.raises(TypeError):
            format_date_key(None)  # type: ignore[arg-type]

    def test_raises_type_error_for_dict(self):
        """Should raise TypeError when passed an arbitrary mapping."""
        with pytest.raises(TypeError):
            format_date_key({"year": 2025, "month": 10, "day": 9})  # type: ignore[arg-type]

    def test_error_message_includes_type_name(self):
        """TypeError message should mention the actual type that was passed."""
        with pytest.raises(TypeError, match="int"):
            format_date_key(42)  # type: ignore[arg-type]
