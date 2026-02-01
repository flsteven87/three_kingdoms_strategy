"""
Battle Event Repository

符合 CLAUDE.md 🔴:
- Inherits from SupabaseRepository
- Uses _handle_supabase_result() for all queries
"""

from datetime import datetime
from uuid import UUID

from src.models.battle_event import BattleEvent, BattleEventCreate, BattleEventUpdate, EventStatus
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

    async def update(self, event_id: UUID, update_data: BattleEventUpdate) -> BattleEvent:
        """
        Update battle event fields

        Args:
            event_id: Event UUID
            update_data: Fields to update (only non-None fields will be updated)

        Returns:
            Updated battle event instance

        符合 CLAUDE.md 🔴: Uses _handle_supabase_result()
        """
        # Only include non-None fields in the update
        data_dict = update_data.model_dump(mode="json", exclude_none=True)

        if not data_dict:
            # No fields to update, return existing event
            event = await self.get_by_id(event_id)
            if not event:
                raise ValueError(f"Event {event_id} not found")
            return event

        result = await self._execute_async(
            lambda: self.client.from_(self.table_name)
            .update(data_dict)
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
            lambda: self.client.from_(self.table_name).delete().eq("id", str(event_id)).execute()
        )
        self._handle_supabase_result(result, allow_empty=True)
        return True

    async def get_latest_completed_event(
        self, alliance_id: UUID, season_id: UUID | None = None
    ) -> BattleEvent | None:
        """
        Get the most recent completed battle event for an alliance

        Args:
            alliance_id: Alliance UUID
            season_id: Optional season UUID to filter by current season

        Returns:
            Latest completed battle event or None if not found

        符合 CLAUDE.md 🔴: Uses _handle_supabase_result()
        """
        query = (
            self.client.from_(self.table_name)
            .select("*")
            .eq("alliance_id", str(alliance_id))
            .eq("status", EventStatus.COMPLETED.value)
        )

        if season_id:
            query = query.eq("season_id", str(season_id))

        result = await self._execute_async(
            lambda: query.order("event_end", desc=True).limit(1).execute()
        )

        data = self._handle_supabase_result(result, allow_empty=True)
        if not data:
            return None
        return self._build_model(data[0])

    async def get_recent_completed_events(
        self, alliance_id: UUID, season_id: UUID | None = None, event_types: list[str] | None = None, limit: int = 5
    ) -> list[BattleEvent]:
        """
        Get the most recent completed battle events for an alliance.

        Args:
            alliance_id: Alliance UUID
            season_id: Optional season UUID to filter by current season
            event_types: Optional list of event types to filter by (e.g., ['battle', 'siege'])
            limit: Maximum number of events to return (default 5)

        Returns:
            List of completed battle events, ordered by event_end desc

        符合 CLAUDE.md 🔴: Uses _handle_supabase_result()
        """
        query = (
            self.client.from_(self.table_name)
            .select("*")
            .eq("alliance_id", str(alliance_id))
            .eq("status", EventStatus.COMPLETED.value)
        )

        if season_id:
            query = query.eq("season_id", str(season_id))

        if event_types:
            query = query.in_("event_type", event_types)

        result = await self._execute_async(
            lambda: query.order("event_start", desc=True).limit(limit).execute()
        )

        data = self._handle_supabase_result(result, allow_empty=True)
        return self._build_models(data)

    async def get_event_by_name(
        self, alliance_id: UUID, name: str, season_id: UUID | None = None
    ) -> BattleEvent | None:
        """
        Get a completed battle event by exact name match.

        Args:
            alliance_id: Alliance UUID
            name: Exact event name to match
            season_id: Optional season UUID to filter by current season

        Returns:
            Battle event if found, None otherwise

        符合 CLAUDE.md 🔴: Uses _handle_supabase_result()
        """
        query = (
            self.client.from_(self.table_name)
            .select("*")
            .eq("alliance_id", str(alliance_id))
            .eq("status", EventStatus.COMPLETED.value)
            .eq("name", name)
        )

        if season_id:
            query = query.eq("season_id", str(season_id))

        result = await self._execute_async(lambda: query.limit(1).execute())

        data = self._handle_supabase_result(result, allow_empty=True)
        if not data:
            return None
        return self._build_model(data[0])

    async def get_by_ids(self, event_ids: list[UUID]) -> list[BattleEvent]:
        """
        Get multiple events by IDs.

        Args:
            event_ids: List of event UUIDs

        Returns:
            List of events (may be fewer than requested if some not found)

        符合 CLAUDE.md 🔴: Uses _handle_supabase_result()
        """
        if not event_ids:
            return []

        event_id_strs = [str(eid) for eid in event_ids]

        result = await self._execute_async(
            lambda: self.client.from_(self.table_name)
            .select("*")
            .in_("id", event_id_strs)
            .execute()
        )

        data = self._handle_supabase_result(result, allow_empty=True)
        return self._build_models(data)
