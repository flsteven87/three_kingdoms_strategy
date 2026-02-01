"""
Database connection and client management

符合 CLAUDE.md: Supabase client singleton
"""

from functools import lru_cache

import httpx
from supabase import Client, ClientOptions, create_client

from src.core.config import settings


@lru_cache
def get_supabase_client() -> Client:
    """
    Get Supabase client singleton with HTTP/1.1 transport

    Disable HTTP/2 to avoid connection pool issues:
    - httpcore.ReadError: [Errno 35] Resource temporarily unavailable

    Returns:
        Supabase client instance

    符合 CLAUDE.md: Singleton pattern with lru_cache
    """
    # Create custom httpx client with HTTP/2 disabled
    custom_httpx_client = httpx.Client(
        http2=False,
        timeout=httpx.Timeout(120.0),
    )

    options = ClientOptions(
        httpx_client=custom_httpx_client,
        postgrest_client_timeout=120,
    )

    return create_client(
        supabase_url=settings.supabase_url,
        supabase_key=settings.supabase_service_key,
        options=options,
    )


# Global client instance
supabase_client = get_supabase_client()
