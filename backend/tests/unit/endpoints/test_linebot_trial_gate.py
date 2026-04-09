"""Tests for LINE bot trial/quota gate injected in _handle_group_message."""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from src.api.v1.endpoints.linebot import _handle_group_message
from src.core.exceptions import SeasonQuotaExhaustedError
from src.models.line_binding import LineWebhookEvent


ALLIANCE_ID = uuid4()
BOT_ID = "Ubot123"
GROUP_ID = "Cgroup123"
USER_ID = "Uuser123"
REPLY_TOKEN = "reply-token-abc"


def _make_event(text: str, mentions_bot: bool = False) -> LineWebhookEvent:
    message: dict = {"type": "text", "text": text}
    if mentions_bot:
        message["mention"] = {"mentionees": [{"userId": BOT_ID, "index": 0, "length": 4}]}
    return LineWebhookEvent(
        type="message",
        reply_token=REPLY_TOKEN,
        source={"type": "group", "groupId": GROUP_ID, "userId": USER_ID},
        message=message,
        timestamp=0,
    )


def _make_settings() -> MagicMock:
    settings = MagicMock()
    settings.line_bot_user_id = BOT_ID
    settings.liff_id = "liff-id"
    settings.frontend_url = "https://tktmanager.com"
    return settings


def _make_binding_service(*, binding=None) -> MagicMock:
    svc = MagicMock()
    svc.get_group_binding = AsyncMock(return_value=binding)
    svc.track_group_presence = AsyncMock(return_value=None)
    svc.get_current_season_id = AsyncMock(return_value=None)
    svc.get_custom_command_response = AsyncMock(return_value=None)
    svc.should_send_liff_notification = AsyncMock(return_value=False)
    svc.search_registered_members = AsyncMock(return_value=[])
    return svc


def _make_binding():
    binding = MagicMock()
    binding.alliance_id = ALLIANCE_ID
    return binding


def _make_quota_service(*, raise_error: SeasonQuotaExhaustedError | None = None) -> MagicMock:
    svc = MagicMock()
    if raise_error is not None:
        svc.require_write_access = AsyncMock(side_effect=raise_error)
    else:
        svc.require_write_access = AsyncMock(return_value=None)
    return svc


@pytest.mark.asyncio
async def test_unbound_group_bypasses_gate_and_still_processes_bind(monkeypatch):
    """Unbound group: /綁定 CODE must still work — gate does not run because no alliance exists yet."""
    binding_service = _make_binding_service(binding=None)
    quota_service = _make_quota_service()
    bind_handler = AsyncMock(return_value=None)
    monkeypatch.setattr(
        "src.api.v1.endpoints.linebot._handle_bind_command", bind_handler
    )
    monkeypatch.setattr(
        "src.api.v1.endpoints.linebot.get_group_member_display_name",
        lambda *a, **kw: "Tester",
    )

    event = _make_event("/綁定 ABC123")
    await _handle_group_message(
        event,
        binding_service,
        battle_event_service=MagicMock(),
        settings=_make_settings(),
        season_quota_service=quota_service,
    )

    quota_service.require_write_access.assert_not_called()
    bind_handler.assert_awaited_once()


@pytest.mark.asyncio
async def test_bound_group_active_quota_passes_gate(monkeypatch):
    """Bound group with active quota: gate runs, passes, command dispatches normally."""
    binding_service = _make_binding_service(binding=_make_binding())
    quota_service = _make_quota_service()
    reply_text = AsyncMock(return_value=None)
    monkeypatch.setattr("src.api.v1.endpoints.linebot._reply_text", reply_text)
    monkeypatch.setattr(
        "src.api.v1.endpoints.linebot.get_group_member_display_name",
        lambda *a, **kw: "Tester",
    )

    # Plain text with no mention / no command → falls through to "should_send_liff_notification" path
    event = _make_event("hello")
    await _handle_group_message(
        event,
        binding_service,
        battle_event_service=MagicMock(),
        settings=_make_settings(),
        season_quota_service=quota_service,
    )

    quota_service.require_write_access.assert_awaited_once_with(
        ALLIANCE_ID, action="使用 LINE 小幫手"
    )
    # No renewal message sent
    for call in reply_text.await_args_list:
        assert "試用" not in call.args[1]
        assert "季數" not in call.args[1]


@pytest.mark.asyncio
async def test_bound_group_trial_expired_replies_renewal_message(monkeypatch):
    """Bound group with expired trial: gate blocks, sends polite renewal reply, no dispatch."""
    err = SeasonQuotaExhaustedError(
        "您的 14 天試用期已結束，請購買季數以繼續使用 LINE 小幫手。"
    )
    binding_service = _make_binding_service(binding=_make_binding())
    quota_service = _make_quota_service(raise_error=err)
    reply_text = AsyncMock(return_value=None)
    bind_handler = AsyncMock(return_value=None)
    monkeypatch.setattr("src.api.v1.endpoints.linebot._reply_text", reply_text)
    monkeypatch.setattr(
        "src.api.v1.endpoints.linebot._handle_bind_command", bind_handler
    )
    monkeypatch.setattr(
        "src.api.v1.endpoints.linebot.get_group_member_display_name",
        lambda *a, **kw: "Tester",
    )

    # Even /綁定 on an already-bound group should be blocked
    event = _make_event("/綁定 ABC123")
    await _handle_group_message(
        event,
        binding_service,
        battle_event_service=MagicMock(),
        settings=_make_settings(),
        season_quota_service=quota_service,
    )

    quota_service.require_write_access.assert_awaited_once()
    bind_handler.assert_not_called()
    reply_text.assert_awaited_once()
    msg = reply_text.await_args.args[1]
    assert "14 天試用期已結束" in msg
    assert "https://tktmanager.com/purchase" in msg


@pytest.mark.asyncio
async def test_bound_group_quota_exhausted_replies_renewal_message(monkeypatch):
    """Bound paid-out group: gate blocks with quota-exhausted variant, sends renewal reply."""
    err = SeasonQuotaExhaustedError(
        "您的可用季數已用完，請購買季數以繼續使用 LINE 小幫手。"
    )
    binding_service = _make_binding_service(binding=_make_binding())
    quota_service = _make_quota_service(raise_error=err)
    reply_text = AsyncMock(return_value=None)
    monkeypatch.setattr("src.api.v1.endpoints.linebot._reply_text", reply_text)
    monkeypatch.setattr(
        "src.api.v1.endpoints.linebot.get_group_member_display_name",
        lambda *a, **kw: "Tester",
    )

    event = _make_event("@bot /最新戰役", mentions_bot=True)
    await _handle_group_message(
        event,
        binding_service,
        battle_event_service=MagicMock(),
        settings=_make_settings(),
        season_quota_service=quota_service,
    )

    quota_service.require_write_access.assert_awaited_once()
    reply_text.assert_awaited_once()
    msg = reply_text.await_args.args[1]
    assert "季數已用完" in msg
    assert "https://tktmanager.com/purchase" in msg
