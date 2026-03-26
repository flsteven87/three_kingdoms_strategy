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

from postgrest.exceptions import APIError

from src.repositories.webhook_event_repository import WebhookEventRepository
from src.services.season_quota_service import SeasonQuotaService

logger = logging.getLogger(__name__)


class PaymentService:
    """
    Payment service for processing Recur webhook events.

    Handles checkout.completed events to add purchased seasons
    to the user's alliance.
    """

    def __init__(self):
        self._quota_service = SeasonQuotaService()
        self._webhook_repo = WebhookEventRepository()

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

    async def handle_payment_success(
        self,
        event_data: dict,
        *,
        event_id: str | None = None,
        event_type: str = "checkout.completed",
    ) -> dict:
        """
        Handle successful payment events (checkout.completed, order.paid).

        Parses externalCustomerId, grants seasons, and records the event.
        Idempotent via webhook_events UNIQUE constraint on event_id.

        Raises:
            ValueError: If required data is missing or invalid.
        """
        if not event_id:
            raise ValueError("Missing event_id — cannot process webhook without idempotency guard")

        if not await self._webhook_repo.try_claim_event(event_id, event_type):
            logger.info("Duplicate webhook event skipped - event_id=%s", event_id)
            return {"success": True, "duplicate": True, "event_id": event_id}

        external_customer_id = event_data.get("externalCustomerId")
        if not external_customer_id:
            external_customer_id = event_data.get("external_customer_id")

        if not external_customer_id:
            raise ValueError("Missing externalCustomerId in checkout.completed event")

        user_id, quantity = self._parse_external_customer_id(external_customer_id)

        logger.info(
            "Processing checkout.completed - user_id=%s, quantity=%s, amount=%s, event_id=%s",
            user_id,
            quantity,
            event_data.get("amount"),
            event_id,
        )

        alliance = await self._quota_service.get_alliance_by_user(user_id)
        if not alliance:
            raise ValueError(f"No alliance found for user: {user_id}")

        new_available = await self._quota_service.add_purchased_seasons(
            alliance_id=alliance.id,
            seasons=quantity,
        )

        try:
            await self._webhook_repo.update_event_details(
                event_id=event_id,
                alliance_id=str(alliance.id),
                user_id=str(user_id),
                seasons_added=quantity,
                payload=event_data,
            )
        except (APIError, OSError):
            logger.critical(
                "AUDIT RECORD FAILED - payment processed but not recorded. "
                "event_id=%s, user_id=%s, alliance_id=%s, quantity=%s "
                "— MANUAL RECONCILIATION NEEDED",
                event_id,
                user_id,
                alliance.id,
                quantity,
                exc_info=True,
            )

        logger.info(
            "Seasons added successfully - alliance_id=%s, quantity=%s, new_available=%s",
            alliance.id,
            quantity,
            new_available,
        )

        return {
            "success": True,
            "alliance_id": str(alliance.id),
            "user_id": str(user_id),
            "seasons_added": quantity,
            "available_seasons": new_available,
        }
