"""
Analytics Service

Provides member performance analytics data aggregation and calculations.

Follows CLAUDE.md:
- Service layer orchestrates repositories and business logic
- NO direct database calls (delegates to repositories)
"""

from datetime import timedelta
from uuid import UUID

from src.models.period import Period
from src.repositories.member_period_metrics_repository import MemberPeriodMetricsRepository
from src.repositories.member_repository import MemberRepository
from src.repositories.period_repository import PeriodRepository


def _build_period_label(period: Period) -> str:
    """
    Build display label for a period.

    For period_number == 1: shows start_date to end_date (season start to first snapshot)
    For period_number > 1: shows (start_date + 1 day) to end_date
        because start_date is the previous snapshot date which belongs to prior period

    Args:
        period: Period model instance

    Returns:
        Label string in format "MM/DD-MM/DD"
    """
    if period.period_number == 1:
        display_start = period.start_date
    else:
        # For subsequent periods, start from day after the start snapshot
        display_start = period.start_date + timedelta(days=1)

    return f"{display_start.strftime('%m/%d')}-{period.end_date.strftime('%m/%d')}"


class AnalyticsService:
    """Service for member analytics and performance data"""

    def __init__(self):
        """Initialize analytics service with required repositories"""
        self._member_repo = MemberRepository()
        self._metrics_repo = MemberPeriodMetricsRepository()
        self._period_repo = PeriodRepository()

    async def get_members_for_analytics(
        self, alliance_id: UUID, active_only: bool = True, season_id: UUID | None = None
    ) -> list[dict]:
        """
        Get all members for analytics member selector with latest rank and group.

        Args:
            alliance_id: Alliance UUID
            active_only: Only return active members
            season_id: Season UUID to get latest period metrics from

        Returns:
            List of member dicts with id, name, contribution_rank, and group
        """
        members = await self._member_repo.get_by_alliance(alliance_id, active_only)

        # Build member_id -> metrics map from latest period
        member_metrics_map: dict[UUID, dict] = {}
        if season_id:
            # Get all periods for the season and find the latest one
            periods = await self._period_repo.get_by_season(season_id)
            if periods:
                latest_period = periods[-1]  # Already sorted by period_number
                metrics = await self._metrics_repo.get_by_period(latest_period.id)
                for m in metrics:
                    member_metrics_map[m.member_id] = {
                        "contribution_rank": m.end_rank,
                        "group": m.end_group,
                    }

        return [
            {
                "id": str(m.id),
                "name": m.name,
                "is_active": m.is_active,
                "contribution_rank": member_metrics_map.get(m.id, {}).get("contribution_rank"),
                "group": member_metrics_map.get(m.id, {}).get("group"),
            }
            for m in members
        ]

    async def get_member_trend(
        self, member_id: UUID, season_id: UUID
    ) -> list[dict]:
        """
        Get member's performance trend across all periods in a season.

        Includes alliance averages for each period to enable comparison charts.

        Args:
            member_id: Member UUID
            season_id: Season UUID

        Returns:
            List of period metrics ordered by period_number,
            including alliance_avg_* fields for comparison
        """
        # Get all periods for this season
        periods = await self._period_repo.get_by_season(season_id)
        if not periods:
            return []

        # Build period_id -> period map
        period_map = {p.id: p for p in periods}

        # Get member's metrics
        metrics = await self._metrics_repo.get_by_member(member_id, season_id)
        if not metrics:
            return []

        # Get alliance averages for all periods in one batch query
        period_ids = [m.period_id for m in metrics]
        alliance_averages = await self._metrics_repo.get_periods_averages_batch(period_ids)

        # Build result with period info and alliance averages
        result = []
        for m in metrics:
            period = period_map.get(m.period_id)
            if not period:
                continue

            # Get alliance averages for this period (default to 0 if not found)
            period_avg = alliance_averages.get(m.period_id, {})

            result.append({
                "period_id": str(m.period_id),
                "period_number": period.period_number,
                "period_label": _build_period_label(period),
                "start_date": period.start_date.isoformat(),
                "end_date": period.end_date.isoformat(),
                "days": period.days,
                # Daily averages
                "daily_contribution": float(m.daily_contribution),
                "daily_merit": float(m.daily_merit),
                "daily_assist": float(m.daily_assist),
                "daily_donation": float(m.daily_donation),
                # Diff values
                "contribution_diff": m.contribution_diff,
                "merit_diff": m.merit_diff,
                "assist_diff": m.assist_diff,
                "donation_diff": m.donation_diff,
                "power_diff": m.power_diff,
                # Rank info
                "start_rank": m.start_rank,
                "end_rank": m.end_rank,
                "rank_change": m.rank_change,
                # State info
                "end_power": m.end_power,
                "end_state": m.end_state,
                "end_group": m.end_group,
                "is_new_member": m.is_new_member,
                # Alliance averages for comparison
                "alliance_avg_contribution": period_avg.get("avg_daily_contribution", 0),
                "alliance_avg_merit": period_avg.get("avg_daily_merit", 0),
                "alliance_avg_assist": period_avg.get("avg_daily_assist", 0),
                "alliance_avg_donation": period_avg.get("avg_daily_donation", 0),
                "alliance_avg_power": period_avg.get("avg_power", 0),
                "alliance_member_count": period_avg.get("member_count", 0),
                # Alliance medians for comparison
                "alliance_median_contribution": period_avg.get("median_daily_contribution", 0),
                "alliance_median_merit": period_avg.get("median_daily_merit", 0),
                "alliance_median_assist": period_avg.get("median_daily_assist", 0),
                "alliance_median_donation": period_avg.get("median_daily_donation", 0),
                "alliance_median_power": period_avg.get("median_power", 0),
            })

        # Sort by period_number
        result.sort(key=lambda x: x["period_number"])
        return result

    async def get_period_alliance_averages(self, period_id: UUID) -> dict:
        """
        Calculate alliance average and median metrics for a specific period.

        Args:
            period_id: Period UUID

        Returns:
            Dict with average and median daily metrics and member count
        """
        from statistics import median

        metrics = await self._metrics_repo.get_by_period(period_id)

        if not metrics:
            return {
                "member_count": 0,
                "avg_daily_contribution": 0,
                "avg_daily_merit": 0,
                "avg_daily_assist": 0,
                "avg_daily_donation": 0,
                "median_daily_contribution": 0,
                "median_daily_merit": 0,
                "median_daily_assist": 0,
                "median_daily_donation": 0,
            }

        count = len(metrics)

        # Extract values for calculations
        contributions = [float(m.daily_contribution) for m in metrics]
        merits = [float(m.daily_merit) for m in metrics]
        assists = [float(m.daily_assist) for m in metrics]
        donations = [float(m.daily_donation) for m in metrics]

        return {
            "member_count": count,
            # Averages
            "avg_daily_contribution": round(sum(contributions) / count, 2),
            "avg_daily_merit": round(sum(merits) / count, 2),
            "avg_daily_assist": round(sum(assists) / count, 2),
            "avg_daily_donation": round(sum(donations) / count, 2),
            # Medians
            "median_daily_contribution": round(median(contributions), 2),
            "median_daily_merit": round(median(merits), 2),
            "median_daily_assist": round(median(assists), 2),
            "median_daily_donation": round(median(donations), 2),
        }

    async def get_member_with_comparison(
        self, member_id: UUID, period_id: UUID
    ) -> dict | None:
        """
        Get member metrics for a period with alliance averages and medians for comparison.

        Args:
            member_id: Member UUID
            period_id: Period UUID

        Returns:
            Dict with member metrics, alliance averages, and medians, or None if not found
        """
        from statistics import median

        # Get all metrics for this period
        all_metrics = await self._metrics_repo.get_by_period(period_id)

        if not all_metrics:
            return None

        # Find this member's metrics
        member_metrics = None
        for m in all_metrics:
            if m.member_id == member_id:
                member_metrics = m
                break

        if not member_metrics:
            return None

        # Extract values for calculations
        count = len(all_metrics)
        contributions = [float(m.daily_contribution) for m in all_metrics]
        merits = [float(m.daily_merit) for m in all_metrics]
        assists = [float(m.daily_assist) for m in all_metrics]
        donations = [float(m.daily_donation) for m in all_metrics]

        return {
            "member": {
                "daily_contribution": float(member_metrics.daily_contribution),
                "daily_merit": float(member_metrics.daily_merit),
                "daily_assist": float(member_metrics.daily_assist),
                "daily_donation": float(member_metrics.daily_donation),
                "end_rank": member_metrics.end_rank,
                "rank_change": member_metrics.rank_change,
                "end_power": member_metrics.end_power,
                "power_diff": member_metrics.power_diff,
                "is_new_member": member_metrics.is_new_member,
            },
            "alliance_avg": {
                "daily_contribution": round(sum(contributions) / count, 2),
                "daily_merit": round(sum(merits) / count, 2),
                "daily_assist": round(sum(assists) / count, 2),
                "daily_donation": round(sum(donations) / count, 2),
            },
            "alliance_median": {
                "daily_contribution": round(median(contributions), 2),
                "daily_merit": round(median(merits), 2),
                "daily_assist": round(median(assists), 2),
                "daily_donation": round(median(donations), 2),
            },
            "total_members": count,
        }

    async def get_season_summary(
        self, member_id: UUID, season_id: UUID
    ) -> dict | None:
        """
        Get member's season-to-date summary (aggregated across all periods).

        Args:
            member_id: Member UUID
            season_id: Season UUID

        Returns:
            Dict with season summary metrics
        """
        trend = await self.get_member_trend(member_id, season_id)

        if not trend:
            return None

        # Calculate season totals and averages
        total_days = sum(p["days"] for p in trend)
        total_contribution = sum(p["contribution_diff"] for p in trend)
        total_merit = sum(p["merit_diff"] for p in trend)
        total_assist = sum(p["assist_diff"] for p in trend)
        total_donation = sum(p["donation_diff"] for p in trend)
        total_power_change = sum(p["power_diff"] for p in trend)

        # Get latest period info
        latest = trend[-1]

        # Get first period for comparison
        first = trend[0]

        return {
            "period_count": len(trend),
            "total_days": total_days,
            # Season totals
            "total_contribution": total_contribution,
            "total_merit": total_merit,
            "total_assist": total_assist,
            "total_donation": total_donation,
            "total_power_change": total_power_change,
            # Season daily averages
            "avg_daily_contribution": round(total_contribution / total_days, 2) if total_days > 0 else 0,
            "avg_daily_merit": round(total_merit / total_days, 2) if total_days > 0 else 0,
            "avg_daily_assist": round(total_assist / total_days, 2) if total_days > 0 else 0,
            "avg_daily_donation": round(total_donation / total_days, 2) if total_days > 0 else 0,
            # Rank info
            "current_rank": latest["end_rank"],
            "rank_change_season": (first["start_rank"] - latest["end_rank"]) if first["start_rank"] else None,
            # Power info
            "current_power": latest["end_power"],
            # Group info
            "current_group": latest["end_group"],
            "current_state": latest["end_state"],
        }

    async def get_alliance_trend_averages(
        self, season_id: UUID
    ) -> list[dict]:
        """
        Get alliance averages for each period in a season.

        Args:
            season_id: Season UUID

        Returns:
            List of period averages ordered by period_number
        """
        periods = await self._period_repo.get_by_season(season_id)

        result = []
        for period in periods:
            avg = await self.get_period_alliance_averages(period.id)
            result.append({
                "period_id": str(period.id),
                "period_number": period.period_number,
                "period_label": _build_period_label(period),
                **avg,
            })

        return result

    # =========================================================================
    # Group Analytics Methods
    # =========================================================================

    async def get_groups_list(self, season_id: UUID) -> list[dict]:
        """
        Get list of all groups with member counts for a season.

        Args:
            season_id: Season UUID

        Returns:
            List of groups with name and member_count
        """
        # Get latest period for the season
        periods = await self._period_repo.get_by_season(season_id)
        if not periods:
            return []

        latest_period = periods[-1]
        return await self._metrics_repo.get_all_groups_for_period(latest_period.id)

    async def get_group_analytics(
        self, season_id: UUID, group_name: str
    ) -> dict:
        """
        Get complete group analytics including stats, members, trends, and alliance averages.

        Args:
            season_id: Season UUID
            group_name: Group name to analyze

        Returns:
            Dict with stats, members, trends, and alliance_averages
        """
        from datetime import date as date_type
        from decimal import Decimal

        # Get all periods for the season
        periods = await self._period_repo.get_by_season(season_id)
        if not periods:
            return {
                "stats": self._empty_group_stats(group_name),
                "members": [],
                "trends": [],
                "alliance_averages": self._empty_alliance_averages(),
            }

        latest_period = periods[-1]

        # Get group members for latest period
        group_metrics = await self._metrics_repo.get_metrics_by_group_for_period(
            latest_period.id, group_name
        )

        if not group_metrics:
            return {
                "stats": self._empty_group_stats(group_name),
                "members": [],
                "trends": [],
                "alliance_averages": await self.get_period_alliance_averages(latest_period.id),
            }

        # Build members list
        members = [
            {
                "id": str(m["member_id"]),
                "name": m["member_name"],
                "contribution_rank": m["end_rank"],
                "daily_merit": float(Decimal(str(m["daily_merit"]))),
                "daily_assist": float(Decimal(str(m["daily_assist"]))),
                "daily_donation": float(Decimal(str(m["daily_donation"]))),
                "power": m["end_power"],
                "rank_change": m["rank_change"],
            }
            for m in group_metrics
        ]

        # Calculate group stats
        stats = self._calculate_group_stats(group_name, group_metrics)

        # Get group trends across all periods
        trend_data = await self._metrics_repo.get_group_metrics_by_season(
            season_id, group_name
        )

        # Build period label map
        period_map = {str(p.id): p for p in periods}
        trends = []
        for t in trend_data:
            period = period_map.get(t["period_id"])
            if period:
                # Parse dates if they're strings
                start_date = t["start_date"]
                end_date = t["end_date"]
                if isinstance(start_date, str):
                    start_date = date_type.fromisoformat(start_date)
                if isinstance(end_date, str):
                    end_date = date_type.fromisoformat(end_date)

                trends.append({
                    "period_label": _build_period_label(period),
                    "period_number": t["period_number"],
                    "start_date": start_date.isoformat(),
                    "end_date": end_date.isoformat(),
                    "avg_rank": round(t["avg_rank"], 1),
                    "avg_merit": round(t["avg_merit"], 2),
                    "avg_assist": round(t["avg_assist"], 2),
                    "member_count": t["member_count"],
                })

        # Get alliance averages for comparison
        alliance_averages = await self.get_period_alliance_averages(latest_period.id)

        return {
            "stats": stats,
            "members": members,
            "trends": trends,
            "alliance_averages": alliance_averages,
        }

    async def get_groups_comparison(self, season_id: UUID) -> list[dict]:
        """
        Get comparison data for all groups in a season.

        Args:
            season_id: Season UUID

        Returns:
            List of group comparison items sorted by avg_daily_merit descending
        """
        # Get latest period
        periods = await self._period_repo.get_by_season(season_id)
        if not periods:
            return []

        latest_period = periods[-1]

        # Get group averages using existing method
        group_averages = await self._metrics_repo.get_group_averages(latest_period.id)

        # Get all metrics for rank calculation
        all_metrics = await self._metrics_repo.get_by_period(latest_period.id)

        # Build group -> avg_rank map
        from collections import defaultdict

        group_ranks: dict[str, list[int]] = defaultdict(list)
        for m in all_metrics:
            group = m.end_group or "未分組"
            group_ranks[group].append(m.end_rank)

        # Build comparison list
        result = []
        for g in group_averages:
            group_name = g["group_name"]
            ranks = group_ranks.get(group_name, [])
            avg_rank = sum(ranks) / len(ranks) if ranks else 0

            result.append({
                "name": group_name,
                "avg_daily_merit": round(float(g["avg_daily_merit"]), 2),
                "avg_rank": round(avg_rank, 1),
                "member_count": g["member_count"],
            })

        # Sort by avg_daily_merit descending
        return sorted(result, key=lambda x: x["avg_daily_merit"], reverse=True)

    def _calculate_group_stats(self, group_name: str, metrics: list[dict]) -> dict:
        """
        Calculate group statistics from metrics data.

        Args:
            group_name: Group name
            metrics: List of member metrics for the group

        Returns:
            GroupStats dict
        """
        from decimal import Decimal
        from statistics import stdev

        count = len(metrics)

        # Extract values
        merits = [float(Decimal(str(m["daily_merit"]))) for m in metrics]
        assists = [float(Decimal(str(m["daily_assist"]))) for m in metrics]
        donations = [float(Decimal(str(m["daily_donation"]))) for m in metrics]
        powers = [float(m["end_power"]) for m in metrics]
        ranks = [m["end_rank"] for m in metrics]

        # Calculate averages
        avg_merit = sum(merits) / count
        avg_assist = sum(assists) / count
        avg_donation = sum(donations) / count
        avg_power = sum(powers) / count
        avg_rank = sum(ranks) / count

        # Calculate quartiles for box plot
        sorted_merits = sorted(merits)

        def percentile(data: list[float], p: float) -> float:
            """Calculate percentile using linear interpolation"""
            if not data:
                return 0.0
            k = (len(data) - 1) * p
            f = int(k)
            c = f + 1 if f + 1 < len(data) else f
            return data[f] + (data[c] - data[f]) * (k - f)

        merit_min = sorted_merits[0] if sorted_merits else 0
        merit_q1 = percentile(sorted_merits, 0.25)
        merit_median = percentile(sorted_merits, 0.5)
        merit_q3 = percentile(sorted_merits, 0.75)
        merit_max = sorted_merits[-1] if sorted_merits else 0

        # Coefficient of variation
        merit_std = stdev(merits) if len(merits) > 1 else 0
        merit_cv = merit_std / avg_merit if avg_merit > 0 else 0

        return {
            "group_name": group_name,
            "member_count": count,
            "avg_daily_merit": round(avg_merit, 2),
            "avg_daily_assist": round(avg_assist, 2),
            "avg_daily_donation": round(avg_donation, 2),
            "avg_power": round(avg_power, 2),
            "avg_rank": round(avg_rank, 1),
            "best_rank": min(ranks),
            "worst_rank": max(ranks),
            "merit_min": round(merit_min, 2),
            "merit_q1": round(merit_q1, 2),
            "merit_median": round(merit_median, 2),
            "merit_q3": round(merit_q3, 2),
            "merit_max": round(merit_max, 2),
            "merit_cv": round(merit_cv, 3),
        }

    def _empty_group_stats(self, group_name: str) -> dict:
        """Return empty group stats structure"""
        return {
            "group_name": group_name,
            "member_count": 0,
            "avg_daily_merit": 0,
            "avg_daily_assist": 0,
            "avg_daily_donation": 0,
            "avg_power": 0,
            "avg_rank": 0,
            "best_rank": 0,
            "worst_rank": 0,
            "merit_min": 0,
            "merit_q1": 0,
            "merit_median": 0,
            "merit_q3": 0,
            "merit_max": 0,
            "merit_cv": 0,
        }

    def _empty_alliance_averages(self) -> dict:
        """Return empty alliance averages structure"""
        return {
            "member_count": 0,
            "avg_daily_contribution": 0,
            "avg_daily_merit": 0,
            "avg_daily_assist": 0,
            "avg_daily_donation": 0,
            "median_daily_contribution": 0,
            "median_daily_merit": 0,
            "median_daily_assist": 0,
            "median_daily_donation": 0,
        }
