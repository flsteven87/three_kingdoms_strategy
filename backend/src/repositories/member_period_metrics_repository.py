"""
Member Period Metrics Repository

符合 CLAUDE.md 🔴:
- Inherits from SupabaseRepository
- Uses _handle_supabase_result() for all queries
"""

from uuid import UUID

from src.models.member_period_metrics import MemberPeriodMetrics
from src.repositories.base import SupabaseRepository


class MemberPeriodMetricsRepository(SupabaseRepository[MemberPeriodMetrics]):
    """Repository for member period metrics data access"""

    def __init__(self):
        """Initialize member period metrics repository"""
        super().__init__(table_name="member_period_metrics", model_class=MemberPeriodMetrics)

    async def get_by_period(self, period_id: UUID) -> list[MemberPeriodMetrics]:
        """
        Get all metrics for a period

        Args:
            period_id: Period UUID

        Returns:
            List of member period metrics instances

        符合 CLAUDE.md 🔴: Uses _handle_supabase_result()
        """
        result = (
            self.client.from_(self.table_name)
            .select("*")
            .eq("period_id", str(period_id))
            .order("daily_contribution", desc=True)
            .execute()
        )

        data = self._handle_supabase_result(result, allow_empty=True)
        return self._build_models(data)

    async def get_by_period_with_member(self, period_id: UUID) -> list[dict]:
        """
        Get all metrics for a period with member names (for display)

        Args:
            period_id: Period UUID

        Returns:
            List of metrics with member_name field

        符合 CLAUDE.md 🔴: Uses _handle_supabase_result()
        """
        result = (
            self.client.from_(self.table_name)
            .select("*, members(name)")
            .eq("period_id", str(period_id))
            .order("daily_contribution", desc=True)
            .execute()
        )

        data = self._handle_supabase_result(result, allow_empty=True)

        # Flatten member name into the result
        for row in data:
            member_data = row.pop("members", {})
            row["member_name"] = member_data.get("name", "Unknown")

        return data

    async def get_by_member(
        self, member_id: UUID, season_id: UUID | None = None
    ) -> list[MemberPeriodMetrics]:
        """
        Get all period metrics for a member (for trend analysis)

        Args:
            member_id: Member UUID
            season_id: Optional season filter

        Returns:
            List of member period metrics ordered by period

        符合 CLAUDE.md 🔴: Uses _handle_supabase_result()
        """
        query = (
            self.client.from_(self.table_name)
            .select("*, periods(period_number, start_date, end_date)")
            .eq("member_id", str(member_id))
        )

        if season_id:
            query = query.eq("periods.season_id", str(season_id))

        result = query.order("created_at").execute()

        data = self._handle_supabase_result(result, allow_empty=True)
        return self._build_models(data)

    async def create_batch(self, metrics_data: list[dict]) -> list[MemberPeriodMetrics]:
        """
        Create multiple period metrics in batch

        Args:
            metrics_data: List of metrics data dictionaries

        Returns:
            List of created metrics instances

        符合 CLAUDE.md 🔴: Uses _handle_supabase_result()
        """
        if not metrics_data:
            return []

        result = self.client.from_(self.table_name).insert(metrics_data).execute()
        data = self._handle_supabase_result(result, allow_empty=False)
        return self._build_models(data)

    async def delete_by_period(self, period_id: UUID) -> bool:
        """
        Delete all metrics for a period (used during recalculation)

        Args:
            period_id: Period UUID

        Returns:
            True if deleted successfully

        符合 CLAUDE.md 🔴: Uses _handle_supabase_result()
        """
        result = (
            self.client.from_(self.table_name)
            .delete()
            .eq("period_id", str(period_id))
            .execute()
        )
        self._handle_supabase_result(result, allow_empty=True)
        return True

    async def delete_by_alliance(self, alliance_id: UUID) -> bool:
        """
        Delete all metrics for an alliance (used during full recalculation)

        Args:
            alliance_id: Alliance UUID

        Returns:
            True if deleted successfully

        符合 CLAUDE.md 🔴: Uses _handle_supabase_result()
        """
        result = (
            self.client.from_(self.table_name)
            .delete()
            .eq("alliance_id", str(alliance_id))
            .execute()
        )
        self._handle_supabase_result(result, allow_empty=True)
        return True

    async def get_periods_averages_batch(
        self, period_ids: list[UUID]
    ) -> dict[UUID, dict]:
        """
        Get alliance average metrics for multiple periods in one query.

        Args:
            period_ids: List of Period UUIDs

        Returns:
            Dict mapping period_id to average metrics

        符合 CLAUDE.md 🔴: Uses _handle_supabase_result()
        """
        if not period_ids:
            return {}

        from collections import defaultdict
        from decimal import Decimal

        # Query all metrics for these periods
        result = (
            self.client.from_(self.table_name)
            .select("period_id, daily_contribution, daily_merit, daily_assist, daily_donation")
            .in_("period_id", [str(pid) for pid in period_ids])
            .execute()
        )

        data = self._handle_supabase_result(result, allow_empty=True)

        # Group by period_id and calculate averages
        period_metrics: dict[str, list[dict]] = defaultdict(list)
        for row in data:
            period_metrics[row["period_id"]].append(row)

        averages: dict[UUID, dict] = {}
        for period_id_str, metrics_list in period_metrics.items():
            count = len(metrics_list)
            if count == 0:
                continue

            period_uuid = UUID(period_id_str)
            averages[period_uuid] = {
                "member_count": count,
                "avg_daily_contribution": float(
                    sum(Decimal(str(m["daily_contribution"])) for m in metrics_list) / count
                ),
                "avg_daily_merit": float(
                    sum(Decimal(str(m["daily_merit"])) for m in metrics_list) / count
                ),
                "avg_daily_assist": float(
                    sum(Decimal(str(m["daily_assist"])) for m in metrics_list) / count
                ),
                "avg_daily_donation": float(
                    sum(Decimal(str(m["daily_donation"])) for m in metrics_list) / count
                ),
            }

        return averages

    async def get_group_averages(self, period_id: UUID) -> list[dict]:
        """
        Get average metrics by group for a period

        Args:
            period_id: Period UUID

        Returns:
            List of group averages

        Note: This is a simplified version. For complex aggregations,
              consider using a Postgres function.
        """
        result = (
            self.client.from_(self.table_name)
            .select("end_group, daily_contribution, daily_merit, daily_assist, daily_donation")
            .eq("period_id", str(period_id))
            .execute()
        )

        data = self._handle_supabase_result(result, allow_empty=True)

        # Group by end_group and calculate averages in Python
        # For production, consider using a Postgres view or function
        from collections import defaultdict
        from decimal import Decimal

        groups: dict[str, list[dict]] = defaultdict(list)
        for row in data:
            group_name = row.get("end_group") or "未分組"
            groups[group_name].append(row)

        averages = []
        for group_name, members in groups.items():
            count = len(members)
            averages.append({
                "group_name": group_name,
                "member_count": count,
                "avg_daily_contribution": sum(
                    Decimal(str(m["daily_contribution"])) for m in members
                ) / count,
                "avg_daily_merit": sum(
                    Decimal(str(m["daily_merit"])) for m in members
                ) / count,
                "avg_daily_assist": sum(
                    Decimal(str(m["daily_assist"])) for m in members
                ) / count,
                "avg_daily_donation": sum(
                    Decimal(str(m["daily_donation"])) for m in members
                ) / count,
            })

        return sorted(averages, key=lambda x: x["avg_daily_contribution"], reverse=True)
