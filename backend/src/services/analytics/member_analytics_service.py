"""
Member Analytics Service

Individual member performance: trends, comparisons, season summaries, member lists.
"""

import asyncio
from statistics import median as calc_median
from uuid import UUID

from src.repositories.member_repository import MemberRepository

from ._helpers import build_period_label
from ._shared import SharedAnalyticsMixin


class MemberAnalyticsService(SharedAnalyticsMixin):
    """Service for individual member analytics and performance data."""

    def __init__(self, *, member_repo: MemberRepository | None = None, **kwargs) -> None:
        super().__init__(**kwargs)
        self._member_repo = member_repo or MemberRepository()

    async def get_members_for_analytics(
        self, alliance_id: UUID, active_only: bool = True, season_id: UUID | None = None
    ) -> list[dict]:
        """
        Get members for analytics selector, filtered by season data availability.

        When season_id is provided, only returns members who have period metrics
        in that season.
        """
        member_metrics_map: dict[UUID, dict] = {}
        members_with_data: set[UUID] = set()

        if season_id:
            periods, all_members = await asyncio.gather(
                self._period_repo.get_by_season(season_id),
                self._member_repo.get_by_alliance(alliance_id, active_only),
            )
            if periods:
                latest_period = periods[-1]
                metrics = await self._metrics_repo.get_by_period(latest_period.id)
                for m in metrics:
                    members_with_data.add(m.member_id)
                    member_metrics_map[m.member_id] = {
                        "contribution_rank": m.end_rank,
                        "group": m.end_group,
                    }
        else:
            all_members = await self._member_repo.get_by_alliance(alliance_id, active_only)

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

    async def get_member_trend(self, member_id: UUID, season_id: UUID) -> list[dict]:
        """
        Get member's performance trend across all periods in a season.

        Includes alliance averages for each period to enable comparison charts.
        """
        periods = await self._period_repo.get_by_season(season_id)
        if not periods:
            return []

        period_map = {p.id: p for p in periods}

        metrics = await self._metrics_repo.get_by_member(member_id, season_id)
        if not metrics:
            return []

        period_ids = [m.period_id for m in metrics]
        alliance_averages = await self._metrics_repo.get_periods_averages_batch(period_ids)

        result = []
        for m in metrics:
            period = period_map.get(m.period_id)
            if not period:
                continue

            period_avg = alliance_averages.get(m.period_id, {})

            result.append(
                {
                    "period_id": str(m.period_id),
                    "period_number": period.period_number,
                    "period_label": build_period_label(period),
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
                }
            )

        result.sort(key=lambda x: x["period_number"])
        return result

    async def get_member_with_comparison(self, member_id: UUID, period_id: UUID) -> dict | None:
        """Get member metrics for a period with alliance averages and medians for comparison."""
        all_metrics = await self._metrics_repo.get_by_period(period_id)

        if not all_metrics:
            return None

        member_metrics = None
        for m in all_metrics:
            if m.member_id == member_id:
                member_metrics = m
                break

        if not member_metrics:
            return None

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

    async def get_season_summary(self, member_id: UUID, season_id: UUID) -> dict | None:
        """Get member's season-to-date summary (aggregated across all periods)."""
        trend = await self.get_member_trend(member_id, season_id)

        if not trend:
            return None

        total_days = sum(p["days"] for p in trend)
        total_contribution = sum(p["contribution_diff"] for p in trend)
        total_merit = sum(p["merit_diff"] for p in trend)
        total_assist = sum(p["assist_diff"] for p in trend)
        total_donation = sum(p["donation_diff"] for p in trend)
        total_power_change = sum(p["power_diff"] for p in trend)

        latest = trend[-1]
        first = trend[0]

        return {
            "period_count": len(trend),
            "total_days": total_days,
            "total_contribution": total_contribution,
            "total_merit": total_merit,
            "total_assist": total_assist,
            "total_donation": total_donation,
            "total_power_change": total_power_change,
            "avg_daily_contribution": round(total_contribution / total_days, 2)
            if total_days > 0
            else 0,
            "avg_daily_merit": round(total_merit / total_days, 2) if total_days > 0 else 0,
            "avg_daily_assist": round(total_assist / total_days, 2) if total_days > 0 else 0,
            "avg_daily_donation": round(total_donation / total_days, 2) if total_days > 0 else 0,
            "avg_power": round(sum(p["end_power"] for p in trend) / len(trend), 2) if trend else 0,
            "current_rank": latest["end_rank"],
            "rank_change_season": (first["start_rank"] - latest["end_rank"])
            if first["start_rank"]
            else None,
            "current_power": latest["end_power"],
            "current_group": latest["end_group"],
            "current_state": latest["end_state"],
        }
