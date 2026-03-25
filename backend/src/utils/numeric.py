"""Shared numeric conversion utilities."""

from decimal import Decimal


def db_float(value: Decimal | float | str) -> float:
    """Convert a DB NUMERIC value (str, Decimal, or float) to float safely."""
    return float(Decimal(str(value)))


def db_decimal(value: Decimal | float | str | None) -> Decimal:
    """Convert a DB NUMERIC value to Decimal safely. None returns Decimal('0')."""
    if value is None:
        return Decimal("0")
    return Decimal(str(value))
