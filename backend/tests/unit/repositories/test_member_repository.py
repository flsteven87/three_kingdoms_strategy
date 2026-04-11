"""
Tests for MemberRepository membership-diff behavior.

Verifies that deactivate_absent_members flips is_active on members who
are NOT present in the provided name set, so a regular CSV upload can
reflect that absent members have left the alliance.
"""

from unittest.mock import MagicMock
from uuid import uuid4

import pytest

from src.repositories.member_repository import MemberRepository


class _QueryStub:
    """
    Minimal stand-in for the Supabase query builder that records update
    payload, eq filters, and not_.in_() calls. Supports the chaining
    style used by postgrest-py: `.update(...).eq(...).eq(...).not_.in_(...).execute()`.
    """

    def __init__(self, state: dict):
        self._state = state

    def update(self, payload):
        self._state["update"] = payload
        return self

    def eq(self, column, value):
        self._state.setdefault("eq", []).append((column, value))
        return self

    @property
    def not_(self):
        # postgrest exposes `not_` as a property that negates the next filter.
        # Our stub records the fact and returns self so `.in_` chains through.
        self._state["negate_next"] = True
        return self

    def in_(self, column, values):
        self._state["in"] = (column, list(values))
        return self

    def execute(self):
        result = MagicMock()
        # Return one row per affected name so the service can count updates.
        result.data = [{"id": str(uuid4())} for _ in self._state.get("in", ("", []))[1]]
        return result


class _ClientStub:
    def __init__(self):
        self.state: dict = {}

    def from_(self, *_args, **_kwargs):
        return _QueryStub(self.state)


@pytest.fixture
def repo_with_client() -> tuple[MemberRepository, _ClientStub]:
    repo = MemberRepository()
    client = _ClientStub()
    repo.client = client  # type: ignore[assignment]

    async def exec_async(fn):
        return fn()

    repo._execute_async = exec_async  # type: ignore[method-assign]
    return repo, client


class TestDeactivateAbsentMembers:
    """deactivate_absent_members must scope to alliance + is_active and
    negate membership against the present name set."""

    @pytest.mark.asyncio
    async def test_flips_is_active_for_absent_members(self, repo_with_client):
        repo, client = repo_with_client
        alliance_id = uuid4()
        present_names = {"張飛", "關羽"}

        count = await repo.deactivate_absent_members(alliance_id, present_names)

        # Payload: only is_active flipped, nothing else
        assert client.state["update"] == {"is_active": False}
        # Filters: alliance_id match AND currently active
        assert (client.state["eq"]) == [
            ("alliance_id", str(alliance_id)),
            ("is_active", True),
        ]
        # Negated membership against present names
        assert client.state.get("negate_next") is True
        assert client.state["in"][0] == "name"
        assert set(client.state["in"][1]) == present_names
        # Count reflects affected rows from the stub
        assert count == len(present_names)

    @pytest.mark.asyncio
    async def test_empty_present_names_short_circuits_to_noop(self, repo_with_client):
        """
        PostgREST `.in_()` cannot take an empty iterable (it would produce
        an invalid `()` filter). An empty CSV should be rejected earlier by
        the service layer, but the repo contract is: no-op, return 0.
        """
        repo, client = repo_with_client
        alliance_id = uuid4()

        count = await repo.deactivate_absent_members(alliance_id, set())

        # No query should have been built — state stays empty
        assert client.state == {}
        assert count == 0
