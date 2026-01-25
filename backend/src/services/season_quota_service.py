"""
Season Quota Service - Season Purchase System

Manages trial period and season quota for alliances.
Trial is now based on Season activation, not Alliance creation.

Key Logic:
- Trial available: No activated/completed seasons exist
- Can activate: has_trial_available OR available_seasons > 0
- Can write: purchased_seasons > 0 OR (current_season.is_trial AND within 14 days)

Follows CLAUDE.md:
- Service Layer: Business logic for season quota checking
- NO direct database calls (use Repository)
- Exception chaining with 'from e'
"""

import logging
from datetime import UTC, datetime, timedelta
from uuid import UUID

from src.core.exceptions import SeasonQuotaExhaustedError
from src.models.alliance import Alliance, SeasonQuotaStatus
from src.models.season import Season
from src.repositories.alliance_repository import AllianceRepository
from src.repositories.season_repository import SeasonRepository

logger = logging.getLogger(__name__)

TRIAL_DURATION_DAYS = 14


class SeasonQuotaService:
    """
    Season quota service for managing trial/season purchase status.

    Trial system is now Season-based:
    - Trial starts when user activates their FIRST season
    - Trial lasts 14 days from activation
    - Only ONE trial season allowed per alliance
    - After trial: season becomes read-only unless user purchases quota
    """

    def __init__(self):
        """Initialize season quota service with repositories."""
        self._alliance_repo = AllianceRepository()
        self._season_repo = SeasonRepository()

    # =========================================================================
    # Alliance Retrieval
    # =========================================================================

    async def get_alliance_by_user(self, user_id: UUID) -> Alliance | None:
        """Get alliance for a user."""
        return await self._alliance_repo.get_by_collaborator(user_id)

    async def get_alliance_by_id(self, alliance_id: UUID) -> Alliance | None:
        """Get alliance by ID."""
        return await self._alliance_repo.get_by_id(alliance_id)

    # =========================================================================
    # Trial Calculation (Season-based)
    # =========================================================================

    def _calculate_trial_end(self, season: Season) -> datetime | None:
        """Calculate when trial ends for a trial season."""
        if not season.is_trial or not season.activated_at:
            return None

        activated_at = season.activated_at
        if activated_at.tzinfo is None:
            activated_at = activated_at.replace(tzinfo=UTC)

        return activated_at + timedelta(days=TRIAL_DURATION_DAYS)

    def _is_trial_active(self, season: Season) -> bool:
        """Check if a trial season is still within trial period."""
        if not season.is_trial:
            return False

        trial_end = self._calculate_trial_end(season)
        if not trial_end:
            return False

        return datetime.now(UTC) < trial_end

    def _calculate_trial_days_remaining(self, season: Season) -> int | None:
        """Calculate days remaining in trial period."""
        if not season.is_trial:
            return None

        trial_end = self._calculate_trial_end(season)
        if not trial_end:
            return None

        now = datetime.now(UTC)
        if now >= trial_end:
            return 0

        delta = trial_end - now
        return delta.days

    # =========================================================================
    # Quota Calculation
    # =========================================================================

    def _calculate_available_seasons(self, alliance: Alliance) -> int:
        """Calculate available seasons (purchased - used)."""
        return max(0, alliance.purchased_seasons - alliance.used_seasons)

    async def _has_trial_available(self, alliance_id: UUID) -> bool:
        """Check if alliance can use trial (no activated/completed seasons yet)."""
        count = await self._season_repo.get_activated_seasons_count(alliance_id)
        return count == 0

    async def _can_activate_season(self, alliance: Alliance) -> bool:
        """
        Check if alliance can activate a new season.

        Can activate if:
        1. Has available purchased seasons, OR
        2. Never activated any season (trial available)
        """
        if self._calculate_available_seasons(alliance) > 0:
            return True

        return await self._has_trial_available(alliance.id)

    async def _can_write_to_season(
        self, alliance: Alliance, current_season: Season | None
    ) -> bool:
        """
        Check if user can write (upload CSV) to current season.

        Can write if:
        1. Has purchased seasons (purchased_seasons > 0), OR
        2. Current season is trial AND trial is active
        """
        if alliance.purchased_seasons > 0:
            return True

        if current_season and current_season.is_trial:
            return self._is_trial_active(current_season)

        return False

    # =========================================================================
    # Quota Status
    # =========================================================================

    async def _calculate_quota_status(
        self, alliance: Alliance, current_season: Season | None
    ) -> SeasonQuotaStatus:
        """Calculate detailed quota status for an alliance."""
        available_seasons = self._calculate_available_seasons(alliance)
        has_trial_available = await self._has_trial_available(alliance.id)

        # Use cached has_trial_available to avoid duplicate DB query
        can_activate = available_seasons > 0 or has_trial_available
        can_write = await self._can_write_to_season(alliance, current_season)

        # Trial info from current season
        current_is_trial = current_season.is_trial if current_season else False
        trial_days_remaining = None
        trial_ends_at = None

        if current_season and current_season.is_trial:
            trial_days_remaining = self._calculate_trial_days_remaining(current_season)
            trial_end = self._calculate_trial_end(current_season)
            trial_ends_at = trial_end.isoformat() if trial_end else None

        return SeasonQuotaStatus(
            purchased_seasons=alliance.purchased_seasons,
            used_seasons=alliance.used_seasons,
            available_seasons=available_seasons,
            has_trial_available=has_trial_available,
            current_season_is_trial=current_is_trial,
            trial_days_remaining=trial_days_remaining,
            trial_ends_at=trial_ends_at,
            can_activate_season=can_activate,
            can_write=can_write,
        )

    async def get_quota_status(self, user_id: UUID) -> SeasonQuotaStatus:
        """Get season quota status for a user's alliance."""
        alliance = await self.get_alliance_by_user(user_id)
        if not alliance:
            raise ValueError("No alliance found for user")

        current_season = await self._season_repo.get_current_season(alliance.id)
        return await self._calculate_quota_status(alliance, current_season)

    async def get_quota_status_by_alliance(self, alliance_id: UUID) -> SeasonQuotaStatus:
        """Get season quota status for a specific alliance."""
        alliance = await self.get_alliance_by_id(alliance_id)
        if not alliance:
            raise ValueError(f"Alliance not found: {alliance_id}")

        current_season = await self._season_repo.get_current_season(alliance_id)
        return await self._calculate_quota_status(alliance, current_season)

    # =========================================================================
    # Access Control
    # =========================================================================

    async def check_write_access(self, alliance_id: UUID) -> bool:
        """Check if alliance has write access."""
        try:
            status = await self.get_quota_status_by_alliance(alliance_id)
            return status.can_write
        except ValueError:
            return False

    async def can_activate_season(self, alliance_id: UUID) -> bool:
        """Check if alliance can activate a new season."""
        try:
            status = await self.get_quota_status_by_alliance(alliance_id)
            return status.can_activate_season
        except ValueError:
            return False

    async def require_write_access(
        self, alliance_id: UUID, action: str = "perform this action"
    ) -> None:
        """Require alliance to have write access."""
        alliance = await self.get_alliance_by_id(alliance_id)
        if not alliance:
            raise ValueError(f"Alliance not found: {alliance_id}")

        current_season = await self._season_repo.get_current_season(alliance_id)
        can_write = await self._can_write_to_season(alliance, current_season)

        if not can_write:
            logger.warning(
                f"Write access denied - alliance_id={alliance_id}, action={action}"
            )

            if current_season and current_season.is_trial:
                message = f"您的 14 天試用期已結束，請購買季數以繼續{action}。"
            else:
                message = f"您的可用季數已用完，請購買季數以繼續{action}。"

            raise SeasonQuotaExhaustedError(message)

    async def require_season_activation(self, alliance_id: UUID) -> None:
        """Require alliance to be able to activate a season."""
        alliance = await self.get_alliance_by_id(alliance_id)
        if not alliance:
            raise ValueError(f"Alliance not found: {alliance_id}")

        can_activate = await self._can_activate_season(alliance)
        if not can_activate:
            logger.warning(f"Season activation denied - alliance_id={alliance_id}")
            message = "您的可用季數已用完，請購買季數以啟用新賽季。"
            raise SeasonQuotaExhaustedError(message)

    # =========================================================================
    # Season Consumption
    # =========================================================================

    async def consume_season(self, alliance_id: UUID) -> tuple[int, bool, str | None]:
        """
        Consume one season from alliance's quota or use trial.

        Returns:
            Tuple of (remaining_seasons, used_trial, trial_ends_at)
        """
        alliance = await self.get_alliance_by_id(alliance_id)
        if not alliance:
            raise ValueError(f"Alliance not found: {alliance_id}")

        available = self._calculate_available_seasons(alliance)
        has_trial = await self._has_trial_available(alliance_id)

        # Priority: use purchased seasons first, then trial
        if available > 0:
            new_used = alliance.used_seasons + 1
            await self._alliance_repo.update(alliance_id, {"used_seasons": new_used})
            remaining = alliance.purchased_seasons - new_used
            logger.info(
                f"Season consumed (paid) - alliance_id={alliance_id}, remaining={remaining}"
            )
            return (remaining, False, None)

        if has_trial:
            trial_end = datetime.now(UTC) + timedelta(days=TRIAL_DURATION_DAYS)
            logger.info(
                f"Season activated using trial - alliance_id={alliance_id}, "
                f"trial_ends={trial_end.isoformat()}"
            )
            return (0, True, trial_end.isoformat())

        raise ValueError("No available seasons or trial to consume")

    async def add_purchased_seasons(self, alliance_id: UUID, seasons: int) -> int:
        """Add purchased seasons to alliance."""
        if seasons <= 0:
            raise ValueError("Seasons must be positive")

        alliance = await self.get_alliance_by_id(alliance_id)
        if not alliance:
            raise ValueError(f"Alliance not found: {alliance_id}")

        new_purchased = alliance.purchased_seasons + seasons
        await self._alliance_repo.update(alliance_id, {"purchased_seasons": new_purchased})

        new_available = new_purchased - alliance.used_seasons
        logger.info(
            f"Seasons purchased - alliance_id={alliance_id}, "
            f"added={seasons}, available={new_available}"
        )

        return new_available
