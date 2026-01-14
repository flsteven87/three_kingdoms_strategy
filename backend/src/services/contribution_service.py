"""
Contribution Service

管理捐獻事件與成員貢獻計算

核心功能:
1. 建立/查詢捐獻事件
2. 從快照計算成員貢獻差異（creation_time 到 deadline 之間的 total_contribution 差值）
3. 支援同盟與懲罰兩種類型

符合 CLAUDE.md 🔴:
- Service layer orchestrates repositories
- NO direct database calls
"""

from uuid import UUID

from src.models.contribution import (
    Contribution,
    ContributionCreate,
    ContributionInfo,
    ContributionTarget,
    ContributionType,
    ContributionWithInfo,
)
from src.repositories.contribution_repository import ContributionRepository
from src.repositories.contribution_target_repository import ContributionTargetRepository
from src.repositories.csv_upload_repository import CsvUploadRepository
from src.repositories.member_snapshot_repository import MemberSnapshotRepository
from src.services.permission_service import PermissionService


class ContributionService:
    """Service for contribution event management"""

    def __init__(self):
        """Initialize contribution service"""
        self._contribution_repo = ContributionRepository()
        self._target_repo = ContributionTargetRepository()
        self._upload_repo = CsvUploadRepository()
        self._snapshot_repo = MemberSnapshotRepository()
        self._permission_service = PermissionService()

    async def verify_user_access(self, user_id: UUID, contribution_id: UUID) -> UUID:
        """
        Verify user has access to contribution's alliance

        Args:
            user_id: User UUID
            contribution_id: Contribution UUID

        Returns:
            Alliance UUID if user has access

        Raises:
            HTTPException: If user lacks access
        """
        contribution = await self._contribution_repo.get_by_id(contribution_id)
        return await self._permission_service.verify_alliance_access(
            user_id, contribution.alliance_id
        )

    async def get_contributions_by_alliance_and_season(
        self, alliance_id: UUID, season_id: UUID
    ) -> list[Contribution]:
        """
        Get all contribution events for an alliance in a season

        Args:
            alliance_id: Alliance UUID
            season_id: Season UUID

        Returns:
            List of contribution events
        """
        return await self._contribution_repo.get_by_alliance_and_season(
            alliance_id, season_id
        )

    async def create_contribution(
        self, contribution_data: ContributionCreate
    ) -> Contribution:
        """
        Create new contribution event

        Args:
            contribution_data: Contribution creation data

        Returns:
            Created contribution event
        """
        return await self._contribution_repo.create(contribution_data)

    async def get_contribution_with_info(
        self, contribution_id: UUID, target_amount: int | None = None
    ) -> ContributionWithInfo:
        """
        Get contribution event with member contribution info.

        Returns per-member data from the end snapshot:
        - If type is REGULAR: target comes from stored `target_amount`
        - If type is PENALTY: target comes from per-member overrides

        Args:
            contribution_id: Contribution UUID
            target_amount: Optional override for REGULAR type only; ignored for PENALTY

        Returns:
            Contribution with member contribution details
        """
        contribution = await self._contribution_repo.get_by_id(contribution_id)
        is_regular = contribution.type == ContributionType.REGULAR
        is_penalty = contribution.type == ContributionType.PENALTY
        effective_target = (
            target_amount
            if (is_regular and target_amount is not None)
            else contribution.target_amount
        )

        # Check if this is a retrospective contribution (created after deadline)
        is_retrospective = contribution.created_at > contribution.deadline

        # Get snapshots closest to creation_time and deadline from MemberSnapshotRepository
        if is_retrospective:
            start_snapshots = []
        else:
            # Normal case: get both start and end snapshots
            start_snapshots = await self._snapshot_repo.get_closest_to_date(
                alliance_id=contribution.alliance_id,
                season_id=contribution.season_id,
                target_date=contribution.created_at,
            )

        # For retrospective contributions, only use end snapshot
        end_snapshots = await self._snapshot_repo.get_closest_to_date(
            alliance_id=contribution.alliance_id,
            season_id=contribution.season_id,
            target_date=contribution.deadline,
        )

        if not end_snapshots:
            # No snapshots found, return empty info
            return ContributionWithInfo(
                **contribution.model_dump(), contribution_info=[]
            )

        # Build lookup dictionaries
        start_snapshot_map = {snap.member_id: snap for snap in start_snapshots}
        end_snapshot_map = {snap.member_id: snap for snap in end_snapshots}

        # Calculate contributions for all members in end snapshot
        contribution_info_list: list[ContributionInfo] = []

        if is_penalty:
            overrides = await self._target_repo.get_by_donation_event(contribution_id)
            member_source = { ov.member_id: end_snapshot_map.get(ov.member_id) for ov in overrides }
            # Filter out None values (members not in snapshot)
            member_source = {k: v for k, v in member_source.items() if v is not None}
        else:
            member_source = end_snapshot_map

        for member_id, end_snap in member_source.items():
            # Calculate contribution made based on retrospective status
            if is_retrospective:
                # Use weekly contribution from end snapshot
                contribution_made = end_snap.weekly_contribution
            else:
                # Calculate difference between end and start total contributions
                start_snap = start_snapshot_map.get(member_id)
                # Corner case: if start and end are from same upload, use weekly contribution
                if start_snap and start_snap.csv_upload_id == end_snap.csv_upload_id:
                    contribution_made = end_snap.weekly_contribution
                else:
                    start_total = start_snap.total_contribution if start_snap else 0
                    end_total = end_snap.total_contribution
                    contribution_made = max(0, end_total - start_total)

            contribution_info = ContributionInfo(
                member_id=member_id,
                member_name=end_snap.member_name,
                target_amount=effective_target,
                contribution_made=contribution_made,
            )
            contribution_info_list.append(contribution_info)

        # Sort by contribution made descending
        contribution_info_list.sort(
            key=lambda x: x.contribution_made, reverse=True
        )


        return ContributionWithInfo(
            **contribution.model_dump(), contribution_info=contribution_info_list
        )

    async def set_member_target_override(
        self,
        contribution_id: UUID,
        member_id: UUID,
        target_amount: int,
        user_id: UUID,
    ) -> ContributionTarget:
        """Set or update a per-member contribution target override"""
        # Verify user has access via contribution's alliance
        contribution = await self._contribution_repo.get_by_id(contribution_id)
        await self._permission_service.require_owner_or_collaborator(
            user_id, contribution.alliance_id
        )

        return await self._target_repo.upsert_target(
            contribution_id, contribution.alliance_id, member_id, target_amount
        )

    async def delete_contribution(self, contribution_id: UUID, user_id: UUID) -> None:
        """Delete a contribution event after access check"""
        contribution = await self._contribution_repo.get_by_id(contribution_id)
        await self._permission_service.require_owner_or_collaborator(
            user_id, contribution.alliance_id
        )
        await self._contribution_repo.delete(contribution_id)

    async def delete_member_target_override(
        self, contribution_id: UUID, member_id: UUID, user_id: UUID
    ) -> None:
        """Delete a member's target override after access check"""
        contribution = await self._contribution_repo.get_by_id(contribution_id)
        await self._permission_service.require_owner_or_collaborator(
            user_id, contribution.alliance_id
        )
        await self._target_repo.delete_target(contribution_id, member_id)
