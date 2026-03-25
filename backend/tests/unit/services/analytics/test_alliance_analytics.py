"""Tests for AllianceAnalyticsService."""

from unittest.mock import AsyncMock
from uuid import UUID

import pytest

from src.services.analytics.alliance_analytics_service import AllianceAnalyticsService


@pytest.fixture
def service():
    return AllianceAnalyticsService()


@pytest.fixture
def season_id():
    return UUID("33333333-3333-3333-3333-333333333333")


class TestGetAllianceAnalytics:
    @pytest.mark.asyncio
    async def test_no_season_returns_empty(self, service, season_id):
        service._season_repo.get_by_id = AsyncMock(return_value=None)
        service._period_repo.get_by_season = AsyncMock(return_value=[])
        result = await service.get_alliance_analytics(season_id)
        assert result["summary"]["member_count"] == 0
        assert result["trends"] == []
        assert result["top_performers"] == []


class TestEmptyAllianceAnalytics:
    def test_returns_complete_empty_structure(self, service):
        result = service._empty_alliance_analytics()
        assert result["summary"]["member_count"] == 0
        assert result["distributions"]["contribution"] == []
        assert result["current_period"]["period_id"] == ""


class TestCalculateNeedsAttention:
    def test_rank_drop_detected(self, service):
        member_data = [
            {
                "member_id": "aaa",
                "name": "Test",
                "group": "G1",
                "daily_contribution": 100.0,
                "rank": 50,
                "rank_change": -15,
            }
        ]
        result = service._calculate_needs_attention(member_data, 200.0, "latest")
        assert len(result) == 1
        assert "排名下滑" in result[0]["reason"]

    def test_low_contribution_detected(self, service):
        member_data = [
            {
                "member_id": "bbb",
                "name": "Low",
                "group": "G1",
                "daily_contribution": 10.0,
                "rank": 5,
                "rank_change": 0,
            }
        ]
        result = service._calculate_needs_attention(member_data, 100.0, "latest")
        assert len(result) == 1
        assert "低於同盟中位數" in result[0]["reason"]

    def test_season_view_skips_rank_change_rules(self, service):
        member_data = [
            {
                "member_id": "ccc",
                "name": "SeasonDrop",
                "group": "G1",
                "daily_contribution": 200.0,
                "rank": 10,
                "rank_change": -20,
            }
        ]
        result = service._calculate_needs_attention(member_data, 100.0, "season")
        assert len(result) == 0  # rank_change rules skipped in season view


class TestCalculateDistributions:
    def test_empty_data(self, service):
        result = service._calculate_distributions([])
        assert result == {"contribution": [], "merit": []}

    def test_produces_bins(self, service):
        member_data = [
            {"daily_contribution": 1000.0, "daily_merit": 500.0},
            {"daily_contribution": 5000.0, "daily_merit": 2000.0},
            {"daily_contribution": 10000.0, "daily_merit": 8000.0},
        ]
        result = service._calculate_distributions(member_data)
        assert len(result["contribution"]) > 0
        assert len(result["merit"]) > 0
        # Total count across bins should equal member count
        total = sum(b["count"] for b in result["contribution"])
        assert total == 3


class TestCalculatePerformers:
    def test_returns_sorted_performers(self, service):
        member_data = [
            {
                "member_id": "a",
                "name": "A",
                "group": "G1",
                "daily_contribution": 100.0,
                "daily_merit": 50.0,
                "daily_assist": 10.0,
                "rank": 3,
                "rank_change": 1,
                "merit_change": 5.0,
                "assist_change": 2.0,
            },
            {
                "member_id": "b",
                "name": "B",
                "group": "G1",
                "daily_contribution": 200.0,
                "daily_merit": 100.0,
                "daily_assist": 20.0,
                "rank": 1,
                "rank_change": 0,
                "merit_change": 10.0,
                "assist_change": 5.0,
            },
        ]
        top, bottom = service._calculate_performers(member_data)
        assert top[0]["name"] == "B"  # rank 1 first
        assert bottom[0]["name"] == "A"  # rank 3 first (reversed)


class TestFormatRange:
    def test_thousands(self, service):
        assert service._format_range(1000, 5000) == "1K-5K"

    def test_millions(self, service):
        assert service._format_range(1000000, 2000000) == "1M-2M"

    def test_small_values(self, service):
        assert service._format_range(0, 100) == "0-100"
