"""
Application startup validation.

Fail-closed checks that must pass before the FastAPI app accepts traffic.
Currently enforces that revenue-critical environment variables are
configured in production — missing Recur/alert config would otherwise
silently break webhooks or suppress permanent-error alerts.
"""

from src.core.config import Settings

# Env vars that MUST be set when running in production. Omitted from this
# list (on purpose): ``recur_expected_amount_twd`` and
# ``recur_expected_currency`` — both have safe defaults that match the
# current product; any drift is caught downstream by amount/currency
# validation in PaymentService and surfaced via the alert path below.
REQUIRED_PRODUCTION_SETTINGS: tuple[str, ...] = (
    "recur_secret_key",
    "recur_webhook_secret",
    "recur_product_id",
    "alert_webhook_url",
)


class StartupConfigError(RuntimeError):
    """Raised when production configuration is incomplete."""


def missing_production_settings(settings: Settings) -> list[str]:
    """Return the names of required production settings that are unset or empty."""
    missing: list[str] = []
    for name in REQUIRED_PRODUCTION_SETTINGS:
        value = getattr(settings, name, None)
        if value is None or (isinstance(value, str) and not value.strip()):
            missing.append(name)
    return missing


def assert_production_config(settings: Settings) -> None:
    """Raise ``StartupConfigError`` if any required production setting is missing.

    No-op outside production so local development and tests keep working
    without a full Recur/alert configuration.
    """
    if not settings.is_production:
        return

    missing = missing_production_settings(settings)
    if missing:
        raise StartupConfigError(
            "Missing required production environment variables: " + ", ".join(sorted(missing))
        )
