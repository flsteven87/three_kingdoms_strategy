"""
CSV Upload Repository

符合 CLAUDE.md 🔴:
- Inherits from SupabaseRepository
- Uses _handle_supabase_result() for all queries
- Uses _execute_async() to avoid blocking event loop
"""

from datetime import datetime, timedelta
from uuid import UUID

from src.models.csv_upload import CsvUpload, UploadType
from src.repositories.base import SupabaseRepository


class CsvUploadRepository(SupabaseRepository[CsvUpload]):
    """Repository for CSV upload data access"""

    def __init__(self):
        """Initialize CSV upload repository"""
        super().__init__(table_name="csv_uploads", model_class=CsvUpload)

    async def get_by_season(
        self, season_id: UUID, upload_type: UploadType = "regular"
    ) -> list[CsvUpload]:
        """
        Get CSV uploads by season ID and upload type

        Args:
            season_id: Season UUID
            upload_type: Type of upload to filter ('regular' or 'event')

        Returns:
            List of CSV upload instances

        符合 CLAUDE.md 🔴: Uses _handle_supabase_result()
        """
        result = await self._execute_async(
            lambda: self.client.from_(self.table_name)
            .select("*")
            .eq("season_id", str(season_id))
            .eq("upload_type", upload_type)
            .order("snapshot_date", desc=True)
            .execute()
        )

        data = self._handle_supabase_result(result, allow_empty=True)

        return self._build_models(data)

    async def get_by_alliance(self, alliance_id: UUID, limit: int = 100) -> list[CsvUpload]:
        """
        Get CSV uploads by alliance ID

        Args:
            alliance_id: Alliance UUID
            limit: Maximum number of records to return

        Returns:
            List of CSV upload instances

        符合 CLAUDE.md 🔴: Uses _handle_supabase_result()
        """
        result = await self._execute_async(
            lambda: self.client.from_(self.table_name)
            .select("*")
            .eq("alliance_id", str(alliance_id))
            .order("snapshot_date", desc=True)
            .limit(limit)
            .execute()
        )

        data = self._handle_supabase_result(result, allow_empty=True)

        return self._build_models(data)

    async def get_latest_by_season(self, season_id: UUID) -> CsvUpload | None:
        """
        Get the latest CSV upload for a season

        Args:
            season_id: Season UUID

        Returns:
            Latest CSV upload or None if not found

        符合 CLAUDE.md 🔴: Uses _handle_supabase_result()
        """
        result = await self._execute_async(
            lambda: self.client.from_(self.table_name)
            .select("*")
            .eq("season_id", str(season_id))
            .order("snapshot_date", desc=True)
            .limit(1)
            .execute()
        )

        data = self._handle_supabase_result(result, allow_empty=True, expect_single=True)

        if not data:
            return None

        return self._build_model(data)

    async def create(self, upload_data: dict) -> CsvUpload:
        """
        Create new CSV upload

        Args:
            upload_data: CSV upload data dictionary

        Returns:
            Created CSV upload instance

        符合 CLAUDE.md 🔴: Uses _handle_supabase_result()
        """
        result = await self._execute_async(
            lambda: self.client.from_(self.table_name).insert(upload_data).execute()
        )

        data = self._handle_supabase_result(result, expect_single=True)

        return self._build_model(data)

    async def update(self, upload_id: UUID, upload_data: dict) -> CsvUpload:
        """
        Update CSV upload

        Args:
            upload_id: CSV upload UUID
            upload_data: CSV upload data dictionary

        Returns:
            Updated CSV upload instance

        符合 CLAUDE.md 🔴: Uses _handle_supabase_result()
        """
        result = await self._execute_async(
            lambda: self.client.from_(self.table_name)
            .update(upload_data)
            .eq("id", str(upload_id))
            .execute()
        )

        data = self._handle_supabase_result(result, expect_single=True)

        return self._build_model(data)

    async def get_by_date(
        self, alliance_id: UUID, season_id: UUID, snapshot_date: datetime
    ) -> CsvUpload | None:
        """
        Get regular CSV upload by alliance, season, and date (ignoring time).

        Only checks 'regular' upload type. For data management, each day can have
        at most one snapshot - uploading on the same day will replace the existing one.

        Args:
            alliance_id: Alliance UUID
            season_id: Season UUID
            snapshot_date: Snapshot datetime (only date part is compared)

        Returns:
            CSV upload instance or None if not found

        符合 CLAUDE.md 🔴: Uses _handle_supabase_result()
        """
        # Compare only date part: start_of_day <= snapshot_date < end_of_day
        start_of_day = snapshot_date.replace(hour=0, minute=0, second=0, microsecond=0)
        end_of_day = start_of_day + timedelta(days=1)

        result = await self._execute_async(
            lambda: self.client.from_(self.table_name)
            .select("*")
            .eq("alliance_id", str(alliance_id))
            .eq("season_id", str(season_id))
            .eq("upload_type", "regular")
            .gte("snapshot_date", start_of_day.isoformat())
            .lt("snapshot_date", end_of_day.isoformat())
            .limit(1)
            .execute()
        )

        data = self._handle_supabase_result(result, allow_empty=True, expect_single=True)

        if not data:
            return None

        return self._build_model(data)

    async def delete(self, upload_id: UUID) -> bool:
        """
        Delete CSV upload (hard delete)

        Args:
            upload_id: CSV upload UUID

        Returns:
            True if deleted successfully

        符合 CLAUDE.md: Hard delete only
        """
        result = await self._execute_async(
            lambda: self.client.from_(self.table_name).delete().eq("id", str(upload_id)).execute()
        )

        self._handle_supabase_result(result, allow_empty=True)

        return True
