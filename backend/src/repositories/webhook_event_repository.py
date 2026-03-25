"""
Webhook Event Repository

Stores processed webhook events for idempotency dedup.
符合 CLAUDE.md 🔴: Inherits SupabaseRepository, uses _handle_supabase_result()
"""

from pydantic import BaseModel, ConfigDict

from src.repositories.base import SupabaseRepository


class WebhookEvent(BaseModel):
    """Webhook event record for dedup."""

    model_config = ConfigDict(from_attributes=True)

    id: str | None = None
    event_id: str
    event_type: str
    alliance_id: str | None = None
    user_id: str | None = None
    seasons_added: int = 0
    payload: dict | None = None


class WebhookEventRepository(SupabaseRepository[WebhookEvent]):
    """Repository for webhook event dedup records."""

    def __init__(self):
        super().__init__(table_name="webhook_events", model_class=WebhookEvent)

    async def exists_by_event_id(self, event_id: str) -> bool:
        """Check if an event has already been processed."""
        result = await self._execute_async(
            lambda: self.client.from_(self.table_name)
            .select("id")
            .eq("event_id", event_id)
            .limit(1)
            .execute()
        )
        data = self._handle_supabase_result(result, allow_empty=True)
        return len(data) > 0

    async def create(self, event_data: dict) -> WebhookEvent:
        """Record a processed webhook event."""
        result = await self._execute_async(
            lambda: self.client.from_(self.table_name).insert(event_data).execute()
        )
        data = self._handle_supabase_result(result, expect_single=True)
        return self._build_model(data)
