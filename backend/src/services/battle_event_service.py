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
    BattleEventUpdate,
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
    ViolatorItem,
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

        Performance:
            - 1 query for events
            - 1 batch query for all completed events' metrics
            - Total: 2 queries regardless of event count
        """
        events = await self._event_repo.get_by_season(season_id)

        # Batch fetch metrics for all completed events (avoid N+1)
        completed_event_ids = [e.id for e in events if e.status == EventStatus.COMPLETED]
        metrics_map: dict[UUID, list[BattleEventMetricsWithMember]] = {}

        if completed_event_ids:
            metrics_map = await self._metrics_repo.get_by_events_with_member_and_group(
                completed_event_ids
            )

        result: list[BattleEventListItem] = []
        for event in events:
            # Default values for non-completed events
            participation_rate = None
            total_merit = None
            mvp_name = None
            absent_count = None
            absent_names = None
            participant_names = None

            if event.status == EventStatus.COMPLETED:
                # Use pre-fetched metrics (no additional DB query)
                metrics = metrics_map.get(event.id, [])
                summary = self._calculate_summary_from_metrics(metrics, event.event_type)

                participation_rate = summary.participation_rate
                total_merit = summary.total_merit
                mvp_name = summary.mvp_member_name
                absent_count = summary.absent_count
                absent_names = [m.member_name for m in metrics if m.is_absent]
                participant_names = [m.member_name for m in metrics if m.participated]

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
                    absent_names=absent_names,
                    participant_names=participant_names,
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
        return self._calculate_summary_from_metrics(metrics, event_type)

    async def update_event(
        self,
        event_id: UUID,
        update_data: BattleEventUpdate,
        user_id: UUID,
    ) -> BattleEvent:
        """
        Update a battle event's basic information.

        Only owner or collaborator can update events.
        Only name, event_type, and description can be updated.

        Args:
            event_id: Event UUID
            update_data: Fields to update
            user_id: User performing the update

        Returns:
            Updated battle event

        Raises:
            ValueError: If event not found
            PermissionError: If user is not owner/collaborator
            SeasonQuotaExhaustedError: If trial/season quota has expired

        符合 CLAUDE.md 🔴: Service layer orchestration with permission check
        """
        # Get event to verify it exists and get alliance_id
        event = await self._event_repo.get_by_id(event_id)
        if not event:
            raise ValueError("Event not found")

        # Check user has edit permission (owner or collaborator)
        role = await self._permission_service.get_user_role(user_id, event.alliance_id)
        if role not in ("owner", "collaborator"):
            raise PermissionError("Only owner or collaborator can edit events")

        # Verify quota: trial or available seasons required
        await self._permission_service.require_active_quota(
            event.alliance_id, "update battle events"
        )

        # Only allow updating specific fields (name, event_type, description)
        # Ignore other fields like status, upload_ids, event times
        safe_update = BattleEventUpdate(
            name=update_data.name,
            event_type=update_data.event_type,
            description=update_data.description,
        )

        return await self._event_repo.update(event_id, safe_update)

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
        self, alliance_id: UUID, season_id: UUID | None = None
    ) -> BattleEvent | None:
        """
        Get the most recent completed battle event for an alliance.

        Args:
            alliance_id: Alliance UUID
            season_id: Optional season UUID to filter by current season

        Returns:
            Latest completed battle event or None
        """
        return await self._event_repo.get_latest_completed_event(alliance_id, season_id)

    async def get_recent_completed_events_for_alliance(
        self, alliance_id: UUID, season_id: UUID | None = None, limit: int = 5
    ) -> list[BattleEventListItem]:
        """
        Get the most recent completed battle events for an alliance with stats.

        Used by LINE Bot to list recent events with participation rates.

        Args:
            alliance_id: Alliance UUID
            season_id: Optional season UUID to filter by current season
            limit: Maximum number of events to return (default 5)

        Returns:
            List of BattleEventListItem with computed stats, ordered by event_end desc

        Performance:
            - 1 query for events
            - 1 batch query for all events' metrics
            - Total: 2 queries regardless of event count
        """
        events = await self._event_repo.get_recent_completed_events(
            alliance_id=alliance_id,
            season_id=season_id,
            event_types=["battle", "siege"],
            limit=limit,
        )

        if not events:
            return []

        # Batch fetch metrics for all events (avoid N+1)
        event_ids = [e.id for e in events]
        metrics_map = await self._metrics_repo.get_by_events_with_member_and_group(event_ids)

        result = []
        for event in events:
            metrics = metrics_map.get(event.id, [])
            summary = self._calculate_summary_from_metrics(metrics, event.event_type)
            result.append(
                BattleEventListItem(
                    id=event.id,
                    name=event.name,
                    event_type=event.event_type,
                    status=event.status,
                    event_start=event.event_start,
                    event_end=event.event_end,
                    created_at=event.created_at,
                    participation_rate=summary.participation_rate,
                    total_merit=summary.total_merit,
                    mvp_name=summary.mvp_member_name,
                    absent_count=summary.absent_count,
                    absent_names=[m.member_name for m in metrics if m.is_absent],
                )
            )
        return result

    async def get_event_by_name_for_alliance(
        self, alliance_id: UUID, name: str, season_id: UUID | None = None
    ) -> BattleEvent | None:
        """
        Get a completed battle event by exact name match.

        Used by LINE Bot to find event by name.

        Args:
            alliance_id: Alliance UUID
            name: Exact event name to match
            season_id: Optional season UUID to filter by current season

        Returns:
            Battle event if found, None otherwise
        """
        return await self._event_repo.get_event_by_name(alliance_id, name, season_id)

    async def get_event_group_analytics(
        self, event_id: UUID, top_n: int = 5
    ) -> EventGroupAnalytics | None:
        """
        Get group-level analytics for a battle event (category-aware).

        Calculates per-group statistics including:
        - Participation rate (BATTLE/SIEGE) or violator count (FORBIDDEN)
        - Category-specific metric distribution
        - Top performers (BATTLE/SIEGE) or violators (FORBIDDEN)

        Args:
            event_id: Event UUID
            top_n: Number of top performers/violators to include

        Returns:
            EventGroupAnalytics with group stats and top members/violators,
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
        summary = await self._calculate_event_summary(event_id, event.event_type)

        # Group metrics by group_name
        groups: dict[str, list[BattleEventMetricsWithMember]] = {}
        for m in metrics:
            group_name = m.group_name or "未分組"
            if group_name not in groups:
                groups[group_name] = []
            groups[group_name].append(m)

        # Calculate stats for each group (category-aware)
        group_stats: list[GroupEventStats] = []
        for group_name, group_metrics in groups.items():
            stats = self._calculate_group_stats(group_name, group_metrics, event.event_type)
            group_stats.append(stats)

        # Sort groups by primary metric descending
        if event.event_type == EventCategory.SIEGE:
            group_stats.sort(key=lambda g: g.total_contribution + g.total_assist, reverse=True)
        elif event.event_type == EventCategory.FORBIDDEN:
            group_stats.sort(key=lambda g: g.violator_count, reverse=True)
        else:  # BATTLE
            group_stats.sort(key=lambda g: g.total_merit, reverse=True)

        # Build top performers or violators based on event type
        top_members: list[TopMemberItem] = []
        top_contributors: list[TopMemberItem] = []
        top_assisters: list[TopMemberItem] = []
        violators: list[ViolatorItem] = []

        if event.event_type == EventCategory.FORBIDDEN:
            # FORBIDDEN: Return violators (power_diff > 0)
            violation_list = [m for m in metrics if m.power_diff > 0]
            violation_list.sort(key=lambda m: m.power_diff, reverse=True)

            violators = [
                ViolatorItem(
                    rank=i + 1,
                    member_name=m.member_name,
                    group_name=m.group_name,
                    power_diff=m.power_diff,
                )
                for i, m in enumerate(violation_list[:top_n])
            ]

        elif event.event_type == EventCategory.SIEGE:
            # SIEGE: Dual rankings - top contributors + top assisters
            # Top contributors (by contribution_diff)
            contribution_ranked = [m for m in metrics if m.contribution_diff > 0]
            contribution_ranked.sort(key=lambda m: m.contribution_diff, reverse=True)

            top_contributors = [
                TopMemberItem(
                    rank=i + 1,
                    member_name=m.member_name,
                    group_name=m.group_name,
                    score=m.contribution_diff,
                    contribution_diff=m.contribution_diff,
                    assist_diff=m.assist_diff,
                )
                for i, m in enumerate(contribution_ranked[:top_n])
            ]

            # Top assisters (by assist_diff)
            assist_ranked = [m for m in metrics if m.assist_diff > 0]
            assist_ranked.sort(key=lambda m: m.assist_diff, reverse=True)

            top_assisters = [
                TopMemberItem(
                    rank=i + 1,
                    member_name=m.member_name,
                    group_name=m.group_name,
                    score=m.assist_diff,
                    contribution_diff=m.contribution_diff,
                    assist_diff=m.assist_diff,
                )
                for i, m in enumerate(assist_ranked[:top_n])
            ]

        else:  # BATTLE
            # BATTLE: Rank by merit
            participants = [m for m in metrics if m.participated]
            participants.sort(key=lambda m: m.merit_diff, reverse=True)

            top_members = [
                TopMemberItem(
                    rank=i + 1,
                    member_name=m.member_name,
                    group_name=m.group_name,
                    score=m.merit_diff,
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
            top_contributors=top_contributors,
            top_assisters=top_assisters,
            violators=violators,
        )

    async def get_batch_event_analytics(
        self, event_ids: list[UUID]
    ) -> dict[UUID, tuple[BattleEvent, EventSummary, list[BattleEventMetricsWithMember]]]:
        """
        Get analytics for multiple events in a single batch.

        Optimized to minimize database queries.

        Args:
            event_ids: List of event UUIDs

        Returns:
            Dict mapping event_id to tuple of (event, summary, metrics)
        """
        if not event_ids:
            return {}

        # Batch fetch events
        events = await self._event_repo.get_by_ids(event_ids)
        event_map = {e.id: e for e in events}

        # Batch fetch all metrics
        metrics_map = await self._metrics_repo.get_by_events_with_member_and_group(event_ids)

        # Calculate summaries for each event
        result: dict[
            UUID, tuple[BattleEvent, EventSummary, list[BattleEventMetricsWithMember]]
        ] = {}

        for event_id in event_ids:
            event = event_map.get(event_id)
            if not event:
                continue

            metrics = metrics_map.get(event_id, [])
            summary = self._calculate_summary_from_metrics(metrics, event.event_type)
            result[event_id] = (event, summary, metrics)

        return result

    def _calculate_summary_from_metrics(
        self,
        metrics: list[BattleEventMetricsWithMember],
        event_type: EventCategory = EventCategory.BATTLE,
    ) -> EventSummary:
        """
        Calculate summary from pre-fetched metrics.

        This is a sync helper that works with already-fetched data.
        """
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
                avg_contribution=0.0,
                mvp_member_id=None,
                mvp_member_name=None,
                mvp_merit=None,
                contribution_mvp_member_id=None,
                contribution_mvp_name=None,
                contribution_mvp_score=None,
                assist_mvp_member_id=None,
                assist_mvp_name=None,
                assist_mvp_score=None,
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

        # Extract participant and absent names
        participant_names = [m.member_name for m in metrics if m.participated]
        absent_names = [m.member_name for m in metrics if m.is_absent]

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
        avg_contribution = (
            total_contribution / participated_count if participated_count > 0 else 0.0
        )

        # Category-specific MVP calculation
        mvp_member_id = None
        mvp_member_name = None
        mvp_merit = None
        contribution_mvp_member_id = None
        contribution_mvp_name = None
        contribution_mvp_score = None
        assist_mvp_member_id = None
        assist_mvp_name = None
        assist_mvp_score = None
        mvp_contribution = None
        mvp_assist = None
        mvp_combined_score = None
        violator_count = 0

        if event_type == EventCategory.SIEGE:
            # Dual MVP: Contribution MVP + Assist MVP
            contribution_candidates = [m for m in metrics if m.contribution_diff > 0]
            if contribution_candidates:
                top_contributor = max(contribution_candidates, key=lambda m: m.contribution_diff)
                contribution_mvp_member_id = top_contributor.member_id
                contribution_mvp_name = top_contributor.member_name
                contribution_mvp_score = top_contributor.contribution_diff

            assist_candidates = [m for m in metrics if m.assist_diff > 0]
            if assist_candidates:
                top_assister = max(assist_candidates, key=lambda m: m.assist_diff)
                assist_mvp_member_id = top_assister.member_id
                assist_mvp_name = top_assister.member_name
                assist_mvp_score = top_assister.assist_diff

            # Legacy: combined MVP for backward compatibility
            if metrics:
                mvp = max(metrics, key=lambda m: m.contribution_diff + m.assist_diff)
                combined = mvp.contribution_diff + mvp.assist_diff
                if combined > 0:
                    mvp_contribution = mvp.contribution_diff
                    mvp_assist = mvp.assist_diff
                    mvp_combined_score = combined

        elif event_type == EventCategory.FORBIDDEN:
            # Count violators (power_diff > 0)
            violator_count = sum(1 for m in metrics if m.power_diff > 0)

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
            absent_names=absent_names,
            participant_names=participant_names,
            new_member_count=new_member_count,
            participation_rate=round(participation_rate, 1),
            total_merit=total_merit,
            total_assist=total_assist,
            total_contribution=total_contribution,
            avg_merit=round(avg_merit, 1),
            avg_assist=round(avg_assist, 1),
            avg_contribution=round(avg_contribution, 1),
            mvp_member_id=mvp_member_id,
            mvp_member_name=mvp_member_name,
            mvp_merit=mvp_merit,
            contribution_mvp_member_id=contribution_mvp_member_id,
            contribution_mvp_name=contribution_mvp_name,
            contribution_mvp_score=contribution_mvp_score,
            assist_mvp_member_id=assist_mvp_member_id,
            assist_mvp_name=assist_mvp_name,
            assist_mvp_score=assist_mvp_score,
            mvp_contribution=mvp_contribution,
            mvp_assist=mvp_assist,
            mvp_combined_score=mvp_combined_score,
            violator_count=violator_count,
        )

    def _calculate_group_stats(
        self,
        group_name: str,
        metrics: list[BattleEventMetricsWithMember],
        event_type: EventCategory = EventCategory.BATTLE,
    ) -> GroupEventStats:
        """
        Calculate statistics for a single group based on event category.

        Args:
            group_name: Name of the group
            metrics: All metrics for members in this group
            event_type: Event category for category-specific calculations

        Returns:
            GroupEventStats with calculated values
        """
        # Exclude new members from participation calculation
        eligible = [m for m in metrics if not m.is_new_member]
        member_count = len(eligible)

        participated_count = sum(1 for m in eligible if m.participated)
        absent_count = sum(1 for m in eligible if m.is_absent)

        participation_rate = (participated_count / member_count * 100) if member_count > 0 else 0.0

        # Participants for metric calculations
        participants = [m for m in eligible if m.participated]

        # Initialize all stats
        total_merit = 0
        avg_merit = 0.0
        merit_min = 0
        merit_max = 0
        total_contribution = 0
        avg_contribution = 0.0
        total_assist = 0
        avg_assist = 0.0
        combined_min = 0
        combined_max = 0
        violator_count = 0

        if event_type == EventCategory.BATTLE:
            # BATTLE: Merit-focused stats
            merit_values = [m.merit_diff for m in participants]
            if merit_values:
                total_merit = sum(merit_values)
                avg_merit = total_merit / len(merit_values)
                merit_min = min(merit_values)
                merit_max = max(merit_values)

        elif event_type == EventCategory.SIEGE:
            # SIEGE: Contribution + Assist stats
            contribution_values = [m.contribution_diff for m in participants]
            assist_values = [m.assist_diff for m in participants]
            combined_values = [m.contribution_diff + m.assist_diff for m in participants]

            if contribution_values:
                total_contribution = sum(contribution_values)
                avg_contribution = total_contribution / len(contribution_values)
                total_assist = sum(assist_values)
                avg_assist = total_assist / len(assist_values)
                combined_min = min(combined_values)
                combined_max = max(combined_values)

        else:  # FORBIDDEN
            # FORBIDDEN: Violator count (power_diff > 0)
            violator_count = sum(1 for m in eligible if m.power_diff > 0)

        return GroupEventStats(
            group_name=group_name,
            member_count=member_count,
            participated_count=participated_count,
            absent_count=absent_count,
            participation_rate=round(participation_rate, 1),
            # BATTLE stats
            total_merit=total_merit,
            avg_merit=round(avg_merit, 1),
            merit_min=merit_min,
            merit_max=merit_max,
            # SIEGE stats
            total_contribution=total_contribution,
            avg_contribution=round(avg_contribution, 1),
            total_assist=total_assist,
            avg_assist=round(avg_assist, 1),
            combined_min=combined_min,
            combined_max=combined_max,
            # FORBIDDEN stats
            violator_count=violator_count,
        )
