"""
Payment Service — Recur webhook processing (purchase-level idempotency).

Responsibilities:
    1. Route by event type: only ``order.paid`` grants; ``checkout.completed``
       is audit-only. Unknown types become permanent errors.
    2. Extract purchase-level identifiers (``checkout_id``, ``order_id``)
       from the real Recur payload shapes.
    3. Validate server-authoritative product/amount/currency (strict).
    4. Resolve the buyer's alliance.
    5. Call the atomic ``process_payment_webhook_event`` v2 RPC.

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

# Only ``order.paid`` actually grants a season; ``checkout.completed`` is
# audit-only. Any other event type is a hard stop — we would rather 4xx and
# alert than silently grant on an unknown event.
GRANTING_EVENT_TYPE = "order.paid"
AUDIT_ONLY_EVENT_TYPES = frozenset({"checkout.completed"})
KNOWN_EVENT_TYPES = frozenset({GRANTING_EVENT_TYPE}) | AUDIT_ONLY_EVENT_TYPES


class PaymentService:
    def __init__(self) -> None:
        self._quota_service = SeasonQuotaService()
        self._webhook_repo = WebhookEventRepository()

    async def handle_payment_success(
        self,
        event_data: dict,
        *,
        event_id: str | None = None,
        event_type: str = GRANTING_EVENT_TYPE,
    ) -> dict:
        """Validate + (optionally) grant for a Recur webhook event.

        Returns a dict describing the outcome. Raises ``WebhookPermanentError``
        for unretryable problems and ``WebhookTransientError`` for retryable
        problems.
        """
        if not event_id:
            raise WebhookPermanentError("missing_event_id")
        if event_type not in KNOWN_EVENT_TYPES:
            raise WebhookPermanentError(
                "unsupported_event_type", event_id=event_id, event_type=event_type
            )

        user_id = self._extract_user_id(event_data, event_id=event_id)
        checkout_id = self._extract_checkout_id(
            event_data, event_id=event_id, event_type=event_type
        )
        order_id = self._extract_order_id(event_data, event_type=event_type)

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

        seasons = SEASONS_PER_PURCHASE if event_type == GRANTING_EVENT_TYPE else 0

        try:
            result: WebhookProcessingResult = await self._webhook_repo.process_event(
                event_id=event_id,
                event_type=event_type,
                checkout_id=checkout_id,
                order_id=order_id,
                alliance_id=alliance.id,
                user_id=user_id,
                seasons=seasons,
                payload=event_data,
            )
        except APIError as e:
            raise WebhookTransientError("rpc_api_error", event_id=event_id) from e
        except OSError as e:
            raise WebhookTransientError("rpc_os_error", event_id=event_id) from e

        seasons_added = SEASONS_PER_PURCHASE if result.status == "granted" else 0
        logger.info(
            "Webhook processed status=%s event_id=%s event_type=%s "
            "checkout_id=%s alliance_id=%s user_id=%s available=%s",
            result.status,
            event_id,
            event_type,
            checkout_id,
            alliance.id,
            user_id,
            result.available_seasons,
        )
        return {
            "status": result.status,
            "alliance_id": str(alliance.id),
            "user_id": str(user_id),
            "checkout_id": checkout_id,
            "order_id": order_id,
            "seasons_added": seasons_added,
            "available_seasons": result.available_seasons,
        }

    # ------------------------------------------------------------------
    # Extraction helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _extract_user_id(event_data: dict, *, event_id: str) -> UUID:
        """Pull the buyer's user UUID from the webhook payload.

        Real Recur payloads put it at ``data.customer.external_id`` (snake_case).
        Camel-case and ``data.order.customer.externalId`` fallbacks exist for
        defensive coverage but are never observed in production and should
        eventually be pruned.
        """
        raw = PaymentService._find_external_customer_id(event_data)
        if not raw:
            logger.warning(
                "Webhook missing externalCustomerId event_id=%s top_keys=%s customer_keys=%s",
                event_id,
                sorted(event_data.keys()),
                sorted((event_data.get("customer") or {}).keys())
                if isinstance(event_data.get("customer"), dict)
                else None,
            )
            raise WebhookPermanentError("missing_external_customer_id", event_id=event_id)

        if ":" in str(raw):
            # Legacy sticky-per-email customers created before the 2026-04-08
            # rewrite still send ``uuid:qty``. Suffix is ignored; quantity is
            # hardcoded by SEASONS_PER_PURCHASE. Log so we can detect when
            # the last legacy customer stops firing and delete this path.
            logger.warning(
                "legacy_external_id_suffix event_id=%s raw=%s", event_id, raw
            )

        uuid_part = str(raw).split(":", 1)[0]
        try:
            return UUID(uuid_part)
        except (ValueError, TypeError) as e:
            raise WebhookPermanentError(
                "invalid_external_customer_id", event_id=event_id, raw=str(raw)
            ) from e

    @staticmethod
    def _find_external_customer_id(event_data: dict) -> str | None:
        """Walk the known Recur payload shapes looking for the external customer id."""
        def _first_str(*candidates: object) -> str | None:
            for c in candidates:
                if isinstance(c, str) and c:
                    return c
            return None

        top = _first_str(
            event_data.get("externalCustomerId"),
            event_data.get("external_customer_id"),
        )
        if top:
            return top

        customer = event_data.get("customer")
        if isinstance(customer, dict):
            nested = _first_str(
                customer.get("external_id"),
                customer.get("externalId"),
                customer.get("externalCustomerId"),
                customer.get("external_customer_id"),
            )
            if nested:
                return nested

        order = event_data.get("order")
        if isinstance(order, dict):
            order_customer = order.get("customer")
            if isinstance(order_customer, dict):
                nested = _first_str(
                    order_customer.get("external_id"),
                    order_customer.get("externalId"),
                )
                if nested:
                    return nested

        return None

    @staticmethod
    def _extract_checkout_id(
        event_data: dict, *, event_id: str, event_type: str
    ) -> str:
        """Checkout id = purchase-level idempotency key. Mandatory.

        ``checkout.completed.payload.id``    → the checkout id itself
        ``order.paid.payload.checkout_id``   → explicit field
        """
        if event_type == "checkout.completed":
            raw = event_data.get("id")
        else:  # order.paid
            raw = event_data.get("checkout_id") or event_data.get("checkoutId")

        if not isinstance(raw, str) or not raw:
            raise WebhookPermanentError(
                "missing_checkout_id",
                event_id=event_id,
                event_type=event_type,
            )
        return raw

    @staticmethod
    def _extract_order_id(event_data: dict, *, event_type: str) -> str | None:
        """Order id only exists on ``order.paid``. Return None otherwise."""
        if event_type != "order.paid":
            return None
        raw = (
            event_data.get("order_id")
            or event_data.get("orderId")
            or event_data.get("id")  # order.paid.payload.id is also the order id
        )
        return raw if isinstance(raw, str) and raw else None

    # ------------------------------------------------------------------
    # Validation helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _validate_product(event_data: dict, *, event_id: str) -> None:
        expected = settings.recur_product_id
        actual = event_data.get("product_id") or event_data.get("productId")
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
                "amount_unparseable", event_id=event_id, expected=expected, actual=raw
            ) from e
        if actual != expected:
            raise WebhookPermanentError(
                "amount_mismatch", event_id=event_id, expected=expected, actual=actual
            )

    @staticmethod
    def _validate_currency(event_data: dict, *, event_id: str) -> None:
        """Strict currency check — real Recur payloads always include it."""
        expected = (settings.recur_expected_currency or "TWD").upper()
        raw = event_data.get("currency")
        if raw is None:
            raise WebhookPermanentError(
                "currency_missing", event_id=event_id, expected=expected
            )
        actual = str(raw).upper()
        if actual != expected:
            raise WebhookPermanentError(
                "currency_mismatch", event_id=event_id, expected=expected, actual=actual
            )
