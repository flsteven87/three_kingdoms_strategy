"""
Season Service Layer

符合 CLAUDE.md 🔴:
- Business logic layer
- Orchestrates repositories
- No direct database calls
"""

from uuid import UUID

from src.models.season import Season, SeasonCreate, SeasonUpdate
from src.repositories.alliance_repository import AllianceRepository
from src.repositories.season_repository import SeasonRepository


class SeasonService:
    """
    Season business logic service

    Handles season CRUD operations, validation, and active season management
    """

    def __init__(self):
        """Initialize season service with repositories"""
        self._repo = SeasonRepository()
        self._alliance_repo = AllianceRepository()

    async def get_seasons(self, user_id: UUID, active_only: bool = False) -> list[Season]:
        """
        Get all seasons for user's alliance

        Args:
            user_id: User UUID from authentication
            active_only: Only return active seasons

        Returns:
            List of season instances

        Raises:
            ValueError: If user has no alliance
        """
        # Verify user has alliance
        alliance = await self._alliance_repo.get_by_collaborator(user_id)
        if not alliance:
            raise ValueError("User has no alliance")

        return await self._repo.get_by_alliance(alliance.id, active_only=active_only)

    async def get_season(self, user_id: UUID, season_id: UUID) -> Season:
        """
        Get specific season by ID

        Args:
            user_id: User UUID from authentication
            season_id: Season UUID

        Returns:
            Season instance

        Raises:
            ValueError: If user has no alliance or season not found
            PermissionError: If user doesn't own the season
        """
        # Verify user has alliance
        alliance = await self._alliance_repo.get_by_collaborator(user_id)
        if not alliance:
            raise ValueError("User has no alliance")

        # Get season and verify ownership
        season = await self._repo.get_by_id(season_id)
        if not season:
            raise ValueError("Season not found")

        if season.alliance_id != alliance.id:
            raise PermissionError("User does not have permission to access this season")

        return season

    async def get_active_season(self, user_id: UUID) -> Season | None:
        """
        Get active season for user's alliance

        Args:
            user_id: User UUID from authentication

        Returns:
            Active season or None if not found

        Raises:
            ValueError: If user has no alliance
        """
        # Verify user has alliance
        alliance = await self._alliance_repo.get_by_collaborator(user_id)
        if not alliance:
            raise ValueError("User has no alliance")

        return await self._repo.get_active_season(alliance.id)

    async def create_season(self, user_id: UUID, season_data: SeasonCreate) -> Season:
        """
        Create new season for user's alliance

        Args:
            user_id: User UUID from authentication
            season_data: Season creation data

        Returns:
            Created season instance

        Raises:
            ValueError: If user has no alliance
            PermissionError: If alliance_id doesn't match user's alliance
        """
        # Verify user has alliance
        alliance = await self._alliance_repo.get_by_collaborator(user_id)
        if not alliance:
            raise ValueError("User has no alliance")

        # Verify alliance_id matches user's alliance
        if season_data.alliance_id != alliance.id:
            raise PermissionError("Cannot create season for different alliance")

        # Create season
        data = season_data.model_dump()
        data["alliance_id"] = str(alliance.id)

        # Convert date objects to ISO format strings for Supabase
        if "start_date" in data and data["start_date"]:
            data["start_date"] = data["start_date"].isoformat()
        if "end_date" in data and data["end_date"]:
            data["end_date"] = data["end_date"].isoformat()

        return await self._repo.create(data)

    async def update_season(
        self, user_id: UUID, season_id: UUID, season_data: SeasonUpdate
    ) -> Season:
        """
        Update existing season

        Args:
            user_id: User UUID from authentication
            season_id: Season UUID
            season_data: Season update data

        Returns:
            Updated season instance

        Raises:
            ValueError: If user has no alliance or season not found
            PermissionError: If user doesn't own the season
        """
        # Verify ownership through get_season
        await self.get_season(user_id, season_id)

        # Update only provided fields
        update_data = season_data.model_dump(exclude_unset=True)

        # Convert date objects to ISO format strings for Supabase
        if "start_date" in update_data and update_data["start_date"]:
            update_data["start_date"] = update_data["start_date"].isoformat()
        if "end_date" in update_data and update_data["end_date"]:
            update_data["end_date"] = update_data["end_date"].isoformat()

        return await self._repo.update(season_id, update_data)

    async def delete_season(self, user_id: UUID, season_id: UUID) -> bool:
        """
        Delete season (hard delete, CASCADE will remove related data)

        Args:
            user_id: User UUID from authentication
            season_id: Season UUID

        Returns:
            True if deleted successfully

        Raises:
            ValueError: If user has no alliance or season not found
            PermissionError: If user doesn't own the season
        """
        # Verify ownership through get_season
        await self.get_season(user_id, season_id)

        return await self._repo.delete(season_id)

    async def set_active_season(self, user_id: UUID, season_id: UUID) -> Season:
        """
        Set a season as active and deactivate all others for the alliance

        Args:
            user_id: User UUID from authentication
            season_id: Season UUID to set as active

        Returns:
            Updated active season

        Raises:
            ValueError: If user has no alliance or season not found
            PermissionError: If user doesn't own the season
        """
        # Verify ownership
        alliance = await self._alliance_repo.get_by_collaborator(user_id)
        if not alliance:
            raise ValueError("User has no alliance")

        # Verify user owns the season
        await self.get_season(user_id, season_id)

        # Deactivate all seasons for this alliance
        all_seasons = await self._repo.get_by_alliance(alliance.id)
        for s in all_seasons:
            if s.is_active:
                await self._repo.update(s.id, {"is_active": False})

        # Activate the target season
        return await self._repo.update(season_id, {"is_active": True})
