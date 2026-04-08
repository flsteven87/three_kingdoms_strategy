"""Tests for webhook error classes."""

from src.core.webhook_errors import WebhookPermanentError, WebhookTransientError


class TestWebhookErrors:
    def test_permanent_error_stores_code_and_context(self):
        err = WebhookPermanentError("product_mismatch", event_id="evt_1", product_id="prod_x")
        assert err.code == "product_mismatch"
        assert err.context == {"event_id": "evt_1", "product_id": "prod_x"}
        assert "product_mismatch" in str(err)

    def test_transient_error_stores_code_and_context(self):
        err = WebhookTransientError("db_unreachable", event_id="evt_2")
        assert err.code == "db_unreachable"
        assert err.context == {"event_id": "evt_2"}

    def test_permanent_error_is_not_transient(self):
        assert not issubclass(WebhookPermanentError, WebhookTransientError)
        assert not issubclass(WebhookTransientError, WebhookPermanentError)
