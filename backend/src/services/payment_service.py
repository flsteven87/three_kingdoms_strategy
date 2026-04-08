"""
Payment Service — Recur webhook processing.

Responsibilities:
    1. Validate that the event's product/amount/currency match server config.
    2. Resolve the buyer's alliance.
    3. Call the atomic ``process_payment_webhook_event`` RPC to claim + grant.

Errors are raised as ``WebhookPermanentError`` or ``WebhookTransientError``
so the API layer can translate to the correct HTTP status.
"""

import logging
from uuid import UUID

from postgrest.exceptions import APIError

from src.core.config import settings
from src.core.webhook_errors import WebhookPermanentError, WebhookTransientError
from src.repositories.webhook_event_repository import (
    WebhookEventRepository,
    WebhookProcessingResult,
)
from src.services.season_quota_service import SeasonQuotaService

logger = logging.getLogger(__name__)

# One product = one season. Quantity is NEVER taken from the event.
SEASONS_PER_PURCHASE = 1


class PaymentService:
    def __init__(self) -> None:
        self._quota_service = SeasonQuotaService()
        self._webhook_repo = WebhookEventRepository()

    async def handle_payment_success(
        self,
        event_data: dict,
        *,
        event_id: str | None = None,
        event_type: str = "checkout.completed",
    ) -> dict:
        """
        Validate + grant for a ``checkout.completed`` / ``order.paid`` event.

        Returns a dict describing the outcome. Raises ``WebhookPermanentError``
        for unretryable problems and ``WebhookTransientError`` for retryable
        problems.
        """
        if not event_id:
            raise WebhookPermanentError("missing_event_id")

        user_id = self._extract_user_id(event_data, event_id=event_id)
        self._validate_product(event_data, event_id=event_id)
        self._validate_amount(event_data, event_id=event_id)
        self._validate_currency(event_data, event_id=event_id)

        try:
            alliance = await self._quota_service.get_alliance_by_user(user_id)
        except (APIError, OSError) as e:
            raise WebhookTransientError(
                "alliance_lookup_failed", event_id=event_id, user_id=str(user_id)
            ) from e

        if alliance is None:
            raise WebhookPermanentError(
                "alliance_not_found", event_id=event_id, user_id=str(user_id)
            )

        try:
            result: WebhookProcessingResult = await self._webhook_repo.process_event(
                event_id=event_id,
                event_type=event_type,
                alliance_id=alliance.id,
                user_id=user_id,
                seasons=SEASONS_PER_PURCHASE,
                payload=event_data,
            )
        except APIError as e:
            raise WebhookTransientError("rpc_api_error", event_id=event_id) from e
        except OSError as e:
            raise WebhookTransientError("rpc_os_error", event_id=event_id) from e

        if result.status == "duplicate":
            logger.info("Duplicate webhook skipped event_id=%s", event_id)
            return {
                "status": "duplicate",
                "alliance_id": str(alliance.id),
                "user_id": str(user_id),
                "seasons_added": 0,
                "available_seasons": result.available_seasons,
            }

        logger.info(
            "Season granted event_id=%s alliance_id=%s user_id=%s available=%s",
            event_id,
            alliance.id,
            user_id,
            result.available_seasons,
        )
        return {
            "status": "granted",
            "alliance_id": str(alliance.id),
            "user_id": str(user_id),
            "seasons_added": SEASONS_PER_PURCHASE,
            "available_seasons": result.available_seasons,
        }

    # ------------------------------------------------------------------
    # Validation helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _extract_user_id(event_data: dict, *, event_id: str) -> UUID:
        """
        Pull the buyer's user UUID from the webhook payload.

        Tolerates a legacy ``uuid:qty`` suffix: Recur's Customer.externalId is
        sticky per-email, so customers first seen under the old format keep
        sending that string forever. Any suffix after the first ``:`` is ignored
        — quantity is hardcoded by :data:`SEASONS_PER_PURCHASE`, so the suffix
        cannot inflate the grant even if it says ``:999``.
        """
        raw = event_data.get("externalCustomerId") or event_data.get("external_customer_id")
        if not raw:
            raise WebhookPermanentError("missing_external_customer_id", event_id=event_id)
        uuid_part = str(raw).split(":", 1)[0]
        try:
            return UUID(uuid_part)
        except (ValueError, TypeError) as e:
            raise WebhookPermanentError(
                "invalid_external_customer_id", event_id=event_id, raw=str(raw)
            ) from e

    @staticmethod
    def _validate_product(event_data: dict, *, event_id: str) -> None:
        expected = settings.recur_product_id
        actual = event_data.get("productId") or event_data.get("product_id")
        if not expected or actual != expected:
            raise WebhookPermanentError(
                "product_mismatch", event_id=event_id, expected=expected, actual=actual
            )

    @staticmethod
    def _validate_amount(event_data: dict, *, event_id: str) -> None:
        expected = settings.recur_expected_amount_twd
        raw = event_data.get("amount")
        try:
            actual = int(raw) if raw is not None else None
        except (TypeError, ValueError) as e:
            raise WebhookPermanentError(
                "amount_mismatch", event_id=event_id, expected=expected, actual=raw
            ) from e
        if actual != expected:
            raise WebhookPermanentError(
                "amount_mismatch", event_id=event_id, expected=expected, actual=actual
            )

    @staticmethod
    def _validate_currency(event_data: dict, *, event_id: str) -> None:
        expected = (settings.recur_expected_currency or "TWD").upper()
        actual = (event_data.get("currency") or expected).upper()
        if actual != expected:
            raise WebhookPermanentError(
                "currency_mismatch", event_id=event_id, expected=expected, actual=actual
            )
