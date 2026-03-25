"""Tests for SharedAnalyticsMixin — alliance averages and empty structures."""

from datetime import date
from unittest.mock import AsyncMock, MagicMock
from uuid import UUID

import pytest

from src.services.analytics._shared import SharedAnalyticsMixin


class ConcreteService(SharedAnalyticsMixin):
    """Concrete class for testing the mixin."""

    pass


@pytest.fixture
def service():
    svc = ConcreteService()
    svc._metrics_repo = MagicMock()
    svc._period_repo = MagicMock()
    svc._season_repo = MagicMock()
    return svc


@pytest.fixture
def season_id():
    return UUID("33333333-3333-3333-3333-333333333333")


@pytest.fixture
def period_id():
    return UUID("55555555-5555-5555-5555-555555555555")


class TestEmptyAllianceAverages:
    def test_returns_zero_structure(self, service):
        result = service._empty_alliance_averages()
        assert result["member_count"] == 0
        assert result["avg_daily_contribution"] == 0
        assert result["median_power"] == 0


class TestComputeSeasonDays:
    def test_normal_range(self):
        assert SharedAnalyticsMixin._compute_season_days(date(2026, 1, 1), date(2026, 1, 10)) == 9

    def test_same_day_returns_1(self):
        assert SharedAnalyticsMixin._compute_season_days(date(2026, 1, 1), date(2026, 1, 1)) == 1


class TestGetPeriodAllianceAverages:
    @pytest.mark.asyncio
    async def test_empty_metrics_returns_empty(self, service, period_id):
        service._metrics_repo.get_by_period = AsyncMock(return_value=[])
        result = await service.get_period_alliance_averages(period_id)
        assert result["member_count"] == 0

    @pytest.mark.asyncio
    async def test_calculates_averages_and_medians(self, service, period_id):
        mock_m1 = MagicMock(
            daily_contribution=100.0,
            daily_merit=50.0,
            daily_assist=10.0,
            daily_donation=5.0,
            end_power=1000,
        )
        mock_m2 = MagicMock(
            daily_contribution=200.0,
            daily_merit=150.0,
            daily_assist=30.0,
            daily_donation=15.0,
            end_power=2000,
        )
        service._metrics_repo.get_by_period = AsyncMock(return_value=[mock_m1, mock_m2])

        result = await service.get_period_alliance_averages(period_id)
        assert result["member_count"] == 2
        assert result["avg_daily_contribution"] == 150.0
        assert result["median_daily_contribution"] == 150.0


class TestGetSeasonAllianceAverages:
    @pytest.mark.asyncio
    async def test_no_season_returns_empty(self, service, season_id):
        service._season_repo.get_by_id = AsyncMock(return_value=None)
        service._period_repo.get_by_season = AsyncMock(return_value=[])
        result = await service.get_season_alliance_averages(season_id)
        assert result["member_count"] == 0


class TestGetAllianceTrendAverages:
    @pytest.mark.asyncio
    async def test_no_periods_returns_empty(self, service, season_id):
        service._period_repo.get_by_season = AsyncMock(return_value=[])
        result = await service.get_alliance_trend_averages(season_id)
        assert result == []
