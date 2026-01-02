"""
Application configuration

符合 CLAUDE.md: Pydantic BaseSettings for environment variables
"""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables"""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # Application Version (from pyproject.toml)
    version: str = "0.3.0"

    # Supabase Configuration
    supabase_url: str
    supabase_anon_key: str
    supabase_service_key: str
    supabase_jwt_secret: str

    # Backend Configuration
    backend_url: str = "http://localhost:8087"
    frontend_url: str = "http://localhost:5187"
    cors_origins: str = "http://localhost:5187"

    # Security
    secret_key: str

    # Environment
    environment: str = "development"
    debug: bool = True

    # Logging
    log_level: str = "INFO"

    # LINE Bot Configuration
    line_channel_id: str | None = None
    line_channel_secret: str | None = None
    line_access_token: str | None = None
    liff_id: str | None = None

    @property
    def line_bot_enabled(self) -> bool:
        """Check if LINE Bot is configured"""
        return all([
            self.line_channel_id,
            self.line_channel_secret,
            self.line_access_token,
            self.liff_id
        ])

    @property
    def cors_origins_list(self) -> list[str]:
        """Parse CORS origins from comma-separated string"""
        return [origin.strip() for origin in self.cors_origins.split(",")]

    @property
    def is_production(self) -> bool:
        """Check if running in production environment"""
        return self.environment == "production"


@lru_cache
def get_settings() -> Settings:
    """
    Get cached settings instance (singleton pattern)

    符合 CLAUDE.md 🟡: Settings via pydantic-settings with @lru_cache
    """
    return Settings()


# Global settings instance
settings = get_settings()
