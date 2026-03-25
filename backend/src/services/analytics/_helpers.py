"""
Analytics shared helpers.

Pure utility functions used across all analytics services.
"""

from datetime import timedelta
from statistics import stdev
from typing import Literal, TypedDict

from src.models.period import Period
from src.utils.numeric import db_float

ViewMode = Literal["latest", "season"]

UNGROUPED_LABEL = "未分組"

__all__ = [
    "UNGROUPED_LABEL",
    "ViewMode",
    "build_period_label",
    "compute_box_plot_stats",
    "db_float",
    "percentile",
]


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


class BoxPlotStats(TypedDict):
    min: float
    q1: float
    median: float
    q3: float
    max: float
    cv: float


def compute_box_plot_stats(values: list[float]) -> BoxPlotStats:
    """Compute box plot statistics (min, q1, median, q3, max, cv) from values.

    Handles empty lists and single-element lists safely.
    """
    if not values:
        return {"min": 0, "q1": 0, "median": 0, "q3": 0, "max": 0, "cv": 0}

    sorted_vals = sorted(values)
    count = len(values)
    avg = sum(values) / count
    std_val = stdev(values) if count > 1 else 0
    cv = std_val / avg if avg > 0 else 0

    return {
        "min": sorted_vals[0],
        "q1": percentile(sorted_vals, 0.25),
        "median": percentile(sorted_vals, 0.5),
        "q3": percentile(sorted_vals, 0.75),
        "max": sorted_vals[-1],
        "cv": cv,
    }


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
