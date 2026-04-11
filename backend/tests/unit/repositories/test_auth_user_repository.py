"""
Unit tests for AuthUserRepository.

Covers the scalar RPC wrapper around find_user_id_by_email.
RPC is mocked via the supabase client — no live DB access.
"""

from unittest.mock import MagicMock
from uuid import uuid4

import pytest

from src.repositories.auth_user_repository import AuthUserRepository


@pytest.fixture
def mock_client() -> MagicMock:
    return MagicMock()


@pytest.fixture
def repo(mock_client: MagicMock) -> AuthUserRepository:
    return AuthUserRepository(client=mock_client)


def _mock_rpc_result(value):
    """Shape the synchronous supabase.rpc(...).execute() return."""
    exec_result = MagicMock()
    exec_result.data = value
    mock_rpc = MagicMock()
    mock_rpc.execute.return_value = exec_result
    return mock_rpc


class TestFindUserIdByEmail:
    @pytest.mark.asyncio
    async def test_returns_uuid_when_user_exists(
        self, repo: AuthUserRepository, mock_client: MagicMock
    ):
        existing = uuid4()
        mock_client.rpc.return_value = _mock_rpc_result(str(existing))

        result = await repo.find_user_id_by_email("Alice@Example.com")

        assert result == existing
        mock_client.rpc.assert_called_once_with(
            "find_user_id_by_email", {"p_email": "Alice@Example.com"}
        )

    @pytest.mark.asyncio
    async def test_returns_none_when_user_missing(
        self, repo: AuthUserRepository, mock_client: MagicMock
    ):
        mock_client.rpc.return_value = _mock_rpc_result(None)

        result = await repo.find_user_id_by_email("ghost@example.com")

        assert result is None

    @pytest.mark.asyncio
    async def test_returns_none_when_rpc_returns_empty_list(
        self, repo: AuthUserRepository, mock_client: MagicMock
    ):
        # Defensive: CLAUDE.md says scalar returns come as direct value, but
        # if Supabase ever hands back [] for a null scalar we should not
        # blow up — treat as "no match".
        mock_client.rpc.return_value = _mock_rpc_result([])

        result = await repo.find_user_id_by_email("ghost@example.com")

        assert result is None
