"""
Subscription Service - Season Purchase System

符合 CLAUDE.md:
- 🔴 Service Layer: Business logic for subscription/season purchase checking
- 🔴 NO direct database calls (use Repository)
- 🟡 Exception chaining with 'from e'
"""

import logging
from datetime import UTC, datetime
from uuid import UUID

from src.core.exceptions import SubscriptionExpiredError
from src.models.alliance import Alliance, SubscriptionStatusResponse
from src.repositories.alliance_repository import AllianceRepository

logger = logging.getLogger(__name__)


class SubscriptionService:
    """
    Subscription service for managing trial/season purchase status.

    Handles checking subscription validity and enforcing write access restrictions
    based on trial period or available seasons.
    """

    def __init__(self):
        """Initialize subscription service with repository"""
        self._alliance_repo = AllianceRepository()

    async def get_alliance_by_user(self, user_id: UUID) -> Alliance | None:
        """
        Get alliance for a user.

        Args:
            user_id: User UUID

        Returns:
            Alliance if found, None otherwise
        """
        return await self._alliance_repo.get_by_collaborator(user_id)

    async def get_alliance_by_id(self, alliance_id: UUID) -> Alliance | None:
        """
        Get alliance by ID.

        Args:
            alliance_id: Alliance UUID

        Returns:
            Alliance if found, None otherwise
        """
        return await self._alliance_repo.get_by_id(alliance_id)

    def _is_trial_active(self, alliance: Alliance) -> bool:
        """
        Check if alliance is within active trial period.

        Args:
            alliance: Alliance model

        Returns:
            True if trial is active, False otherwise
        """
        if alliance.subscription_status != "trial":
            return False

        if not alliance.trial_ends_at:
            return False

        now = datetime.now(UTC)
        trial_end = alliance.trial_ends_at

        # Ensure timezone-aware comparison
        if trial_end.tzinfo is None:
            trial_end = trial_end.replace(tzinfo=UTC)

        return now < trial_end

    def _calculate_trial_days_remaining(self, alliance: Alliance) -> int | None:
        """
        Calculate days remaining in trial period.

        Args:
            alliance: Alliance model

        Returns:
            Days remaining, or None if not in trial
        """
        if not alliance.trial_ends_at:
            return None

        now = datetime.now(UTC)
        trial_end = alliance.trial_ends_at

        if trial_end.tzinfo is None:
            trial_end = trial_end.replace(tzinfo=UTC)

        if now >= trial_end:
            return 0

        delta = trial_end - now
        return delta.days

    def _calculate_available_seasons(self, alliance: Alliance) -> int:
        """
        Calculate available seasons for an alliance.

        Args:
            alliance: Alliance model

        Returns:
            Number of available seasons (purchased - used)
        """
        return max(0, alliance.purchased_seasons - alliance.used_seasons)

    def _can_activate_season(self, alliance: Alliance) -> bool:
        """
        Check if alliance can activate a new season.

        Activation is allowed if:
        1. Trial is still active, OR
        2. Has available seasons (purchased - used > 0)

        Args:
            alliance: Alliance model

        Returns:
            True if can activate, False otherwise
        """
        # Trial period allows free activation
        if self._is_trial_active(alliance):
            return True

        # Has available purchased seasons
        return self._calculate_available_seasons(alliance) > 0

    def _determine_subscription_status(self, alliance: Alliance) -> str:
        """
        Determine the subscription status based on trial and seasons.

        Args:
            alliance: Alliance model

        Returns:
            Status string: 'trial', 'active', or 'expired'
        """
        is_trial_active = self._is_trial_active(alliance)
        available_seasons = self._calculate_available_seasons(alliance)

        if is_trial_active:
            return "trial"
        elif available_seasons > 0:
            return "active"
        else:
            return "expired"

    def _calculate_subscription_status(self, alliance: Alliance) -> SubscriptionStatusResponse:
        """
        Calculate detailed subscription status for an alliance.

        Args:
            alliance: Alliance model

        Returns:
            SubscriptionStatusResponse with full status details
        """
        is_trial_active = self._is_trial_active(alliance)
        trial_days_remaining = self._calculate_trial_days_remaining(alliance)
        available_seasons = self._calculate_available_seasons(alliance)
        can_activate = self._can_activate_season(alliance)
        status = self._determine_subscription_status(alliance)

        # is_active means user can perform actions (activate seasons)
        is_active = can_activate

        return SubscriptionStatusResponse(
            status=status,
            is_active=is_active,
            is_trial=alliance.subscription_status == "trial",
            is_trial_active=is_trial_active,
            trial_days_remaining=trial_days_remaining,
            trial_ends_at=(
                alliance.trial_ends_at.isoformat() if alliance.trial_ends_at else None
            ),
            purchased_seasons=alliance.purchased_seasons,
            used_seasons=alliance.used_seasons,
            available_seasons=available_seasons,
            can_activate_season=can_activate,
        )

    async def get_subscription_status(self, user_id: UUID) -> SubscriptionStatusResponse:
        """
        Get subscription status for a user's alliance.

        Args:
            user_id: User UUID

        Returns:
            SubscriptionStatusResponse with full status details

        Raises:
            ValueError: If user has no alliance
        """
        alliance = await self.get_alliance_by_user(user_id)

        if not alliance:
            raise ValueError("No alliance found for user")

        return self._calculate_subscription_status(alliance)

    async def get_subscription_status_by_alliance(
        self, alliance_id: UUID
    ) -> SubscriptionStatusResponse:
        """
        Get subscription status for a specific alliance.

        Args:
            alliance_id: Alliance UUID

        Returns:
            SubscriptionStatusResponse with full status details

        Raises:
            ValueError: If alliance not found
        """
        alliance = await self.get_alliance_by_id(alliance_id)

        if not alliance:
            raise ValueError(f"Alliance not found: {alliance_id}")

        return self._calculate_subscription_status(alliance)

    async def check_write_access(self, alliance_id: UUID) -> bool:
        """
        Check if alliance has write access (active trial or has seasons).

        Args:
            alliance_id: Alliance UUID

        Returns:
            True if write access is allowed, False otherwise
        """
        try:
            status = await self.get_subscription_status_by_alliance(alliance_id)
            return status.is_active
        except ValueError:
            return False

    async def can_activate_season(self, alliance_id: UUID) -> bool:
        """
        Check if alliance can activate a new season.

        Args:
            alliance_id: Alliance UUID

        Returns:
            True if can activate, False otherwise
        """
        try:
            status = await self.get_subscription_status_by_alliance(alliance_id)
            return status.can_activate_season
        except ValueError:
            return False

    async def require_write_access(
        self, alliance_id: UUID, action: str = "perform this action"
    ) -> None:
        """
        Require alliance to have write access.

        Args:
            alliance_id: Alliance UUID
            action: Description of the action being attempted

        Raises:
            SubscriptionExpiredError: If trial/subscription has expired
            ValueError: If alliance not found
        """
        status = await self.get_subscription_status_by_alliance(alliance_id)

        if not status.is_active:
            logger.warning(
                f"Write access denied - alliance_id={alliance_id}, "
                f"status={status.status}, action={action}"
            )

            if status.is_trial:
                message = (
                    f"您的 14 天試用期已結束，請購買季數以繼續{action}。"
                )
            else:
                message = (
                    f"您的可用季數已用完，請購買季數以繼續{action}。"
                )

            raise SubscriptionExpiredError(message)

    async def require_season_activation(self, alliance_id: UUID) -> None:
        """
        Require alliance to be able to activate a season.

        Args:
            alliance_id: Alliance UUID

        Raises:
            SubscriptionExpiredError: If cannot activate season
            ValueError: If alliance not found
        """
        status = await self.get_subscription_status_by_alliance(alliance_id)

        if not status.can_activate_season:
            logger.warning(
                f"Season activation denied - alliance_id={alliance_id}, "
                f"status={status.status}, available_seasons={status.available_seasons}"
            )

            if status.is_trial:
                message = "您的 14 天試用期已結束，請購買季數以啟用新賽季。"
            else:
                message = "您的可用季數已用完，請購買季數以啟用新賽季。"

            raise SubscriptionExpiredError(message)

    async def consume_season(self, alliance_id: UUID) -> int:
        """
        Consume one season from alliance's available seasons.

        This should be called when activating a season (if not using trial).

        Args:
            alliance_id: Alliance UUID

        Returns:
            Remaining available seasons after consumption

        Raises:
            ValueError: If alliance not found or no seasons available
        """
        alliance = await self.get_alliance_by_id(alliance_id)

        if not alliance:
            raise ValueError(f"Alliance not found: {alliance_id}")

        # If trial is active, don't consume seasons
        if self._is_trial_active(alliance):
            logger.info(f"Season activated using trial - alliance_id={alliance_id}")
            return self._calculate_available_seasons(alliance)

        # Check if has available seasons
        available = self._calculate_available_seasons(alliance)
        if available <= 0:
            raise ValueError("No available seasons to consume")

        # Increment used_seasons
        new_used = alliance.used_seasons + 1
        await self._alliance_repo.update(
            alliance_id, {"used_seasons": new_used}
        )

        remaining = alliance.purchased_seasons - new_used
        logger.info(
            f"Season consumed - alliance_id={alliance_id}, "
            f"used={new_used}, remaining={remaining}"
        )

        return remaining

    async def add_purchased_seasons(self, alliance_id: UUID, seasons: int) -> int:
        """
        Add purchased seasons to alliance (called after successful payment).

        Args:
            alliance_id: Alliance UUID
            seasons: Number of seasons to add

        Returns:
            New total available seasons

        Raises:
            ValueError: If alliance not found or invalid seasons count
        """
        if seasons <= 0:
            raise ValueError("Seasons must be positive")

        alliance = await self.get_alliance_by_id(alliance_id)

        if not alliance:
            raise ValueError(f"Alliance not found: {alliance_id}")

        new_purchased = alliance.purchased_seasons + seasons

        # Update subscription status to active if was expired
        updates = {"purchased_seasons": new_purchased}
        if alliance.subscription_status == "expired":
            updates["subscription_status"] = "active"

        await self._alliance_repo.update(alliance_id, updates)

        new_available = new_purchased - alliance.used_seasons
        logger.info(
            f"Seasons purchased - alliance_id={alliance_id}, "
            f"added={seasons}, total_purchased={new_purchased}, available={new_available}"
        )

        return new_available
