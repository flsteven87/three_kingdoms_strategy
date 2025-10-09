"""
Alliance Repository

符合 CLAUDE.md 🔴:
- Inherits from SupabaseRepository
- Uses _handle_supabase_result() for all queries
- NEVER accesses result.data directly
"""

from uuid import UUID

from src.models.alliance import Alliance
from src.repositories.base import SupabaseRepository


class AllianceRepository(SupabaseRepository[Alliance]):
    """Repository for alliance data access"""

    def __init__(self):
        """Initialize alliance repository"""
        super().__init__(table_name="alliances", model_class=Alliance)

    async def get_by_collaborator(self, user_id: UUID) -> Alliance | None:
        """
        Get user's alliance (via alliance_collaborators relationship).

        Args:
            user_id: User UUID

        Returns:
            Alliance instance or None if not found

        Note:
            This replaces get_by_user_id() - now queries through alliance_collaborators
        """
        # Query alliance through collaborators relationship
        # Get first alliance user is collaborator of (Phase 1: single alliance per user)
        result = (
            self.client.from_("alliance_collaborators")
            .select("alliances(*)")
            .eq("user_id", str(user_id))
            .order("joined_at", desc=True)
            .limit(1)
            .execute()
        )

        data = self._handle_supabase_result(result, allow_empty=True)

        if not data or not data[0].get("alliances"):
            return None

        return self._build_model(data[0]["alliances"])

    async def create(self, alliance_data: dict) -> Alliance:
        """
        Create new alliance

        Args:
            alliance_data: Alliance data dictionary

        Returns:
            Created alliance instance

        符合 CLAUDE.md 🔴: Uses _handle_supabase_result()
        """
        result = self.client.from_(self.table_name).insert(alliance_data).execute()

        data = self._handle_supabase_result(result, expect_single=True)

        return self._build_model(data)

    async def update(self, alliance_id: UUID, alliance_data: dict) -> Alliance:
        """
        Update alliance

        Args:
            alliance_id: Alliance UUID
            alliance_data: Alliance data dictionary

        Returns:
            Updated alliance instance

        符合 CLAUDE.md 🔴: Uses _handle_supabase_result()
        """
        result = (
            self.client.from_(self.table_name)
            .update(alliance_data)
            .eq("id", str(alliance_id))
            .execute()
        )

        data = self._handle_supabase_result(result, expect_single=True)

        return self._build_model(data)

    async def delete(self, alliance_id: UUID) -> bool:
        """
        Delete alliance (hard delete)

        Args:
            alliance_id: Alliance UUID

        Returns:
            True if deleted successfully

        符合 CLAUDE.md: Hard delete only
        """
        result = (
            self.client.from_(self.table_name)
            .delete()
            .eq("id", str(alliance_id))
            .execute()
        )

        # Delete operations may return empty data
        self._handle_supabase_result(result, allow_empty=True)

        return True
