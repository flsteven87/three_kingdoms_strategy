"""
Battle Event Metrics Repository

符合 CLAUDE.md 🔴:
- Inherits from SupabaseRepository
- Uses _handle_supabase_result() for all queries
"""

from uuid import UUID

from src.models.battle_event_metrics import (
    BattleEventMetrics,
    BattleEventMetricsCreate,
    BattleEventMetricsWithMember,
)
from src.repositories.base import SupabaseRepository


class BattleEventMetricsRepository(SupabaseRepository[BattleEventMetrics]):
    """Repository for battle event metrics data access"""

    def __init__(self):
        """Initialize battle event metrics repository"""
        super().__init__(table_name="battle_event_metrics", model_class=BattleEventMetrics)

    async def get_by_event(self, event_id: UUID) -> list[BattleEventMetrics]:
        """
        Get all metrics for a battle event

        Args:
            event_id: Battle event UUID

        Returns:
            List of metrics instances

        符合 CLAUDE.md 🔴: Uses _handle_supabase_result()
        """
        result = await self._execute_async(
            lambda: self.client.from_(self.table_name)
            .select("*")
            .eq("event_id", str(event_id))
            .order("merit_diff", desc=True)
            .execute()
        )

        data = self._handle_supabase_result(result, allow_empty=True)
        return self._build_models(data)

    async def get_by_event_with_member(self, event_id: UUID) -> list[BattleEventMetricsWithMember]:
        """
        Get all metrics for a battle event with member info

        Args:
            event_id: Battle event UUID

        Returns:
            List of metrics with member info

        符合 CLAUDE.md 🔴: Uses _handle_supabase_result()
        """
        result = await self._execute_async(
            lambda: self.client.from_(self.table_name)
            .select("*, members!inner(name)")
            .eq("event_id", str(event_id))
            .order("merit_diff", desc=True)
            .execute()
        )

        data = self._handle_supabase_result(result, allow_empty=True)

        # Flatten member name
        metrics_list: list[BattleEventMetricsWithMember] = []
        for row in data:
            member_data = row.pop("members", {})
            row["member_name"] = member_data.get("name", "Unknown")
            row["group_name"] = None  # Group comes from snapshot, not member
            metrics_list.append(BattleEventMetricsWithMember(**row))

        return metrics_list

    async def get_by_event_with_member_and_group(
        self, event_id: UUID
    ) -> list[BattleEventMetricsWithMember]:
        """
        Get all metrics for a battle event with member and group info from end snapshot

        Args:
            event_id: Battle event UUID

        Returns:
            List of metrics with member and group info

        符合 CLAUDE.md 🔴: Uses _handle_supabase_result()
        """
        result = await self._execute_async(
            lambda: self.client.from_(self.table_name)
            .select("*, members!inner(name), member_snapshots!end_snapshot_id(group_name)")
            .eq("event_id", str(event_id))
            .order("merit_diff", desc=True)
            .execute()
        )

        data = self._handle_supabase_result(result, allow_empty=True)

        metrics_list: list[BattleEventMetricsWithMember] = []
        for row in data:
            member_data = row.pop("members", {})
            snapshot_data = row.pop("member_snapshots", {})
            row["member_name"] = member_data.get("name", "Unknown")
            row["group_name"] = snapshot_data.get("group_name") if snapshot_data else None
            metrics_list.append(BattleEventMetricsWithMember(**row))

        return metrics_list

    async def create_batch(
        self, metrics_list: list[BattleEventMetricsCreate]
    ) -> list[BattleEventMetrics]:
        """
        Create multiple metrics records in batch

        Args:
            metrics_list: List of metrics creation data

        Returns:
            List of created metrics instances

        符合 CLAUDE.md 🔴: Uses _handle_supabase_result()
        """
        if not metrics_list:
            return []

        insert_data = [m.model_dump(mode="json") for m in metrics_list]
        result = await self._execute_async(
            lambda: self.client.from_(self.table_name).insert(insert_data).execute()
        )
        data = self._handle_supabase_result(result, allow_empty=True)
        return self._build_models(data)

    async def delete_by_event(self, event_id: UUID) -> bool:
        """
        Delete all metrics for a battle event

        Args:
            event_id: Battle event UUID

        Returns:
            True if deleted successfully

        符合 CLAUDE.md 🔴: Uses _handle_supabase_result()
        """
        result = await self._execute_async(
            lambda: self.client.from_(self.table_name)
            .delete()
            .eq("event_id", str(event_id))
            .execute()
        )
        self._handle_supabase_result(result, allow_empty=True)
        return True

    async def get_by_member(self, member_id: UUID) -> list[BattleEventMetrics]:
        """
        Get all metrics for a member across events

        Args:
            member_id: Member UUID

        Returns:
            List of metrics instances

        符合 CLAUDE.md 🔴: Uses _handle_supabase_result()
        """
        result = await self._execute_async(
            lambda: self.client.from_(self.table_name)
            .select("*")
            .eq("member_id", str(member_id))
            .order("created_at", desc=True)
            .execute()
        )

        data = self._handle_supabase_result(result, allow_empty=True)
        return self._build_models(data)

    async def get_by_events_with_member_and_group(
        self, event_ids: list[UUID]
    ) -> dict[UUID, list[BattleEventMetricsWithMember]]:
        """
        Get all metrics for multiple events with member and group info.

        Optimized batch query to avoid N+1 problem.

        Args:
            event_ids: List of event UUIDs

        Returns:
            Dict mapping event_id to list of metrics

        符合 CLAUDE.md 🔴: Uses _handle_supabase_result()
        """
        if not event_ids:
            return {}

        event_id_strs = [str(eid) for eid in event_ids]

        result = await self._execute_async(
            lambda: self.client.from_(self.table_name)
            .select("*, members!inner(name), member_snapshots!end_snapshot_id(group_name)")
            .in_("event_id", event_id_strs)
            .order("merit_diff", desc=True)
            .execute()
        )

        data = self._handle_supabase_result(result, allow_empty=True)

        # Group by event_id
        grouped: dict[UUID, list[BattleEventMetricsWithMember]] = {eid: [] for eid in event_ids}
        for row in data:
            member_data = row.pop("members", {})
            snapshot_data = row.pop("member_snapshots", {})
            row["member_name"] = member_data.get("name", "Unknown")
            row["group_name"] = snapshot_data.get("group_name") if snapshot_data else None

            event_id = UUID(row["event_id"])
            if event_id in grouped:
                grouped[event_id].append(BattleEventMetricsWithMember(**row))

        return grouped

    async def get_user_metrics_for_events(
        self, event_ids: list[UUID], member_id: UUID
    ) -> dict[UUID, BattleEventMetrics | None]:
        """
        Get user's metrics for multiple events in a single query.

        Args:
            event_ids: List of event UUIDs
            member_id: Member UUID to lookup

        Returns:
            Dict mapping event_id -> BattleEventMetrics (or None if not found)

        符合 CLAUDE.md 🔴: Uses _handle_supabase_result()
        """
        if not event_ids:
            return {}

        result = await self._execute_async(
            lambda: self.client.from_(self.table_name)
            .select("*")
            .in_("event_id", [str(eid) for eid in event_ids])
            .eq("member_id", str(member_id))
            .execute()
        )

        data = self._handle_supabase_result(result, allow_empty=True)
        metrics_list = self._build_models(data)

        return {m.event_id: m for m in metrics_list}
