"""
LINE Binding Repository

Data access layer for LINE Bot integration tables:
- line_binding_codes
- line_group_bindings
- member_line_bindings

符合 CLAUDE.md 🔴:
- Inherits from SupabaseRepository
- Uses _handle_supabase_result() for all queries
- No business logic (belongs in Service layer)
"""

from datetime import datetime
from uuid import UUID

from src.models.line_binding import (
    LineBindingCode,
    LineGroupBinding,
    MemberLineBinding,
)
from src.repositories.base import SupabaseRepository


class LineBindingRepository(SupabaseRepository[LineBindingCode]):
    """
    Repository for LINE binding operations

    Handles three tables:
    - line_binding_codes: Temporary binding codes
    - line_group_bindings: LINE group to alliance links
    - member_line_bindings: LINE user to game ID links
    """

    def __init__(self):
        # Primary table for base class methods
        super().__init__(
            table_name="line_binding_codes",
            model_class=LineBindingCode
        )

    # =========================================================================
    # Binding Codes Operations
    # =========================================================================

    async def create_binding_code(
        self,
        alliance_id: UUID,
        code: str,
        created_by: UUID,
        expires_at: datetime
    ) -> LineBindingCode:
        """Create a new binding code"""
        result = await self._execute_async(
            lambda: self.client
            .from_("line_binding_codes")
            .insert({
                "alliance_id": str(alliance_id),
                "code": code,
                "created_by": str(created_by),
                "expires_at": expires_at.isoformat()
            })
            .execute()
        )

        data = self._handle_supabase_result(result, expect_single=True)
        return LineBindingCode(**data)

    async def get_valid_code(self, code: str) -> LineBindingCode | None:
        """Get a valid (unused, not expired) binding code"""
        result = await self._execute_async(
            lambda: self.client
            .from_("line_binding_codes")
            .select("*")
            .eq("code", code)
            .is_("used_at", "null")
            .gt("expires_at", datetime.utcnow().isoformat())
            .execute()
        )

        data = self._handle_supabase_result(result, allow_empty=True, expect_single=True)
        if not data:
            return None
        return LineBindingCode(**data)

    async def get_pending_code_by_alliance(
        self,
        alliance_id: UUID
    ) -> LineBindingCode | None:
        """Get pending (unused, not expired) code for an alliance"""
        result = await self._execute_async(
            lambda: self.client
            .from_("line_binding_codes")
            .select("*")
            .eq("alliance_id", str(alliance_id))
            .is_("used_at", "null")
            .gt("expires_at", datetime.utcnow().isoformat())
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )

        data = self._handle_supabase_result(result, allow_empty=True, expect_single=True)
        if not data:
            return None
        return LineBindingCode(**data)

    async def mark_code_used(self, code_id: UUID) -> None:
        """Mark a binding code as used"""
        await self._execute_async(
            lambda: self.client
            .from_("line_binding_codes")
            .update({"used_at": datetime.utcnow().isoformat()})
            .eq("id", str(code_id))
            .execute()
        )

    async def count_recent_codes(
        self,
        alliance_id: UUID,
        since: datetime
    ) -> int:
        """Count codes created for alliance since given time (for rate limiting)"""
        result = await self._execute_async(
            lambda: self.client
            .from_("line_binding_codes")
            .select("id", count="exact")
            .eq("alliance_id", str(alliance_id))
            .gte("created_at", since.isoformat())
            .execute()
        )

        return result.count or 0

    # =========================================================================
    # Group Bindings Operations
    # =========================================================================

    async def get_active_group_binding_by_alliance(
        self,
        alliance_id: UUID
    ) -> LineGroupBinding | None:
        """Get active group binding for an alliance"""
        result = await self._execute_async(
            lambda: self.client
            .from_("line_group_bindings")
            .select("*")
            .eq("alliance_id", str(alliance_id))
            .eq("is_active", True)
            .execute()
        )

        data = self._handle_supabase_result(result, allow_empty=True, expect_single=True)
        if not data:
            return None
        return LineGroupBinding(**data)

    async def get_group_binding_by_line_group_id(
        self,
        line_group_id: str
    ) -> LineGroupBinding | None:
        """Get group binding by LINE group ID"""
        result = await self._execute_async(
            lambda: self.client
            .from_("line_group_bindings")
            .select("*")
            .eq("line_group_id", line_group_id)
            .eq("is_active", True)
            .execute()
        )

        data = self._handle_supabase_result(result, allow_empty=True, expect_single=True)
        if not data:
            return None
        return LineGroupBinding(**data)

    async def create_group_binding(
        self,
        alliance_id: UUID,
        line_group_id: str,
        bound_by_line_user_id: str,
        group_name: str | None = None
    ) -> LineGroupBinding:
        """Create a new group binding"""
        result = await self._execute_async(
            lambda: self.client
            .from_("line_group_bindings")
            .insert({
                "alliance_id": str(alliance_id),
                "line_group_id": line_group_id,
                "group_name": group_name,
                "bound_by_line_user_id": bound_by_line_user_id,
                "is_active": True
            })
            .execute()
        )

        data = self._handle_supabase_result(result, expect_single=True)
        return LineGroupBinding(**data)

    async def deactivate_group_binding(self, binding_id: UUID) -> None:
        """Deactivate a group binding"""
        await self._execute_async(
            lambda: self.client
            .from_("line_group_bindings")
            .update({
                "is_active": False,
                "updated_at": datetime.utcnow().isoformat()
            })
            .eq("id", str(binding_id))
            .execute()
        )

    # =========================================================================
    # Member LINE Bindings Operations
    # =========================================================================

    async def get_member_bindings_by_line_user(
        self,
        alliance_id: UUID,
        line_user_id: str
    ) -> list[MemberLineBinding]:
        """Get all game ID bindings for a LINE user in an alliance"""
        result = await self._execute_async(
            lambda: self.client
            .from_("member_line_bindings")
            .select("*")
            .eq("alliance_id", str(alliance_id))
            .eq("line_user_id", line_user_id)
            .order("created_at", desc=True)
            .execute()
        )

        data = self._handle_supabase_result(result, allow_empty=True)
        return [MemberLineBinding(**row) for row in data]

    async def get_member_binding_by_game_id(
        self,
        alliance_id: UUID,
        game_id: str
    ) -> MemberLineBinding | None:
        """Check if a game ID is already registered in an alliance"""
        result = await self._execute_async(
            lambda: self.client
            .from_("member_line_bindings")
            .select("*")
            .eq("alliance_id", str(alliance_id))
            .eq("game_id", game_id)
            .execute()
        )

        data = self._handle_supabase_result(result, allow_empty=True, expect_single=True)
        if not data:
            return None
        return MemberLineBinding(**data)

    async def create_member_binding(
        self,
        alliance_id: UUID,
        line_user_id: str,
        line_display_name: str,
        game_id: str,
        member_id: UUID | None = None
    ) -> MemberLineBinding:
        """Create a new member LINE binding"""
        insert_data = {
            "alliance_id": str(alliance_id),
            "line_user_id": line_user_id,
            "line_display_name": line_display_name,
            "game_id": game_id,
            "is_verified": member_id is not None
        }
        if member_id:
            insert_data["member_id"] = str(member_id)

        result = await self._execute_async(
            lambda: self.client
            .from_("member_line_bindings")
            .insert(insert_data)
            .execute()
        )

        data = self._handle_supabase_result(result, expect_single=True)
        return MemberLineBinding(**data)

    async def count_member_bindings_by_alliance(self, alliance_id: UUID) -> int:
        """Count member bindings for an alliance"""
        result = await self._execute_async(
            lambda: self.client
            .from_("member_line_bindings")
            .select("id", count="exact")
            .eq("alliance_id", str(alliance_id))
            .execute()
        )

        return result.count or 0

    async def find_member_by_name(
        self,
        alliance_id: UUID,
        name: str
    ) -> UUID | None:
        """Find member ID by name in members table (for auto-matching)"""
        result = await self._execute_async(
            lambda: self.client
            .from_("members")
            .select("id")
            .eq("alliance_id", str(alliance_id))
            .eq("name", name)
            .execute()
        )

        data = self._handle_supabase_result(result, allow_empty=True, expect_single=True)
        if not data:
            return None
        return UUID(data["id"])

    # =========================================================================
    # Group Reminder Cooldown Operations
    # =========================================================================

    async def get_group_reminder_cooldown(
        self,
        line_group_id: str
    ) -> datetime | None:
        """Get last reminder time for a group"""
        result = await self._execute_async(
            lambda: self.client
            .from_("line_group_reminder_cooldowns")
            .select("last_reminder_at")
            .eq("line_group_id", line_group_id)
            .execute()
        )

        data = self._handle_supabase_result(result, allow_empty=True, expect_single=True)
        if not data:
            return None
        return datetime.fromisoformat(data["last_reminder_at"].replace("Z", "+00:00"))

    async def upsert_group_reminder_cooldown(self, line_group_id: str) -> None:
        """Update or insert group reminder cooldown timestamp"""
        await self._execute_async(
            lambda: self.client
            .from_("line_group_reminder_cooldowns")
            .upsert({
                "line_group_id": line_group_id,
                "last_reminder_at": datetime.utcnow().isoformat()
            })
            .execute()
        )

    async def is_user_registered_in_group(
        self,
        line_group_id: str,
        line_user_id: str
    ) -> bool:
        """Check if a LINE user has any registered game IDs in the group's alliance"""
        # First get the alliance for this group
        group_binding = await self.get_group_binding_by_line_group_id(line_group_id)
        if not group_binding:
            return False

        # Check if user has any bindings
        bindings = await self.get_member_bindings_by_line_user(
            alliance_id=group_binding.alliance_id,
            line_user_id=line_user_id
        )
        return len(bindings) > 0

    async def is_user_registered_anywhere(self, line_user_id: str) -> bool:
        """Check if a LINE user has any registered game IDs in any alliance"""
        result = await self._execute_async(
            lambda: self.client
            .from_("member_line_bindings")
            .select("id", count="exact")
            .eq("line_user_id", line_user_id)
            .limit(1)
            .execute()
        )

        return (result.count or 0) > 0
