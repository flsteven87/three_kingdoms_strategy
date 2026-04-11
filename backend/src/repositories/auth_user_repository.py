"""
Auth User Repository

Thin wrapper around the ``find_user_id_by_email`` RPC for looking up a
Supabase ``auth.users`` row by email in O(1).

Replaces the paginated ``supabase.auth.admin.list_users()`` call which
silently stops at the first 50 users.
"""

import asyncio
from uuid import UUID

from supabase import Client

from src.core.database import get_supabase_client

RPC_NAME = "find_user_id_by_email"


class AuthUserRepository:
    """Repository for auth.users lookups via SECURITY DEFINER RPCs."""

    def __init__(self, client: Client | None = None) -> None:
        self.client = client or get_supabase_client()

    async def find_user_id_by_email(self, email: str) -> UUID | None:
        """
        Look up a user by email. Case-insensitive; returns None if not found.

        The RPC returns a scalar UUID (or NULL). Per CLAUDE.md, scalar RPC
        results arrive as ``result.data`` being the direct value — NOT a list.
        The empty-list branch below is purely defensive against SDK changes.
        """
        result = await asyncio.to_thread(
            lambda: self.client.rpc(RPC_NAME, {"p_email": email}).execute()
        )
        data = result.data
        if data is None:
            return None
        if isinstance(data, list):
            return UUID(data[0]) if data else None
        return UUID(data)
