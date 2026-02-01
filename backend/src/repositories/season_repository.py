"""
Season Repository

符合 CLAUDE.md 🔴:
- Inherits from SupabaseRepository
- Uses _handle_supabase_result() for all queries
"""

from uuid import UUID

from src.models.season import Season
from src.repositories.base import SupabaseRepository


class SeasonRepository(SupabaseRepository[Season]):
    """Repository for season data access"""

    def __init__(self):
        """Initialize season repository"""
        super().__init__(table_name="seasons", model_class=Season)

    async def get_by_alliance(
        self, alliance_id: UUID, activated_only: bool = False
    ) -> list[Season]:
        """
        Get seasons by alliance ID

        Args:
            alliance_id: Alliance UUID
            activated_only: Only return activated seasons (not draft/completed)

        Returns:
            List of season instances

        符合 CLAUDE.md 🔴: Uses _handle_supabase_result()
        """
        query = self.client.from_(self.table_name).select("*").eq("alliance_id", str(alliance_id))

        if activated_only:
            query = query.eq("activation_status", "activated")

        result = await self._execute_async(lambda: query.order("start_date", desc=True).execute())

        data = self._handle_supabase_result(result, allow_empty=True)

        return self._build_models(data)

    async def get_current_season(self, alliance_id: UUID) -> Season | None:
        """
        Get the current (selected) season for an alliance

        Args:
            alliance_id: Alliance UUID

        Returns:
            Current season or None if not found

        符合 CLAUDE.md 🔴: Uses _handle_supabase_result()
        """
        result = await self._execute_async(
            lambda: self.client.from_(self.table_name)
            .select("*")
            .eq("alliance_id", str(alliance_id))
            .eq("is_current", True)
            .order("start_date", desc=True)
            .limit(1)
            .execute()
        )

        data = self._handle_supabase_result(result, allow_empty=True, expect_single=True)

        if not data:
            return None

        return self._build_model(data)

    async def create(self, season_data: dict) -> Season:
        """
        Create new season

        Args:
            season_data: Season data dictionary

        Returns:
            Created season instance

        符合 CLAUDE.md 🔴: Uses _handle_supabase_result()
        """
        result = await self._execute_async(
            lambda: self.client.from_(self.table_name).insert(season_data).execute()
        )

        data = self._handle_supabase_result(result, expect_single=True)

        return self._build_model(data)

    async def update(self, season_id: UUID, season_data: dict) -> Season:
        """
        Update season

        Args:
            season_id: Season UUID
            season_data: Season data dictionary

        Returns:
            Updated season instance

        符合 CLAUDE.md 🔴: Uses _handle_supabase_result()
        """
        result = await self._execute_async(
            lambda: self.client.from_(self.table_name)
            .update(season_data)
            .eq("id", str(season_id))
            .execute()
        )

        data = self._handle_supabase_result(result, expect_single=True)

        return self._build_model(data)

    async def delete(self, season_id: UUID) -> bool:
        """
        Delete season (hard delete)

        Args:
            season_id: Season UUID

        Returns:
            True if deleted successfully

        符合 CLAUDE.md: Hard delete only
        """
        result = await self._execute_async(
            lambda: self.client.from_(self.table_name).delete().eq("id", str(season_id)).execute()
        )

        self._handle_supabase_result(result, allow_empty=True)

        return True

    async def get_activated_seasons_count(self, alliance_id: UUID) -> int:
        """
        Get count of activated or completed seasons for an alliance.
        Used to determine if trial is available.

        Args:
            alliance_id: Alliance UUID

        Returns:
            Count of activated/completed seasons
        """
        result = await self._execute_async(
            lambda: self.client.from_(self.table_name)
            .select("id", count="exact")
            .eq("alliance_id", str(alliance_id))
            .in_("activation_status", ["activated", "completed"])
            .execute()
        )
        return result.count or 0

    async def get_trial_season(self, alliance_id: UUID) -> Season | None:
        """
        Get the trial season for an alliance (if exists).
        There should be at most one trial season per alliance.

        Args:
            alliance_id: Alliance UUID

        Returns:
            Trial season or None if not found
        """
        result = await self._execute_async(
            lambda: self.client.from_(self.table_name)
            .select("*")
            .eq("alliance_id", str(alliance_id))
            .eq("is_trial", True)
            .limit(1)
            .execute()
        )
        data = self._handle_supabase_result(result, allow_empty=True)
        return self._build_model(data[0]) if data else None

    async def unset_all_current_by_alliance(self, alliance_id: UUID) -> int:
        """
        Unset is_current for all seasons in an alliance (single SQL query).

        Performance: Replaces loop-based updates with single batch update.

        Args:
            alliance_id: Alliance UUID

        Returns:
            Number of seasons updated

        符合 CLAUDE.md 🔴: Uses _handle_supabase_result()
        """
        result = await self._execute_async(
            lambda: self.client.from_(self.table_name)
            .update({"is_current": False})
            .eq("alliance_id", str(alliance_id))
            .eq("is_current", True)
            .execute()
        )
        data = self._handle_supabase_result(result, allow_empty=True)
        return len(data) if data else 0
