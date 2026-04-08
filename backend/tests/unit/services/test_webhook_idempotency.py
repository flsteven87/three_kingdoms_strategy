"""Tests for WebhookEventRepository.process_event (RPC wrapper)."""

from unittest.mock import MagicMock, patch
from uuid import UUID

import pytest
from postgrest.exceptions import APIError

from src.repositories.webhook_event_repository import (
    WebhookEventRepository,
    WebhookProcessingResult,
)

ALLIANCE_ID = UUID("22222222-2222-2222-2222-222222222222")
USER_ID = UUID("11111111-1111-1111-1111-111111111111")


def _make_repo() -> WebhookEventRepository:
    with patch("src.repositories.base.get_supabase_client"):
        return WebhookEventRepository()


@pytest.mark.asyncio
async def test_process_event_returns_granted_result():
    repo = _make_repo()
    rpc_result = MagicMock()
    rpc_result.data = [{"status": "granted", "available_seasons": 5}]
    repo.client.rpc = MagicMock(return_value=MagicMock(execute=MagicMock(return_value=rpc_result)))

    result = await repo.process_event(
        event_id="evt_1",
        event_type="checkout.completed",
        alliance_id=ALLIANCE_ID,
        user_id=USER_ID,
        seasons=1,
        payload={"amount": 999},
    )

    assert result == WebhookProcessingResult(status="granted", available_seasons=5)
    repo.client.rpc.assert_called_once_with(
        "process_payment_webhook_event",
        {
            "p_event_id": "evt_1",
            "p_event_type": "checkout.completed",
            "p_alliance_id": str(ALLIANCE_ID),
            "p_user_id": str(USER_ID),
            "p_seasons": 1,
            "p_payload": {"amount": 999},
        },
    )


@pytest.mark.asyncio
async def test_process_event_returns_duplicate_result():
    repo = _make_repo()
    rpc_result = MagicMock()
    rpc_result.data = [{"status": "duplicate", "available_seasons": 3}]
    repo.client.rpc = MagicMock(return_value=MagicMock(execute=MagicMock(return_value=rpc_result)))

    result = await repo.process_event(
        event_id="evt_dup",
        event_type="checkout.completed",
        alliance_id=ALLIANCE_ID,
        user_id=USER_ID,
        seasons=1,
        payload={},
    )
    assert result == WebhookProcessingResult(status="duplicate", available_seasons=3)


@pytest.mark.asyncio
async def test_process_event_raises_on_empty_rpc_response():
    repo = _make_repo()
    rpc_result = MagicMock()
    rpc_result.data = []
    repo.client.rpc = MagicMock(return_value=MagicMock(execute=MagicMock(return_value=rpc_result)))

    with pytest.raises(RuntimeError, match="RPC returned no rows"):
        await repo.process_event(
            event_id="evt_2",
            event_type="checkout.completed",
            alliance_id=ALLIANCE_ID,
            user_id=USER_ID,
            seasons=1,
            payload={},
        )


@pytest.mark.asyncio
async def test_process_event_propagates_api_error():
    repo = _make_repo()
    api_err = APIError({"message": "boom", "code": "XX000"})
    repo.client.rpc = MagicMock(return_value=MagicMock(execute=MagicMock(side_effect=api_err)))

    with pytest.raises(APIError):
        await repo.process_event(
            event_id="evt_3",
            event_type="checkout.completed",
            alliance_id=ALLIANCE_ID,
            user_id=USER_ID,
            seasons=1,
            payload={},
        )
