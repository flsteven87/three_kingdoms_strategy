"""
Webhook Event Repository

Thin wrapper around the atomic Postgres RPC ``process_payment_webhook_event``
which performs idempotency claim + audit write + season grant in one
transaction.

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
    """Audit row in ``webhook_events``. Read-only from the app layer."""

    model_config = ConfigDict(from_attributes=True)

    id: str | None = None
    event_id: str
    event_type: str
    alliance_id: str | None = None
    user_id: str | None = None
    seasons_added: int = 0
    payload: dict[str, object] | None = None


class WebhookProcessingResult(BaseModel):
    """Result returned by the atomic RPC."""

    status: Literal["granted", "duplicate"]
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
        alliance_id: UUID,
        user_id: UUID,
        seasons: int,
        payload: dict,
    ) -> WebhookProcessingResult:
        """
        Atomically claim + audit + grant via ``process_payment_webhook_event``.

        Returns ``WebhookProcessingResult(status="granted"|"duplicate", available_seasons=int)``.

        Raises:
            postgrest.exceptions.APIError: transient DB/RPC failures.
            RuntimeError: RPC returned an empty result (should not happen).
        """
        params = {
            "p_event_id": event_id,
            "p_event_type": event_type,
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

        row = rows[0]
        return WebhookProcessingResult(
            status=row["status"],
            available_seasons=int(row["available_seasons"]),
        )
