"""Tests for binding status query optimization."""

from datetime import datetime
from unittest.mock import AsyncMock, MagicMock
from uuid import UUID

import pytest

from src.models.line_binding import (
    LineGroupBinding,
)
from src.services.line_binding_service import LineBindingService

ALLIANCE_ID = UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")


def _make_group_binding(
    *, is_test: bool = False, line_group_id: str = "Cgroup1"
) -> LineGroupBinding:
    now = datetime.now()
    return LineGroupBinding(
        id=UUID("11111111-1111-1111-1111-111111111111"),
        alliance_id=ALLIANCE_ID,
        line_group_id=line_group_id,
        group_name="蜀漢同盟",
        group_picture_url=None,
        bound_by_line_user_id="Uabc123",
        is_active=True,
        is_test=is_test,
        bound_at=now,
        created_at=now,
        updated_at=now,
    )


def _make_service() -> LineBindingService:
    service = LineBindingService.__new__(LineBindingService)
    service.repository = MagicMock()
    service._season_repo = MagicMock()
    service._event_repo = MagicMock()
    service._metrics_repo = MagicMock()
    service._analytics_service = MagicMock()
    return service


@pytest.mark.asyncio
async def test_get_binding_status_uses_batch_count_rpc():
    """get_binding_status should call count_registered_group_members_batch once,
    not count_group_members_registered per binding."""
    service = _make_service()
    prod_binding = _make_group_binding(line_group_id="Cprod")
    test_binding = _make_group_binding(is_test=True, line_group_id="Ctest")

    service.repository.get_all_active_group_bindings_by_alliance = AsyncMock(
        return_value=[prod_binding, test_binding]
    )
    service.repository.count_registered_group_members_batch = AsyncMock(
        return_value={"Cprod": 5, "Ctest": 2}
    )
    service.repository.get_pending_code_by_alliance = AsyncMock(return_value=None)

    result = await service.get_binding_status(ALLIANCE_ID)

    # Batch RPC called exactly once with both group IDs
    service.repository.count_registered_group_members_batch.assert_awaited_once_with(
        ALLIANCE_ID, ["Cprod", "Ctest"]
    )

    assert len(result.bindings) == 2
    assert result.bindings[0].member_count == 5
    assert result.bindings[1].member_count == 2


@pytest.mark.asyncio
async def test_get_binding_status_no_bindings():
    """Should return empty bindings; batch RPC receives empty list and returns {}."""
    service = _make_service()

    service.repository.get_all_active_group_bindings_by_alliance = AsyncMock(return_value=[])
    service.repository.count_registered_group_members_batch = AsyncMock(return_value={})
    service.repository.get_pending_code_by_alliance = AsyncMock(return_value=None)

    result = await service.get_binding_status(ALLIANCE_ID)

    service.repository.count_registered_group_members_batch.assert_awaited_once_with(
        ALLIANCE_ID, []
    )
    assert result.is_bound is False
    assert result.bindings == []
