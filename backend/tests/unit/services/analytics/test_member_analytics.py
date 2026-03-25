"""Tests for MemberAnalyticsService."""

from unittest.mock import AsyncMock, MagicMock
from uuid import UUID

import pytest

from src.services.analytics.member_analytics_service import MemberAnalyticsService


@pytest.fixture
def service():
    return MemberAnalyticsService()


@pytest.fixture
def season_id():
    return UUID("33333333-3333-3333-3333-333333333333")


@pytest.fixture
def member_id():
    return UUID("11111111-1111-1111-1111-111111111111")


@pytest.fixture
def alliance_id():
    return UUID("22222222-2222-2222-2222-222222222222")


class TestGetMembersForAnalytics:
    @pytest.mark.asyncio
    async def test_no_periods_returns_empty(self, service, alliance_id, season_id):
        service._period_repo.get_by_season = AsyncMock(return_value=[])
        service._member_repo.get_by_alliance = AsyncMock(return_value=[])
        result = await service.get_members_for_analytics(alliance_id, True, season_id)
        assert result == []

    @pytest.mark.asyncio
    async def test_filters_to_members_with_data(self, service, alliance_id, season_id):
        member_with_data = MagicMock(
            id=UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"), is_active=True
        )
        member_with_data.name = "A"
        member_without = MagicMock(id=UUID("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"), is_active=True)
        member_without.name = "B"

        period = MagicMock(id=UUID("55555555-5555-5555-5555-555555555555"))
        metric = MagicMock(member_id=member_with_data.id, end_rank=1, end_group="G1")

        service._period_repo.get_by_season = AsyncMock(return_value=[period])
        service._member_repo.get_by_alliance = AsyncMock(
            return_value=[member_with_data, member_without]
        )
        service._metrics_repo.get_by_period = AsyncMock(return_value=[metric])

        result = await service.get_members_for_analytics(alliance_id, True, season_id)
        assert len(result) == 1
        assert result[0]["name"] == "A"

    @pytest.mark.asyncio
    async def test_no_season_returns_all_members(self, service, alliance_id):
        member = MagicMock(id=UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"), is_active=True)
        member.name = "A"
        service._member_repo.get_by_alliance = AsyncMock(return_value=[member])

        result = await service.get_members_for_analytics(alliance_id, True, None)
        assert len(result) == 1
        assert result[0]["contribution_rank"] is None


class TestGetSeasonSummary:
    @pytest.mark.asyncio
    async def test_no_trend_returns_none(self, service, member_id, season_id):
        service._period_repo.get_by_season = AsyncMock(return_value=[])
        result = await service.get_season_summary(member_id, season_id)
        assert result is None


class TestGetMemberWithComparison:
    @pytest.mark.asyncio
    async def test_no_metrics_returns_none(self, service, member_id):
        period_id = UUID("55555555-5555-5555-5555-555555555555")
        service._metrics_repo.get_by_period = AsyncMock(return_value=[])
        result = await service.get_member_with_comparison(member_id, period_id)
        assert result is None

    @pytest.mark.asyncio
    async def test_member_not_found_returns_none(self, service, member_id):
        period_id = UUID("55555555-5555-5555-5555-555555555555")
        other_metric = MagicMock(member_id=UUID("99999999-9999-9999-9999-999999999999"))
        service._metrics_repo.get_by_period = AsyncMock(return_value=[other_metric])
        result = await service.get_member_with_comparison(member_id, period_id)
        assert result is None
