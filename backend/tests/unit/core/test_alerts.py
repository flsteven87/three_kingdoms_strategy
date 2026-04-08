"""Tests for alert_critical."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.core.alerts import alert_critical


@pytest.mark.asyncio
async def test_alert_critical_logs_without_webhook(caplog):
    with patch("src.core.alerts.settings") as mock_settings:
        mock_settings.alert_webhook_url = None
        with caplog.at_level("CRITICAL"):
            await alert_critical("recur.signature_failed", event_id="evt_x")
    assert any("recur.signature_failed" in r.message for r in caplog.records)


@pytest.mark.asyncio
async def test_alert_critical_posts_to_webhook_when_configured():
    mock_client = MagicMock()
    mock_client.post = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)

    with patch("src.core.alerts.settings") as mock_settings, \
         patch("src.core.alerts.httpx.AsyncClient", return_value=mock_client):
        mock_settings.alert_webhook_url = "https://discord.test/webhook"
        await alert_critical("recur.permanent", event_id="evt_y", reason="amount_mismatch")

    mock_client.post.assert_awaited_once()
    call = mock_client.post.await_args
    assert call.args[0] == "https://discord.test/webhook"
    payload = call.kwargs["json"]
    assert "recur.permanent" in payload["content"]
    assert payload["context"] == {"event_id": "evt_y", "reason": "amount_mismatch"}


@pytest.mark.asyncio
async def test_alert_critical_swallows_webhook_exceptions(caplog):
    mock_client = MagicMock()
    mock_client.post = AsyncMock(side_effect=RuntimeError("network down"))
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)

    with patch("src.core.alerts.settings") as mock_settings, \
         patch("src.core.alerts.httpx.AsyncClient", return_value=mock_client), \
         caplog.at_level("ERROR"):
        mock_settings.alert_webhook_url = "https://discord.test/webhook"
        # must not raise
        await alert_critical("recur.permanent", event_id="evt_z")

    assert any("alert_webhook_url delivery failed" in r.message for r in caplog.records)
