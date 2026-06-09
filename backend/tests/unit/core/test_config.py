"""
Unit Tests for Application Settings

Covers:
- line_bot_enabled: True only when all four LINE fields are set
- cors_origins_list: Parses comma-separated origins, strips whitespace
- is_production: True only when environment == 'production'
- Settings defaults and version constant

All tests use monkeypatch to inject env vars so that the real .env
file (which may be absent in CI) is never loaded.
"""


# Minimum env vars required so Settings() can be constructed without a .env file.
_REQUIRED_VARS = {
    "SUPABASE_URL": "https://example.supabase.co",
    "SUPABASE_ANON_KEY": "anon-key",
    "SUPABASE_SERVICE_KEY": "service-key",
    "SUPABASE_JWT_SECRET": "jwt-secret",
    "SECRET_KEY": "secret-key",
}

# Optional fields whose real .env values must not bleed into "defaults" tests.
# We delenv these so pydantic-settings sees them as absent → None.
_OPTIONAL_FIELDS_TO_CLEAR = [
    "LINE_CHANNEL_ID",
    "LINE_CHANNEL_SECRET",
    "LINE_ACCESS_TOKEN",
    "LINE_BOT_USER_ID",
    "LIFF_ID",
    "RECUR_SECRET_KEY",
    "RECUR_WEBHOOK_SECRET",
]


def _make_settings(monkeypatch, extra: dict | None = None, *, clear_optional: bool = True):
    """
    Helper: clear the Settings lru_cache, inject env vars, and return a fresh instance.

    clear_optional=True (default) removes optional LINE/Recur fields from the environment
    so that values in the real .env file on disk cannot leak into tests that assert defaults.
    Pass clear_optional=False when the test deliberately sets those fields.
    """
    from src.core import config as config_module

    config_module.get_settings.cache_clear()

    # Set required fields
    for key, value in _REQUIRED_VARS.items():
        monkeypatch.setenv(key, value)

    # Clear optional fields before applying extras, unless caller opts out
    if clear_optional:
        for field in _OPTIONAL_FIELDS_TO_CLEAR:
            monkeypatch.delenv(field, raising=False)

    if extra:
        for key, value in extra.items():
            monkeypatch.setenv(key, value)

    # Import Settings directly to avoid the cached global instance.
    # Pass _env_file=None so pydantic-settings does NOT read the real .env from disk —
    # values come only from the process environment (controlled via monkeypatch).
    from src.core.config import Settings

    return Settings(_env_file=None)


# =============================================================================
# TestLineBotEnabled
# =============================================================================


class TestLineBotEnabled:
    """Tests for the line_bot_enabled computed property."""

    def test_returns_false_when_all_line_vars_missing(self, monkeypatch):
        """Should be False when no LINE env vars are configured."""
        settings = _make_settings(monkeypatch)

        assert settings.line_bot_enabled is False

    def test_returns_false_when_only_channel_id_set(self, monkeypatch):
        """Should be False when only one of the four required values is present."""
        settings = _make_settings(monkeypatch, {"LINE_CHANNEL_ID": "cid"})

        assert settings.line_bot_enabled is False

    def test_returns_false_when_liff_id_missing(self, monkeypatch):
        """Should be False when three of four values are set but liff_id is absent."""
        settings = _make_settings(
            monkeypatch,
            {
                "LINE_CHANNEL_ID": "cid",
                "LINE_CHANNEL_SECRET": "csecret",
                "LINE_ACCESS_TOKEN": "token",
                # liff_id intentionally omitted
            },
        )

        assert settings.line_bot_enabled is False

    def test_returns_true_when_all_four_values_set(self, monkeypatch):
        """Should be True only when all four required LINE values are present."""
        settings = _make_settings(
            monkeypatch,
            {
                "LINE_CHANNEL_ID": "cid",
                "LINE_CHANNEL_SECRET": "csecret",
                "LINE_ACCESS_TOKEN": "token",
                "LIFF_ID": "liff-id",
            },
        )

        assert settings.line_bot_enabled is True

    def test_returns_false_when_any_value_is_empty_string(self, monkeypatch):
        """Should be False when a required LINE field is set to an empty string."""
        settings = _make_settings(
            monkeypatch,
            {
                "LINE_CHANNEL_ID": "cid",
                "LINE_CHANNEL_SECRET": "",  # empty — falsy
                "LINE_ACCESS_TOKEN": "token",
                "LIFF_ID": "liff-id",
            },
        )

        assert settings.line_bot_enabled is False


# =============================================================================
# TestCorsOriginsList
# =============================================================================


class TestCorsOriginsList:
    """Tests for the cors_origins_list computed property."""

    def test_single_origin_returns_single_item_list(self, monkeypatch):
        """Should wrap a single origin in a list."""
        settings = _make_settings(
            monkeypatch, {"CORS_ORIGINS": "http://localhost:5187"}
        )

        assert settings.cors_origins_list == ["http://localhost:5187"]

    def test_multiple_origins_split_on_comma(self, monkeypatch):
        """Should split comma-separated origins into individual list items."""
        settings = _make_settings(
            monkeypatch,
            {"CORS_ORIGINS": "http://localhost:5187,https://example.com"},
        )

        assert settings.cors_origins_list == [
            "http://localhost:5187",
            "https://example.com",
        ]

    def test_strips_whitespace_around_origins(self, monkeypatch):
        """Should strip leading/trailing spaces from each origin."""
        settings = _make_settings(
            monkeypatch,
            {"CORS_ORIGINS": "http://localhost:5187 , https://example.com"},
        )

        assert settings.cors_origins_list == [
            "http://localhost:5187",
            "https://example.com",
        ]

    def test_three_origins_all_parsed(self, monkeypatch):
        """Should parse three or more origins correctly."""
        settings = _make_settings(
            monkeypatch,
            {
                "CORS_ORIGINS": (
                    "http://localhost:5187,"
                    "https://staging.example.com,"
                    "https://app.example.com"
                )
            },
        )

        assert len(settings.cors_origins_list) == 3
        assert "https://staging.example.com" in settings.cors_origins_list

    def test_default_cors_origins_is_localhost(self, monkeypatch):
        """Default cors_origins should resolve to the local dev frontend."""
        settings = _make_settings(monkeypatch)

        assert settings.cors_origins_list == ["http://localhost:5187"]


# =============================================================================
# TestIsProduction
# =============================================================================


class TestIsProduction:
    """Tests for the is_production computed property."""

    def test_returns_false_in_development(self, monkeypatch):
        """Should be False when environment is 'development'."""
        settings = _make_settings(monkeypatch, {"ENVIRONMENT": "development"})

        assert settings.is_production is False

    def test_returns_true_in_production(self, monkeypatch):
        """Should be True when environment is exactly 'production'."""
        settings = _make_settings(monkeypatch, {"ENVIRONMENT": "production"})

        assert settings.is_production is True

    def test_returns_false_for_staging(self, monkeypatch):
        """Should be False for any environment value other than 'production'."""
        settings = _make_settings(monkeypatch, {"ENVIRONMENT": "staging"})

        assert settings.is_production is False

    def test_returns_false_for_test(self, monkeypatch):
        """Should be False when environment is 'test'."""
        settings = _make_settings(monkeypatch, {"ENVIRONMENT": "test"})

        assert settings.is_production is False

    def test_default_environment_is_not_production(self, monkeypatch):
        """Default environment ('development') should not be production."""
        settings = _make_settings(monkeypatch)

        assert settings.is_production is False


# =============================================================================
# TestSettingsDefaults
# =============================================================================


class TestSettingsDefaults:
    """Tests for Settings default values and version."""

    def test_default_version(self, monkeypatch):
        """Should default to the project version string."""
        settings = _make_settings(monkeypatch)

        assert settings.version == "0.9.0"

    def test_default_backend_url(self, monkeypatch):
        """Should default to the local dev backend URL."""
        settings = _make_settings(monkeypatch)

        assert settings.backend_url == "http://localhost:8087"

    def test_default_frontend_url(self, monkeypatch):
        """Should default to the local dev frontend URL."""
        settings = _make_settings(monkeypatch)

        assert settings.frontend_url == "http://localhost:5187"

    def test_default_debug_is_true(self, monkeypatch):
        """debug should default to True for local development."""
        settings = _make_settings(monkeypatch)

        assert settings.debug is True

    def test_debug_can_be_overridden_to_false(self, monkeypatch):
        """Should honour DEBUG=false from environment."""
        settings = _make_settings(monkeypatch, {"DEBUG": "false"})

        assert settings.debug is False

    def test_line_fields_default_to_none(self, monkeypatch):
        """All optional LINE fields should default to None."""
        settings = _make_settings(monkeypatch)

        assert settings.line_channel_id is None
        assert settings.line_channel_secret is None
        assert settings.line_access_token is None
        assert settings.liff_id is None

    def test_recur_fields_default_to_none(self, monkeypatch):
        """Recur payment fields should default to None."""
        settings = _make_settings(monkeypatch)

        assert settings.recur_secret_key is None
        assert settings.recur_webhook_secret is None
