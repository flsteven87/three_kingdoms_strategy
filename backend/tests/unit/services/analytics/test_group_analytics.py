"""Tests for GroupAnalyticsService."""

from unittest.mock import AsyncMock, MagicMock
from uuid import UUID

import pytest

from src.services.analytics.group_analytics_service import GroupAnalyticsService


@pytest.fixture
def service():
    return GroupAnalyticsService()


@pytest.fixture
def season_id():
    return UUID("33333333-3333-3333-3333-333333333333")


class TestGetGroupsList:
    @pytest.mark.asyncio
    async def test_no_periods_returns_empty(self, service, season_id):
        service._period_repo.get_by_season = AsyncMock(return_value=[])
        result = await service.get_groups_list(season_id)
        assert result == []

    @pytest.mark.asyncio
    async def test_delegates_to_metrics_repo(self, service, season_id):
        period = MagicMock(id=UUID("55555555-5555-5555-5555-555555555555"))
        service._period_repo.get_by_season = AsyncMock(return_value=[period])
        service._metrics_repo.get_all_groups_for_period = AsyncMock(
            return_value=[{"name": "G1", "member_count": 5}]
        )
        result = await service.get_groups_list(season_id)
        assert len(result) == 1
        assert result[0]["name"] == "G1"


class TestGetGroupsComparison:
    @pytest.mark.asyncio
    async def test_no_periods_returns_empty(self, service, season_id):
        service._period_repo.get_by_season = AsyncMock(return_value=[])
        result = await service.get_groups_comparison(season_id)
        assert result == []


class TestEmptyGroupStats:
    def test_returns_zero_structure(self, service):
        result = service._empty_group_stats("TestGroup")
        assert result["group_name"] == "TestGroup"
        assert result["member_count"] == 0
        assert result["contribution_cv"] == 0
        assert result["merit_cv"] == 0


class TestComputeGroupStats:
    def test_single_member(self, service):
        result = service._compute_group_stats(
            "G1",
            contributions=[100.0],
            merits=[50.0],
            assists=[10.0],
            donations=[5.0],
            powers=[1000.0],
            ranks=[3],
        )
        assert result["group_name"] == "G1"
        assert result["member_count"] == 1
        assert result["avg_daily_contribution"] == 100.0
        assert result["contribution_cv"] == 0  # stdev=0 for single member

    def test_empty_returns_empty_stats(self, service):
        result = service._compute_group_stats(
            "Empty", contributions=[], merits=[], assists=[], donations=[], powers=[], ranks=[]
        )
        assert result["member_count"] == 0


class TestGetGroupAnalytics:
    @pytest.mark.asyncio
    async def test_no_periods_returns_empty_structure(self, service, season_id):
        service._period_repo.get_by_season = AsyncMock(return_value=[])
        result = await service.get_group_analytics(season_id, "G1")
        assert result["members"] == []
        assert result["trends"] == []
