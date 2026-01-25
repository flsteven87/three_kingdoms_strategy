"""
Payment Service - Recur Webhook Processing

Handles payment webhook events from Recur gateway.

Follows CLAUDE.md:
- Service Layer: Business logic for payment processing
- NO direct database calls (use SeasonQuotaService)
- Exception chaining with 'from e'
"""

import logging
from uuid import UUID

from src.services.season_quota_service import SeasonQuotaService

logger = logging.getLogger(__name__)


class PaymentService:
    """
    Payment service for processing Recur webhook events.

    Handles checkout.completed events to add purchased seasons
    to the user's alliance.
    """

    def __init__(self):
        """Initialize payment service with dependencies."""
        self._quota_service = SeasonQuotaService()

    def _parse_external_customer_id(self, external_customer_id: str) -> tuple[UUID, int]:
        """
        Parse externalCustomerId to extract user_id and quantity.

        The frontend passes format: "user_id:quantity"
        Example: "550e8400-e29b-41d4-a716-446655440000:3"

        Args:
            external_customer_id: String in format "user_id:quantity"

        Returns:
            Tuple of (user_id as UUID, quantity as int)

        Raises:
            ValueError: If format is invalid
        """
        if not external_customer_id:
            raise ValueError("externalCustomerId is empty")

        parts = external_customer_id.split(":")
        if len(parts) != 2:
            raise ValueError(
                f"Invalid externalCustomerId format: {external_customer_id}. "
                "Expected format: user_id:quantity"
            )

        try:
            user_id = UUID(parts[0])
        except ValueError as e:
            raise ValueError(f"Invalid user_id in externalCustomerId: {parts[0]}") from e

        try:
            quantity = int(parts[1])
            if quantity <= 0:
                raise ValueError("Quantity must be positive")
        except ValueError as e:
            raise ValueError(f"Invalid quantity in externalCustomerId: {parts[1]}") from e

        return user_id, quantity

    async def handle_checkout_completed(self, event_data: dict) -> dict:
        """
        Handle checkout.completed webhook event.

        Parses the externalCustomerId to get user_id and quantity,
        then adds the purchased seasons to the user's alliance.

        Args:
            event_data: Webhook event data containing:
                - externalCustomerId: "user_id|quantity" format
                - amount: Payment amount in cents
                - productId: Recur product ID

        Returns:
            Dict with processing result

        Raises:
            ValueError: If required data is missing or invalid
        """
        external_customer_id = event_data.get("externalCustomerId")
        if not external_customer_id:
            # Try alternative field names
            external_customer_id = event_data.get("external_customer_id")

        if not external_customer_id:
            raise ValueError("Missing externalCustomerId in checkout.completed event")

        # Parse user_id and quantity from externalCustomerId
        user_id, quantity = self._parse_external_customer_id(external_customer_id)

        logger.info(
            f"Processing checkout.completed - user_id={user_id}, quantity={quantity}, "
            f"amount={event_data.get('amount')}"
        )

        # Get user's alliance
        alliance = await self._quota_service.get_alliance_by_user(user_id)
        if not alliance:
            raise ValueError(f"No alliance found for user: {user_id}")

        # Add purchased seasons
        new_available = await self._quota_service.add_purchased_seasons(
            alliance_id=alliance.id,
            seasons=quantity,
        )

        logger.info(
            f"Seasons added successfully - alliance_id={alliance.id}, "
            f"quantity={quantity}, new_available={new_available}"
        )

        return {
            "success": True,
            "alliance_id": str(alliance.id),
            "user_id": str(user_id),
            "seasons_added": quantity,
            "available_seasons": new_available,
        }
