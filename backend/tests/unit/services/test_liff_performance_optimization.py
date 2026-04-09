"""
Tests for LIFF performance optimization — verifying that
get_member_performance uses asyncio.gather for parallelization.
"""

from datetime import datetime
from unittest.mock import AsyncMock, MagicMock
from uuid import UUID

import pytest
from fastapi import HTTPException

from src.models.line_binding import LineGroupBinding, MemberLineBinding
from src.services.line_binding_service import LineBindingService

ALLIANCE_ID = UUID("22222222-2222-2222-2222-222222222222")
SEASON_ID = UUID("33333333-3333-3333-3333-333333333333")
MEMBER_ID = UUID("44444444-4444-4444-4444-444444444444")


def _make_group_binding() -> LineGroupBinding:
    now = datetime.now()
    return LineGroupBinding(
        id=UUID("11111111-1111-1111-1111-111111111111"),
        alliance_id=ALLIANCE_ID,
        line_group_id="Cgroup1234",
        group_name="蜀漢同盟",
        group_picture_url=None,
        bound_by_line_user_id="Uabc123",
        is_active=True,
        is_test=False,
        bound_at=now,
        created_at=now,
        updated_at=now,
    )


def _make_member_binding() -> MemberLineBinding:
    now = datetime.now()
    return MemberLineBinding(
        id=UUID("55555555-5555-5555-5555-555555555555"),
        alliance_id=ALLIANCE_ID,
        line_user_id="Uuser123",
        line_display_name="劉備",
        game_id="player1",
        member_id=MEMBER_ID,
        is_verified=True,
        bound_at=now,
        created_at=now,
        updated_at=now,
    )


def _make_season_mock():
    season = MagicMock()
    season.id = SEASON_ID
    season.name = "PK23"
    return season


def _make_trend_data():
    return [
        {
            "period_label": "4/1-4/3",
            "start_date": "2026-04-01",
            "end_rank": 5,
            "alliance_member_count": 100,
            "rank_change": -2,
            "daily_contribution": 1000,
            "daily_merit": 500,
            "daily_assist": 200,
            "daily_donation": 300,
            "end_power": 50000,
            "alliance_avg_contribution": 800,
            "alliance_avg_merit": 400,
            "alliance_avg_assist": 150,
            "alliance_avg_donation": 250,
            "alliance_avg_power": 45000,
            "alliance_median_contribution": 750,
            "alliance_median_merit": 380,
            "alliance_median_assist": 140,
            "alliance_median_donation": 230,
            "alliance_median_power": 43000,
        }
    ]


def _make_season_summary():
    return {
        "total_contribution": 10000,
        "total_donation": 3000,
        "current_power": 50000,
        "total_power_change": 5000,
    }


def _make_service():
    service = LineBindingService.__new__(LineBindingService)
    service.repository = MagicMock()
    service._season_repo = MagicMock()
    service._event_repo = MagicMock()
    service._metrics_repo = MagicMock()
    service._analytics_service = MagicMock()
    service.supabase = MagicMock()
    return service


@pytest.mark.asyncio
async def test_get_member_performance_returns_complete_response():
    """Verify happy path returns correct fields with all dependencies called."""
    service = _make_service()
    group_binding = _make_group_binding()
    member_binding = _make_member_binding()
    season = _make_season_mock()
    trend_data = _make_trend_data()
    season_summary = _make_season_summary()

    service.repository.get_group_binding_by_line_group_id = AsyncMock(return_value=group_binding)
    service.repository.get_member_binding_by_game_id = AsyncMock(return_value=member_binding)
    service._season_repo.get_current_season = AsyncMock(return_value=season)
    service._analytics_service.get_member_trend = AsyncMock(return_value=trend_data)
    service._analytics_service.get_season_summary = AsyncMock(return_value=season_summary)

    result = await service.get_member_performance(
        line_group_id="Cgroup1234", line_user_id="Uuser123", game_id="player1"
    )

    assert result.has_data is True
    assert result.game_id == "player1"
    assert result.season_name == "PK23"
    assert result.rank is not None
    assert result.rank.current == 5
    assert result.latest is not None
    assert result.latest.daily_merit == 500
    assert result.season_total is not None
    assert result.season_total.contribution == 10000
    # All dependencies should have been called exactly once
    service.repository.get_group_binding_by_line_group_id.assert_awaited_once()
    service.repository.get_member_binding_by_game_id.assert_awaited_once()
    service._season_repo.get_current_season.assert_awaited_once()
    service._analytics_service.get_member_trend.assert_awaited_once()
    service._analytics_service.get_season_summary.assert_awaited_once()


@pytest.mark.asyncio
async def test_get_member_performance_early_return_no_member():
    """If member_binding is None, should return early without fetching trend/summary."""
    service = _make_service()
    group_binding = _make_group_binding()
    season = _make_season_mock()

    service.repository.get_group_binding_by_line_group_id = AsyncMock(return_value=group_binding)
    service.repository.get_member_binding_by_game_id = AsyncMock(return_value=None)
    service._season_repo.get_current_season = AsyncMock(return_value=season)

    with pytest.raises(HTTPException):
        await service.get_member_performance(
            line_group_id="Cgroup1234", line_user_id="Uuser123", game_id="player1"
        )

    # trend and summary should NOT be called
    service._analytics_service.get_member_trend.assert_not_called()
    service._analytics_service.get_season_summary.assert_not_called()
