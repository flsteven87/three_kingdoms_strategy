"""
Donation Repository

符合 CLAUDE.md 🔴:
- Inherits from SupabaseRepository
- Uses _handle_supabase_result() for all queries
"""

from uuid import UUID

from src.models.donation import Donation, DonationCreate
from src.repositories.base import SupabaseRepository


class DonationRepository(SupabaseRepository[Donation]):
    """Repository for donation event data access"""

    def __init__(self):
        """Initialize donation repository"""
        super().__init__(table_name="donation_events", model_class=Donation)

    async def get_by_season(self, season_id: UUID) -> list[Donation]:
        """
        Get all donation events for a season

        Args:
            season_id: Season UUID

        Returns:
            List of donation event instances
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

    async def get_by_alliance_and_season(
        self, alliance_id: UUID, season_id: UUID
    ) -> list[Donation]:
        """
        Get all donation events for an alliance in a season

        Args:
            alliance_id: Alliance UUID
            season_id: Season UUID

        Returns:
            List of donation event instances
        """
        result = await self._execute_async(
            lambda: self.client.from_(self.table_name)
            .select("*")
            .eq("alliance_id", str(alliance_id))
            .eq("season_id", str(season_id))
            .order("created_at", desc=True)
            .execute()
        )

        data = self._handle_supabase_result(result, allow_empty=True)
        return self._build_models(data)

    async def create(self, donation_data: DonationCreate) -> Donation:
        """
        Create new donation event

        Args:
            donation_data: Donation creation data

        Returns:
            Created donation instance
        """
        insert_data = donation_data.model_dump(mode="json")
        result = await self._execute_async(
            lambda: self.client.from_(self.table_name).insert(insert_data).execute()
        )
        data = self._handle_supabase_result(result, expect_single=True)
        return self._build_model(data)

    async def delete(self, donation_id: UUID) -> None:
        """Delete a donation event by ID"""
        await self._execute_async(
            lambda: self.client.from_(self.table_name).delete().eq("id", str(donation_id)).execute()
        )
