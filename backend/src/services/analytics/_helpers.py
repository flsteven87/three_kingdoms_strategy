"""
Analytics shared helpers.

Pure utility functions used across all analytics services.
"""

from datetime import timedelta
from decimal import Decimal
from typing import Literal

from src.models.period import Period

ViewMode = Literal["latest", "season"]

UNGROUPED_LABEL = "未分組"


def db_float(value: Decimal | float | str) -> float:
    """Convert a DB NUMERIC value (str, Decimal, or float) to float safely."""
    return float(Decimal(str(value)))


def percentile(data: list[float], p: float) -> float:
    """
    Calculate percentile using linear interpolation.

    Args:
        data: Sorted list of values
        p: Percentile (0.0 to 1.0)

    Returns:
        Interpolated percentile value
    """
    if not data:
        return 0.0
    k = (len(data) - 1) * p
    f = int(k)
    c = f + 1 if f + 1 < len(data) else f
    return data[f] + (data[c] - data[f]) * (k - f)


def build_period_label(period: Period) -> str:
    """
    Build display label for a period.

    For period_number == 1: shows start_date to end_date
    For period_number > 1: shows (start_date + 1 day) to end_date
    """
    if period.period_number == 1:
        display_start = period.start_date
    else:
        display_start = period.start_date + timedelta(days=1)

    return f"{display_start.strftime('%m/%d')}-{period.end_date.strftime('%m/%d')}"
