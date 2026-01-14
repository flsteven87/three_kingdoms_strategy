"""
Member Snapshot Repository

符合 CLAUDE.md 🔴:
- Inherits from SupabaseRepository
- Uses _handle_supabase_result() for all queries
"""

from datetime import UTC, datetime
from uuid import UUID

from src.models.member_snapshot import MemberSnapshot
from src.repositories.base import SupabaseRepository


class MemberSnapshotRepository(SupabaseRepository[MemberSnapshot]):
    """Repository for member snapshot data access"""

    def __init__(self):
        """Initialize member snapshot repository"""
        super().__init__(table_name="member_snapshots", model_class=MemberSnapshot)

    async def get_by_upload(self, csv_upload_id: UUID) -> list[MemberSnapshot]:
        """
        Get member snapshots by CSV upload ID

        Args:
            csv_upload_id: CSV upload UUID

        Returns:
            List of member snapshot instances

        符合 CLAUDE.md 🔴: Uses _handle_supabase_result()
        """
        result = await self._execute_async(
            lambda: self.client.from_(self.table_name)
            .select("*")
            .eq("csv_upload_id", str(csv_upload_id))
            .order("contribution_rank")
            .execute()
        )

        data = self._handle_supabase_result(result, allow_empty=True)

        return self._build_models(data)

    async def get_by_uploads_batch(self, csv_upload_ids: list[UUID]) -> list[MemberSnapshot]:
        """
        Get member snapshots for multiple CSV uploads in a single query.

        Performance optimization to avoid N+1 queries when fetching snapshots
        for multiple uploads (e.g., in hegemony score calculation).

        Args:
            csv_upload_ids: List of CSV upload UUIDs

        Returns:
            List of member snapshot instances for all specified uploads

        符合 CLAUDE.md 🔴: Uses _handle_supabase_result()
        """
        if not csv_upload_ids:
            return []

        # Convert UUIDs to strings for the IN query
        upload_id_strings = [str(uid) for uid in csv_upload_ids]

        result = await self._execute_async(
            lambda: self.client.from_(self.table_name)
            .select("*")
            .in_("csv_upload_id", upload_id_strings)
            .order("csv_upload_id")
            .order("contribution_rank")
            .execute()
        )

        data = self._handle_supabase_result(result, allow_empty=True)

        return self._build_models(data)

    async def get_by_member(
        self, member_id: UUID, limit: int = 100
    ) -> list[MemberSnapshot]:
        """
        Get member snapshots by member ID (historical performance)

        Args:
            member_id: Member UUID
            limit: Maximum number of records to return

        Returns:
            List of member snapshot instances ordered by date

        符合 CLAUDE.md 🔴: Uses _handle_supabase_result()
        """
        result = await self._execute_async(
            lambda: self.client.from_(self.table_name)
            .select("*")
            .eq("member_id", str(member_id))
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )

        data = self._handle_supabase_result(result, allow_empty=True)

        return self._build_models(data)

    async def get_by_member_and_upload(
        self, member_id: UUID, csv_upload_id: UUID
    ) -> MemberSnapshot | None:
        """
        Get member snapshot for specific member and CSV upload

        Args:
            member_id: Member UUID
            csv_upload_id: CSV upload UUID

        Returns:
            Member snapshot instance or None if not found

        符合 CLAUDE.md 🔴: Uses _handle_supabase_result()
        """
        result = await self._execute_async(
            lambda: self.client.from_(self.table_name)
            .select("*")
            .eq("member_id", str(member_id))
            .eq("csv_upload_id", str(csv_upload_id))
            .execute()
        )

        data = self._handle_supabase_result(result, allow_empty=True, expect_single=True)

        if not data:
            return None

        return self._build_model(data)

    async def get_by_alliance(
        self, alliance_id: UUID, limit: int = 1000
    ) -> list[MemberSnapshot]:
        """
        Get member snapshots by alliance ID

        Args:
            alliance_id: Alliance UUID
            limit: Maximum number of records to return

        Returns:
            List of member snapshot instances

        符合 CLAUDE.md 🔴: Uses _handle_supabase_result()
        """
        result = await self._execute_async(
            lambda: self.client.from_(self.table_name)
            .select("*")
            .eq("alliance_id", str(alliance_id))
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )

        data = self._handle_supabase_result(result, allow_empty=True)

        return self._build_models(data)

    async def create(self, snapshot_data: dict) -> MemberSnapshot:
        """
        Create new member snapshot

        Args:
            snapshot_data: Member snapshot data dictionary

        Returns:
            Created member snapshot instance

        符合 CLAUDE.md 🔴: Uses _handle_supabase_result()
        """
        result = await self._execute_async(
            lambda: self.client.from_(self.table_name).insert(snapshot_data).execute()
        )

        data = self._handle_supabase_result(result, expect_single=True)

        return self._build_model(data)

    async def create_batch(self, snapshots_data: list[dict]) -> list[MemberSnapshot]:
        """
        Create multiple member snapshots in batch

        Args:
            snapshots_data: List of member snapshot data dictionaries

        Returns:
            List of created member snapshot instances

        符合 CLAUDE.md 🔴: Uses _handle_supabase_result()
        """
        result = await self._execute_async(
            lambda: self.client.from_(self.table_name).insert(snapshots_data).execute()
        )

        data = self._handle_supabase_result(result, allow_empty=False)

        return self._build_models(data)

    async def delete_by_upload(self, csv_upload_id: UUID) -> bool:
        """
        Delete all snapshots for a CSV upload (hard delete)

        Args:
            csv_upload_id: CSV upload UUID

        Returns:
            True if deleted successfully

        符合 CLAUDE.md: Hard delete only
        """
        result = await self._execute_async(
            lambda: self.client.from_(self.table_name)
            .delete()
            .eq("csv_upload_id", str(csv_upload_id))
            .execute()
        )

        self._handle_supabase_result(result, allow_empty=True)

        return True

    async def get_latest_by_member_in_season(
        self, member_id: UUID, season_id: UUID
    ) -> MemberSnapshot | None:
        """
        Get the latest snapshot for a member in a specific season.

        P1 修復: 用於銅礦規則驗證 - 取得成員的最新 total_merit

        Args:
            member_id: Member UUID
            season_id: Season UUID

        Returns:
            Latest member snapshot in the season or None if not found

        符合 CLAUDE.md 🔴: Uses _handle_supabase_result()
        """
        # Join with csv_uploads to filter by season_id
        result = await self._execute_async(
            lambda: self.client.from_(self.table_name)
            .select("*, csv_uploads!inner(season_id)")
            .eq("member_id", str(member_id))
            .eq("csv_uploads.season_id", str(season_id))
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )

        data = self._handle_supabase_result(result, allow_empty=True, expect_single=True)

        if not data:
            return None

        # Remove the joined csv_uploads data before building model
        if isinstance(data, dict) and "csv_uploads" in data:
            del data["csv_uploads"]

        return self._build_model(data)

    async def get_latest_by_members_in_season(
        self, member_ids: list[UUID], season_id: UUID
    ) -> dict[str, MemberSnapshot]:
        """
        Get the latest snapshots for multiple members in a specific season.

        P2 修復: 批次查詢避免 N+1 問題

        Uses PostgreSQL DISTINCT ON to get only the latest snapshot per member.

        Args:
            member_ids: List of member UUIDs
            season_id: Season UUID

        Returns:
            Dict mapping member_id (string) to their latest MemberSnapshot

        符合 CLAUDE.md 🔴: Uses _handle_supabase_result()
        """
        if not member_ids:
            return {}

        member_id_strings = [str(mid) for mid in member_ids]

        # Use RPC for DISTINCT ON query (Supabase doesn't support it directly)
        # Fallback: get all snapshots and filter in Python
        result = await self._execute_async(
            lambda: self.client.from_(self.table_name)
            .select("*, csv_uploads!inner(season_id)")
            .in_("member_id", member_id_strings)
            .eq("csv_uploads.season_id", str(season_id))
            .order("member_id")
            .order("created_at", desc=True)
            .execute()
        )

        data = self._handle_supabase_result(result, allow_empty=True)

        # Group by member_id and keep only the latest (first in each group)
        latest_by_member: dict[str, MemberSnapshot] = {}
        for row in data:
            member_id_str = row["member_id"]
            if member_id_str not in latest_by_member:
                # Remove joined data before building model
                if "csv_uploads" in row:
                    del row["csv_uploads"]
                latest_by_member[member_id_str] = self._build_model(row)

        return latest_by_member

    async def get_closest_to_date(
        self, alliance_id: UUID, season_id: UUID, target_date: datetime
    ) -> list[MemberSnapshot]:
        """
        Get member snapshots closest before or on target date for given alliance and season.

        Queries member_snapshots and joins with csv_uploads to filter by season,
        then finds the upload closest to but not after the target date.

        Args:
            alliance_id: Alliance UUID
            season_id: Season UUID
            target_date: Target datetime to find closest snapshot (before or on this date)

        Returns:
            List of MemberSnapshot models from the closest upload, empty if none found

        符合 CLAUDE.md 🔴: Uses _handle_supabase_result()
        """
        # First, find the csv_upload closest to target_date for this season
        upload_result = await self._execute_async(
            lambda: self.client.from_("csv_uploads")
            .select("id, created_at")
            .eq("season_id", str(season_id))
            .execute()
        )

        uploads = self._handle_supabase_result(upload_result, allow_empty=True)
        if not uploads:
            return []

        # Filter to only uploads before or on target_date
        target_ts = (
            target_date.replace(tzinfo=UTC)
            if target_date.tzinfo is None
            else target_date
        )

        valid_uploads = [
            u for u in uploads
            if datetime.fromisoformat(u["created_at"].replace("Z", "+00:00")) <= target_ts
        ]

        if not valid_uploads:
            return []

        # Find upload closest to target_date (latest before or on target)
        closest_upload = max(
            valid_uploads,
            key=lambda u: datetime.fromisoformat(u["created_at"].replace("Z", "+00:00")),
        )

        # Now get all member snapshots for this upload and alliance
        result = await self._execute_async(
            lambda: self.client.from_(self.table_name)
            .select("*")
            .eq("csv_upload_id", closest_upload["id"])
            .eq("alliance_id", str(alliance_id))
            .execute()
        )

        data_list = self._handle_supabase_result(result, allow_empty=True)
        return self._build_models(data_list)
