"""
Copper Mine Repository

Data access layer for copper_mines table.
Supports both LIFF registration and Dashboard ownership management.

符合 CLAUDE.md 🔴:
- Inherits from SupabaseRepository
- Uses _handle_supabase_result() for all queries
- No business logic (belongs in Service layer)
"""

from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from src.models.copper_mine import CopperMine
from src.repositories.base import SupabaseRepository


class CopperMineRepository(SupabaseRepository[CopperMine]):
    """Repository for copper mine operations"""

    def __init__(self):
        super().__init__(
            table_name="copper_mines",
            model_class=CopperMine
        )

    async def get_mines_by_alliance(
        self,
        alliance_id: UUID,
        status: str | None = None
    ) -> list[CopperMine]:
        """Get all copper mines for an alliance"""
        query = (
            self.client
            .from_("copper_mines")
            .select("*")
            .eq("alliance_id", str(alliance_id))
        )

        if status:
            query = query.eq("status", status)

        result = await self._execute_async(
            lambda: query.order("registered_at", desc=True).execute()
        )

        data = self._handle_supabase_result(result, allow_empty=True)
        return [CopperMine(**row) for row in data]

    async def get_mines_by_line_user(
        self,
        alliance_id: UUID,
        line_user_id: str
    ) -> list[CopperMine]:
        """Get copper mines registered by a specific LINE user"""
        result = await self._execute_async(
            lambda: self.client
            .from_("copper_mines")
            .select("*")
            .eq("alliance_id", str(alliance_id))
            .eq("registered_by_line_user_id", line_user_id)
            .order("registered_at", desc=True)
            .execute()
        )

        data = self._handle_supabase_result(result, allow_empty=True)
        return [CopperMine(**row) for row in data]

    async def get_mine_by_coords(
        self,
        alliance_id: UUID,
        coord_x: int,
        coord_y: int,
        season_id: UUID | None = None
    ) -> CopperMine | None:
        """
        Check if a mine exists at given coordinates.

        Args:
            alliance_id: Alliance UUID
            coord_x: X coordinate
            coord_y: Y coordinate
            season_id: Optional season UUID. If provided, only checks within that season.
                       If None, checks across all mines in the alliance.

        Returns:
            CopperMine if exists, None otherwise
        """
        query = (
            self.client
            .from_("copper_mines")
            .select("*")
            .eq("alliance_id", str(alliance_id))
            .eq("coord_x", coord_x)
            .eq("coord_y", coord_y)
        )

        # If season_id is provided, only check within that season
        if season_id:
            query = query.eq("season_id", str(season_id))

        result = await self._execute_async(lambda: query.execute())

        data = self._handle_supabase_result(result, allow_empty=True, expect_single=True)
        if not data:
            return None
        return CopperMine(**data)

    async def create_mine(
        self,
        alliance_id: UUID,
        registered_by_line_user_id: str,
        game_id: str,
        coord_x: int,
        coord_y: int,
        level: int,
        notes: str | None = None,
        season_id: UUID | None = None,
        member_id: UUID | None = None
    ) -> CopperMine:
        """Create a new copper mine record (LIFF registration)"""
        insert_data: dict[str, Any] = {
            "alliance_id": str(alliance_id),
            "registered_by_line_user_id": registered_by_line_user_id,
            "game_id": game_id,
            "coord_x": coord_x,
            "coord_y": coord_y,
            "level": level,
            "status": "active"
        }
        if notes:
            insert_data["notes"] = notes
        if season_id:
            insert_data["season_id"] = str(season_id)
        if member_id:
            insert_data["member_id"] = str(member_id)

        result = await self._execute_async(
            lambda: self.client
            .from_("copper_mines")
            .insert(insert_data)
            .execute()
        )

        data = self._handle_supabase_result(result, expect_single=True)
        return CopperMine(**data)

    async def delete_mine(self, mine_id: UUID) -> bool:
        """Delete a copper mine by ID"""
        result = await self._execute_async(
            lambda: self.client
            .from_("copper_mines")
            .delete()
            .eq("id", str(mine_id))
            .execute()
        )

        data = self._handle_supabase_result(result, allow_empty=True)
        return len(data) > 0 if isinstance(data, list) else bool(data)

    async def update_mine_status(
        self,
        mine_id: UUID,
        status: str
    ) -> CopperMine | None:
        """Update copper mine status"""
        result = await self._execute_async(
            lambda: self.client
            .from_("copper_mines")
            .update({
                "status": status,
                "updated_at": datetime.now(UTC).isoformat()
            })
            .eq("id", str(mine_id))
            .execute()
        )

        data = self._handle_supabase_result(result, allow_empty=True, expect_single=True)
        if not data:
            return None
        return CopperMine(**data)

    async def count_mines_by_alliance(self, alliance_id: UUID) -> int:
        """Count copper mines for an alliance"""
        result = await self._execute_async(
            lambda: self.client
            .from_("copper_mines")
            .select("id", count="exact")
            .eq("alliance_id", str(alliance_id))
            .execute()
        )

        return result.count or 0

    # =========================================================================
    # Dashboard Methods (with member data joins)
    # =========================================================================

    async def get_ownerships_by_season(
        self,
        season_id: UUID
    ) -> list[dict]:
        """
        Get copper mines for a season with member info (Dashboard view)

        Returns raw dicts with joined member data for Dashboard display.
        """
        # Use Supabase's foreign key join syntax
        result = await self._execute_async(
            lambda: self.client
            .from_("copper_mines")
            .select(
                "id, season_id, member_id, coord_x, coord_y, level, "
                "registered_at, game_id, "
                "members!copper_mines_member_id_fkey(name, id), "
                "member_snapshots!inner(group_name)"
            )
            .eq("season_id", str(season_id))
            .order("registered_at", desc=True)
            .execute()
        )

        data = self._handle_supabase_result(result, allow_empty=True)
        return data if isinstance(data, list) else []

    async def get_ownerships_by_season_simple(
        self,
        season_id: UUID
    ) -> list[dict]:
        """
        Get copper mines for a season (simplified query without complex joins)

        For Dashboard, we'll join the data in service layer.
        """
        result = await self._execute_async(
            lambda: self.client
            .from_("copper_mines")
            .select("*")
            .eq("season_id", str(season_id))
            .order("registered_at", desc=True)
            .execute()
        )

        data = self._handle_supabase_result(result, allow_empty=True)
        return data if isinstance(data, list) else []

    async def create_ownership(
        self,
        season_id: UUID,
        alliance_id: UUID,
        member_id: UUID | None,
        game_id: str,
        coord_x: int,
        coord_y: int,
        level: int,
        applied_at: datetime | None = None
    ) -> CopperMine:
        """Create a copper mine ownership record (Dashboard)"""
        insert_data: dict[str, Any] = {
            "alliance_id": str(alliance_id),
            "season_id": str(season_id),
            "game_id": game_id,
            "coord_x": coord_x,
            "coord_y": coord_y,
            "level": level,
            "status": "active",
            "registered_by_line_user_id": "dashboard",  # Mark as Dashboard entry
        }
        # Only include member_id if it's not None (for reserved mines)
        if member_id is not None:
            insert_data["member_id"] = str(member_id)

        if applied_at:
            insert_data["registered_at"] = applied_at.isoformat()

        result = await self._execute_async(
            lambda: self.client
            .from_("copper_mines")
            .insert(insert_data)
            .execute()
        )

        data = self._handle_supabase_result(result, expect_single=True)
        return CopperMine(**data)

    async def count_member_mines(
        self,
        season_id: UUID,
        member_id: UUID
    ) -> int:
        """Count how many mines a member owns in a season"""
        result = await self._execute_async(
            lambda: self.client
            .from_("copper_mines")
            .select("id", count="exact")
            .eq("season_id", str(season_id))
            .eq("member_id", str(member_id))
            .execute()
        )

        return result.count or 0

    async def update_ownership(
        self,
        ownership_id: UUID,
        member_id: UUID,
        game_id: str
    ) -> CopperMine:
        """Update copper mine ownership (for transferring reserved mines)"""
        result = await self._execute_async(
            lambda: self.client
            .from_("copper_mines")
            .update({
                "member_id": str(member_id),
                "game_id": game_id,
                "updated_at": datetime.now(UTC).isoformat()
            })
            .eq("id", str(ownership_id))
            .execute()
        )

        data = self._handle_supabase_result(result, expect_single=True)
        return CopperMine(**data)
