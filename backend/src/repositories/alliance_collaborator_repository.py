"""
Alliance Collaborator Repository

符合 CLAUDE.md:
- 🔴 Inherit from SupabaseRepository
- 🔴 Use _handle_supabase_result() for ALL queries
- 🔴 NEVER access result.data directly
"""

from uuid import UUID

from src.models.alliance_collaborator import AllianceCollaboratorDB
from src.repositories.base import SupabaseRepository


class AllianceCollaboratorRepository(SupabaseRepository[AllianceCollaboratorDB]):
    """
    Alliance collaborator repository for managing user-alliance relationships.

    符合 CLAUDE.md 4-Layer Architecture:
    - Repository Layer: Database queries and data transformation only
    - NO business logic (belongs in Service layer)
    """

    def __init__(self):
        super().__init__(
            table_name="alliance_collaborators", model_class=AllianceCollaboratorDB
        )

    async def add_collaborator(
        self,
        alliance_id: UUID,
        user_id: UUID,
        role: str = "member",
        invited_by: UUID | None = None,
    ) -> AllianceCollaboratorDB:
        """
        Add a collaborator to alliance.

        Args:
            alliance_id: Alliance UUID
            user_id: User UUID to add
            role: Collaborator role (default: 'member')
            invited_by: User who invited this collaborator

        Returns:
            AllianceCollaboratorDB: Created collaborator record

        Raises:
            HTTPException: If Supabase operation fails
        """
        result = (
            self.client.from_(self.table_name)
            .insert(
                {
                    "alliance_id": str(alliance_id),
                    "user_id": str(user_id),
                    "role": role,
                    "invited_by": str(invited_by) if invited_by else None,
                }
            )
            .execute()
        )

        data = self._handle_supabase_result(result, allow_empty=False)
        return self._build_model(data[0])

    async def remove_collaborator(self, alliance_id: UUID, user_id: UUID) -> bool:
        """
        Remove a collaborator from alliance.

        Args:
            alliance_id: Alliance UUID
            user_id: User UUID to remove

        Returns:
            bool: True if successful
        """
        result = (
            self.client.from_(self.table_name)
            .delete()
            .eq("alliance_id", str(alliance_id))
            .eq("user_id", str(user_id))
            .execute()
        )

        self._handle_supabase_result(result, allow_empty=True)
        return True

    async def get_alliance_collaborators(self, alliance_id: UUID) -> list[dict]:
        """
        Get all collaborators of an alliance.

        Args:
            alliance_id: Alliance UUID

        Returns:
            list[dict]: List of collaborators with user data

        Note:
            Returns raw dict because we need to enrich with user data
        """
        result = (
            self.client.from_(self.table_name)
            .select("*")
            .eq("alliance_id", str(alliance_id))
            .order("joined_at")
            .execute()
        )

        return self._handle_supabase_result(result, allow_empty=True)

    async def get_user_alliances(self, user_id: UUID) -> list[dict]:
        """
        Get all alliances that user is a collaborator of.

        Args:
            user_id: User UUID

        Returns:
            list[dict]: List of memberships with alliance data
        """
        result = (
            self.client.from_(self.table_name)
            .select("*, alliances(*)")
            .eq("user_id", str(user_id))
            .order("joined_at", desc=True)
            .execute()
        )

        return self._handle_supabase_result(result, allow_empty=True)

    async def is_collaborator(self, alliance_id: UUID, user_id: UUID) -> bool:
        """
        Check if user is a collaborator of alliance.

        Args:
            alliance_id: Alliance UUID
            user_id: User UUID

        Returns:
            bool: True if user is collaborator
        """
        result = (
            self.client.from_(self.table_name)
            .select("id")
            .eq("alliance_id", str(alliance_id))
            .eq("user_id", str(user_id))
            .limit(1)
            .execute()
        )

        data = self._handle_supabase_result(result, allow_empty=True)
        return len(data) > 0

    async def get_collaborator_role(
        self, alliance_id: UUID, user_id: UUID
    ) -> str | None:
        """
        Get user's role in alliance.

        Args:
            alliance_id: Alliance UUID
            user_id: User UUID

        Returns:
            str | None: Role name or None if not a collaborator
        """
        result = (
            self.client.from_(self.table_name)
            .select("role")
            .eq("alliance_id", str(alliance_id))
            .eq("user_id", str(user_id))
            .limit(1)
            .execute()
        )

        data = self._handle_supabase_result(result, allow_empty=True, expect_single=True)
        return data.get("role") if data else None

    async def update_role(
        self, alliance_id: UUID, user_id: UUID, new_role: str
    ) -> AllianceCollaboratorDB:
        """
        Update collaborator's role (Phase 2).

        Args:
            alliance_id: Alliance UUID
            user_id: User UUID
            new_role: New role to assign

        Returns:
            AllianceCollaboratorDB: Updated collaborator record
        """
        result = (
            self.client.from_(self.table_name)
            .update({"role": new_role})
            .eq("alliance_id", str(alliance_id))
            .eq("user_id", str(user_id))
            .execute()
        )

        data = self._handle_supabase_result(result, allow_empty=False)
        return self._build_model(data[0])
