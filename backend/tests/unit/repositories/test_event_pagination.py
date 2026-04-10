"""Tests for DB-level event pagination."""

from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from src.models.battle_event import BattleEvent, EventStatus
from src.repositories.battle_event_repository import BattleEventRepository
from src.services.line_binding_service import LineBindingService


@pytest.fixture
def repo():
    r = BattleEventRepository.__new__(BattleEventRepository)
    r.client = MagicMock()
    r.table_name = "battle_events"
    r.model_class = BattleEvent
    return r


@pytest.mark.asyncio
async def test_get_completed_by_season_paginated_returns_tuple(repo):
    """Should return (events, total_count) tuple."""
    season_id = uuid4()

    mock_result = MagicMock()
    mock_result.data = [
        {
            "id": str(uuid4()),
            "season_id": str(season_id),
            "alliance_id": str(uuid4()),
            "name": "Test Event",
            "category": "crusade",
            "status": "completed",
            "before_upload_id": None,
            "after_upload_id": None,
            "created_by": None,
            "created_at": "2026-04-10T00:00:00",
            "updated_at": "2026-04-10T00:00:00",
        }
    ]
    mock_result.count = 15

    repo._execute_async = AsyncMock(return_value=mock_result)

    events, total_count = await repo.get_completed_by_season_paginated(
        season_id, offset=0, limit=10
    )

    assert total_count == 15
    assert len(events) == 1
    assert events[0].status == EventStatus.COMPLETED


@pytest.mark.asyncio
async def test_get_completed_by_season_paginated_empty(repo):
    """Should return empty list and 0 count when no completed events."""
    mock_result = MagicMock()
    mock_result.data = []
    mock_result.count = 0

    repo._execute_async = AsyncMock(return_value=mock_result)

    events, total_count = await repo.get_completed_by_season_paginated(uuid4(), offset=0, limit=10)

    assert total_count == 0
    assert events == []



# --- Service integration test ---


def _make_liff_service() -> LineBindingService:
    service = LineBindingService.__new__(LineBindingService)
    service.repository = MagicMock()
    service._season_repo = MagicMock()
    service._event_repo = MagicMock()
    service._metrics_repo = MagicMock()
    service._analytics_service = MagicMock()
    return service


@pytest.mark.asyncio
async def test_get_event_list_uses_db_pagination():
    """Service should call get_completed_by_season_paginated, not get_by_season."""
    service = _make_liff_service()

    group_binding = MagicMock()
    group_binding.alliance_id = uuid4()

    season = MagicMock()
    season.id = uuid4()
    season.name = "PK23"

    service.repository.get_group_binding_by_line_group_id = AsyncMock(return_value=group_binding)
    service._season_repo.get_current_season = AsyncMock(return_value=season)
    service._event_repo.get_completed_by_season_paginated = AsyncMock(return_value=([], 0))

    result = await service.get_event_list_for_liff(
        line_group_id="Cgroup1", game_id="player1", limit=10, offset=0
    )

    service._event_repo.get_completed_by_season_paginated.assert_awaited_once_with(
        season.id, offset=0, limit=10
    )
    assert result.total_count == 0
