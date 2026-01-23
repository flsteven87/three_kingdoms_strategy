"""
Copper Mine Rule Repository

Data access layer for copper_mine_rules table.

符合 CLAUDE.md 🔴:
- Inherits from SupabaseRepository
- Uses _handle_supabase_result() for all queries
- No business logic (belongs in Service layer)
"""

from datetime import UTC, datetime
from uuid import UUID

from src.models.copper_mine import AllowedLevel, CopperMineRule
from src.repositories.base import SupabaseRepository


class CopperMineRuleRepository(SupabaseRepository[CopperMineRule]):
    """Repository for copper mine rule operations"""

    def __init__(self):
        super().__init__(table_name="copper_mine_rules", model_class=CopperMineRule)

    async def get_rules_by_alliance(self, alliance_id: UUID) -> list[CopperMineRule]:
        """Get all rules for an alliance, ordered by tier"""
        result = await self._execute_async(
            lambda: self.client.from_(self.table_name)
            .select("*")
            .eq("alliance_id", str(alliance_id))
            .order("tier")
            .execute()
        )

        data = self._handle_supabase_result(result, allow_empty=True)
        return self._build_models(data)

    async def get_rule_by_tier(self, alliance_id: UUID, tier: int) -> CopperMineRule | None:
        """Get a specific rule by alliance and tier"""
        result = await self._execute_async(
            lambda: self.client.from_(self.table_name)
            .select("*")
            .eq("alliance_id", str(alliance_id))
            .eq("tier", tier)
            .execute()
        )

        data = self._handle_supabase_result(result, allow_empty=True, expect_single=True)
        if not data:
            return None
        return self._build_model(data)

    async def create_rule(
        self,
        alliance_id: UUID,
        tier: int,
        required_merit: int,
        allowed_level: AllowedLevel = "both",
    ) -> CopperMineRule:
        """Create a new copper mine rule"""
        insert_data = {
            "alliance_id": str(alliance_id),
            "tier": tier,
            "required_merit": required_merit,
            "allowed_level": allowed_level,
        }

        result = await self._execute_async(
            lambda: self.client.from_(self.table_name).insert(insert_data).execute()
        )

        data = self._handle_supabase_result(result, expect_single=True)
        return self._build_model(data)

    async def update_rule(
        self,
        rule_id: UUID,
        required_merit: int | None = None,
        allowed_level: AllowedLevel | None = None,
    ) -> CopperMineRule | None:
        """Update a copper mine rule"""
        update_data: dict = {"updated_at": datetime.now(UTC).isoformat()}

        if required_merit is not None:
            update_data["required_merit"] = required_merit
        if allowed_level is not None:
            update_data["allowed_level"] = allowed_level

        result = await self._execute_async(
            lambda: self.client.from_(self.table_name)
            .update(update_data)
            .eq("id", str(rule_id))
            .execute()
        )

        data = self._handle_supabase_result(result, allow_empty=True, expect_single=True)
        if not data:
            return None
        return self._build_model(data)

    async def delete_rule(self, rule_id: UUID) -> bool:
        """Delete a copper mine rule by ID"""
        result = await self._execute_async(
            lambda: self.client.from_(self.table_name).delete().eq("id", str(rule_id)).execute()
        )

        data = self._handle_supabase_result(result, allow_empty=True)
        return len(data) > 0 if isinstance(data, list) else bool(data)
