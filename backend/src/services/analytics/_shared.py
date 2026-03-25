"""
Shared analytics calculations.

Mixin class providing alliance-wide averages, empty structures,
and season-day computation used by Member, Group, and Alliance services.
"""

import asyncio
from datetime import date
from statistics import median as calc_median
from uuid import UUID

from src.models.period import Period
from src.repositories.member_period_metrics_repository import MemberPeriodMetricsRepository
from src.repositories.period_repository import PeriodRepository
from src.repositories.season_repository import SeasonRepository

from ._helpers import build_period_label


class SharedAnalyticsMixin:
    """Mixin providing shared analytics calculations.

    Subclasses inherit __init__ which creates default repository instances.
    Pass explicit repos for testing.
    """

    def __init__(
        self,
        *,
        metrics_repo: MemberPeriodMetricsRepository | None = None,
        period_repo: PeriodRepository | None = None,
        season_repo: SeasonRepository | None = None,
    ) -> None:
        self._metrics_repo = metrics_repo or MemberPeriodMetricsRepository()
        self._period_repo = period_repo or PeriodRepository()
        self._season_repo = season_repo or SeasonRepository()

    @staticmethod
    def _compute_season_days(season_start: date, latest_period_end: date) -> int:
        """Calculate season days with floor of 1 to prevent division by zero."""
        return max(1, (latest_period_end - season_start).days)

    def _empty_alliance_averages(self) -> dict:
        """Return empty alliance averages structure."""
        return {
            "member_count": 0,
            "avg_daily_contribution": 0,
            "avg_daily_merit": 0,
            "avg_daily_assist": 0,
            "avg_daily_donation": 0,
            "avg_power": 0,
            "median_daily_contribution": 0,
            "median_daily_merit": 0,
            "median_daily_assist": 0,
            "median_daily_donation": 0,
            "median_power": 0,
        }

    async def get_period_alliance_averages(self, period_id: UUID) -> dict:
        """
        Calculate alliance average and median metrics for a specific period.

        Args:
            period_id: Period UUID

        Returns:
            Dict with average and median daily metrics, power, and member count
        """
        metrics = await self._metrics_repo.get_by_period(period_id)

        if not metrics:
            return self._empty_alliance_averages()

        count = len(metrics)

        contributions = [float(m.daily_contribution) for m in metrics]
        merits = [float(m.daily_merit) for m in metrics]
        assists = [float(m.daily_assist) for m in metrics]
        donations = [float(m.daily_donation) for m in metrics]
        powers = [float(m.end_power) for m in metrics]

        return {
            "member_count": count,
            "avg_daily_contribution": round(sum(contributions) / count, 2),
            "avg_daily_merit": round(sum(merits) / count, 2),
            "avg_daily_assist": round(sum(assists) / count, 2),
            "avg_daily_donation": round(sum(donations) / count, 2),
            "avg_power": round(sum(powers) / count, 2),
            "median_daily_contribution": round(calc_median(contributions), 2),
            "median_daily_merit": round(calc_median(merits), 2),
            "median_daily_assist": round(calc_median(assists), 2),
            "median_daily_donation": round(calc_median(donations), 2),
            "median_power": round(calc_median(powers), 2),
        }

    async def get_season_alliance_averages(
        self, season_id: UUID, *, periods: list[Period] | None = None
    ) -> dict:
        """
        Calculate alliance average and median metrics for season-to-date.

        Uses snapshot totals / season_days for accurate season daily averages.
        Pass ``periods`` to avoid re-fetching if the caller already has them.
        """
        if periods is None:
            season, periods = await asyncio.gather(
                self._season_repo.get_by_id(season_id),
                self._period_repo.get_by_season(season_id),
            )
        else:
            season = await self._season_repo.get_by_id(season_id)

        if not season or not periods:
            return self._empty_alliance_averages()

        latest_period = periods[-1]
        season_days = self._compute_season_days(season.start_date, latest_period.end_date)

        metrics_with_totals = await self._metrics_repo.get_metrics_with_snapshot_totals(
            latest_period.id
        )

        if not metrics_with_totals:
            return self._empty_alliance_averages()

        contributions = []
        merits = []
        assists = []
        donations = []
        powers = []

        for m in metrics_with_totals:
            contributions.append(m["total_contribution"] / season_days)
            merits.append(m["total_merit"] / season_days)
            assists.append(m["total_assist"] / season_days)
            donations.append(m["total_donation"] / season_days)
            powers.append(float(m["end_power"]))

        count = len(metrics_with_totals)

        return {
            "member_count": count,
            "avg_daily_contribution": round(sum(contributions) / count, 2),
            "avg_daily_merit": round(sum(merits) / count, 2),
            "avg_daily_assist": round(sum(assists) / count, 2),
            "avg_daily_donation": round(sum(donations) / count, 2),
            "avg_power": round(sum(powers) / count, 2),
            "median_daily_contribution": round(calc_median(contributions), 2),
            "median_daily_merit": round(calc_median(merits), 2),
            "median_daily_assist": round(calc_median(assists), 2),
            "median_daily_donation": round(calc_median(donations), 2),
            "median_power": round(calc_median(powers), 2),
        }

    async def get_alliance_trend_averages(self, season_id: UUID) -> list[dict]:
        """
        Get alliance averages for each period in a season.

        Performance: 2 queries regardless of period count (batch fetch).
        """
        periods = await self._period_repo.get_by_season(season_id)

        if not periods:
            return []

        period_ids = [p.id for p in periods]
        averages_map = await self._metrics_repo.get_periods_averages_batch(period_ids)

        empty_avg = self._empty_alliance_averages()

        result = []
        for period in periods:
            avg = averages_map.get(period.id, empty_avg)
            result.append(
                {
                    "period_id": str(period.id),
                    "period_number": period.period_number,
                    "period_label": build_period_label(period),
                    **avg,
                }
            )

        return result
