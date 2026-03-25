"""
Alliance Analytics Service

Alliance-wide dashboard analytics: summary KPIs, trends with medians,
distributions, group box plots, top/bottom performers, needs attention.
"""

import asyncio
from collections import defaultdict
from statistics import median as calc_median
from uuid import UUID

from src.models.period import Period

from ._helpers import (
    UNGROUPED_LABEL,
    ViewMode,
    build_period_label,
    compute_box_plot_stats,
    db_float,
)
from ._shared import SharedAnalyticsMixin


class AllianceAnalyticsService(SharedAnalyticsMixin):
    """Service for alliance-wide dashboard analytics."""

    async def get_alliance_analytics(self, season_id: UUID, view: ViewMode = "latest") -> dict:
        """
        Get complete alliance analytics for AllianceAnalytics page.

        Args:
            season_id: Season UUID
            view: 'latest' for latest period, 'season' for season-to-date

        Returns:
            Complete analytics response dict matching AllianceAnalyticsResponse schema

        Performance optimization:
            - Season view: Uses get_metrics_with_snapshot_totals() which already includes
              all needed fields, eliminating redundant queries.
            - Latest view: Uses get_by_period_with_member() as before.
        """
        # Fetch season and periods in parallel (independent queries)
        season, periods = await asyncio.gather(
            self._season_repo.get_by_id(season_id),
            self._period_repo.get_by_season(season_id),
        )
        if not season or not periods:
            return self._empty_alliance_analytics()

        latest_period = periods[-1]
        prev_period = periods[-2] if len(periods) >= 2 else None

        season_days = self._compute_season_days(season.start_date, latest_period.end_date)

        # Get metrics based on view mode (optimized to avoid redundant queries)
        metrics_with_totals: list[dict] | None = None
        if view == "season":
            metrics_with_totals = await self._metrics_repo.get_metrics_with_snapshot_totals(
                latest_period.id
            )
            if not metrics_with_totals:
                return self._empty_alliance_analytics()
            latest_metrics_raw = metrics_with_totals
        else:
            latest_metrics_raw = await self._metrics_repo.get_by_period_with_member(
                latest_period.id
            )
            if not latest_metrics_raw:
                return self._empty_alliance_analytics()

        # Get previous period metrics for change calculations
        prev_metrics_map: dict[UUID, dict] = {}
        if prev_period:
            prev_metrics_raw = await self._metrics_repo.get_by_period_with_member(prev_period.id)
            for m in prev_metrics_raw:
                prev_metrics_map[UUID(m["member_id"])] = {
                    "daily_contribution": db_float(m["daily_contribution"]),
                    "daily_merit": db_float(m["daily_merit"]),
                    "daily_assist": db_float(m["daily_assist"]),
                    "end_power": m["end_power"],
                }

        # Build member data based on view
        member_data = self._build_member_data(
            latest_metrics_raw, metrics_with_totals, prev_metrics_map, season_days, view
        )

        # Calculate all analytics components
        summary = self._calculate_alliance_summary(member_data, prev_metrics_map, view)
        trends = await self._calculate_alliance_trends_with_medians(periods)
        distributions = self._calculate_distributions(member_data)
        groups = self._calculate_groups_with_boxplot(member_data)
        top_performers, bottom_performers = self._calculate_performers(member_data)
        needs_attention = self._calculate_needs_attention(
            member_data, summary["median_daily_contribution"], view
        )

        current_period = {
            "period_id": str(latest_period.id),
            "period_number": latest_period.period_number,
            "period_label": build_period_label(latest_period),
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

    # =========================================================================
    # Internal Calculation Methods
    # =========================================================================

    def _build_member_data(
        self,
        latest_metrics_raw: list[dict],
        metrics_with_totals: list[dict] | None,
        prev_metrics_map: dict[UUID, dict],
        season_days: int,
        view: ViewMode,
    ) -> list[dict]:
        """Build unified member data list based on view mode."""
        if view == "season" and metrics_with_totals:
            # In season view, latest_metrics_raw and metrics_with_totals are the same list
            # (set in get_alliance_analytics), so iterate directly — no map needed
            return [
                {
                    "member_id": str(m["member_id"]),
                    "name": m["member_name"],
                    "group": m["end_group"],
                    "daily_contribution": round(m["total_contribution"] / season_days, 2),
                    "daily_merit": round(m["total_merit"] / season_days, 2),
                    "daily_assist": round(m["total_assist"] / season_days, 2),
                    "daily_donation": round(m["total_donation"] / season_days, 2),
                    "power": m["end_power"],
                    "rank": m["end_rank"],
                    "rank_change": None,
                    "merit_change": None,
                    "assist_change": None,
                }
                for m in metrics_with_totals
            ]

        # Latest view
        result = []
        for m in latest_metrics_raw:
            member_id = UUID(m["member_id"])
            current_merit = db_float(m["daily_merit"])
            current_assist = db_float(m["daily_assist"])
            prev_data = prev_metrics_map.get(member_id)
            merit_change = round(current_merit - prev_data["daily_merit"], 2) if prev_data else None
            assist_change = (
                round(current_assist - prev_data["daily_assist"], 2) if prev_data else None
            )

            result.append(
                {
                    "member_id": str(member_id),
                    "name": m.get("member_name", ""),
                    "group": m["end_group"],
                    "daily_contribution": db_float(m["daily_contribution"]),
                    "daily_merit": current_merit,
                    "daily_assist": current_assist,
                    "daily_donation": db_float(m["daily_donation"]),
                    "power": m["end_power"],
                    "rank": m["end_rank"],
                    "rank_change": m.get("rank_change"),
                    "merit_change": merit_change,
                    "assist_change": assist_change,
                }
            )

        return result

    def _calculate_alliance_summary(
        self,
        member_data: list[dict],
        prev_metrics_map: dict[UUID, dict],
        view: ViewMode,
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
            prev_contributions, prev_merits, prev_powers = [], [], []
            for m in member_data:
                prev = prev_metrics_map.get(UUID(m["member_id"]))
                if prev:
                    prev_contributions.append(prev["daily_contribution"])
                    prev_merits.append(prev["daily_merit"])
                    prev_powers.append(prev["end_power"])

            if prev_contributions:
                prev_avg_contribution = sum(prev_contributions) / len(prev_contributions)
                if prev_avg_contribution > 0:
                    contribution_change_pct = round(
                        (avg_contribution - prev_avg_contribution) / prev_avg_contribution * 100,
                        1,
                    )

            if prev_merits:
                prev_avg_merit = sum(prev_merits) / len(prev_merits)
                if prev_avg_merit > 0:
                    merit_change_pct = round((avg_merit - prev_avg_merit) / prev_avg_merit * 100, 1)

            if prev_powers:
                prev_avg_power = sum(prev_powers) / len(prev_powers)
                if prev_avg_power > 0:
                    power_change_pct = round((avg_power - prev_avg_power) / prev_avg_power * 100, 1)

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

    async def _calculate_alliance_trends_with_medians(self, periods: list[Period]) -> list[dict]:
        """
        Calculate alliance trend data with median values for each period.

        Optimized: Uses batch query to fetch all periods' metrics in one DB call.
        """
        if not periods:
            return []

        period_ids = [p.id for p in periods]
        all_metrics = await self._metrics_repo.get_by_periods_batch(period_ids)

        result = []
        for period in periods:
            metrics = all_metrics.get(period.id, [])
            if not metrics:
                continue

            count = len(metrics)
            contributions = [db_float(m["daily_contribution"]) for m in metrics]
            merits = [db_float(m["daily_merit"]) for m in metrics]
            assists = [db_float(m["daily_assist"]) for m in metrics]
            donations = [db_float(m["daily_donation"]) for m in metrics]
            powers = [db_float(m["end_power"]) for m in metrics]

            result.append(
                {
                    "period_id": str(period.id),
                    "period_number": period.period_number,
                    "period_label": build_period_label(period),
                    "start_date": period.start_date.isoformat(),
                    "end_date": period.end_date.isoformat(),
                    "days": period.days,
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
                }
            )

        return result

    def _calculate_distributions(self, member_data: list[dict]) -> dict:
        """Calculate distribution histogram bins for contribution and merit dynamically."""
        if not member_data:
            return {"contribution": [], "merit": []}

        contributions = [m["daily_contribution"] for m in member_data]
        merits = [m["daily_merit"] for m in member_data]

        return {
            "contribution": self._create_dynamic_bins(contributions, "contribution"),
            "merit": self._create_dynamic_bins(merits, "merit"),
        }

    def _create_dynamic_bins(self, values: list[float], metric_type: str) -> list[dict]:
        """Create dynamic histogram bins based on actual data range."""
        if not values:
            return []

        min_val = min(values)
        max_val = max(values)

        # Handle edge case where all values are the same
        if min_val == max_val:
            return [
                {
                    "range": self._format_range(min_val, max_val + 1),
                    "min_value": min_val,
                    "max_value": max_val + 1,
                    "count": len(values),
                }
            ]

        # Calculate nice bin width (round to nearest "nice" number)
        data_range = max_val - min_val
        raw_bin_width = data_range / 5  # Target 5 bins

        # Round to nice numbers (1, 2, 5, 10, 20, 50, 100, etc.)
        magnitude = 10 ** int(len(str(int(raw_bin_width))) - 1) if raw_bin_width >= 1 else 1
        nice_widths = [1, 2, 5, 10, 20, 50]
        bin_width = magnitude * min(nice_widths, key=lambda x: abs(x * magnitude - raw_bin_width))

        # Ensure reasonable bin width based on data magnitude
        if max_val >= 1_000_000:
            min_bin_width = 100_000
        elif max_val >= 100_000:
            min_bin_width = 10_000
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
            bins.append(
                {
                    "range": self._format_range(current, next_val),
                    "min_value": current,
                    "max_value": next_val,
                    "count": 0,
                }
            )
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

    @staticmethod
    def _format_range(min_val: float, max_val: float) -> str:
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
        groups: dict[str, list[dict]] = defaultdict(list)
        for m in member_data:
            group = m["group"] or UNGROUPED_LABEL
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

            c_stats = compute_box_plot_stats(contributions)
            m_stats = compute_box_plot_stats(merits)

            result.append(
                {
                    "name": group_name,
                    "member_count": count,
                    "avg_daily_contribution": round(sum(contributions) / count, 2),
                    "avg_daily_merit": round(sum(merits) / count, 2),
                    "avg_rank": round(sum(ranks) / count, 1),
                    "avg_power": round(sum(powers) / count, 2),
                    "contribution_cv": round(c_stats["cv"], 3),
                    "contribution_min": round(c_stats["min"], 2),
                    "contribution_q1": round(c_stats["q1"], 2),
                    "contribution_median": round(c_stats["median"], 2),
                    "contribution_q3": round(c_stats["q3"], 2),
                    "contribution_max": round(c_stats["max"], 2),
                    "merit_min": round(m_stats["min"], 2),
                    "merit_q1": round(m_stats["q1"], 2),
                    "merit_median": round(m_stats["median"], 2),
                    "merit_q3": round(m_stats["q3"], 2),
                    "merit_max": round(m_stats["max"], 2),
                }
            )

        result.sort(key=lambda x: x["avg_daily_merit"], reverse=True)
        return result

    def _calculate_performers(self, member_data: list[dict]) -> tuple[list[dict], list[dict]]:
        """Calculate top and bottom performers (returns all members for frontend slicing)."""
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

        top_performers = [to_performer(m) for m in sorted_data]
        bottom_performers = [to_performer(m) for m in reversed(sorted_data)]

        return top_performers, bottom_performers

    def _calculate_needs_attention(
        self,
        member_data: list[dict],
        median_contribution: float,
        view: ViewMode,
    ) -> list[dict]:
        """
        Calculate members needing attention.

        Rules:
        1. Rank dropped > 10 positions (highest priority, latest view only)
        2. Contribution < 50% of median
        3. Rank in bottom 10% and dropped > 5 positions (latest view only)
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
                result.append(
                    {
                        "member_id": m["member_id"],
                        "name": m["name"],
                        "group": m["group"],
                        "daily_contribution": m["daily_contribution"],
                        "rank": m["rank"],
                        "rank_change": m["rank_change"],
                        "reason": reason,
                    }
                )

        # Sort by severity (rank drop first, then contribution)
        result.sort(
            key=lambda x: (
                0 if "排名下滑" in x["reason"] else 1,
                x["daily_contribution"],
            )
        )

        return result[:10]

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
