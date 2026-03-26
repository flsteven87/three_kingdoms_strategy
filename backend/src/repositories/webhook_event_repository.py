"""
Webhook Event Repository

Stores processed webhook events for idempotency dedup.
符合 CLAUDE.md 🔴: Inherits SupabaseRepository, uses _handle_supabase_result()
"""

import logging

from postgrest.exceptions import APIError
from pydantic import BaseModel, ConfigDict

from src.repositories.base import SupabaseRepository
from src.utils.postgrest import POSTGRES_UNIQUE_VIOLATION

logger = logging.getLogger(__name__)


class WebhookEvent(BaseModel):
    """Webhook event record for dedup."""

    model_config = ConfigDict(from_attributes=True)

    id: str | None = None
    event_id: str
    event_type: str
    alliance_id: str | None = None
    user_id: str | None = None
    seasons_added: int = 0
    payload: dict[str, object] | None = None


class WebhookEventRepository(SupabaseRepository[WebhookEvent]):
    """Repository for webhook event dedup records."""

    def __init__(self):
        super().__init__(table_name="webhook_events", model_class=WebhookEvent)

    async def try_claim_event(self, event_id: str, event_type: str) -> bool:
        """
        Atomically claim an event for processing via INSERT + UNIQUE constraint.

        Returns True if claimed (first to insert), False if already exists (duplicate).
        This is the idempotency gate — only the winner processes the payment.
        """
        try:
            await self._execute_async(
                lambda: self.client.from_(self.table_name)
                .insert({"event_id": event_id, "event_type": event_type})
                .execute()
            )
            return True
        except APIError as e:
            if e.code == POSTGRES_UNIQUE_VIOLATION:
                logger.info(f"Event already claimed - event_id={event_id}")
                return False
            raise

    async def update_event_details(
        self,
        *,
        event_id: str,
        alliance_id: str,
        user_id: str,
        seasons_added: int,
        payload: dict,
    ) -> None:
        """Update a claimed event with processing details after successful payment."""
        await self._execute_async(
            lambda: self.client.from_(self.table_name)
            .update(
                {
                    "alliance_id": alliance_id,
                    "user_id": user_id,
                    "seasons_added": seasons_added,
                    "payload": payload,
                }
            )
            .eq("event_id", event_id)
            .execute()
        )
