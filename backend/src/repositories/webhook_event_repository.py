"""
Webhook Event Repository

Thin wrapper around the atomic Postgres RPC ``process_payment_webhook_event``
(v2, 2026-04-09) which performs idempotency claim + audit write + optional
season grant in one transaction, keyed on the purchase-level ``checkout_id``.

符合 CLAUDE.md 🔴: Inherits SupabaseRepository; no direct table mutation for
payment-grant logic — all behavior goes through the RPC.
"""

import logging
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from src.repositories.base import SupabaseRepository

logger = logging.getLogger(__name__)

RPC_NAME = "process_payment_webhook_event"


class WebhookEvent(BaseModel):
    """Audit row in ``webhook_events``. Read-only from the app layer.

    Kept only to satisfy ``SupabaseRepository[T]`` generic parameter; no CRUD
    methods are used here — all behavior flows through ``process_event``.
    Do not "clean up" without rewriting the base class.
    """

    model_config = ConfigDict(from_attributes=True)

    id: str | None = None
    event_id: str
    event_type: str
    alliance_id: str | None = None
    user_id: str | None = None
    seasons_added: int = 0
    payload: dict[str, object] | None = None
    checkout_id: str | None = None
    order_id: str | None = None


class WebhookProcessingResult(BaseModel):
    """Result returned by the atomic RPC."""

    status: Literal[
        "granted",
        "duplicate_event",
        "duplicate_purchase",
        "audit_only",
    ]
    available_seasons: int


class WebhookEventRepository(SupabaseRepository[WebhookEvent]):
    """Repository wrapping the atomic payment-webhook RPC."""

    def __init__(self) -> None:
        super().__init__(table_name="webhook_events", model_class=WebhookEvent)

    async def process_event(
        self,
        *,
        event_id: str,
        event_type: str,
        checkout_id: str,
        order_id: str | None,
        alliance_id: UUID,
        user_id: UUID,
        seasons: int,
        payload: dict,
    ) -> WebhookProcessingResult:
        """
        Atomically claim + audit + (optionally) grant via the v2 RPC.

        ``seasons=0`` yields an audit-only row (``checkout.completed`` path).
        Purchase-level idempotency is enforced by the RPC using
        ``checkout_id`` and a transaction-scoped advisory lock.

        Returns ``WebhookProcessingResult(status=..., available_seasons=int)``
        where status is one of ``granted``, ``duplicate_event``,
        ``duplicate_purchase``, or ``audit_only``.

        Raises:
            postgrest.exceptions.APIError: transient DB/RPC failures.
            RuntimeError: RPC returned an empty or multi-row result.
        """
        params = {
            "p_event_id": event_id,
            "p_event_type": event_type,
            "p_checkout_id": checkout_id,
            "p_order_id": order_id,
            "p_alliance_id": str(alliance_id),
            "p_user_id": str(user_id),
            "p_seasons": seasons,
            "p_payload": payload,
        }

        result = await self._execute_async(
            lambda: self.client.rpc(RPC_NAME, params).execute()
        )

        rows = result.data or []
        if not rows:
            raise RuntimeError(f"{RPC_NAME} RPC returned no rows for event_id={event_id}")
        if len(rows) != 1:
            raise RuntimeError(
                f"{RPC_NAME} RPC returned {len(rows)} rows; expected exactly 1"
            )

        row = rows[0]
        return WebhookProcessingResult(
            status=row["status"],
            available_seasons=int(row["available_seasons"]),
        )
