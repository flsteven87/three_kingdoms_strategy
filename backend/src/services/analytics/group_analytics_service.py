"""
Group Analytics Service

Group-level analytics: group lists, group detail analytics, group comparisons,
and statistical calculations (box plots, CV, percentiles).
"""

from collections import defaultdict
from statistics import stdev
from uuid import UUID

from ._helpers import UNGROUPED_LABEL, ViewMode, build_period_label, db_float, percentile
from ._shared import SharedAnalyticsMixin


class GroupAnalyticsService(SharedAnalyticsMixin):
    """Service for group-level analytics and comparisons."""

    async def get_groups_list(self, season_id: UUID) -> list[dict]:
        """
        Get list of all groups with member counts for a season.

        Args:
            season_id: Season UUID

        Returns:
            List of groups with name and member_count
        """
        periods = await self._period_repo.get_by_season(season_id)
        if not periods:
            return []

        latest_period = periods[-1]
        return await self._metrics_repo.get_all_groups_for_period(latest_period.id)

    async def get_group_analytics(
        self, season_id: UUID, group_name: str, view: ViewMode = "latest"
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

        # Build trends (same for both views - shows history)
        trends = self._build_group_trends(trend_data, periods)

        # Get alliance averages for comparison (use season averages for season view)
        if view == "season":
            alliance_averages = await self.get_season_alliance_averages(season_id)
        else:
            alliance_averages = await self.get_period_alliance_averages(latest_period.id)

        if view == "season":
            return await self._build_season_view(
                season_id, group_name, group_metrics, latest_period, trends, alliance_averages
            )

        # Default: latest period view
        return self._build_latest_view(
            group_name, group_metrics, trend_data, periods, trends, alliance_averages
        )

    async def _build_season_view(
        self,
        season_id: UUID,
        group_name: str,
        group_metrics: list[dict],
        latest_period,
        trends: list[dict],
        alliance_averages: dict,
    ) -> dict:
        """Build group analytics for season view using snapshot totals."""
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

        season_days = self._compute_season_days(season.start_date, latest_period.end_date)

        # Calculate season daily averages using snapshot totals
        members = []
        for m in group_metrics_with_totals:
            member_id = str(m["member_id"])

            members.append(
                {
                    "id": member_id,
                    "name": m["member_name"],
                    "contribution_rank": m["end_rank"],  # Latest rank
                    "daily_contribution": round(m["total_contribution"] / season_days, 2),
                    "daily_merit": round(m["total_merit"] / season_days, 2),
                    "daily_assist": round(m["total_assist"] / season_days, 2),
                    "daily_donation": round(m["total_donation"] / season_days, 2),
                    "power": m["end_power"],  # Power is always latest
                    "rank_change": None,  # Not applicable for season view
                    "contribution_change": None,
                    "merit_change": None,
                }
            )

        stats = self._calculate_group_stats_from_members(group_name, members)

        return {
            "stats": stats,
            "members": members,
            "trends": trends,
            "alliance_averages": alliance_averages,
        }

    def _build_latest_view(
        self,
        group_name: str,
        group_metrics: list[dict],
        trend_data: list[dict],
        periods: list,
        trends: list[dict],
        alliance_averages: dict,
    ) -> dict:
        """Build group analytics for latest period view."""
        # Get previous period metrics for change calculation
        # Reuse trend_data instead of extra query (optimization: eliminates 1 DB call)
        prev_metrics_map: dict[str, dict] = {}
        if len(periods) >= 2:
            prev_period_id = str(periods[-2].id)
            for td in trend_data:
                if td["period_id"] == prev_period_id:
                    prev_metrics_map[str(td["member_id"])] = {
                        "daily_contribution": db_float(td["daily_contribution"]),
                        "daily_merit": db_float(td["daily_merit"]),
                    }

        # Build members list for latest period
        members = []
        for m in group_metrics:
            member_id = str(m["member_id"])
            current_contribution = round(db_float(m["daily_contribution"]), 2)
            current_merit = round(db_float(m["daily_merit"]), 2)
            current_assist = round(db_float(m["daily_assist"]), 2)
            current_donation = round(db_float(m["daily_donation"]), 2)
            prev_data = prev_metrics_map.get(member_id)
            contribution_change = (
                round(current_contribution - prev_data["daily_contribution"], 2)
                if prev_data
                else None
            )
            merit_change = round(current_merit - prev_data["daily_merit"], 2) if prev_data else None

            members.append(
                {
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
                }
            )

        stats = self._calculate_group_stats(group_name, group_metrics)

        return {
            "stats": stats,
            "members": members,
            "trends": trends,
            "alliance_averages": alliance_averages,
        }

    def _build_group_trends(self, trend_data: list[dict], periods: list) -> list[dict]:
        """Build period-by-period trend data for a group."""
        # Group by period for trend calculation
        period_groups: dict[str, list[dict]] = defaultdict(list)
        for row in trend_data:
            period_groups[row["period_id"]].append(row)

        period_map = {str(p.id): p for p in periods}

        trends = []
        for period_id_str, metrics in period_groups.items():
            period = period_map.get(period_id_str)
            if period:
                count = len(metrics)
                ranks = [m["end_rank"] for m in metrics]
                contributions = [db_float(m["daily_contribution"]) for m in metrics]
                merits = [db_float(m["daily_merit"]) for m in metrics]
                assists = [db_float(m["daily_assist"]) for m in metrics]
                donations = [db_float(m["daily_donation"]) for m in metrics]
                powers = [float(m["end_power"]) for m in metrics]

                trends.append(
                    {
                        "period_label": build_period_label(period),
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
                    }
                )

        trends.sort(key=lambda x: x["period_number"])
        return trends

    async def get_groups_comparison(self, season_id: UUID, view: ViewMode = "latest") -> list[dict]:
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
            return await self._groups_comparison_season_view(season_id, periods)

        # Default: latest period
        return await self._groups_comparison_latest_view(periods)

    async def _groups_comparison_season_view(self, season_id: UUID, periods: list) -> list[dict]:
        """Build groups comparison for season view."""
        season = await self._season_repo.get_by_id(season_id)
        if not season:
            return []

        latest_period = periods[-1]
        season_days = self._compute_season_days(season.start_date, latest_period.end_date)

        metrics_with_totals = await self._metrics_repo.get_metrics_with_snapshot_totals(
            latest_period.id
        )

        # Group by end_group and calculate season daily averages
        group_data: dict[str, list[dict]] = defaultdict(list)
        for m in metrics_with_totals:
            group = m["end_group"] or UNGROUPED_LABEL
            season_daily_merit = m["total_merit"] / season_days
            group_data[group].append(
                {
                    "season_daily_merit": season_daily_merit,
                    "end_rank": m["end_rank"],
                    "member_name": m["member_name"],
                }
            )

        result = []
        for name, members in group_data.items():
            count = len(members)
            avg_merit = sum(m["season_daily_merit"] for m in members) / count
            avg_rank = sum(m["end_rank"] for m in members) / count
            member_names = [m["member_name"] for m in members]

            result.append(
                {
                    "name": name,
                    "avg_daily_merit": round(avg_merit, 2),
                    "avg_rank": round(avg_rank, 1),
                    "member_count": count,
                    "member_names": member_names,
                }
            )

        return sorted(result, key=lambda x: x["avg_daily_merit"], reverse=True)

    async def _groups_comparison_latest_view(self, periods: list) -> list[dict]:
        """Build groups comparison for latest period view."""
        latest_period = periods[-1]
        all_metrics = await self._metrics_repo.get_by_period_with_member(latest_period.id)

        # Group metrics by end_group and calculate averages in one pass
        group_data: dict[str, list[dict]] = defaultdict(list)
        for m in all_metrics:
            group = m["end_group"] or UNGROUPED_LABEL
            group_data[group].append(m)

        result = []
        for name, members in group_data.items():
            count = len(members)
            merits = [db_float(m["daily_merit"]) for m in members]
            ranks = [m["end_rank"] for m in members]
            member_names = [m["member_name"] for m in members]

            result.append(
                {
                    "name": name,
                    "avg_daily_merit": round(sum(merits) / count, 2),
                    "avg_rank": round(sum(ranks) / count, 1),
                    "member_count": count,
                    "member_names": member_names,
                }
            )

        return sorted(result, key=lambda x: x["avg_daily_merit"], reverse=True)

    # =========================================================================
    # Group Statistics Calculations
    # =========================================================================

    def _compute_group_stats(
        self,
        group_name: str,
        contributions: list[float],
        merits: list[float],
        assists: list[float],
        donations: list[float],
        powers: list[float],
        ranks: list[float],
    ) -> dict:
        """Compute group statistics from pre-extracted numeric lists."""
        count = len(contributions)
        if count == 0:
            return self._empty_group_stats(group_name)

        avg_contribution = sum(contributions) / count
        avg_merit = sum(merits) / count

        sorted_contributions = sorted(contributions)
        contribution_std = stdev(contributions) if count > 1 else 0
        contribution_cv = contribution_std / avg_contribution if avg_contribution > 0 else 0

        sorted_merits = sorted(merits)
        merit_std = stdev(merits) if count > 1 else 0
        merit_cv = merit_std / avg_merit if avg_merit > 0 else 0

        return {
            "group_name": group_name,
            "member_count": count,
            "avg_daily_contribution": round(avg_contribution, 2),
            "avg_daily_merit": round(avg_merit, 2),
            "avg_daily_assist": round(sum(assists) / count, 2),
            "avg_daily_donation": round(sum(donations) / count, 2),
            "avg_power": round(sum(powers) / count, 2),
            "avg_rank": round(sum(ranks) / count, 1),
            "best_rank": min(ranks),
            "worst_rank": max(ranks),
            "contribution_min": round(sorted_contributions[0], 2),
            "contribution_q1": round(percentile(sorted_contributions, 0.25), 2),
            "contribution_median": round(percentile(sorted_contributions, 0.5), 2),
            "contribution_q3": round(percentile(sorted_contributions, 0.75), 2),
            "contribution_max": round(sorted_contributions[-1], 2),
            "contribution_cv": round(contribution_cv, 3),
            "merit_min": round(sorted_merits[0], 2),
            "merit_q1": round(percentile(sorted_merits, 0.25), 2),
            "merit_median": round(percentile(sorted_merits, 0.5), 2),
            "merit_q3": round(percentile(sorted_merits, 0.75), 2),
            "merit_max": round(sorted_merits[-1], 2),
            "merit_cv": round(merit_cv, 3),
        }

    def _calculate_group_stats(self, group_name: str, metrics: list[dict]) -> dict:
        """Calculate group statistics from raw DB metrics data."""
        if not metrics:
            return self._empty_group_stats(group_name)
        return self._compute_group_stats(
            group_name,
            contributions=[db_float(m["daily_contribution"]) for m in metrics],
            merits=[db_float(m["daily_merit"]) for m in metrics],
            assists=[db_float(m["daily_assist"]) for m in metrics],
            donations=[db_float(m["daily_donation"]) for m in metrics],
            powers=[float(m["end_power"]) for m in metrics],
            ranks=[m["end_rank"] for m in metrics],
        )

    def _calculate_group_stats_from_members(self, group_name: str, members: list[dict]) -> dict:
        """Calculate group statistics from pre-calculated member data (season view)."""
        if not members:
            return self._empty_group_stats(group_name)
        return self._compute_group_stats(
            group_name,
            contributions=[m["daily_contribution"] for m in members],
            merits=[m["daily_merit"] for m in members],
            assists=[m["daily_assist"] for m in members],
            donations=[m["daily_donation"] for m in members],
            powers=[float(m["power"]) for m in members],
            ranks=[m["contribution_rank"] for m in members],
        )

    def _empty_group_stats(self, group_name: str) -> dict:
        """Return empty group stats structure."""
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
