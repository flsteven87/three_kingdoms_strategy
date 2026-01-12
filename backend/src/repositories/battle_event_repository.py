"""
Battle Event Repository

符合 CLAUDE.md 🔴:
- Inherits from SupabaseRepository
- Uses _handle_supabase_result() for all queries
"""

from datetime import datetime
from uuid import UUID

from src.models.battle_event import BattleEvent, BattleEventCreate, EventStatus
from src.repositories.base import SupabaseRepository


class BattleEventRepository(SupabaseRepository[BattleEvent]):
    """Repository for battle event data access"""

    def __init__(self):
        """Initialize battle event repository"""
        super().__init__(table_name="battle_events", model_class=BattleEvent)

    async def get_by_season(self, season_id: UUID) -> list[BattleEvent]:
        """
        Get all battle events for a season, ordered by created_at desc

        Args:
            season_id: Season UUID

        Returns:
            List of battle event instances

        符合 CLAUDE.md 🔴: Uses _handle_supabase_result()
        """
        result = await self._execute_async(
            lambda: self.client.from_(self.table_name)
            .select("*")
            .eq("season_id", str(season_id))
            .order("created_at", desc=True)
            .execute()
        )

        data = self._handle_supabase_result(result, allow_empty=True)
        return self._build_models(data)

    async def get_by_alliance(self, alliance_id: UUID) -> list[BattleEvent]:
        """
        Get all battle events for an alliance, ordered by created_at desc

        Args:
            alliance_id: Alliance UUID

        Returns:
            List of battle event instances

        符合 CLAUDE.md 🔴: Uses _handle_supabase_result()
        """
        result = await self._execute_async(
            lambda: self.client.from_(self.table_name)
            .select("*")
            .eq("alliance_id", str(alliance_id))
            .order("created_at", desc=True)
            .execute()
        )

        data = self._handle_supabase_result(result, allow_empty=True)
        return self._build_models(data)

    async def create(self, event_data: BattleEventCreate) -> BattleEvent:
        """
        Create new battle event

        Args:
            event_data: Battle event creation data

        Returns:
            Created battle event instance

        符合 CLAUDE.md 🔴: Uses _handle_supabase_result()
        """
        insert_data = event_data.model_dump(mode="json")
        result = await self._execute_async(
            lambda: self.client.from_(self.table_name).insert(insert_data).execute()
        )
        data = self._handle_supabase_result(result, expect_single=True)
        return self._build_model(data)

    async def update_status(self, event_id: UUID, status: EventStatus) -> BattleEvent:
        """
        Update event status

        Args:
            event_id: Event UUID
            status: New status

        Returns:
            Updated battle event instance

        符合 CLAUDE.md 🔴: Uses _handle_supabase_result()
        """
        result = await self._execute_async(
            lambda: self.client.from_(self.table_name)
            .update({"status": status.value})
            .eq("id", str(event_id))
            .execute()
        )
        data = self._handle_supabase_result(result, expect_single=True)
        return self._build_model(data)

    async def update_upload_ids(
        self,
        event_id: UUID,
        before_upload_id: UUID | None = None,
        after_upload_id: UUID | None = None,
    ) -> BattleEvent:
        """
        Update event upload IDs

        Args:
            event_id: Event UUID
            before_upload_id: Before snapshot upload ID
            after_upload_id: After snapshot upload ID

        Returns:
            Updated battle event instance

        符合 CLAUDE.md 🔴: Uses _handle_supabase_result()
        """
        update_data: dict = {}
        if before_upload_id is not None:
            update_data["before_upload_id"] = str(before_upload_id)
        if after_upload_id is not None:
            update_data["after_upload_id"] = str(after_upload_id)

        if not update_data:
            event = await self.get_by_id(event_id)
            if not event:
                raise ValueError(f"Event {event_id} not found")
            return event

        result = await self._execute_async(
            lambda: self.client.from_(self.table_name)
            .update(update_data)
            .eq("id", str(event_id))
            .execute()
        )
        data = self._handle_supabase_result(result, expect_single=True)
        return self._build_model(data)

    async def update_event_times(
        self,
        event_id: UUID,
        event_start: datetime | None = None,
        event_end: datetime | None = None,
    ) -> BattleEvent:
        """
        Update event start and end times

        Args:
            event_id: Event UUID
            event_start: Event start timestamp (from before snapshot)
            event_end: Event end timestamp (from after snapshot)

        Returns:
            Updated battle event instance

        符合 CLAUDE.md 🔴: Uses _handle_supabase_result()
        """
        update_data: dict = {}
        if event_start is not None:
            update_data["event_start"] = event_start.isoformat()
        if event_end is not None:
            update_data["event_end"] = event_end.isoformat()

        if not update_data:
            event = await self.get_by_id(event_id)
            if not event:
                raise ValueError(f"Event {event_id} not found")
            return event

        result = await self._execute_async(
            lambda: self.client.from_(self.table_name)
            .update(update_data)
            .eq("id", str(event_id))
            .execute()
        )
        data = self._handle_supabase_result(result, expect_single=True)
        return self._build_model(data)

    async def delete(self, event_id: UUID) -> bool:
        """
        Delete a battle event

        Args:
            event_id: Event UUID

        Returns:
            True if deleted successfully

        符合 CLAUDE.md 🔴: Uses _handle_supabase_result()
        """
        result = await self._execute_async(
            lambda: self.client.from_(self.table_name)
            .delete()
            .eq("id", str(event_id))
            .execute()
        )
        self._handle_supabase_result(result, allow_empty=True)
        return True

    async def get_latest_completed_event(self, alliance_id: UUID) -> BattleEvent | None:
        """
        Get the most recent completed battle event for an alliance

        Args:
            alliance_id: Alliance UUID

        Returns:
            Latest completed battle event or None if not found

        符合 CLAUDE.md 🔴: Uses _handle_supabase_result()
        """
        result = await self._execute_async(
            lambda: self.client.from_(self.table_name)
            .select("*")
            .eq("alliance_id", str(alliance_id))
            .eq("status", EventStatus.COMPLETED.value)
            .order("event_end", desc=True)
            .limit(1)
            .execute()
        )

        data = self._handle_supabase_result(result, allow_empty=True)
        if not data:
            return None
        return self._build_model(data[0])
