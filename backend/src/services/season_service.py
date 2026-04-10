"""
Season Service Layer - Season Purchase System

符合 CLAUDE.md 🔴:
- Business logic layer
- Orchestrates repositories
- No direct database calls
"""

import logging
from datetime import UTC, date, datetime
from uuid import UUID

from src.models.season import Season, SeasonActivateResponse, SeasonCreate, SeasonUpdate
from src.repositories.alliance_repository import AllianceRepository
from src.repositories.season_repository import SeasonRepository
from src.services.permission_service import PermissionService
from src.services.season_quota_service import SeasonQuotaService

logger = logging.getLogger(__name__)

# Maximum season duration in days (4 months ≈ 120 days)
MAX_SEASON_DAYS = 120


class SeasonService:
    """
    Season business logic service

    Handles season CRUD operations, validation, activation, and current season management.

    Key concepts:
    - activation_status: 'draft' | 'activated' | 'completed' - payment/activation state
    - is_current: boolean - which season is currently selected for display
    """

    def __init__(self):
        """Initialize season service with repositories"""
        self._repo = SeasonRepository()
        self._alliance_repo = AllianceRepository()
        self._permission_service = PermissionService()
        self._season_quota_service = SeasonQuotaService()

    def _validate_season_duration(self, start_date: date, end_date: date | None) -> None:
        """
        Validate season duration does not exceed maximum allowed days.

        Args:
            start_date: Season start date
            end_date: Season end date (can be None for drafts)

        Raises:
            ValueError: If duration exceeds MAX_SEASON_DAYS
        """
        if end_date is None:
            return

        duration = (end_date - start_date).days
        if duration > MAX_SEASON_DAYS:
            raise ValueError(f"賽季長度不能超過 {MAX_SEASON_DAYS} 天（約 4 個月）")

    async def verify_user_access(self, user_id: UUID, season_id: UUID) -> UUID:
        """
        Verify user has access to season and return alliance_id

        This is a utility method for API endpoints to verify access before operations.

        Args:
            user_id: User UUID
            season_id: Season UUID

        Returns:
            UUID: The alliance_id if access is granted

        Raises:
            ValueError: If season not found
            PermissionError: If user is not a member of the alliance
        """
        season = await self._repo.get_by_id(season_id)
        if not season:
            raise ValueError("Season not found")

        role = await self._permission_service.get_user_role(user_id, season.alliance_id)
        if role is None:
            raise PermissionError("You are not a member of this alliance")

        return season.alliance_id

    async def get_seasons(self, user_id: UUID, activated_only: bool = False) -> list[Season]:
        """
        Get all seasons for user's alliance

        Args:
            user_id: User UUID from authentication
            activated_only: Only return activated seasons

        Returns:
            List of season instances

        Raises:
            ValueError: If user has no alliance
        """
        # Verify user has alliance
        alliance = await self._alliance_repo.get_by_collaborator(user_id)
        if not alliance:
            raise ValueError("User has no alliance")

        return await self._repo.get_by_alliance(alliance.id, activated_only=activated_only)

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

    async def get_current_season(self, user_id: UUID) -> Season | None:
        """
        Get current (selected) season for user's alliance

        Args:
            user_id: User UUID from authentication

        Returns:
            Current season or None if not found

        Raises:
            ValueError: If user has no alliance
        """
        # Verify user has alliance
        alliance = await self._alliance_repo.get_by_collaborator(user_id)
        if not alliance:
            raise ValueError("User has no alliance")

        return await self._repo.get_current_season(alliance.id)

    async def create_season(self, user_id: UUID, season_data: SeasonCreate) -> Season:
        """
        Create new season for user's alliance

        New seasons are created as 'draft' and not current.
        User must activate the season (consuming a season credit) before it can be set as current.

        Permission: owner + collaborator

        Args:
            user_id: User UUID from authentication
            season_data: Season creation data

        Returns:
            Created season instance (draft status)

        Raises:
            ValueError: If user has no alliance
            PermissionError: If alliance_id doesn't match user's alliance
            HTTPException 403: If user doesn't have permission
        """
        # Verify user has alliance
        alliance = await self._alliance_repo.get_by_collaborator(user_id)
        if not alliance:
            raise ValueError("User has no alliance")

        # Verify alliance_id matches user's alliance
        if season_data.alliance_id != alliance.id:
            raise PermissionError("Cannot create season for different alliance")

        # Verify write permission (role check only - creating draft doesn't require quota)
        await self._permission_service.require_role_permission(user_id, alliance.id)

        # Validate season duration (if end_date is provided)
        self._validate_season_duration(season_data.start_date, season_data.end_date)

        # Create season as draft (not current)
        data = season_data.model_dump()
        data["alliance_id"] = str(alliance.id)
        data["activation_status"] = "draft"
        data["is_current"] = False

        # Convert date objects to ISO format strings for Supabase
        if "start_date" in data and data["start_date"]:
            data["start_date"] = data["start_date"].isoformat()
        if "end_date" in data and data["end_date"]:
            data["end_date"] = data["end_date"].isoformat()

        season = await self._repo.create(data)
        logger.info("Season created as draft - season_id=%s, alliance_id=%s", season.id, alliance.id)

        return season

    async def activate_season(self, user_id: UUID, season_id: UUID) -> SeasonActivateResponse:
        """
        Activate a draft season (consume season credit or use trial)

        This changes the season status from 'draft' to 'activated'.
        If this is the first season ever activated for the alliance,
        it becomes a trial season with 14-day access.

        Permission: owner + collaborator

        Args:
            user_id: User UUID from authentication
            season_id: Season UUID to activate

        Returns:
            SeasonActivateResponse with activation result

        Raises:
            ValueError: If season not found or not in draft status
            PermissionError: If user doesn't own the season
            SeasonQuotaExhaustedError: If no available seasons
        """
        # Verify ownership
        season = await self.get_season(user_id, season_id)

        if season.activation_status != "draft":
            raise ValueError(f"Season is already {season.activation_status}, cannot activate")

        # Validate season duration if end_date is set
        if season.end_date is not None:
            self._validate_season_duration(season.start_date, season.end_date)

        # Verify can activate (has trial or seasons)
        await self._season_quota_service.require_season_activation(season.alliance_id)

        # Consume season (handles trial vs paid logic)
        # Returns tuple: (remaining_seasons, used_trial, trial_ends_at)
        remaining, used_trial, trial_ends_at = await self._season_quota_service.consume_season(
            season.alliance_id
        )

        # Update season status with trial info
        update_data: dict[str, object] = {
            "activation_status": "activated",
            "activated_at": datetime.now(UTC).isoformat(),
            "is_trial": used_trial,
        }

        # Auto-set as current if no season is currently selected
        current = await self._repo.get_current_season(season.alliance_id)
        if current is None:
            update_data["is_current"] = True

        updated_season = await self._repo.update(season_id, update_data)

        logger.info(
            "Season activated - season_id=%s, used_trial=%s, remaining_seasons=%s, auto_current=%s",
            season_id,
            used_trial,
            remaining,
            current is None,
        )

        return SeasonActivateResponse(
            success=True,
            season=updated_season,
            remaining_seasons=remaining,
            used_trial=used_trial,
            trial_ends_at=trial_ends_at,
        )

    async def update_season(
        self, user_id: UUID, season_id: UUID, season_data: SeasonUpdate
    ) -> Season:
        """
        Update existing season

        Edit restrictions based on activation_status:
        - draft: all fields editable
        - activated: name/description editable, start_date locked,
                     end_date can extend (within limits)
        - completed: name/description editable, dates locked

        Permission: owner + collaborator

        Args:
            user_id: User UUID from authentication
            season_id: Season UUID
            season_data: Season update data

        Returns:
            Updated season instance

        Raises:
            ValueError: If user has no alliance, season not found, or edit not allowed
            PermissionError: If user doesn't own the season
            HTTPException 403: If user doesn't have permission
        """
        # Verify ownership through get_season
        season = await self.get_season(user_id, season_id)

        # Verify write permission (role check)
        await self._permission_service.require_role_permission(user_id, season.alliance_id)

        # Update only provided fields
        update_data = season_data.model_dump(exclude_unset=True)

        # Apply edit restrictions based on status
        if season.activation_status == "activated":
            # start_date is locked after activation
            if "start_date" in update_data:
                raise ValueError("賽季啟用後無法修改開始日期")

            # end_date can be extended but must respect limits
            if "end_date" in update_data:
                new_end_date = update_data["end_date"]
                if new_end_date is not None:
                    # Validate duration
                    self._validate_season_duration(season.start_date, new_end_date)

        elif season.activation_status == "completed":
            # Both dates are locked after completion
            if "start_date" in update_data:
                raise ValueError("已完成的賽季無法修改開始日期")
            if "end_date" in update_data:
                raise ValueError("已完成的賽季無法修改結束日期")

        else:  # draft status
            # All fields editable, but still need validation
            new_start = update_data.get("start_date", season.start_date)
            new_end = update_data.get("end_date", season.end_date)

            # Validate duration if end_date is set
            if new_end is not None:
                self._validate_season_duration(new_start, new_end)


        # Convert date objects to ISO format strings for Supabase
        if "start_date" in update_data and update_data["start_date"]:
            update_data["start_date"] = update_data["start_date"].isoformat()
        if "end_date" in update_data and update_data["end_date"]:
            update_data["end_date"] = update_data["end_date"].isoformat()

        return await self._repo.update(season_id, update_data)

    async def delete_season(self, user_id: UUID, season_id: UUID) -> bool:
        """
        Delete season (hard delete, CASCADE will remove related data)

        Only draft seasons can be deleted. Activated and completed seasons
        are permanent records and cannot be deleted.

        Permission: owner + collaborator

        Args:
            user_id: User UUID from authentication
            season_id: Season UUID

        Returns:
            True if deleted successfully

        Raises:
            ValueError: If user has no alliance, season not found, or not a draft
            PermissionError: If user doesn't own the season
            HTTPException 403: If user doesn't have permission
        """
        # Verify ownership through get_season
        season = await self.get_season(user_id, season_id)

        # Only draft seasons can be deleted
        if season.activation_status != "draft":
            status_text = "已啟用" if season.activation_status == "activated" else "已完成"
            raise ValueError(f"無法刪除{status_text}的賽季，只有草稿賽季可以刪除")

        # Verify write permission (role check)
        await self._permission_service.require_role_permission(user_id, season.alliance_id)

        return await self._repo.delete(season_id)

    async def set_current_season(self, user_id: UUID, season_id: UUID) -> Season:
        """
        Set a season as current (selected for display) and unset all others

        Both activated and completed seasons can be set as current.
        Draft seasons must be activated first.

        Permission: owner + collaborator

        Args:
            user_id: User UUID from authentication
            season_id: Season UUID to set as current

        Returns:
            Updated current season

        Raises:
            ValueError: If season not found or is draft
            PermissionError: If user doesn't own the season
            HTTPException 403: If user doesn't have permission
        """
        # Verify ownership
        alliance = await self._alliance_repo.get_by_collaborator(user_id)
        if not alliance:
            raise ValueError("User has no alliance")

        # Verify user owns the season (raises error if not)
        season = await self.get_season(user_id, season_id)

        # Only non-draft seasons can be set as current (activated or completed)
        if season.activation_status == "draft":
            raise ValueError(
                "Cannot set draft season as current. "
                "Please activate the season first."
            )

        # Verify write permission (role check)
        await self._permission_service.require_role_permission(user_id, alliance.id)

        # Unset current for all seasons in this alliance (single SQL query)
        await self._repo.unset_all_current_by_alliance(alliance.id)

        # Set the target season as current
        return await self._repo.update(season_id, {"is_current": True})

    async def complete_season(self, user_id: UUID, season_id: UUID) -> Season:
        """
        Mark a season as completed

        Completed seasons can still be set as current for viewing data.
        Use reopen_season to change back to activated if needed.

        Permission: owner + collaborator

        Args:
            user_id: User UUID from authentication
            season_id: Season UUID to complete

        Returns:
            Updated season

        Raises:
            ValueError: If season not found or not activated
            PermissionError: If user doesn't own the season
        """
        # Verify ownership
        season = await self.get_season(user_id, season_id)

        if season.activation_status != "activated":
            raise ValueError("Only activated seasons can be marked as completed")

        # Verify write permission (role check)
        await self._permission_service.require_role_permission(user_id, season.alliance_id)

        # Keep is_current as-is (completed seasons can remain as current for viewing)
        return await self._repo.update(season_id, {"activation_status": "completed"})

    async def reopen_season(self, user_id: UUID, season_id: UUID) -> Season:
        """
        Reopen a completed season back to activated status

        Permission: owner + collaborator

        Args:
            user_id: User UUID from authentication
            season_id: Season UUID to reopen

        Returns:
            Updated season

        Raises:
            ValueError: If season not found or not completed
            PermissionError: If user doesn't own the season
        """
        # Verify ownership
        season = await self.get_season(user_id, season_id)

        if season.activation_status != "completed":
            raise ValueError("Only completed seasons can be reopened")

        # Verify write permission (role check)
        await self._permission_service.require_role_permission(user_id, season.alliance_id)

        return await self._repo.update(season_id, {"activation_status": "activated"})
