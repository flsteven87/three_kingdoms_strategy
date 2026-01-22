"""
Analytics Service

Provides member performance analytics data aggregation and calculations.

Follows CLAUDE.md:
- Service layer orchestrates repositories and business logic
- NO direct database calls (delegates to repositories)
"""

from collections import defaultdict
from datetime import timedelta
from decimal import Decimal
from statistics import median as calc_median
from statistics import stdev
from uuid import UUID

from src.models.period import Period
from src.repositories.member_period_metrics_repository import MemberPeriodMetricsRepository
from src.repositories.member_repository import MemberRepository
from src.repositories.period_repository import PeriodRepository
from src.repositories.season_repository import SeasonRepository


def _percentile(data: list[float], p: float) -> float:
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
        self._season_repo = SeasonRepository()

    async def get_members_for_analytics(
        self, alliance_id: UUID, active_only: bool = True, season_id: UUID | None = None
    ) -> list[dict]:
        """
        Get members for analytics member selector with latest rank and group.

        If season_id is provided, only returns members with data in that season.
        If season_id is not provided, returns all members.

        Args:
            alliance_id: Alliance UUID
            active_only: Only return active members
            season_id: Optional Season UUID to filter members with data in that season

        Returns:
            List of member dicts with id, name, contribution_rank, and group
        """
        # Build member_id -> metrics map from latest period
        member_metrics_map: dict[UUID, dict] = {}
        members_with_data: set[UUID] = set()

        if season_id:
            # Get all periods for the season and find the latest one
            periods = await self._period_repo.get_by_season(season_id)
            if periods:
                latest_period = periods[-1]  # Already sorted by period_number
                metrics = await self._metrics_repo.get_by_period(latest_period.id)
                for m in metrics:
                    members_with_data.add(m.member_id)
                    member_metrics_map[m.member_id] = {
                        "contribution_rank": m.end_rank,
                        "group": m.end_group,
                    }

        # Get all members, then filter to only those with data in this season (if season_id provided)
        all_members = await self._member_repo.get_by_alliance(alliance_id, active_only)

        # If season_id is provided, filter to members with data; otherwise return all
        if season_id:
            return [
                {
                    "id": str(m.id),
                    "name": m.name,
                    "is_active": m.is_active,
                    "contribution_rank": member_metrics_map.get(m.id, {}).get("contribution_rank"),
                    "group": member_metrics_map.get(m.id, {}).get("group"),
                }
                for m in all_members
                if m.id in members_with_data
            ]
        else:
            return [
                {
                    "id": str(m.id),
                    "name": m.name,
                    "is_active": m.is_active,
                    "contribution_rank": None,
                    "group": None,
                }
                for m in all_members
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
            Dict with average and median daily metrics, power, and member count
        """
        metrics = await self._metrics_repo.get_by_period(period_id)

        if not metrics:
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

        count = len(metrics)

        # Extract values for calculations
        contributions = [float(m.daily_contribution) for m in metrics]
        merits = [float(m.daily_merit) for m in metrics]
        assists = [float(m.daily_assist) for m in metrics]
        donations = [float(m.daily_donation) for m in metrics]
        powers = [float(m.end_power) for m in metrics]

        return {
            "member_count": count,
            # Averages
            "avg_daily_contribution": round(sum(contributions) / count, 2),
            "avg_daily_merit": round(sum(merits) / count, 2),
            "avg_daily_assist": round(sum(assists) / count, 2),
            "avg_daily_donation": round(sum(donations) / count, 2),
            "avg_power": round(sum(powers) / count, 2),
            # Medians
            "median_daily_contribution": round(calc_median(contributions), 2),
            "median_daily_merit": round(calc_median(merits), 2),
            "median_daily_assist": round(calc_median(assists), 2),
            "median_daily_donation": round(calc_median(donations), 2),
            "median_power": round(calc_median(powers), 2),
        }

    async def get_season_alliance_averages(self, season_id: UUID) -> dict:
        """
        Calculate alliance average and median metrics for season-to-date.

        Uses snapshot totals / season_days for accurate season daily averages.
        This is more accurate than averaging daily_* values across periods.

        Args:
            season_id: Season UUID

        Returns:
            Dict with average and median daily metrics, power, and member count
        """
        # Get season info for start_date
        season = await self._season_repo.get_by_id(season_id)
        if not season:
            return self._empty_alliance_averages()

        # Get all periods to find latest
        periods = await self._period_repo.get_by_season(season_id)
        if not periods:
            return self._empty_alliance_averages()

        latest_period = periods[-1]

        # Calculate season days
        season_days = (latest_period.end_date - season.start_date).days
        if season_days <= 0:
            season_days = 1

        # Get metrics with snapshot totals for latest period
        metrics_with_totals = await self._metrics_repo.get_metrics_with_snapshot_totals(
            latest_period.id
        )

        if not metrics_with_totals:
            return self._empty_alliance_averages()

        # Calculate season daily averages for each member
        contributions = []
        merits = []
        assists = []
        donations = []
        powers = []

        for m in metrics_with_totals:
            # Season daily = total / season_days
            contributions.append(m["total_contribution"] / season_days)
            merits.append(m["total_merit"] / season_days)
            assists.append(m["total_assist"] / season_days)
            donations.append(m["total_donation"] / season_days)
            powers.append(float(m["end_power"]))

        count = len(metrics_with_totals)

        return {
            "member_count": count,
            # Averages across all members
            "avg_daily_contribution": round(sum(contributions) / count, 2),
            "avg_daily_merit": round(sum(merits) / count, 2),
            "avg_daily_assist": round(sum(assists) / count, 2),
            "avg_daily_donation": round(sum(donations) / count, 2),
            "avg_power": round(sum(powers) / count, 2),
            # Medians
            "median_daily_contribution": round(calc_median(contributions), 2),
            "median_daily_merit": round(calc_median(merits), 2),
            "median_daily_assist": round(calc_median(assists), 2),
            "median_daily_donation": round(calc_median(donations), 2),
            "median_power": round(calc_median(powers), 2),
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
                "daily_contribution": round(calc_median(contributions), 2),
                "daily_merit": round(calc_median(merits), 2),
                "daily_assist": round(calc_median(assists), 2),
                "daily_donation": round(calc_median(donations), 2),
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
            "avg_power": round(sum(p["end_power"] for p in trend) / len(trend), 2) if trend else 0,
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
        self, season_id: UUID, group_name: str, view: str = "latest"
    ) -> dict:
        """
        Get complete group analytics including stats, members, trends, and alliance averages.

        Args:
            season_id: Season UUID
            group_name: Group name to analyze
            view: 'latest' for latest period data, 'season' for season-weighted average

        Returns:
            Dict with stats, members, trends, and alliance_averages
        """
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

        # Get group members for latest period (defines current group membership)
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

        # Get current member IDs and period IDs for trend calculation
        member_ids = [m["member_id"] for m in group_metrics]
        period_ids = [str(p.id) for p in periods]

        # Fetch all metrics for these members across all periods (needed for both views)
        trend_data = await self._metrics_repo.get_members_metrics_for_periods(
            member_ids, period_ids
        )

        # Group by period for trend calculation
        period_groups: dict[str, list[dict]] = defaultdict(list)
        for row in trend_data:
            period_groups[row["period_id"]].append(row)

        # Build period label map
        period_map = {str(p.id): p for p in periods}

        # Build trends (same for both views - shows history)
        trends = []
        for period_id_str, metrics in period_groups.items():
            period = period_map.get(period_id_str)
            if period:
                count = len(metrics)
                ranks = [m["end_rank"] for m in metrics]
                contributions = [float(Decimal(str(m["daily_contribution"]))) for m in metrics]
                merits = [float(Decimal(str(m["daily_merit"]))) for m in metrics]
                assists = [float(Decimal(str(m["daily_assist"]))) for m in metrics]
                donations = [float(Decimal(str(m["daily_donation"]))) for m in metrics]
                powers = [float(m["end_power"]) for m in metrics]

                trends.append({
                    "period_label": _build_period_label(period),
                    "period_number": period.period_number,
                    "start_date": period.start_date.isoformat(),
                    "end_date": period.end_date.isoformat(),
                    "days": period.days,
                    "avg_rank": round(sum(ranks) / count, 1),
                    "avg_contribution": round(sum(contributions) / count, 2),
                    "avg_merit": round(sum(merits) / count, 2),
                    "avg_assist": round(sum(assists) / count, 2),
                    "avg_donation": round(sum(donations) / count, 2),
                    "avg_power": round(sum(powers) / count, 0),
                    "member_count": count,
                })

        trends.sort(key=lambda x: x["period_number"])

        # Get alliance averages for comparison (use season averages for season view)
        if view == "season":
            alliance_averages = await self.get_season_alliance_averages(season_id)
        else:
            alliance_averages = await self.get_period_alliance_averages(latest_period.id)

        if view == "season":
            # Season view: use snapshot totals / season_days for accurate daily averages
            # This is more accurate than averaging daily_* values across periods

            # Get season info for start_date
            season = await self._season_repo.get_by_id(season_id)
            if not season:
                return {
                    "stats": self._empty_group_stats(group_name),
                    "members": [],
                    "trends": trends,
                    "alliance_averages": alliance_averages,
                }

            # Get metrics with snapshot totals for latest period
            metrics_with_totals = await self._metrics_repo.get_metrics_with_snapshot_totals(
                latest_period.id
            )

            # Filter to group members
            group_member_ids = {str(m["member_id"]) for m in group_metrics}
            group_metrics_with_totals = [
                m for m in metrics_with_totals if str(m["member_id"]) in group_member_ids
            ]

            # Calculate season days: from season start to latest snapshot date
            season_days = (latest_period.end_date - season.start_date).days
            if season_days <= 0:
                season_days = 1  # Prevent division by zero

            # Calculate season daily averages using snapshot totals
            members = []
            for m in group_metrics_with_totals:
                member_id = str(m["member_id"])

                # Season daily = total / season_days
                season_daily_contribution = round(m["total_contribution"] / season_days, 2)
                season_daily_merit = round(m["total_merit"] / season_days, 2)
                season_daily_assist = round(m["total_assist"] / season_days, 2)
                season_daily_donation = round(m["total_donation"] / season_days, 2)

                members.append({
                    "id": member_id,
                    "name": m["member_name"],
                    "contribution_rank": m["end_rank"],  # Latest rank
                    "daily_contribution": season_daily_contribution,
                    "daily_merit": season_daily_merit,
                    "daily_assist": season_daily_assist,
                    "daily_donation": season_daily_donation,
                    "power": m["end_power"],  # Power is always latest
                    "rank_change": None,  # Not applicable for season view
                    "contribution_change": None,  # Not applicable for season view
                    "merit_change": None,  # Not applicable for season view
                })

            # Calculate season stats from aggregated member data
            stats = self._calculate_group_stats_from_members(group_name, members)

            return {
                "stats": stats,
                "members": members,
                "trends": trends,
                "alliance_averages": alliance_averages,
            }

        # Default: latest period view
        # Get previous period metrics for change calculation
        # Use current member_ids to find their previous metrics (regardless of their old group)
        prev_metrics_map: dict[str, dict] = {}
        if len(periods) >= 2:
            prev_period = periods[-2]
            current_member_ids = [str(m["member_id"]) for m in group_metrics]
            prev_metrics = await self._metrics_repo.get_members_metrics_for_periods(
                current_member_ids, [str(prev_period.id)]
            )
            for pm in prev_metrics:
                prev_metrics_map[str(pm["member_id"])] = {
                    "daily_contribution": float(Decimal(str(pm["daily_contribution"]))),
                    "daily_merit": float(Decimal(str(pm["daily_merit"]))),
                }

        # Build members list for latest period
        members = []
        for m in group_metrics:
            member_id = str(m["member_id"])
            current_contribution = round(float(Decimal(str(m["daily_contribution"]))), 2)
            current_merit = round(float(Decimal(str(m["daily_merit"]))), 2)
            current_assist = round(float(Decimal(str(m["daily_assist"]))), 2)
            current_donation = round(float(Decimal(str(m["daily_donation"]))), 2)
            prev_data = prev_metrics_map.get(member_id)
            contribution_change = round(current_contribution - prev_data["daily_contribution"], 2) if prev_data else None
            merit_change = round(current_merit - prev_data["daily_merit"], 2) if prev_data else None

            members.append({
                "id": member_id,
                "name": m["member_name"],
                "contribution_rank": m["end_rank"],
                "daily_contribution": current_contribution,
                "daily_merit": current_merit,
                "daily_assist": current_assist,
                "daily_donation": current_donation,
                "power": m["end_power"],
                "rank_change": m["rank_change"],
                "contribution_change": contribution_change,
                "merit_change": merit_change,
            })

        # Calculate group stats from latest period
        stats = self._calculate_group_stats(group_name, group_metrics)

        return {
            "stats": stats,
            "members": members,
            "trends": trends,
            "alliance_averages": alliance_averages,
        }

    async def get_groups_comparison(
        self, season_id: UUID, view: str = "latest"
    ) -> list[dict]:
        """
        Get comparison data for all groups in a season.

        Args:
            season_id: Season UUID
            view: 'latest' for latest period data, 'season' for season-weighted average

        Returns:
            List of group comparison items sorted by avg_daily_merit descending
        """
        periods = await self._period_repo.get_by_season(season_id)
        if not periods:
            return []

        if view == "season":
            # Season view: use snapshot totals / season_days for accurate daily averages
            # This is more accurate than averaging daily_* values across periods

            # Get season info for start_date
            season = await self._season_repo.get_by_id(season_id)
            if not season:
                return []

            latest_period = periods[-1]

            # Calculate season days
            season_days = (latest_period.end_date - season.start_date).days
            if season_days <= 0:
                season_days = 1

            # Get metrics with snapshot totals for latest period
            metrics_with_totals = await self._metrics_repo.get_metrics_with_snapshot_totals(
                latest_period.id
            )

            # Group by end_group and calculate season daily averages
            group_data: dict[str, list[dict]] = defaultdict(list)
            for m in metrics_with_totals:
                group = m["end_group"] or "未分組"
                season_daily_merit = m["total_merit"] / season_days
                group_data[group].append({
                    "season_daily_merit": season_daily_merit,
                    "end_rank": m["end_rank"],
                })

            # Build result
            result = []
            for group_name, members in group_data.items():
                count = len(members)
                avg_merit = sum(m["season_daily_merit"] for m in members) / count
                avg_rank = sum(m["end_rank"] for m in members) / count

                result.append({
                    "name": group_name,
                    "avg_daily_merit": round(avg_merit, 2),
                    "avg_rank": round(avg_rank, 1),
                    "member_count": count,
                })

            return sorted(result, key=lambda x: x["avg_daily_merit"], reverse=True)

        # Default: latest period
        latest_period = periods[-1]
        group_averages = await self._metrics_repo.get_group_averages(latest_period.id)
        all_metrics = await self._metrics_repo.get_by_period(latest_period.id)

        group_ranks: dict[str, list[int]] = defaultdict(list)
        for m in all_metrics:
            group = m.end_group or "未分組"
            group_ranks[group].append(m.end_rank)

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
        count = len(metrics)

        # Extract values
        contributions = [float(Decimal(str(m["daily_contribution"]))) for m in metrics]
        merits = [float(Decimal(str(m["daily_merit"]))) for m in metrics]
        assists = [float(Decimal(str(m["daily_assist"]))) for m in metrics]
        donations = [float(Decimal(str(m["daily_donation"]))) for m in metrics]
        powers = [float(m["end_power"]) for m in metrics]
        ranks = [m["end_rank"] for m in metrics]

        # Calculate averages
        avg_contribution = sum(contributions) / count
        avg_merit = sum(merits) / count
        avg_assist = sum(assists) / count
        avg_donation = sum(donations) / count
        avg_power = sum(powers) / count
        avg_rank = sum(ranks) / count

        # Calculate contribution quartiles for box plot
        sorted_contributions = sorted(contributions)
        contribution_min = sorted_contributions[0] if sorted_contributions else 0
        contribution_q1 = _percentile(sorted_contributions, 0.25)
        contribution_median = _percentile(sorted_contributions, 0.5)
        contribution_q3 = _percentile(sorted_contributions, 0.75)
        contribution_max = sorted_contributions[-1] if sorted_contributions else 0

        # Contribution coefficient of variation
        contribution_std = stdev(contributions) if len(contributions) > 1 else 0
        contribution_cv = contribution_std / avg_contribution if avg_contribution > 0 else 0

        # Calculate merit quartiles for box plot
        sorted_merits = sorted(merits)
        merit_min = sorted_merits[0] if sorted_merits else 0
        merit_q1 = _percentile(sorted_merits, 0.25)
        merit_median = _percentile(sorted_merits, 0.5)
        merit_q3 = _percentile(sorted_merits, 0.75)
        merit_max = sorted_merits[-1] if sorted_merits else 0

        # Merit coefficient of variation
        merit_std = stdev(merits) if len(merits) > 1 else 0
        merit_cv = merit_std / avg_merit if avg_merit > 0 else 0

        return {
            "group_name": group_name,
            "member_count": count,
            "avg_daily_contribution": round(avg_contribution, 2),
            "avg_daily_merit": round(avg_merit, 2),
            "avg_daily_assist": round(avg_assist, 2),
            "avg_daily_donation": round(avg_donation, 2),
            "avg_power": round(avg_power, 2),
            "avg_rank": round(avg_rank, 1),
            "best_rank": min(ranks),
            "worst_rank": max(ranks),
            "contribution_min": round(contribution_min, 2),
            "contribution_q1": round(contribution_q1, 2),
            "contribution_median": round(contribution_median, 2),
            "contribution_q3": round(contribution_q3, 2),
            "contribution_max": round(contribution_max, 2),
            "contribution_cv": round(contribution_cv, 3),
            "merit_min": round(merit_min, 2),
            "merit_q1": round(merit_q1, 2),
            "merit_median": round(merit_median, 2),
            "merit_q3": round(merit_q3, 2),
            "merit_max": round(merit_max, 2),
            "merit_cv": round(merit_cv, 3),
        }

    def _calculate_group_stats_from_members(
        self, group_name: str, members: list[dict]
    ) -> dict:
        """
        Calculate group statistics from pre-calculated member data.

        Used for season view where members already have aggregated values.

        Args:
            group_name: Group name
            members: List of member dicts with daily_contribution, daily_merit, etc.

        Returns:
            GroupStats dict
        """
        count = len(members)
        if count == 0:
            return self._empty_group_stats(group_name)

        # Extract values from member dicts
        contributions = [m["daily_contribution"] for m in members]
        merits = [m["daily_merit"] for m in members]
        assists = [m["daily_assist"] for m in members]
        donations = [m["daily_donation"] for m in members]
        powers = [float(m["power"]) for m in members]
        ranks = [m["contribution_rank"] for m in members]

        # Calculate averages
        avg_contribution = sum(contributions) / count
        avg_merit = sum(merits) / count
        avg_assist = sum(assists) / count
        avg_donation = sum(donations) / count
        avg_power = sum(powers) / count
        avg_rank = sum(ranks) / count

        # Calculate contribution quartiles for box plot
        sorted_contributions = sorted(contributions)
        contribution_min = sorted_contributions[0] if sorted_contributions else 0
        contribution_q1 = _percentile(sorted_contributions, 0.25)
        contribution_median = _percentile(sorted_contributions, 0.5)
        contribution_q3 = _percentile(sorted_contributions, 0.75)
        contribution_max = sorted_contributions[-1] if sorted_contributions else 0

        # Contribution coefficient of variation
        contribution_std = stdev(contributions) if len(contributions) > 1 else 0
        contribution_cv = contribution_std / avg_contribution if avg_contribution > 0 else 0

        # Calculate merit quartiles for box plot
        sorted_merits = sorted(merits)
        merit_min = sorted_merits[0] if sorted_merits else 0
        merit_q1 = _percentile(sorted_merits, 0.25)
        merit_median = _percentile(sorted_merits, 0.5)
        merit_q3 = _percentile(sorted_merits, 0.75)
        merit_max = sorted_merits[-1] if sorted_merits else 0

        # Merit coefficient of variation
        merit_std = stdev(merits) if len(merits) > 1 else 0
        merit_cv = merit_std / avg_merit if avg_merit > 0 else 0

        return {
            "group_name": group_name,
            "member_count": count,
            "avg_daily_contribution": round(avg_contribution, 2),
            "avg_daily_merit": round(avg_merit, 2),
            "avg_daily_assist": round(avg_assist, 2),
            "avg_daily_donation": round(avg_donation, 2),
            "avg_power": round(avg_power, 2),
            "avg_rank": round(avg_rank, 1),
            "best_rank": min(ranks),
            "worst_rank": max(ranks),
            "contribution_min": round(contribution_min, 2),
            "contribution_q1": round(contribution_q1, 2),
            "contribution_median": round(contribution_median, 2),
            "contribution_q3": round(contribution_q3, 2),
            "contribution_max": round(contribution_max, 2),
            "contribution_cv": round(contribution_cv, 3),
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
            "avg_daily_contribution": 0,
            "avg_daily_merit": 0,
            "avg_daily_assist": 0,
            "avg_daily_donation": 0,
            "avg_power": 0,
            "avg_rank": 0,
            "best_rank": 0,
            "worst_rank": 0,
            "contribution_min": 0,
            "contribution_q1": 0,
            "contribution_median": 0,
            "contribution_q3": 0,
            "contribution_max": 0,
            "contribution_cv": 0,
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
            "avg_power": 0,
            "median_daily_contribution": 0,
            "median_daily_merit": 0,
            "median_daily_assist": 0,
            "median_daily_donation": 0,
            "median_power": 0,
        }

    # =========================================================================
    # Alliance Analytics Methods
    # =========================================================================

    async def get_alliance_analytics(
        self, season_id: UUID, view: str = "latest"
    ) -> dict:
        """
        Get complete alliance analytics for AllianceAnalytics page.

        Args:
            season_id: Season UUID
            view: 'latest' for latest period, 'season' for season-to-date

        Returns:
            Complete analytics response dict matching AllianceAnalyticsResponse schema
        """
        # Get season and periods
        season = await self._season_repo.get_by_id(season_id)
        if not season:
            return self._empty_alliance_analytics()

        periods = await self._period_repo.get_by_season(season_id)
        if not periods:
            return self._empty_alliance_analytics()

        latest_period = periods[-1]
        prev_period = periods[-2] if len(periods) >= 2 else None

        # Get all metrics for latest period (with member names)
        latest_metrics_raw = await self._metrics_repo.get_by_period_with_member(latest_period.id)
        if not latest_metrics_raw:
            return self._empty_alliance_analytics()

        # Get previous period metrics for change calculations
        prev_metrics_map: dict[UUID, dict] = {}
        if prev_period:
            prev_metrics_raw = await self._metrics_repo.get_by_period_with_member(prev_period.id)
            for m in prev_metrics_raw:
                prev_metrics_map[UUID(m["member_id"])] = {
                    "daily_contribution": float(m["daily_contribution"]),
                    "daily_merit": float(m["daily_merit"]),
                    "daily_assist": float(m["daily_assist"]),
                    "end_power": m["end_power"],
                }

        # Calculate season days for season view
        season_days = (latest_period.end_date - season.start_date).days
        if season_days <= 0:
            season_days = 1

        # Get metrics with snapshot totals for season view
        metrics_with_totals = None
        if view == "season":
            metrics_with_totals = await self._metrics_repo.get_metrics_with_snapshot_totals(
                latest_period.id
            )

        # Build member data based on view
        member_data = self._build_member_data(
            latest_metrics_raw, metrics_with_totals, prev_metrics_map, season_days, view
        )

        # Calculate summary
        summary = self._calculate_alliance_summary(
            member_data, prev_metrics_map, view
        )

        # Calculate trends with medians
        trends = await self._calculate_alliance_trends_with_medians(periods)

        # Calculate distributions
        distributions = self._calculate_distributions(member_data)

        # Calculate groups with box plot
        groups = self._calculate_groups_with_boxplot(member_data)

        # Calculate performers
        top_performers, bottom_performers = self._calculate_performers(member_data)

        # Calculate needs attention
        needs_attention = self._calculate_needs_attention(
            member_data, summary["median_daily_contribution"], view
        )

        # Build period info
        current_period = {
            "period_id": str(latest_period.id),
            "period_number": latest_period.period_number,
            "period_label": _build_period_label(latest_period),
            "start_date": latest_period.start_date.isoformat(),
            "end_date": latest_period.end_date.isoformat(),
            "days": latest_period.days,
        }

        return {
            "summary": summary,
            "trends": trends,
            "distributions": distributions,
            "groups": groups,
            "top_performers": top_performers,
            "bottom_performers": bottom_performers,
            "needs_attention": needs_attention,
            "current_period": current_period,
        }

    def _build_member_data(
        self,
        latest_metrics_raw: list[dict],
        metrics_with_totals: list[dict] | None,
        prev_metrics_map: dict[UUID, dict],
        season_days: int,
        view: str,
    ) -> list[dict]:
        """
        Build unified member data list based on view mode.

        Args:
            latest_metrics_raw: Latest period metrics (raw dicts from get_by_period_with_member)
            metrics_with_totals: Metrics with snapshot totals (for season view)
            prev_metrics_map: Previous period metrics map for change calculations
            season_days: Number of days in season
            view: 'latest' or 'season'

        Returns:
            List of member data dicts with consistent structure
        """
        if view == "season" and metrics_with_totals:
            # Build member_id -> totals map
            totals_map = {str(m["member_id"]): m for m in metrics_with_totals}

            result = []
            for m in latest_metrics_raw:
                member_id = str(m["member_id"])
                totals = totals_map.get(member_id)
                if not totals:
                    continue

                result.append({
                    "member_id": member_id,
                    "name": totals["member_name"],
                    "group": m["end_group"],
                    "daily_contribution": round(totals["total_contribution"] / season_days, 2),
                    "daily_merit": round(totals["total_merit"] / season_days, 2),
                    "daily_assist": round(totals["total_assist"] / season_days, 2),
                    "daily_donation": round(totals["total_donation"] / season_days, 2),
                    "power": m["end_power"],
                    "rank": m["end_rank"],
                    "rank_change": None,  # Not applicable for season view
                    "merit_change": None,  # Not applicable for season view
                    "assist_change": None,  # Not applicable for season view
                })
            return result

        # Latest view - metrics_raw is list of dicts from get_by_period_with_member
        result = []
        for m in latest_metrics_raw:
            member_id = UUID(m["member_id"])
            current_merit = float(Decimal(str(m["daily_merit"])))
            current_assist = float(Decimal(str(m["daily_assist"])))
            prev_data = prev_metrics_map.get(member_id)
            merit_change = (
                round(current_merit - prev_data["daily_merit"], 2)
                if prev_data
                else None
            )
            assist_change = (
                round(current_assist - prev_data["daily_assist"], 2)
                if prev_data
                else None
            )

            result.append({
                "member_id": str(member_id),
                "name": m.get("member_name", ""),
                "group": m["end_group"],
                "daily_contribution": float(Decimal(str(m["daily_contribution"]))),
                "daily_merit": current_merit,
                "daily_assist": current_assist,
                "daily_donation": float(Decimal(str(m["daily_donation"]))),
                "power": m["end_power"],
                "rank": m["end_rank"],
                "rank_change": m.get("rank_change"),
                "merit_change": merit_change,
                "assist_change": assist_change,
            })

        return result

    def _calculate_alliance_summary(
        self,
        member_data: list[dict],
        prev_metrics_map: dict[UUID, dict],
        view: str,
    ) -> dict:
        """Calculate alliance-wide summary metrics."""
        if not member_data:
            return {
                "member_count": 0,
                "avg_daily_contribution": 0,
                "avg_daily_merit": 0,
                "avg_daily_assist": 0,
                "avg_daily_donation": 0,
                "avg_power": 0,
                "median_daily_contribution": 0,
                "median_daily_merit": 0,
                "contribution_change_pct": None,
                "merit_change_pct": None,
                "power_change_pct": None,
            }

        count = len(member_data)
        contributions = [m["daily_contribution"] for m in member_data]
        merits = [m["daily_merit"] for m in member_data]
        assists = [m["daily_assist"] for m in member_data]
        donations = [m["daily_donation"] for m in member_data]
        powers = [float(m["power"]) for m in member_data]

        avg_contribution = sum(contributions) / count
        avg_merit = sum(merits) / count
        avg_power = sum(powers) / count

        # Calculate change percentages (only for latest view)
        contribution_change_pct = None
        merit_change_pct = None
        power_change_pct = None

        if view == "latest" and prev_metrics_map:
            prev_contributions = [
                prev_metrics_map[UUID(m["member_id"])]["daily_contribution"]
                for m in member_data
                if UUID(m["member_id"]) in prev_metrics_map
            ]
            prev_merits = [
                prev_metrics_map[UUID(m["member_id"])]["daily_merit"]
                for m in member_data
                if UUID(m["member_id"]) in prev_metrics_map
            ]
            prev_powers = [
                prev_metrics_map[UUID(m["member_id"])]["end_power"]
                for m in member_data
                if UUID(m["member_id"]) in prev_metrics_map
            ]

            if prev_contributions:
                prev_avg_contribution = sum(prev_contributions) / len(prev_contributions)
                if prev_avg_contribution > 0:
                    contribution_change_pct = round(
                        (avg_contribution - prev_avg_contribution) / prev_avg_contribution * 100, 1
                    )

            if prev_merits:
                prev_avg_merit = sum(prev_merits) / len(prev_merits)
                if prev_avg_merit > 0:
                    merit_change_pct = round(
                        (avg_merit - prev_avg_merit) / prev_avg_merit * 100, 1
                    )

            if prev_powers:
                prev_avg_power = sum(prev_powers) / len(prev_powers)
                if prev_avg_power > 0:
                    power_change_pct = round(
                        (avg_power - prev_avg_power) / prev_avg_power * 100, 1
                    )

        return {
            "member_count": count,
            "avg_daily_contribution": round(avg_contribution, 2),
            "avg_daily_merit": round(avg_merit, 2),
            "avg_daily_assist": round(sum(assists) / count, 2),
            "avg_daily_donation": round(sum(donations) / count, 2),
            "avg_power": round(avg_power, 2),
            "median_daily_contribution": round(calc_median(contributions), 2),
            "median_daily_merit": round(calc_median(merits), 2),
            "contribution_change_pct": contribution_change_pct,
            "merit_change_pct": merit_change_pct,
            "power_change_pct": power_change_pct,
        }

    async def _calculate_alliance_trends_with_medians(
        self, periods: list[Period]
    ) -> list[dict]:
        """Calculate alliance trend data with median values for each period."""
        result = []
        for period in periods:
            metrics = await self._metrics_repo.get_by_period(period.id)
            if not metrics:
                continue

            count = len(metrics)
            contributions = [float(m.daily_contribution) for m in metrics]
            merits = [float(m.daily_merit) for m in metrics]
            assists = [float(m.daily_assist) for m in metrics]
            donations = [float(m.daily_donation) for m in metrics]
            powers = [float(m.end_power) for m in metrics]

            result.append({
                "period_id": str(period.id),
                "period_number": period.period_number,
                "period_label": _build_period_label(period),
                "start_date": period.start_date.isoformat(),
                "end_date": period.end_date.isoformat(),
                "days": period.days,
                "member_count": count,
                # Averages
                "avg_daily_contribution": round(sum(contributions) / count, 2),
                "avg_daily_merit": round(sum(merits) / count, 2),
                "avg_daily_assist": round(sum(assists) / count, 2),
                "avg_daily_donation": round(sum(donations) / count, 2),
                "avg_power": round(sum(powers) / count, 2),
                # Medians
                "median_daily_contribution": round(calc_median(contributions), 2),
                "median_daily_merit": round(calc_median(merits), 2),
                "median_daily_assist": round(calc_median(assists), 2),
                "median_daily_donation": round(calc_median(donations), 2),
            })

        return result

    def _calculate_distributions(self, member_data: list[dict]) -> dict:
        """Calculate distribution histogram bins for contribution and merit dynamically."""
        if not member_data:
            return {"contribution": [], "merit": []}

        contributions = [m["daily_contribution"] for m in member_data]
        merits = [m["daily_merit"] for m in member_data]

        contribution_bins = self._create_dynamic_bins(contributions, "contribution")
        merit_bins = self._create_dynamic_bins(merits, "merit")

        return {
            "contribution": contribution_bins,
            "merit": merit_bins,
        }

    def _create_dynamic_bins(self, values: list[float], metric_type: str) -> list[dict]:
        """Create dynamic histogram bins based on actual data range."""
        if not values:
            return []

        min_val = min(values)
        max_val = max(values)

        # Handle edge case where all values are the same
        if min_val == max_val:
            return [{"range": self._format_range(min_val, max_val + 1), "count": len(values)}]

        # Calculate nice bin width (round to nearest "nice" number)
        data_range = max_val - min_val
        raw_bin_width = data_range / 5  # Target 5 bins

        # Round to nice numbers (1, 2, 5, 10, 20, 50, 100, etc.)
        magnitude = 10 ** int(len(str(int(raw_bin_width))) - 1) if raw_bin_width >= 1 else 1
        nice_widths = [1, 2, 5, 10, 20, 50]
        bin_width = magnitude * min(nice_widths, key=lambda x: abs(x * magnitude - raw_bin_width))

        # Ensure reasonable bin width based on data magnitude
        if max_val >= 1_000_000:
            min_bin_width = 100_000  # 100K minimum for million-scale data
        elif max_val >= 100_000:
            min_bin_width = 10_000  # 10K minimum for 100K+ data
        else:
            min_bin_width = 1000 if metric_type == "contribution" else 5000
        bin_width = max(bin_width, min_bin_width)

        # Calculate bin start (round down to nearest bin_width)
        bin_start = (int(min_val) // int(bin_width)) * int(bin_width)

        # Create bins
        bins = []
        current = bin_start
        while current < max_val:
            next_val = current + bin_width
            bins.append({
                "range": self._format_range(current, next_val),
                "min_value": current,
                "max_value": next_val,
                "count": 0,
            })
            current = next_val

        # Count values in each bin
        for v in values:
            for bin_data in bins:
                if bin_data["min_value"] <= v < bin_data["max_value"]:
                    bin_data["count"] += 1
                    break
            else:
                # Value equals max_val, put in last bin
                if bins and v >= bins[-1]["min_value"]:
                    bins[-1]["count"] += 1

        return bins

    def _format_range(self, min_val: float, max_val: float) -> str:
        """Format range label with K/M suffix for thousands/millions."""
        def fmt(v: float) -> str:
            if v >= 1_000_000:
                return f"{v / 1_000_000:.1f}M" if v % 1_000_000 != 0 else f"{v / 1_000_000:.0f}M"
            if v >= 1000:
                return f"{v / 1000:.0f}K" if v % 1000 == 0 else f"{v / 1000:.1f}K"
            return str(int(v))

        return f"{fmt(min_val)}-{fmt(max_val)}"

    def _calculate_groups_with_boxplot(self, member_data: list[dict]) -> list[dict]:
        """Calculate group stats with box plot data for all groups."""
        # Group members by group name
        groups: dict[str, list[dict]] = defaultdict(list)
        for m in member_data:
            group = m["group"] or "未分組"
            groups[group].append(m)

        result = []
        for group_name, members in groups.items():
            count = len(members)
            if count == 0:
                continue

            contributions = [m["daily_contribution"] for m in members]
            merits = [m["daily_merit"] for m in members]
            powers = [float(m["power"]) for m in members]
            ranks = [m["rank"] for m in members]

            # Sort for percentile calculations
            sorted_contributions = sorted(contributions)
            sorted_merits = sorted(merits)

            avg_contribution = sum(contributions) / count
            contribution_std = stdev(contributions) if count > 1 else 0
            contribution_cv = contribution_std / avg_contribution if avg_contribution > 0 else 0

            result.append({
                "name": group_name,
                "member_count": count,
                "avg_daily_contribution": round(avg_contribution, 2),
                "avg_daily_merit": round(sum(merits) / count, 2),
                "avg_rank": round(sum(ranks) / count, 1),
                "avg_power": round(sum(powers) / count, 2),
                "contribution_cv": round(contribution_cv, 3),
                # Contribution box plot
                "contribution_min": round(sorted_contributions[0], 2),
                "contribution_q1": round(_percentile(sorted_contributions, 0.25), 2),
                "contribution_median": round(_percentile(sorted_contributions, 0.5), 2),
                "contribution_q3": round(_percentile(sorted_contributions, 0.75), 2),
                "contribution_max": round(sorted_contributions[-1], 2),
                # Merit box plot
                "merit_min": round(sorted_merits[0], 2),
                "merit_q1": round(_percentile(sorted_merits, 0.25), 2),
                "merit_median": round(_percentile(sorted_merits, 0.5), 2),
                "merit_q3": round(_percentile(sorted_merits, 0.75), 2),
                "merit_max": round(sorted_merits[-1], 2),
            })

        # Sort by avg_daily_merit descending
        result.sort(key=lambda x: x["avg_daily_merit"], reverse=True)
        return result

    def _calculate_performers(
        self, member_data: list[dict]
    ) -> tuple[list[dict], list[dict]]:
        """Calculate top and bottom performers (returns all members for frontend slicing)."""
        # Sort by rank ascending (rank 1 is best)
        sorted_data = sorted(member_data, key=lambda x: x["rank"])

        def to_performer(m: dict) -> dict:
            return {
                "member_id": m["member_id"],
                "name": m["name"],
                "group": m["group"],
                "daily_contribution": m["daily_contribution"],
                "daily_merit": m["daily_merit"],
                "daily_assist": m["daily_assist"],
                "rank": m["rank"],
                "rank_change": m["rank_change"],
                "merit_change": m["merit_change"],
                "assist_change": m["assist_change"],
            }

        # Return all members - top (high to low) and bottom (low to high)
        top_performers = [to_performer(m) for m in sorted_data]
        bottom_performers = [to_performer(m) for m in reversed(sorted_data)]

        return top_performers, bottom_performers

    def _calculate_needs_attention(
        self,
        member_data: list[dict],
        median_contribution: float,
        view: str,
    ) -> list[dict]:
        """
        Calculate members needing attention.

        Rules:
        1. Rank dropped > 10 positions (highest priority)
        2. Contribution < 50% of median
        3. Rank in bottom 10% and dropped > 5 positions
        """
        result = []
        member_count = len(member_data)
        bottom_threshold = member_count * 0.9

        for m in member_data:
            reason = None

            # Rule 1: Significant rank drop (only for latest view)
            if view == "latest" and m["rank_change"] is not None and m["rank_change"] < -10:
                reason = f"排名下滑 {abs(m['rank_change'])} 名"

            # Rule 2: Contribution below 50% of median
            elif median_contribution > 0 and m["daily_contribution"] < median_contribution * 0.5:
                reason = "貢獻低於同盟中位數 50%"

            # Rule 3: Bottom rank and still dropping
            elif (
                view == "latest"
                and m["rank"] > bottom_threshold
                and m["rank_change"] is not None
                and m["rank_change"] < -5
            ):
                reason = "排名接近底部且持續下滑"

            if reason:
                result.append({
                    "member_id": m["member_id"],
                    "name": m["name"],
                    "group": m["group"],
                    "daily_contribution": m["daily_contribution"],
                    "rank": m["rank"],
                    "rank_change": m["rank_change"],
                    "reason": reason,
                })

        # Sort by severity (rank drop first, then contribution)
        result.sort(
            key=lambda x: (
                0 if "排名下滑" in x["reason"] else 1,
                x["daily_contribution"],
            )
        )

        return result[:10]  # Limit to 10

    def _empty_alliance_analytics(self) -> dict:
        """Return empty alliance analytics structure."""
        return {
            "summary": {
                "member_count": 0,
                "avg_daily_contribution": 0,
                "avg_daily_merit": 0,
                "avg_daily_assist": 0,
                "avg_daily_donation": 0,
                "avg_power": 0,
                "median_daily_contribution": 0,
                "median_daily_merit": 0,
                "contribution_change_pct": None,
                "merit_change_pct": None,
                "power_change_pct": None,
            },
            "trends": [],
            "distributions": {
                "contribution": [],
                "merit": [],
            },
            "groups": [],
            "top_performers": [],
            "bottom_performers": [],
            "needs_attention": [],
            "current_period": {
                "period_id": "",
                "period_number": 0,
                "period_label": "",
                "start_date": "",
                "end_date": "",
                "days": 0,
            },
        }
