"""Unit tests for production startup configuration validation."""

from unittest.mock import MagicMock

import pytest

from src.core.startup import (
    REQUIRED_PRODUCTION_SETTINGS,
    StartupConfigError,
    assert_production_config,
    missing_production_settings,
)


def _settings(environment: str = "production", **overrides) -> MagicMock:
    """Build a mock Settings object with all required vars populated by default."""
    defaults = {
        "environment": environment,
        "is_production": environment == "production",
        "recur_secret_key": "sk_live_xxx",
        "recur_webhook_secret": "whsec_xxx",
        "recur_product_id": "prod_xxx",
        "alert_webhook_url": "https://discord.com/api/webhooks/xxx",
    }
    defaults.update(overrides)
    mock = MagicMock()
    for key, value in defaults.items():
        setattr(mock, key, value)
    return mock


class TestMissingProductionSettings:
    def test_all_set_returns_empty(self):
        assert missing_production_settings(_settings()) == []

    def test_none_value_is_reported(self):
        result = missing_production_settings(_settings(recur_secret_key=None))
        assert result == ["recur_secret_key"]

    def test_empty_string_is_reported(self):
        result = missing_production_settings(_settings(recur_webhook_secret=""))
        assert result == ["recur_webhook_secret"]

    def test_whitespace_only_is_reported(self):
        result = missing_production_settings(_settings(alert_webhook_url="   "))
        assert result == ["alert_webhook_url"]

    def test_multiple_missing_all_reported(self):
        result = missing_production_settings(
            _settings(recur_secret_key=None, recur_product_id=None, alert_webhook_url="")
        )
        assert set(result) == {"recur_secret_key", "recur_product_id", "alert_webhook_url"}

    def test_required_list_locked_down(self):
        # Guard against accidental expansion/shrinking of the required set.
        assert REQUIRED_PRODUCTION_SETTINGS == (
            "recur_secret_key",
            "recur_webhook_secret",
            "recur_product_id",
            "alert_webhook_url",
        )


class TestAssertProductionConfig:
    def test_production_with_all_set_passes(self):
        assert_production_config(_settings())  # no raise

    def test_production_with_missing_raises(self):
        with pytest.raises(StartupConfigError) as exc:
            assert_production_config(_settings(recur_secret_key=None))
        assert "recur_secret_key" in str(exc.value)

    def test_production_error_message_lists_all_missing_sorted(self):
        with pytest.raises(StartupConfigError) as exc:
            assert_production_config(
                _settings(
                    recur_secret_key=None,
                    recur_webhook_secret=None,
                    alert_webhook_url=None,
                )
            )
        msg = str(exc.value)
        # Sorted alphabetically for deterministic output.
        idx_alert = msg.index("alert_webhook_url")
        idx_secret = msg.index("recur_secret_key")
        idx_webhook = msg.index("recur_webhook_secret")
        assert idx_alert < idx_secret < idx_webhook

    def test_development_with_everything_missing_passes(self):
        # Local dev must boot without Recur creds configured.
        assert_production_config(
            _settings(
                environment="development",
                recur_secret_key=None,
                recur_webhook_secret=None,
                recur_product_id=None,
                alert_webhook_url=None,
            )
        )

    def test_staging_with_missing_passes(self):
        # Only "production" is strict; other environments are permissive.
        assert_production_config(_settings(environment="staging", recur_secret_key=None))
