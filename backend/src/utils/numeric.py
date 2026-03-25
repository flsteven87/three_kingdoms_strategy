"""Shared numeric conversion utilities."""

from decimal import Decimal


def db_float(value: Decimal | float | str) -> float:
    """Convert a DB NUMERIC value (str, Decimal, or float) to float safely."""
    return float(Decimal(str(value)))
