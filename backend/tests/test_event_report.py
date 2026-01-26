"""
Test for Event Report Feature

驗證戰役報告功能的各個組件：
1. Model 建構
2. 組別統計計算
3. Flex Message 建構
"""

from datetime import datetime
from uuid import uuid4

import pytest

from src.lib.line_flex_builder import (
    build_event_report_flex,
    format_duration,
    format_event_time,
    format_number,
)
from src.models.battle_event_metrics import (
    BattleEventMetricsWithMember,
    EventGroupAnalytics,
    EventSummary,
    GroupEventStats,
    TopMemberItem,
)


class TestFormatNumber:
    """Test number formatting utility"""

    def test_small_number(self):
        assert format_number(500) == "500"
        assert format_number(8500) == "8,500"

    def test_k_format(self):
        assert format_number(15000) == "15K"
        assert format_number(85000) == "85K"
        assert format_number(125000) == "125K"

    def test_m_format(self):
        assert format_number(1500000) == "1.5M"
        assert format_number(2000000) == "2.0M"


class TestFormatDuration:
    """Test duration formatting utility"""

    def test_minutes_only(self):
        start = datetime(2025, 1, 15, 6, 42)
        end = datetime(2025, 1, 15, 7, 35)
        assert format_duration(start, end) == "53分鐘"

    def test_hours_and_minutes(self):
        start = datetime(2025, 1, 15, 6, 0)
        end = datetime(2025, 1, 15, 8, 30)
        assert format_duration(start, end) == "2小時30分"

    def test_hours_only(self):
        start = datetime(2025, 1, 15, 6, 0)
        end = datetime(2025, 1, 15, 8, 0)
        assert format_duration(start, end) == "2小時"

    def test_none_values(self):
        assert format_duration(None, None) == ""
        assert format_duration(datetime.now(), None) == ""


class TestFormatEventTime:
    """Test event time formatting"""

    def test_format(self):
        dt = datetime(2025, 1, 15, 6, 42)
        assert format_event_time(dt) == "01/15 06:42"

    def test_none(self):
        assert format_event_time(None) == ""


class TestGroupEventStats:
    """Test GroupEventStats model"""

    def test_create_group_stats(self):
        stats = GroupEventStats(
            group_name="前鋒隊",
            member_count=5,
            participated_count=5,
            absent_count=0,
            participation_rate=100.0,
            total_merit=250000,
            avg_merit=50000.0,
            merit_min=15000,
            merit_max=85000,
        )

        assert stats.group_name == "前鋒隊"
        assert stats.participation_rate == 100.0
        assert stats.total_merit == 250000


class TestEventGroupAnalytics:
    """Test EventGroupAnalytics model"""

    def test_create_analytics(self):
        summary = EventSummary(
            total_members=20,
            participated_count=17,
            absent_count=3,
            new_member_count=0,
            participation_rate=85.0,
            total_merit=450000,
            total_assist=3200,
            total_contribution=125000,
            avg_merit=26470.6,
            avg_assist=188.2,
            mvp_member_id=uuid4(),
            mvp_member_name="張飛",
            mvp_merit=85000,
        )

        group_stats = [
            GroupEventStats(
                group_name="前鋒隊",
                member_count=5,
                participated_count=5,
                absent_count=0,
                participation_rate=100.0,
                total_merit=250000,
                avg_merit=50000.0,
                merit_min=15000,
                merit_max=85000,
            ),
            GroupEventStats(
                group_name="後勤隊",
                member_count=4,
                participated_count=3,
                absent_count=1,
                participation_rate=75.0,
                total_merit=100000,
                avg_merit=33333.3,
                merit_min=20000,
                merit_max=45000,
            ),
        ]

        top_members = [
            TopMemberItem(rank=1, member_name="張飛", group_name="前鋒隊", score=85000, merit_diff=85000),
            TopMemberItem(rank=2, member_name="關羽", group_name="前鋒隊", score=72000, merit_diff=72000),
            TopMemberItem(rank=3, member_name="趙雲", group_name="前鋒隊", score=65000, merit_diff=65000),
        ]

        analytics = EventGroupAnalytics(
            event_id=uuid4(),
            event_name="徐州爭奪戰",
            event_type="siege",
            event_start=datetime(2025, 1, 15, 6, 42),
            event_end=datetime(2025, 1, 15, 7, 35),
            summary=summary,
            group_stats=group_stats,
            top_members=top_members,
        )

        assert analytics.event_name == "徐州爭奪戰"
        assert analytics.summary.participation_rate == 85.0
        assert len(analytics.group_stats) == 2
        assert len(analytics.top_members) == 3


class TestBuildEventReportFlex:
    """Test Flex Message building"""

    @pytest.fixture
    def sample_analytics(self):
        """Create sample analytics data for testing"""
        summary = EventSummary(
            total_members=20,
            participated_count=17,
            absent_count=3,
            new_member_count=0,
            participation_rate=85.0,
            total_merit=450000,
            total_assist=3200,
            total_contribution=125000,
            avg_merit=26470.6,
            avg_assist=188.2,
            mvp_member_id=uuid4(),
            mvp_member_name="張飛",
            mvp_merit=85000,
        )

        group_stats = [
            GroupEventStats(
                group_name="前鋒隊",
                member_count=5,
                participated_count=5,
                absent_count=0,
                participation_rate=100.0,
                total_merit=250000,
                avg_merit=50000.0,
                merit_min=15000,
                merit_max=85000,
            ),
            GroupEventStats(
                group_name="後勤隊",
                member_count=4,
                participated_count=3,
                absent_count=1,
                participation_rate=75.0,
                total_merit=100000,
                avg_merit=33333.3,
                merit_min=20000,
                merit_max=45000,
            ),
            GroupEventStats(
                group_name="新手組",
                member_count=3,
                participated_count=2,
                absent_count=1,
                participation_rate=66.7,
                total_merit=30000,
                avg_merit=15000.0,
                merit_min=10000,
                merit_max=20000,
            ),
        ]

        top_members = [
            TopMemberItem(rank=1, member_name="張飛", group_name="前鋒隊", score=85000, merit_diff=85000),
            TopMemberItem(rank=2, member_name="關羽", group_name="前鋒隊", score=72000, merit_diff=72000),
            TopMemberItem(rank=3, member_name="趙雲", group_name="前鋒隊", score=65000, merit_diff=65000),
            TopMemberItem(rank=4, member_name="馬超", group_name="後勤隊", score=35000, merit_diff=35000),
            TopMemberItem(rank=5, member_name="黃忠", group_name="後勤隊", score=32000, merit_diff=32000),
        ]

        return EventGroupAnalytics(
            event_id=uuid4(),
            event_name="徐州爭奪戰",
            event_type="siege",
            event_start=datetime(2025, 1, 15, 6, 42),
            event_end=datetime(2025, 1, 15, 7, 35),
            summary=summary,
            group_stats=group_stats,
            top_members=top_members,
        )

    def test_build_flex_message(self, sample_analytics):
        """Test that Flex Message is built correctly"""
        try:
            from linebot.v3.messaging import FlexMessage
        except ImportError:
            pytest.skip("linebot SDK not installed")

        flex_message = build_event_report_flex(sample_analytics)

        assert flex_message is not None
        assert isinstance(flex_message, FlexMessage)
        assert "徐州爭奪戰" in flex_message.alt_text

    def test_build_flex_message_content(self, sample_analytics):
        """Test Flex Message content structure"""
        try:
            from linebot.v3.messaging import FlexBubble
        except ImportError:
            pytest.skip("linebot SDK not installed")

        flex_message = build_event_report_flex(sample_analytics)

        assert flex_message is not None
        assert flex_message.contents is not None
        assert isinstance(flex_message.contents, FlexBubble)

        bubble = flex_message.contents
        assert bubble.header is not None
        assert bubble.body is not None


class TestGroupStatsCalculation:
    """Test group statistics calculation logic"""

    def test_calculate_group_stats(self):
        """Test the group stats calculation in service"""
        from src.services.battle_event_service import BattleEventService

        service = BattleEventService()

        # Create mock metrics
        metrics = [
            _create_mock_metric("張飛", "前鋒隊", merit_diff=85000, participated=True),
            _create_mock_metric("關羽", "前鋒隊", merit_diff=72000, participated=True),
            _create_mock_metric("趙雲", "前鋒隊", merit_diff=65000, participated=True),
            _create_mock_metric("劉備", "前鋒隊", merit_diff=0, participated=False, is_absent=True),
        ]

        stats = service._calculate_group_stats("前鋒隊", metrics)

        assert stats.group_name == "前鋒隊"
        assert stats.member_count == 4
        assert stats.participated_count == 3
        assert stats.absent_count == 1
        assert stats.participation_rate == 75.0
        assert stats.total_merit == 222000
        assert stats.merit_min == 65000
        assert stats.merit_max == 85000

    def test_calculate_group_stats_all_participated(self):
        """Test when all members participated"""
        from src.services.battle_event_service import BattleEventService

        service = BattleEventService()

        metrics = [
            _create_mock_metric("張飛", "前鋒隊", merit_diff=85000, participated=True),
            _create_mock_metric("關羽", "前鋒隊", merit_diff=72000, participated=True),
        ]

        stats = service._calculate_group_stats("前鋒隊", metrics)

        assert stats.participation_rate == 100.0
        assert stats.absent_count == 0

    def test_calculate_group_stats_empty(self):
        """Test with empty metrics"""
        from src.services.battle_event_service import BattleEventService

        service = BattleEventService()
        stats = service._calculate_group_stats("空組", [])

        assert stats.member_count == 0
        assert stats.participation_rate == 0.0


def _create_mock_metric(
    name: str,
    group: str,
    merit_diff: int = 0,
    participated: bool = False,
    is_absent: bool = False,
    is_new_member: bool = False,
) -> BattleEventMetricsWithMember:
    """Helper to create mock metric for testing"""
    return BattleEventMetricsWithMember(
        id=uuid4(),
        event_id=uuid4(),
        member_id=uuid4(),
        alliance_id=uuid4(),
        start_snapshot_id=uuid4() if not is_new_member else None,
        end_snapshot_id=uuid4(),
        created_at=datetime.now(),
        contribution_diff=0,
        merit_diff=merit_diff,
        assist_diff=0,
        donation_diff=0,
        power_diff=0,
        participated=participated,
        is_new_member=is_new_member,
        is_absent=is_absent,
        member_name=name,
        group_name=group,
    )


class TestBuildEventListCarousel:
    """Test build_event_list_carousel function"""

    def test_build_carousel_with_events(self):
        """Test carousel is built correctly with events"""
        try:
            from linebot.v3.messaging import FlexCarousel, FlexMessage
        except ImportError:
            pytest.skip("linebot SDK not installed")

        from src.lib.line_flex_builder import build_event_list_carousel
        from src.models.battle_event import BattleEvent, EventCategory, EventStatus

        events = [
            BattleEvent(
                id=uuid4(),
                season_id=uuid4(),
                alliance_id=uuid4(),
                name="徐州爭奪戰",
                event_type=EventCategory.BATTLE,
                status=EventStatus.COMPLETED,
                event_start=datetime(2025, 1, 15, 6, 42),
                event_end=datetime(2025, 1, 15, 7, 35),
                created_at=datetime.now(),
                before_upload_id=None,
                after_upload_id=None,
                created_by=None,
            ),
            BattleEvent(
                id=uuid4(),
                season_id=uuid4(),
                alliance_id=uuid4(),
                name="資源洲開關",
                event_type=EventCategory.SIEGE,
                status=EventStatus.COMPLETED,
                event_start=datetime(2025, 1, 14, 10, 0),
                event_end=datetime(2025, 1, 14, 11, 30),
                created_at=datetime.now(),
                before_upload_id=None,
                after_upload_id=None,
                created_by=None,
            ),
        ]

        flex_message = build_event_list_carousel(events)

        assert flex_message is not None
        assert isinstance(flex_message, FlexMessage)
        assert isinstance(flex_message.contents, FlexCarousel)
        assert len(flex_message.contents.contents) == 2

    def test_build_carousel_empty_events(self):
        """Test carousel returns None when events list is empty"""
        from src.lib.line_flex_builder import build_event_list_carousel

        flex_message = build_event_list_carousel([])
        assert flex_message is None


class TestEventCommandHelpers:
    """Test event command helper functions"""

    def test_is_event_command(self):
        """Test event command detection"""
        from src.api.v1.endpoints.linebot import _is_event_command

        assert _is_event_command("/戰役") is True
        assert _is_event_command("/戰役 資源洲開關") is True
        assert _is_event_command("/其他指令") is False
        assert _is_event_command("戰役") is False

    def test_extract_event_name(self):
        """Test event name extraction"""
        from src.api.v1.endpoints.linebot import _extract_event_name

        assert _extract_event_name("/戰役") is None
        assert _extract_event_name("/戰役 ") is None
        assert _extract_event_name("/戰役 資源洲開關") == "資源洲開關"
        assert _extract_event_name("/戰役  有空格的名稱  ") == "有空格的名稱"


class TestEventCategoryAwareReport:
    """Test category-aware event report building"""

    @pytest.fixture
    def battle_analytics(self):
        """Create battle event analytics"""
        summary = EventSummary(
            total_members=10,
            participated_count=8,
            absent_count=2,
            new_member_count=0,
            participation_rate=80.0,
            total_merit=200000,
            total_assist=1000,
            total_contribution=50000,
            avg_merit=25000.0,
            avg_assist=125.0,
            mvp_member_id=uuid4(),
            mvp_member_name="張飛",
            mvp_merit=50000,
        )

        return EventGroupAnalytics(
            event_id=uuid4(),
            event_name="徐州爭奪戰",
            event_type="battle",
            event_start=datetime(2025, 1, 15, 6, 42),
            event_end=datetime(2025, 1, 15, 7, 35),
            summary=summary,
            group_stats=[],
            top_members=[
                TopMemberItem(rank=1, member_name="張飛", group_name="前鋒", score=50000, merit_diff=50000),
            ],
        )

    @pytest.fixture
    def siege_analytics(self):
        """Create siege event analytics"""
        summary = EventSummary(
            total_members=10,
            participated_count=9,
            absent_count=1,
            new_member_count=0,
            participation_rate=90.0,
            total_merit=100000,
            total_assist=5000,
            total_contribution=300000,
            avg_merit=11111.1,
            avg_assist=555.6,
            mvp_member_id=uuid4(),
            mvp_member_name="關羽",
            mvp_merit=30000,
        )

        return EventGroupAnalytics(
            event_id=uuid4(),
            event_name="資源洲開關",
            event_type="siege",
            event_start=datetime(2025, 1, 14, 10, 0),
            event_end=datetime(2025, 1, 14, 11, 30),
            summary=summary,
            group_stats=[],
            top_members=[
                TopMemberItem(rank=1, member_name="關羽", group_name="攻城", score=80000, merit_diff=30000),
            ],
        )

    @pytest.fixture
    def forbidden_analytics(self):
        """Create forbidden event analytics with violators"""
        from src.models.battle_event_metrics import ViolatorItem

        summary = EventSummary(
            total_members=10,
            participated_count=0,
            absent_count=0,
            new_member_count=0,
            participation_rate=0.0,
            total_merit=50000,
            total_assist=0,
            total_contribution=10000,
            avg_merit=5000.0,
            avg_assist=0.0,
            mvp_member_id=None,
            mvp_member_name=None,
            mvp_merit=0,
        )

        return EventGroupAnalytics(
            event_id=uuid4(),
            event_name="禁地活動",
            event_type="forbidden",
            event_start=datetime(2025, 1, 13, 8, 0),
            event_end=datetime(2025, 1, 13, 9, 0),
            summary=summary,
            group_stats=[],
            top_members=[],
            violators=[
                ViolatorItem(rank=1, member_name="違規者A", group_name="組1", power_diff=5000),
                ViolatorItem(rank=2, member_name="違規者B", group_name="組2", power_diff=3000),
            ],
        )

    def test_build_battle_report(self, battle_analytics):
        """Test building battle event report"""
        try:
            from linebot.v3.messaging import FlexMessage
        except ImportError:
            pytest.skip("linebot SDK not installed")

        flex_message = build_event_report_flex(battle_analytics)

        assert flex_message is not None
        assert isinstance(flex_message, FlexMessage)
        assert "徐州爭奪戰" in flex_message.alt_text

    def test_build_siege_report(self, siege_analytics):
        """Test building siege event report"""
        try:
            from linebot.v3.messaging import FlexMessage
        except ImportError:
            pytest.skip("linebot SDK not installed")

        flex_message = build_event_report_flex(siege_analytics)

        assert flex_message is not None
        assert isinstance(flex_message, FlexMessage)
        assert "資源洲開關" in flex_message.alt_text

    def test_build_forbidden_report(self, forbidden_analytics):
        """Test building forbidden event report with violators"""
        try:
            from linebot.v3.messaging import FlexMessage
        except ImportError:
            pytest.skip("linebot SDK not installed")

        flex_message = build_event_report_flex(forbidden_analytics)

        assert flex_message is not None
        assert isinstance(flex_message, FlexMessage)
        assert "禁地活動" in flex_message.alt_text


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
