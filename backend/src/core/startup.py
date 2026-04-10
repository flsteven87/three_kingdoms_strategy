"""
Application startup validation.

Two tiers of production config checks:

1. **Required** — revenue-critical vars. Missing any of these in production
   raises ``StartupConfigError`` and the app refuses to boot, because the
   alternative is silently broken payments (unparseable webhooks, wrong
   product validation, etc.).

2. **Recommended** — observability vars. Missing these in production logs
   a CRITICAL warning but does NOT crash the app; their absence degrades
   visibility but doesn't break functionality.
"""

import logging

from src.core.config import Settings

logger = logging.getLogger(__name__)

# Revenue-critical. Missing → app refuses to start.
#
# Omitted (intentional): ``recur_expected_amount_twd`` /
# ``recur_expected_currency`` — both have safe defaults matching the
# current product; drift is caught by PaymentService's amount/currency
# validation and surfaced via the alert path.
REQUIRED_PRODUCTION_SETTINGS: tuple[str, ...] = (
    "recur_secret_key",
    "recur_webhook_secret",
    "recur_product_id",
)

# Observability / operational hygiene. Missing → CRITICAL log only.
# ``alert_webhook_url`` is any HTTP endpoint that receives POSTed alert
# payloads (Discord, Slack, your own handler, etc.) — it is NOT tied to
# any specific provider.
RECOMMENDED_PRODUCTION_SETTINGS: tuple[str, ...] = ("alert_webhook_url",)


class StartupConfigError(RuntimeError):
    """Raised when revenue-critical production configuration is incomplete."""


def _missing(settings: Settings, names: tuple[str, ...]) -> list[str]:
    missing: list[str] = []
    for name in names:
        value = getattr(settings, name, None)
        if value is None or (isinstance(value, str) and not value.strip()):
            missing.append(name)
    return missing


def missing_production_settings(settings: Settings) -> list[str]:
    """Return revenue-critical production settings that are unset or empty."""
    return _missing(settings, REQUIRED_PRODUCTION_SETTINGS)


def missing_recommended_settings(settings: Settings) -> list[str]:
    """Return recommended production settings that are unset or empty."""
    return _missing(settings, RECOMMENDED_PRODUCTION_SETTINGS)


def assert_production_config(settings: Settings) -> None:
    """Validate production configuration.

    - Revenue-critical vars missing → raise ``StartupConfigError``.
    - Recommended vars missing → ``logger.critical`` but continue booting.

    No-op outside production so local development and tests keep working
    without a full Recur / alerting configuration.
    """
    if not settings.is_production:
        return

    missing_required = missing_production_settings(settings)
    if missing_required:
        raise StartupConfigError(
            "Missing required production environment variables: "
            + ", ".join(sorted(missing_required))
        )

    if settings.recur_secret_key and not settings.recur_secret_key.startswith("sk_live_"):
        raise StartupConfigError(
            "recur_secret_key must be a live key (sk_live_*) in production"
        )

    missing_recommended = missing_recommended_settings(settings)
    if missing_recommended:
        logger.critical(
            "Missing recommended production environment variables: %s. "
            "App will run, but some observability features are degraded.",
            ", ".join(sorted(missing_recommended)),
        )
