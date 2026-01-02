"""
Copper Mine Repository

Data access layer for copper_mines table.

符合 CLAUDE.md 🔴:
- Inherits from SupabaseRepository
- Uses _handle_supabase_result() for all queries
- No business logic (belongs in Service layer)
"""

from datetime import datetime
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
        coord_y: int
    ) -> CopperMine | None:
        """Check if a mine exists at given coordinates"""
        result = await self._execute_async(
            lambda: self.client
            .from_("copper_mines")
            .select("*")
            .eq("alliance_id", str(alliance_id))
            .eq("coord_x", coord_x)
            .eq("coord_y", coord_y)
            .execute()
        )

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
        notes: str | None = None
    ) -> CopperMine:
        """Create a new copper mine record"""
        insert_data = {
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
                "updated_at": datetime.utcnow().isoformat()
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
