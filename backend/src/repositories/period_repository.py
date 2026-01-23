"""
Period Repository

符合 CLAUDE.md 🔴:
- Inherits from SupabaseRepository
- Uses _handle_supabase_result() for all queries
"""

from uuid import UUID

from src.models.period import Period
from src.repositories.base import SupabaseRepository


class PeriodRepository(SupabaseRepository[Period]):
    """Repository for period data access"""

    def __init__(self):
        """Initialize period repository"""
        super().__init__(table_name="periods", model_class=Period)

    async def get_by_season(self, season_id: UUID) -> list[Period]:
        """
        Get all periods for a season, ordered by period_number

        Args:
            season_id: Season UUID

        Returns:
            List of period instances ordered by period_number

        符合 CLAUDE.md 🔴: Uses _handle_supabase_result()
        """
        result = (
            self.client.from_(self.table_name)
            .select("*")
            .eq("season_id", str(season_id))
            .order("period_number")
            .execute()
        )

        data = self._handle_supabase_result(result, allow_empty=True)
        return self._build_models(data)

    async def get_by_end_upload(self, end_upload_id: UUID) -> Period | None:
        """
        Get period by its end upload ID

        Args:
            end_upload_id: End CSV upload UUID

        Returns:
            Period instance or None if not found

        符合 CLAUDE.md 🔴: Uses _handle_supabase_result()
        """
        result = (
            self.client.from_(self.table_name)
            .select("*")
            .eq("end_upload_id", str(end_upload_id))
            .execute()
        )

        data = self._handle_supabase_result(result, allow_empty=True, expect_single=True)

        if not data:
            return None

        return self._build_model(data)

    async def create(self, period_data: dict) -> Period:
        """
        Create new period

        Args:
            period_data: Period data dictionary

        Returns:
            Created period instance

        符合 CLAUDE.md 🔴: Uses _handle_supabase_result()
        """
        result = self.client.from_(self.table_name).insert(period_data).execute()
        data = self._handle_supabase_result(result, expect_single=True)
        return self._build_model(data)

    async def delete_by_season(self, season_id: UUID) -> bool:
        """
        Delete all periods for a season (used during recalculation)

        Args:
            season_id: Season UUID

        Returns:
            True if deleted successfully

        符合 CLAUDE.md 🔴: Uses _handle_supabase_result()
        """
        result = (
            self.client.from_(self.table_name).delete().eq("season_id", str(season_id)).execute()
        )
        self._handle_supabase_result(result, allow_empty=True)
        return True

    async def get_next_period_number(self, season_id: UUID) -> int:
        """
        Get the next period number for a season

        Args:
            season_id: Season UUID

        Returns:
            Next period number (1 if no periods exist)

        符合 CLAUDE.md 🔴: Uses _handle_supabase_result()
        """
        result = (
            self.client.from_(self.table_name)
            .select("period_number")
            .eq("season_id", str(season_id))
            .order("period_number", desc=True)
            .limit(1)
            .execute()
        )

        data = self._handle_supabase_result(result, allow_empty=True, expect_single=True)

        if not data:
            return 1

        return data["period_number"] + 1
