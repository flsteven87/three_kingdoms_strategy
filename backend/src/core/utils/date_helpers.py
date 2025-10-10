"""
Date Helper Functions

符合 CLAUDE.md 🟢: Pure utility functions for date operations.
These helpers ensure consistent date formatting across the application,
particularly for hegemony score calculations.
"""

from datetime import date, datetime


def format_date_key(dt: datetime | date) -> str:
    """
    Format date/datetime to YYYY-MM-DD string (UTC-aware).

    Used for consistent date key generation in hegemony score calculations.
    Avoids timezone issues by using strftime on date objects, ensuring
    frontend and backend produce identical date keys.

    Args:
        dt: datetime or date object to format

    Returns:
        Date string in YYYY-MM-DD format

    Examples:
        >>> format_date_key(datetime(2025, 10, 9, 10, 13, 9))
        '2025-10-09'

        >>> format_date_key(date(2025, 10, 9))
        '2025-10-09'

    Raises:
        TypeError: If dt is not a datetime or date object
    """
    # datetime is a subclass of date, so we can check both with single isinstance
    if isinstance(dt, (datetime, date)):
        return dt.strftime("%Y-%m-%d")

    raise TypeError(f"Expected datetime or date object, got {type(dt).__name__}")
