"""
Analytics Service

Provides member performance analytics data aggregation and calculations.

Follows CLAUDE.md:
- Service layer orchestrates repositories and business logic
- NO direct database calls (delegates to repositories)
"""

from uuid import UUID

from src.repositories.member_period_metrics_repository import MemberPeriodMetricsRepository
from src.repositories.member_repository import MemberRepository
from src.repositories.period_repository import PeriodRepository


class AnalyticsService:
    """Service for member analytics and performance data"""

    def __init__(self):
        """Initialize analytics service with required repositories"""
        self._member_repo = MemberRepository()
        self._metrics_repo = MemberPeriodMetricsRepository()
        self._period_repo = PeriodRepository()

    async def get_members_for_analytics(
        self, alliance_id: UUID, active_only: bool = True
    ) -> list[dict]:
        """
        Get all members for analytics member selector.

        Args:
            alliance_id: Alliance UUID
            active_only: Only return active members

        Returns:
            List of member dicts with id and name
        """
        members = await self._member_repo.get_by_alliance(alliance_id, active_only)
        return [
            {
                "id": str(m.id),
                "name": m.name,
                "is_active": m.is_active,
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
                "period_label": f"{period.start_date.strftime('%m/%d')}-{period.end_date.strftime('%m/%d')}",
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
                "alliance_member_count": period_avg.get("member_count", 0),
            })

        # Sort by period_number
        result.sort(key=lambda x: x["period_number"])
        return result

    async def get_period_alliance_averages(self, period_id: UUID) -> dict:
        """
        Calculate alliance average metrics for a specific period.

        Args:
            period_id: Period UUID

        Returns:
            Dict with average daily metrics and member count
        """
        metrics = await self._metrics_repo.get_by_period(period_id)

        if not metrics:
            return {
                "member_count": 0,
                "avg_daily_contribution": 0,
                "avg_daily_merit": 0,
                "avg_daily_assist": 0,
                "avg_daily_donation": 0,
            }

        count = len(metrics)
        total_contribution = sum(float(m.daily_contribution) for m in metrics)
        total_merit = sum(float(m.daily_merit) for m in metrics)
        total_assist = sum(float(m.daily_assist) for m in metrics)
        total_donation = sum(float(m.daily_donation) for m in metrics)

        return {
            "member_count": count,
            "avg_daily_contribution": round(total_contribution / count, 2),
            "avg_daily_merit": round(total_merit / count, 2),
            "avg_daily_assist": round(total_assist / count, 2),
            "avg_daily_donation": round(total_donation / count, 2),
        }

    async def get_member_with_comparison(
        self, member_id: UUID, period_id: UUID
    ) -> dict | None:
        """
        Get member metrics for a period with alliance averages for comparison.

        Args:
            member_id: Member UUID
            period_id: Period UUID

        Returns:
            Dict with member metrics and alliance averages, or None if not found
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

        # Calculate alliance averages
        count = len(all_metrics)
        avg_contribution = sum(float(m.daily_contribution) for m in all_metrics) / count
        avg_merit = sum(float(m.daily_merit) for m in all_metrics) / count
        avg_assist = sum(float(m.daily_assist) for m in all_metrics) / count
        avg_donation = sum(float(m.daily_donation) for m in all_metrics) / count

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
                "daily_contribution": round(avg_contribution, 2),
                "daily_merit": round(avg_merit, 2),
                "daily_assist": round(avg_assist, 2),
                "daily_donation": round(avg_donation, 2),
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
                "period_label": f"{period.start_date.strftime('%m/%d')}-{period.end_date.strftime('%m/%d')}",
                **avg,
            })

        return result
