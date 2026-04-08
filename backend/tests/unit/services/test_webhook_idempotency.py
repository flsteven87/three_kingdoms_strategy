"""Tests for WebhookEventRepository.process_event (v2 RPC wrapper)."""

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
CHECKOUT_ID = "chk_test_aaaaaaaaaaaaaaaaaaaaaaaa"
ORDER_ID = "ord_test_bbbbbbbbbbbbbbbbbbbbbbbb"


def _make_repo() -> WebhookEventRepository:
    with patch("src.repositories.base.get_supabase_client"):
        return WebhookEventRepository()


def _mock_rpc(repo: WebhookEventRepository, rows: list[dict]) -> MagicMock:
    rpc_result = MagicMock()
    rpc_result.data = rows
    mock_rpc = MagicMock(return_value=MagicMock(execute=MagicMock(return_value=rpc_result)))
    repo.client.rpc = mock_rpc
    return mock_rpc


@pytest.mark.asyncio
async def test_process_event_passes_new_rpc_params():
    repo = _make_repo()
    mock_rpc = _mock_rpc(repo, [{"status": "granted", "available_seasons": 5}])

    result = await repo.process_event(
        event_id="evt_1",
        event_type="order.paid",
        checkout_id=CHECKOUT_ID,
        order_id=ORDER_ID,
        alliance_id=ALLIANCE_ID,
        user_id=USER_ID,
        seasons=1,
        payload={"amount": 999},
    )

    assert result == WebhookProcessingResult(status="granted", available_seasons=5)
    mock_rpc.assert_called_once_with(
        "process_payment_webhook_event",
        {
            "p_event_id": "evt_1",
            "p_event_type": "order.paid",
            "p_checkout_id": CHECKOUT_ID,
            "p_order_id": ORDER_ID,
            "p_alliance_id": str(ALLIANCE_ID),
            "p_user_id": str(USER_ID),
            "p_seasons": 1,
            "p_payload": {"amount": 999},
        },
    )


@pytest.mark.asyncio
async def test_process_event_accepts_null_order_id_for_checkout_completed():
    repo = _make_repo()
    mock_rpc = _mock_rpc(repo, [{"status": "audit_only", "available_seasons": 4}])

    result = await repo.process_event(
        event_id="evt_chk",
        event_type="checkout.completed",
        checkout_id=CHECKOUT_ID,
        order_id=None,
        alliance_id=ALLIANCE_ID,
        user_id=USER_ID,
        seasons=0,
        payload={},
    )

    assert result == WebhookProcessingResult(status="audit_only", available_seasons=4)
    call_args = mock_rpc.call_args[0]
    params = call_args[1]
    assert params["p_order_id"] is None
    assert params["p_seasons"] == 0


@pytest.mark.asyncio
async def test_process_event_duplicate_event_status():
    repo = _make_repo()
    _mock_rpc(repo, [{"status": "duplicate_event", "available_seasons": 3}])

    result = await repo.process_event(
        event_id="evt_dup",
        event_type="order.paid",
        checkout_id=CHECKOUT_ID,
        order_id=ORDER_ID,
        alliance_id=ALLIANCE_ID,
        user_id=USER_ID,
        seasons=1,
        payload={},
    )
    assert result.status == "duplicate_event"


@pytest.mark.asyncio
async def test_process_event_duplicate_purchase_status():
    repo = _make_repo()
    _mock_rpc(repo, [{"status": "duplicate_purchase", "available_seasons": 6}])

    result = await repo.process_event(
        event_id="evt_sibling",
        event_type="order.paid",
        checkout_id=CHECKOUT_ID,
        order_id=ORDER_ID,
        alliance_id=ALLIANCE_ID,
        user_id=USER_ID,
        seasons=1,
        payload={},
    )
    assert result.status == "duplicate_purchase"


@pytest.mark.asyncio
async def test_process_event_raises_on_empty_rpc_response():
    repo = _make_repo()
    _mock_rpc(repo, [])

    with pytest.raises(RuntimeError, match="RPC returned no rows"):
        await repo.process_event(
            event_id="evt_2",
            event_type="order.paid",
            checkout_id=CHECKOUT_ID,
            order_id=ORDER_ID,
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
            event_type="order.paid",
            checkout_id=CHECKOUT_ID,
            order_id=ORDER_ID,
            alliance_id=ALLIANCE_ID,
            user_id=USER_ID,
            seasons=1,
            payload={},
        )
