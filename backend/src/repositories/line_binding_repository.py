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
    LineCustomCommand,
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
        group_name: str | None = None,
        group_picture_url: str | None = None
    ) -> LineGroupBinding:
        """Create a new group binding"""
        result = await self._execute_async(
            lambda: self.client
            .from_("line_group_bindings")
            .insert({
                "alliance_id": str(alliance_id),
                "line_group_id": line_group_id,
                "group_name": group_name,
                "group_picture_url": group_picture_url,
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

    async def update_group_info(
        self,
        binding_id: UUID,
        group_name: str | None = None,
        group_picture_url: str | None = None
    ) -> LineGroupBinding:
        """Update group name and/or picture for an existing binding"""
        update_data: dict[str, str] = {
            "updated_at": datetime.utcnow().isoformat()
        }
        if group_name is not None:
            update_data["group_name"] = group_name
        if group_picture_url is not None:
            update_data["group_picture_url"] = group_picture_url

        result = await self._execute_async(
            lambda: self.client
            .from_("line_group_bindings")
            .update(update_data)
            .eq("id", str(binding_id))
            .select("*")
            .execute()
        )

        data = self._handle_supabase_result(result, expect_single=True)
        return LineGroupBinding(**data)

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

    async def get_member_bindings_by_game_ids(
        self,
        alliance_id: UUID,
        game_ids: list[str]
    ) -> list[MemberLineBinding]:
        """
        Get member LINE bindings for multiple game IDs in a single query.

        P2 修復: 批次查詢避免 N+1 問題

        Args:
            alliance_id: Alliance UUID
            game_ids: List of game IDs to look up

        Returns:
            List of MemberLineBinding instances
        """
        if not game_ids:
            return []

        result = await self._execute_async(
            lambda: self.client
            .from_("member_line_bindings")
            .select("*")
            .eq("alliance_id", str(alliance_id))
            .in_("game_id", game_ids)
            .execute()
        )

        data = self._handle_supabase_result(result, allow_empty=True)
        return [MemberLineBinding(**row) for row in data]

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

    async def get_all_member_bindings_by_alliance(
        self,
        alliance_id: UUID
    ) -> list[MemberLineBinding]:
        """Get all member LINE bindings for an alliance (for admin view)"""
        result = await self._execute_async(
            lambda: self.client
            .from_("member_line_bindings")
            .select("*")
            .eq("alliance_id", str(alliance_id))
            .order("created_at", desc=True)
            .execute()
        )

        data = self._handle_supabase_result(result, allow_empty=True)
        return [MemberLineBinding(**row) for row in data]

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

    async def delete_member_binding(
        self,
        alliance_id: UUID,
        line_user_id: str,
        game_id: str
    ) -> bool:
        """
        Delete a member LINE binding

        Returns True if a row was deleted, False if not found
        """
        result = await self._execute_async(
            lambda: self.client
            .from_("member_line_bindings")
            .delete()
            .eq("alliance_id", str(alliance_id))
            .eq("line_user_id", line_user_id)
            .eq("game_id", game_id)
            .execute()
        )

        data = self._handle_supabase_result(result, allow_empty=True)
        return len(data) > 0

    async def list_custom_commands(self, alliance_id: UUID) -> list[LineCustomCommand]:
        result = await self._execute_async(
            lambda: self.client
            .from_("line_custom_commands")
            .select("*")
            .eq("alliance_id", str(alliance_id))
            .order("updated_at", desc=True)
            .execute()
        )

        data = self._handle_supabase_result(result, allow_empty=True)
        return [LineCustomCommand(**row) for row in data]

    async def get_custom_command_by_id(self, command_id: UUID) -> LineCustomCommand | None:
        result = await self._execute_async(
            lambda: self.client
            .from_("line_custom_commands")
            .select("*")
            .eq("id", str(command_id))
            .execute()
        )

        data = self._handle_supabase_result(result, allow_empty=True, expect_single=True)
        if not data:
            return None
        return LineCustomCommand(**data)

    async def get_custom_command_by_trigger(
        self,
        alliance_id: UUID,
        trigger_keyword: str
    ) -> LineCustomCommand | None:
        result = await self._execute_async(
            lambda: self.client
            .from_("line_custom_commands")
            .select("*")
            .eq("alliance_id", str(alliance_id))
            .eq("trigger_keyword", trigger_keyword)
            .eq("is_enabled", True)
            .execute()
        )

        data = self._handle_supabase_result(result, allow_empty=True, expect_single=True)
        if not data:
            return None
        return LineCustomCommand(**data)

    async def get_custom_command_by_trigger_any(
        self,
        alliance_id: UUID,
        trigger_keyword: str
    ) -> LineCustomCommand | None:
        result = await self._execute_async(
            lambda: self.client
            .from_("line_custom_commands")
            .select("*")
            .eq("alliance_id", str(alliance_id))
            .eq("trigger_keyword", trigger_keyword)
            .execute()
        )

        data = self._handle_supabase_result(result, allow_empty=True, expect_single=True)
        if not data:
            return None
        return LineCustomCommand(**data)

    async def create_custom_command(
        self,
        alliance_id: UUID,
        command_name: str,
        trigger_keyword: str,
        response_message: str,
        is_enabled: bool,
        created_by: UUID,
    ) -> LineCustomCommand:
        result = await self._execute_async(
            lambda: self.client
            .from_("line_custom_commands")
            .insert({
                "alliance_id": str(alliance_id),
                "command_name": command_name,
                "trigger_keyword": trigger_keyword,
                "response_message": response_message,
                "is_enabled": is_enabled,
                "created_by": str(created_by),
            })
            .execute()
        )

        data = self._handle_supabase_result(result, expect_single=True)
        return LineCustomCommand(**data)

    async def update_custom_command(
        self,
        command_id: UUID,
        update_data: dict[str, str | bool]
    ) -> LineCustomCommand:
        result = await self._execute_async(
            lambda: self.client
            .from_("line_custom_commands")
            .update(update_data)
            .eq("id", str(command_id))
            .select("*")
            .execute()
        )

        data = self._handle_supabase_result(result, expect_single=True)
        return LineCustomCommand(**data)

    async def delete_custom_command(self, command_id: UUID) -> None:
        await self._execute_async(
            lambda: self.client
            .from_("line_custom_commands")
            .delete()
            .eq("id", str(command_id))
            .execute()
        )

    # =========================================================================
    # User Notification Operations (每用戶每群組只通知一次)
    # =========================================================================

    async def has_user_been_notified(
        self,
        line_group_id: str,
        line_user_id: str
    ) -> bool:
        """Check if user has already been notified in this group"""
        result = await self._execute_async(
            lambda: self.client
            .from_("line_user_notifications")
            .select("line_user_id")
            .eq("line_group_id", line_group_id)
            .eq("line_user_id", line_user_id)
            .execute()
        )

        data = self._handle_supabase_result(result, allow_empty=True)
        return len(data) > 0

    async def record_user_notification(
        self,
        line_group_id: str,
        line_user_id: str
    ) -> None:
        """Record that user has been notified in this group"""
        await self._execute_async(
            lambda: self.client
            .from_("line_user_notifications")
            .upsert({
                "line_group_id": line_group_id,
                "line_user_id": line_user_id
            })
            .execute()
        )

    async def is_user_registered_in_group(
        self,
        line_group_id: str,
        line_user_id: str
    ) -> bool:
        """Check if a LINE user has any registered game IDs in the group's alliance"""
        group_binding = await self.get_group_binding_by_line_group_id(line_group_id)
        if not group_binding:
            return False

        bindings = await self.get_member_bindings_by_line_user(
            alliance_id=group_binding.alliance_id,
            line_user_id=line_user_id
        )
        return len(bindings) > 0
