"""
Unit Tests for Numeric Utility Functions

Covers db_float():
- Decimal input (happy path)
- String numeric input (DB NUMERIC comes back as str)
- Plain float input
- Integer input
- Negative values
- Zero (int, float, Decimal, string)
- Very large and very small numbers
- Precision preservation via Decimal
- Invalid input raises an exception
"""

from decimal import Decimal

import pytest

from src.utils.numeric import db_float

# =============================================================================
# TestDbFloat
# =============================================================================


class TestDbFloat:
    """Tests for db_float() numeric conversion utility."""

    # --- Happy path ---

    def test_converts_decimal_to_float(self):
        """Should convert a Decimal value to the equivalent float."""
        result = db_float(Decimal("3.14"))

        assert result == pytest.approx(3.14)
        assert isinstance(result, float)

    def test_converts_string_to_float(self):
        """Should convert a numeric string (as returned by PostgreSQL NUMERIC) to float."""
        result = db_float("12345.678")

        assert result == pytest.approx(12345.678)
        assert isinstance(result, float)

    def test_converts_plain_float_to_float(self):
        """Should accept a plain float and return it as float."""
        result = db_float(3.14)

        assert result == pytest.approx(3.14)
        assert isinstance(result, float)

    def test_converts_integer_to_float(self):
        """Should accept an integer value and return it as float."""
        result = db_float(100)

        assert result == 100.0
        assert isinstance(result, float)

    # --- Zero ---

    def test_zero_decimal(self):
        """Decimal zero should convert to 0.0."""
        assert db_float(Decimal("0")) == 0.0

    def test_zero_string(self):
        """String zero should convert to 0.0."""
        assert db_float("0") == 0.0

    def test_zero_float(self):
        """Float zero should convert to 0.0."""
        assert db_float(0.0) == 0.0

    def test_zero_int(self):
        """Integer zero should convert to 0.0."""
        assert db_float(0) == 0.0

    # --- Negative values ---

    def test_negative_decimal(self):
        """Should handle negative Decimal values correctly."""
        result = db_float(Decimal("-99.99"))

        assert result == pytest.approx(-99.99)

    def test_negative_string(self):
        """Should handle negative numeric strings correctly."""
        result = db_float("-1234.5")

        assert result == pytest.approx(-1234.5)

    def test_negative_float(self):
        """Should handle negative float values correctly."""
        result = db_float(-0.001)

        assert result == pytest.approx(-0.001)

    # --- Precision ---

    def test_high_precision_decimal_preserved(self):
        """Decimal-path should preserve more precision than naive float arithmetic."""
        # Decimal("0.1") + Decimal("0.2") == Decimal("0.3") exactly via string round-trip
        value = Decimal("0.1")
        result = db_float(value)

        assert result == pytest.approx(0.1, rel=1e-9)

    def test_large_integer_value(self):
        """Should handle large integer-like values without overflow."""
        result = db_float(Decimal("9999999999"))

        assert result == 9_999_999_999.0

    def test_small_fractional_value(self):
        """Should handle very small fractional Decimal values."""
        result = db_float(Decimal("0.000001"))

        assert result == pytest.approx(1e-6)

    # --- Error cases ---

    def test_invalid_string_raises(self):
        """A non-numeric string should raise InvalidOperation via Decimal constructor."""
        from decimal import InvalidOperation

        with pytest.raises(InvalidOperation):
            db_float("not-a-number")

    def test_empty_string_raises(self):
        """An empty string should raise InvalidOperation via Decimal constructor."""
        from decimal import InvalidOperation

        with pytest.raises(InvalidOperation):
            db_float("")
