"""Unit tests for production startup configuration validation."""

import logging
from unittest.mock import MagicMock

import pytest

from src.core.startup import (
    RECOMMENDED_PRODUCTION_SETTINGS,
    REQUIRED_PRODUCTION_SETTINGS,
    StartupConfigError,
    assert_production_config,
    missing_production_settings,
    missing_recommended_settings,
)


def _settings(environment: str = "production", **overrides) -> MagicMock:
    """Build a mock Settings object with all config populated by default."""
    defaults = {
        "environment": environment,
        "is_production": environment == "production",
        "recur_secret_key": "sk_live_xxx",
        "recur_webhook_secret": "whsec_xxx",
        "recur_product_id": "prod_xxx",
        "alert_webhook_url": "https://example.com/hooks/alerts",
    }
    defaults.update(overrides)
    mock = MagicMock()
    for key, value in defaults.items():
        setattr(mock, key, value)
    return mock


class TestRequiredSettingsList:
    def test_required_list_locked_down(self):
        # Revenue-critical only. alert_webhook_url is NOT here on purpose —
        # it is a recommended observability var, not a hard requirement.
        assert REQUIRED_PRODUCTION_SETTINGS == (
            "recur_secret_key",
            "recur_webhook_secret",
            "recur_product_id",
        )

    def test_recommended_list_locked_down(self):
        assert RECOMMENDED_PRODUCTION_SETTINGS == ("alert_webhook_url",)


class TestMissingProductionSettings:
    def test_all_set_returns_empty(self):
        assert missing_production_settings(_settings()) == []

    def test_none_value_is_reported(self):
        assert missing_production_settings(_settings(recur_secret_key=None)) == [
            "recur_secret_key"
        ]

    def test_empty_string_is_reported(self):
        assert missing_production_settings(_settings(recur_webhook_secret="")) == [
            "recur_webhook_secret"
        ]

    def test_whitespace_only_is_reported(self):
        assert missing_production_settings(_settings(recur_product_id="   ")) == [
            "recur_product_id"
        ]

    def test_alert_webhook_url_missing_is_NOT_required(self):
        # Recommended, not required — must not appear in the "required" list.
        assert missing_production_settings(_settings(alert_webhook_url=None)) == []

    def test_multiple_missing_all_reported(self):
        result = missing_production_settings(
            _settings(recur_secret_key=None, recur_product_id=None)
        )
        assert set(result) == {"recur_secret_key", "recur_product_id"}


class TestMissingRecommendedSettings:
    def test_all_set_returns_empty(self):
        assert missing_recommended_settings(_settings()) == []

    def test_alert_webhook_url_missing_is_reported(self):
        assert missing_recommended_settings(_settings(alert_webhook_url=None)) == [
            "alert_webhook_url"
        ]


class TestAssertProductionConfig:
    def test_production_with_all_set_passes(self):
        assert_production_config(_settings())  # no raise

    def test_production_with_missing_required_raises(self):
        with pytest.raises(StartupConfigError) as exc:
            assert_production_config(_settings(recur_secret_key=None))
        assert "recur_secret_key" in str(exc.value)

    def test_production_error_message_lists_all_missing_sorted(self):
        with pytest.raises(StartupConfigError) as exc:
            assert_production_config(
                _settings(recur_secret_key=None, recur_webhook_secret=None)
            )
        msg = str(exc.value)
        assert msg.index("recur_secret_key") < msg.index("recur_webhook_secret")

    def test_production_with_missing_alert_webhook_does_not_raise(self, caplog):
        # Recommended vars missing must NOT crash — only log CRITICAL.
        with caplog.at_level(logging.CRITICAL, logger="src.core.startup"):
            assert_production_config(_settings(alert_webhook_url=None))
        assert any(
            "alert_webhook_url" in record.getMessage() and record.levelno == logging.CRITICAL
            for record in caplog.records
        )

    def test_production_with_missing_alert_only_logs_once(self, caplog):
        with caplog.at_level(logging.CRITICAL, logger="src.core.startup"):
            assert_production_config(_settings(alert_webhook_url=""))
        critical_records = [r for r in caplog.records if r.levelno == logging.CRITICAL]
        assert len(critical_records) == 1

    def test_production_with_required_missing_skips_recommended_check(self, caplog):
        # Short-circuit: required failure raises before recommended warning.
        with caplog.at_level(logging.CRITICAL, logger="src.core.startup"):
            with pytest.raises(StartupConfigError):
                assert_production_config(
                    _settings(recur_secret_key=None, alert_webhook_url=None)
                )
        assert not any(
            "alert_webhook_url" in record.getMessage() for record in caplog.records
        )

    def test_development_with_everything_missing_passes(self, caplog):
        # Local dev must boot without any Recur/alert configuration AND
        # without noise in the logs.
        with caplog.at_level(logging.CRITICAL, logger="src.core.startup"):
            assert_production_config(
                _settings(
                    environment="development",
                    recur_secret_key=None,
                    recur_webhook_secret=None,
                    recur_product_id=None,
                    alert_webhook_url=None,
                )
            )
        assert caplog.records == []

    def test_staging_with_missing_passes(self):
        # Only "production" is strict; other environments are permissive.
        assert_production_config(_settings(environment="staging", recur_secret_key=None))
