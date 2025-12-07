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
        Get alliance average and median metrics for multiple periods in one query.

        Args:
            period_ids: List of Period UUIDs

        Returns:
            Dict mapping period_id to average and median metrics

        符合 CLAUDE.md 🔴: Uses _handle_supabase_result()
        """
        if not period_ids:
            return {}

        from collections import defaultdict
        from decimal import Decimal
        from statistics import median

        # Query all metrics for these periods
        result = (
            self.client.from_(self.table_name)
            .select("period_id, daily_contribution, daily_merit, daily_assist, daily_donation, end_power")
            .in_("period_id", [str(pid) for pid in period_ids])
            .execute()
        )

        data = self._handle_supabase_result(result, allow_empty=True)

        # Group by period_id and calculate averages and medians
        period_metrics: dict[str, list[dict]] = defaultdict(list)
        for row in data:
            period_metrics[row["period_id"]].append(row)

        averages: dict[UUID, dict] = {}
        for period_id_str, metrics_list in period_metrics.items():
            count = len(metrics_list)
            if count == 0:
                continue

            period_uuid = UUID(period_id_str)

            # Extract values for median calculation
            contributions = [float(Decimal(str(m["daily_contribution"]))) for m in metrics_list]
            merits = [float(Decimal(str(m["daily_merit"]))) for m in metrics_list]
            assists = [float(Decimal(str(m["daily_assist"]))) for m in metrics_list]
            donations = [float(Decimal(str(m["daily_donation"]))) for m in metrics_list]
            powers = [float(Decimal(str(m["end_power"]))) for m in metrics_list]

            averages[period_uuid] = {
                "member_count": count,
                # Averages
                "avg_daily_contribution": sum(contributions) / count,
                "avg_daily_merit": sum(merits) / count,
                "avg_daily_assist": sum(assists) / count,
                "avg_daily_donation": sum(donations) / count,
                "avg_power": sum(powers) / count,
                # Medians
                "median_daily_contribution": median(contributions),
                "median_daily_merit": median(merits),
                "median_daily_assist": median(assists),
                "median_daily_donation": median(donations),
                "median_power": median(powers),
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

    async def get_metrics_by_group_for_period(
        self, period_id: UUID, group_name: str
    ) -> list[dict]:
        """
        Get all metrics for members in a specific group for a period.

        Args:
            period_id: Period UUID
            group_name: Group name to filter by

        Returns:
            List of metrics with member info

        符合 CLAUDE.md 🔴: Uses _handle_supabase_result()
        """
        result = (
            self.client.from_(self.table_name)
            .select("*, members(id, name)")
            .eq("period_id", str(period_id))
            .eq("end_group", group_name)
            .order("daily_merit", desc=True)
            .execute()
        )

        data = self._handle_supabase_result(result, allow_empty=True)

        # Flatten member info
        for row in data:
            member_data = row.pop("members", {})
            row["member_id"] = member_data.get("id", "")
            row["member_name"] = member_data.get("name", "Unknown")

        return data

    async def get_group_metrics_by_season(
        self, season_id: UUID, group_name: str
    ) -> list[dict]:
        """
        Get group metrics across all periods in a season.

        Args:
            season_id: Season UUID
            group_name: Group name to filter by

        Returns:
            List of dicts with period info and aggregated group metrics

        符合 CLAUDE.md 🔴: Uses _handle_supabase_result()
        """
        from collections import defaultdict
        from decimal import Decimal

        # Join with periods to get period info and filter by season
        result = (
            self.client.from_(self.table_name)
            .select(
                "period_id, end_group, end_rank, daily_merit, daily_assist, "
                "periods(period_number, start_date, end_date, season_id)"
            )
            .eq("end_group", group_name)
            .execute()
        )

        data = self._handle_supabase_result(result, allow_empty=True)

        # Filter by season_id and group by period
        period_groups: dict[str, list[dict]] = defaultdict(list)
        period_info: dict[str, dict] = {}

        for row in data:
            periods_data = row.get("periods", {})
            if periods_data and str(periods_data.get("season_id")) == str(season_id):
                period_id = row["period_id"]
                period_groups[period_id].append(row)
                if period_id not in period_info:
                    period_info[period_id] = periods_data

        # Calculate aggregates per period
        results = []
        for period_id, metrics in period_groups.items():
            info = period_info[period_id]
            count = len(metrics)

            ranks = [m["end_rank"] for m in metrics]
            merits = [float(Decimal(str(m["daily_merit"]))) for m in metrics]
            assists = [float(Decimal(str(m["daily_assist"]))) for m in metrics]

            results.append({
                "period_id": period_id,
                "period_number": info["period_number"],
                "start_date": info["start_date"],
                "end_date": info["end_date"],
                "member_count": count,
                "avg_rank": sum(ranks) / count,
                "avg_merit": sum(merits) / count,
                "avg_assist": sum(assists) / count,
            })

        # Sort by period_number
        return sorted(results, key=lambda x: x["period_number"])

    async def get_all_groups_for_period(self, period_id: UUID) -> list[dict]:
        """
        Get unique groups and their member counts for a period.

        Args:
            period_id: Period UUID

        Returns:
            List of dicts with group name and member count

        符合 CLAUDE.md 🔴: Uses _handle_supabase_result()
        """
        from collections import Counter

        result = (
            self.client.from_(self.table_name)
            .select("end_group")
            .eq("period_id", str(period_id))
            .execute()
        )

        data = self._handle_supabase_result(result, allow_empty=True)

        # Count members per group
        group_counts = Counter(
            row.get("end_group") or "未分組" for row in data
        )

        return [
            {"name": name, "member_count": count}
            for name, count in sorted(group_counts.items(), key=lambda x: -x[1])
        ]
