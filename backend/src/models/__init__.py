"""
Pydantic models package

Export all models for easy import
"""

from src.models.alliance import Alliance, AllianceCreate, AllianceUpdate
from src.models.battle_event import (
    BattleEvent,
    BattleEventCreate,
    BattleEventListItem,
    BattleEventUpdate,
    EventStatus,
)
from src.models.battle_event_metrics import (
    BattleEventMetrics,
    BattleEventMetricsCreate,
    BattleEventMetricsWithMember,
    EventSummary,
)
from src.models.copper_mine_coordinate import (
    CopperCoordinateSearchResult,
    CopperMineCoordinate,
    CopperMineCoordinateResponse,
)
from src.models.csv_upload import CsvUpload, CsvUploadCreate, CsvUploadUpdate
from src.models.donation import (
    Donation,
    DonationCreate,
    DonationMemberInfo,
    DonationStatus,
    DonationTarget,
    DonationType,
    DonationWithInfo,
)
from src.models.member import Member, MemberCreate, MemberUpdate
from src.models.member_period_metrics import (
    MemberPeriodMetrics,
    MemberPeriodMetricsCreate,
    MemberPeriodMetricsSummary,
    MemberPeriodMetricsWithMember,
)
from src.models.member_snapshot import (
    MemberSnapshot,
    MemberSnapshotCreate,
    MemberSnapshotWithDetails,
)
from src.models.period import Period, PeriodCreate, PeriodWithUploads
from src.models.season import Season, SeasonCreate, SeasonUpdate

__all__ = [
    # Alliance models
    "Alliance",
    "AllianceCreate",
    "AllianceUpdate",
    # Battle Event models
    "BattleEvent",
    "BattleEventCreate",
    "BattleEventUpdate",
    "BattleEventListItem",
    "EventStatus",
    # Battle Event Metrics models
    "BattleEventMetrics",
    "BattleEventMetricsCreate",
    "BattleEventMetricsWithMember",
    "EventSummary",
    # Copper Mine Coordinate models
    "CopperMineCoordinate",
    "CopperMineCoordinateResponse",
    "CopperCoordinateSearchResult",
    # Donation models
    "Donation",
    "DonationCreate",
    "DonationMemberInfo",
    "DonationStatus",
    "DonationTarget",
    "DonationType",
    "DonationWithInfo",
    # Season models
    "Season",
    "SeasonCreate",
    "SeasonUpdate",
    # CSV Upload models
    "CsvUpload",
    "CsvUploadCreate",
    "CsvUploadUpdate",
    # Member models
    "Member",
    "MemberCreate",
    "MemberUpdate",
    # Member Snapshot models
    "MemberSnapshot",
    "MemberSnapshotCreate",
    "MemberSnapshotWithDetails",
    # Period models
    "Period",
    "PeriodCreate",
    "PeriodWithUploads",
    # Member Period Metrics models
    "MemberPeriodMetrics",
    "MemberPeriodMetricsCreate",
    "MemberPeriodMetricsSummary",
    "MemberPeriodMetricsWithMember",
]
