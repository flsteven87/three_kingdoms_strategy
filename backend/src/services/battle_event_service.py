"""
Battle Event Service

管理戰役事件：建立事件、處理快照、計算指標

核心功能：
1. 建立戰役事件
2. 處理戰前/戰後快照並計算成員指標
3. 判定參戰（merit_diff > 0 或 contribution_diff > 0）
4. 生成事件摘要統計

符合 CLAUDE.md 🔴:
- Service layer orchestrates repositories and business logic
- NO direct database calls (delegates to repositories)
"""

from uuid import UUID

from src.models.battle_event import (
    BattleEvent,
    BattleEventCreate,
    BattleEventListItem,
    EventCategory,
    EventStatus,
)
from src.models.battle_event_metrics import (
    BattleEventMetricsCreate,
    BattleEventMetricsWithMember,
    EventGroupAnalytics,
    EventSummary,
    GroupEventStats,
    TopMemberItem,
)
from src.repositories.battle_event_metrics_repository import BattleEventMetricsRepository
from src.repositories.battle_event_repository import BattleEventRepository
from src.repositories.csv_upload_repository import CsvUploadRepository
from src.repositories.member_snapshot_repository import MemberSnapshotRepository
from src.services.permission_service import PermissionService


class BattleEventService:
    """Service for battle event management and analytics"""

    def __init__(self):
        """Initialize battle event service with required repositories"""
        self._event_repo = BattleEventRepository()
        self._metrics_repo = BattleEventMetricsRepository()
        self._snapshot_repo = MemberSnapshotRepository()
        self._upload_repo = CsvUploadRepository()
        self._permission_service = PermissionService()

    def _determine_participation(
        self,
        event_type: EventCategory,
        contribution_diff: int,
        merit_diff: int,
        assist_diff: int,
        power_diff: int,
    ) -> tuple[bool, bool]:
        """
        Determine participation and absence based on event category.

        Args:
            event_type: Event category
            contribution_diff: Contribution change
            merit_diff: Merit change
            assist_diff: Assist change
            power_diff: Power change

        Returns:
            Tuple of (participated, is_absent)
        """
        if event_type == EventCategory.SIEGE:
            # 攻城事件: 貢獻 > 0 OR 助攻 > 0
            participated = contribution_diff > 0 or assist_diff > 0
        elif event_type == EventCategory.FORBIDDEN:
            # 禁地事件: 不計算出席，只標記違規者
            # power_diff > 0 表示偷打地（違規）
            participated = False  # Forbidden zone doesn't track participation
        else:  # BATTLE
            # 戰役事件: 戰功 > 0
            participated = merit_diff > 0

        is_absent = not participated if event_type != EventCategory.FORBIDDEN else False
        return participated, is_absent

    async def verify_user_access(self, user_id: UUID, event_id: UUID) -> UUID:
        """
        Verify user has access to event and return alliance_id

        This is a utility method for API endpoints to verify access before operations.

        Args:
            user_id: User UUID
            event_id: Event UUID

        Returns:
            UUID: The alliance_id if access is granted

        Raises:
            ValueError: If event not found
            PermissionError: If user is not a member of the alliance
        """
        event = await self._event_repo.get_by_id(event_id)
        if not event:
            raise ValueError("Event not found")

        role = await self._permission_service.get_user_role(user_id, event.alliance_id)
        if role is None:
            raise PermissionError("You are not a member of this alliance")

        return event.alliance_id

    async def create_event(self, event_data: BattleEventCreate) -> BattleEvent:
        """
        Create a new battle event.

        Args:
            event_data: Event creation data

        Returns:
            Created battle event

        Raises:
            SeasonQuotaExhaustedError: If trial/season quota has expired

        符合 CLAUDE.md 🔴: Service layer orchestration
        """
        # Verify quota: trial or available seasons required
        await self._permission_service.require_active_quota(
            event_data.alliance_id, "create battle events"
        )

        return await self._event_repo.create(event_data)

    async def get_event(self, event_id: UUID) -> BattleEvent | None:
        """
        Get a battle event by ID.

        Args:
            event_id: Event UUID

        Returns:
            Battle event or None if not found
        """
        return await self._event_repo.get_by_id(event_id)

    async def get_events_by_season(self, season_id: UUID) -> list[BattleEventListItem]:
        """
        Get all events for a season with computed stats.

        Args:
            season_id: Season UUID

        Returns:
            List of event list items with stats
        """
        events = await self._event_repo.get_by_season(season_id)

        result: list[BattleEventListItem] = []
        for event in events:
            # Get summary stats if event is completed
            participation_rate = None
            total_merit = None
            mvp_name = None
            absent_count = None

            if event.status == EventStatus.COMPLETED:
                summary = await self._calculate_event_summary(event.id, event.event_type)
                participation_rate = summary.participation_rate
                total_merit = summary.total_merit
                mvp_name = summary.mvp_member_name
                absent_count = summary.absent_count

            result.append(
                BattleEventListItem(
                    id=event.id,
                    name=event.name,
                    event_type=event.event_type,
                    status=event.status,
                    event_start=event.event_start,
                    event_end=event.event_end,
                    created_at=event.created_at,
                    participation_rate=participation_rate,
                    total_merit=total_merit,
                    mvp_name=mvp_name,
                    absent_count=absent_count,
                )
            )

        return result

    async def process_event_snapshots(
        self,
        event_id: UUID,
        before_upload_id: UUID,
        after_upload_id: UUID,
    ) -> BattleEvent:
        """
        Process before/after snapshots and calculate member metrics.

        This is the main entry point after uploading CSVs for an event.
        It calculates diffs and determines participation for each member.

        Args:
            event_id: Event UUID
            before_upload_id: Before snapshot upload UUID
            after_upload_id: After snapshot upload UUID

        Returns:
            Updated battle event

        Raises:
            ValueError: If event not found

        符合 CLAUDE.md 🔴: Service layer orchestration
        """
        # 1. Update event with upload IDs and set status to analyzing
        event = await self._event_repo.get_by_id(event_id)
        if not event:
            raise ValueError(f"Event {event_id} not found")

        # Verify quota: trial or available seasons required
        await self._permission_service.require_active_quota(
            event.alliance_id, "process battle event snapshots"
        )

        await self._event_repo.update_upload_ids(event_id, before_upload_id, after_upload_id)
        await self._event_repo.update_status(event_id, EventStatus.ANALYZING)

        # 1.5 Auto-set event times from CSV upload snapshot dates
        before_upload = await self._upload_repo.get_by_id(before_upload_id)
        after_upload = await self._upload_repo.get_by_id(after_upload_id)

        if before_upload and after_upload:
            await self._event_repo.update_event_times(
                event_id,
                event_start=before_upload.snapshot_date,
                event_end=after_upload.snapshot_date,
            )

        # 2. Get snapshots for both uploads
        before_snapshots = await self._snapshot_repo.get_by_upload(before_upload_id)
        after_snapshots = await self._snapshot_repo.get_by_upload(after_upload_id)

        # 3. Build member_id -> snapshot maps
        before_map = {snap.member_id: snap for snap in before_snapshots}
        after_map = {snap.member_id: snap for snap in after_snapshots}

        # 4. Delete existing metrics for this event (in case of reprocessing)
        await self._metrics_repo.delete_by_event(event_id)

        # 5. Calculate metrics for each member
        metrics_list: list[BattleEventMetricsCreate] = []

        # Members in after snapshot (participated or new)
        for member_id, after_snap in after_map.items():
            before_snap = before_map.get(member_id)

            if before_snap:
                # Existing member: calculate diffs
                contribution_diff = max(
                    0, after_snap.total_contribution - before_snap.total_contribution
                )
                merit_diff = max(0, after_snap.total_merit - before_snap.total_merit)
                assist_diff = max(0, after_snap.total_assist - before_snap.total_assist)
                donation_diff = max(0, after_snap.total_donation - before_snap.total_donation)
                power_diff = after_snap.power_value - before_snap.power_value

                # Participation based on event category
                participated, is_absent = self._determine_participation(
                    event.event_type,
                    contribution_diff,
                    merit_diff,
                    assist_diff,
                    power_diff,
                )

                metrics_list.append(
                    BattleEventMetricsCreate(
                        event_id=event_id,
                        member_id=member_id,
                        alliance_id=event.alliance_id,
                        start_snapshot_id=before_snap.id,
                        end_snapshot_id=after_snap.id,
                        contribution_diff=contribution_diff,
                        merit_diff=merit_diff,
                        assist_diff=assist_diff,
                        donation_diff=donation_diff,
                        power_diff=power_diff,
                        participated=participated,
                        is_new_member=False,
                        is_absent=is_absent,
                    )
                )
            else:
                # New member: only in after snapshot
                metrics_list.append(
                    BattleEventMetricsCreate(
                        event_id=event_id,
                        member_id=member_id,
                        alliance_id=event.alliance_id,
                        start_snapshot_id=None,
                        end_snapshot_id=after_snap.id,
                        contribution_diff=0,
                        merit_diff=0,
                        assist_diff=0,
                        donation_diff=0,
                        power_diff=0,
                        participated=False,
                        is_new_member=True,
                        is_absent=False,
                    )
                )

        # Members only in before snapshot (left/absent during event)
        for member_id, before_snap in before_map.items():
            if member_id not in after_map:
                # Member left or not in after snapshot
                metrics_list.append(
                    BattleEventMetricsCreate(
                        event_id=event_id,
                        member_id=member_id,
                        alliance_id=event.alliance_id,
                        start_snapshot_id=before_snap.id,
                        end_snapshot_id=None,
                        contribution_diff=0,
                        merit_diff=0,
                        assist_diff=0,
                        donation_diff=0,
                        power_diff=0,
                        participated=False,
                        is_new_member=False,
                        is_absent=True,
                    )
                )

        # 6. Batch insert metrics
        if metrics_list:
            await self._metrics_repo.create_batch(metrics_list)

        # 7. Update event status to completed
        return await self._event_repo.update_status(event_id, EventStatus.COMPLETED)

    async def get_event_metrics(self, event_id: UUID) -> list[BattleEventMetricsWithMember]:
        """
        Get all member metrics for an event with member info.

        Args:
            event_id: Event UUID

        Returns:
            List of metrics with member names, ordered by merit_diff desc
        """
        return await self._metrics_repo.get_by_event_with_member_and_group(event_id)

    async def get_event_summary(self, event_id: UUID) -> EventSummary:
        """
        Get summary statistics for an event.

        Args:
            event_id: Event UUID

        Returns:
            Event summary with participation stats and aggregates
        """
        event = await self._event_repo.get_by_id(event_id)
        if not event:
            raise ValueError("Event not found")
        return await self._calculate_event_summary(event_id, event.event_type)

    async def _calculate_event_summary(
        self, event_id: UUID, event_type: EventCategory = EventCategory.BATTLE
    ) -> EventSummary:
        """
        Calculate summary statistics for an event.

        Args:
            event_id: Event UUID
            event_type: Event category for category-specific calculations

        Returns:
            EventSummary with all stats
        """
        metrics = await self._metrics_repo.get_by_event_with_member(event_id)

        if not metrics:
            return EventSummary(
                total_members=0,
                participated_count=0,
                absent_count=0,
                new_member_count=0,
                participation_rate=0.0,
                total_merit=0,
                total_assist=0,
                total_contribution=0,
                avg_merit=0.0,
                avg_assist=0.0,
                mvp_member_id=None,
                mvp_member_name=None,
                mvp_merit=None,
                mvp_contribution=None,
                mvp_assist=None,
                mvp_combined_score=None,
                violator_count=0,
            )

        # Count participation types
        total_members = len(metrics)
        participated_count = sum(1 for m in metrics if m.participated)
        new_member_count = sum(1 for m in metrics if m.is_new_member)
        absent_count = sum(1 for m in metrics if m.is_absent)

        # Calculate participation rate (excluding new members)
        eligible_members = total_members - new_member_count
        participation_rate = (
            (participated_count / eligible_members * 100) if eligible_members > 0 else 0.0
        )

        # Aggregate metrics
        total_merit = sum(m.merit_diff for m in metrics)
        total_assist = sum(m.assist_diff for m in metrics)
        total_contribution = sum(m.contribution_diff for m in metrics)

        # Average metrics (only for participants)
        avg_merit = total_merit / participated_count if participated_count > 0 else 0.0
        avg_assist = total_assist / participated_count if participated_count > 0 else 0.0

        # Category-specific MVP calculation
        mvp_member_id = None
        mvp_member_name = None
        mvp_merit = None
        mvp_contribution = None
        mvp_assist = None
        mvp_combined_score = None
        violator_count = 0

        if event_type == EventCategory.SIEGE:
            # MVP = highest contribution + assist combined
            if metrics:
                mvp = max(metrics, key=lambda m: m.contribution_diff + m.assist_diff)
                combined = mvp.contribution_diff + mvp.assist_diff
                if combined > 0:
                    mvp_member_id = mvp.member_id
                    mvp_member_name = mvp.member_name
                    mvp_contribution = mvp.contribution_diff
                    mvp_assist = mvp.assist_diff
                    mvp_combined_score = combined

        elif event_type == EventCategory.FORBIDDEN:
            # Count violators (power_diff > 0)
            violator_count = sum(1 for m in metrics if m.power_diff > 0)
            # No MVP for forbidden zone

        else:  # BATTLE
            # MVP = highest merit
            if metrics:
                mvp = max(metrics, key=lambda m: m.merit_diff)
                if mvp.merit_diff > 0:
                    mvp_member_id = mvp.member_id
                    mvp_member_name = mvp.member_name
                    mvp_merit = mvp.merit_diff

        return EventSummary(
            total_members=total_members,
            participated_count=participated_count,
            absent_count=absent_count,
            new_member_count=new_member_count,
            participation_rate=round(participation_rate, 1),
            total_merit=total_merit,
            total_assist=total_assist,
            total_contribution=total_contribution,
            avg_merit=round(avg_merit, 1),
            avg_assist=round(avg_assist, 1),
            mvp_member_id=mvp_member_id,
            mvp_member_name=mvp_member_name,
            mvp_merit=mvp_merit,
            mvp_contribution=mvp_contribution,
            mvp_assist=mvp_assist,
            mvp_combined_score=mvp_combined_score,
            violator_count=violator_count,
        )

    async def delete_event(self, event_id: UUID) -> bool:
        """
        Delete a battle event and its metrics.

        Args:
            event_id: Event UUID

        Returns:
            True if deleted successfully

        Raises:
            ValueError: If event not found
            SeasonQuotaExhaustedError: If trial/season quota has expired
        """
        # Get event to check alliance_id
        event = await self._event_repo.get_by_id(event_id)
        if not event:
            raise ValueError("Event not found")

        # Verify quota: trial or available seasons required
        await self._permission_service.require_active_quota(
            event.alliance_id, "delete battle events"
        )

        # Metrics are deleted via CASCADE
        return await self._event_repo.delete(event_id)

    async def get_latest_completed_event_for_alliance(
        self, alliance_id: UUID
    ) -> BattleEvent | None:
        """
        Get the most recent completed battle event for an alliance.

        Args:
            alliance_id: Alliance UUID

        Returns:
            Latest completed battle event or None
        """
        return await self._event_repo.get_latest_completed_event(alliance_id)

    async def get_event_group_analytics(
        self, event_id: UUID, top_n: int = 5
    ) -> EventGroupAnalytics | None:
        """
        Get group-level analytics for a battle event.

        Calculates per-group statistics including:
        - Participation rate
        - Merit distribution (min/avg/max)
        - Member counts

        Args:
            event_id: Event UUID
            top_n: Number of top performers to include

        Returns:
            EventGroupAnalytics with group stats and top members,
            or None if event not found
        """
        event = await self._event_repo.get_by_id(event_id)
        if not event:
            return None

        # Get all metrics with group info
        metrics = await self._metrics_repo.get_by_event_with_member_and_group(event_id)
        if not metrics:
            return None

        # Get overall summary
        summary = await self._calculate_event_summary(event_id)

        # Group metrics by group_name
        groups: dict[str, list[BattleEventMetricsWithMember]] = {}
        for m in metrics:
            group_name = m.group_name or "未分組"
            if group_name not in groups:
                groups[group_name] = []
            groups[group_name].append(m)

        # Calculate stats for each group
        group_stats: list[GroupEventStats] = []
        for group_name, group_metrics in groups.items():
            stats = self._calculate_group_stats(group_name, group_metrics)
            group_stats.append(stats)

        # Sort by total_merit descending
        group_stats.sort(key=lambda g: g.total_merit, reverse=True)

        # Get top performers (exclude new members)
        participants = [m for m in metrics if m.participated]
        participants.sort(key=lambda m: m.merit_diff, reverse=True)

        top_members = [
            TopMemberItem(
                rank=i + 1,
                member_name=m.member_name,
                group_name=m.group_name,
                merit_diff=m.merit_diff,
            )
            for i, m in enumerate(participants[:top_n])
        ]

        return EventGroupAnalytics(
            event_id=event.id,
            event_name=event.name,
            event_type=event.event_type,
            event_start=event.event_start,
            event_end=event.event_end,
            summary=summary,
            group_stats=group_stats,
            top_members=top_members,
        )

    def _calculate_group_stats(
        self,
        group_name: str,
        metrics: list[BattleEventMetricsWithMember],
    ) -> GroupEventStats:
        """
        Calculate statistics for a single group.

        Args:
            group_name: Name of the group
            metrics: All metrics for members in this group

        Returns:
            GroupEventStats with calculated values
        """
        # Exclude new members from participation calculation
        eligible = [m for m in metrics if not m.is_new_member]
        member_count = len(eligible)

        participated_count = sum(1 for m in eligible if m.participated)
        absent_count = sum(1 for m in eligible if m.is_absent)

        participation_rate = (participated_count / member_count * 100) if member_count > 0 else 0.0

        # Merit stats from participants only
        participants = [m for m in eligible if m.participated]
        merit_values = [m.merit_diff for m in participants]

        total_merit = sum(merit_values)
        avg_merit = total_merit / len(merit_values) if merit_values else 0.0
        merit_min = min(merit_values) if merit_values else 0
        merit_max = max(merit_values) if merit_values else 0

        return GroupEventStats(
            group_name=group_name,
            member_count=member_count,
            participated_count=participated_count,
            absent_count=absent_count,
            participation_rate=round(participation_rate, 1),
            total_merit=total_merit,
            avg_merit=round(avg_merit, 1),
            merit_min=merit_min,
            merit_max=merit_max,
        )
