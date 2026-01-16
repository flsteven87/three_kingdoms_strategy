"""
Donation Service

管理捐獻事件與成員貢獻計算

核心功能:
1. 建立/查詢捐獻事件
2. 從快照計算成員捐獻差異（creation_time 到 deadline 之間的 total_donation 差值）
3. 支援同盟與懲罰兩種類型

符合 CLAUDE.md 🔴:
- Service layer orchestrates repositories
- NO direct database calls
- Public methods for permission checking (no private member access from API layer)
"""

from uuid import UUID

from fastapi import HTTPException

from src.models.donation import (
    Donation,
    DonationCreate,
    DonationMemberInfo,
    DonationTarget,
    DonationType,
    DonationWithInfo,
)
from src.repositories.donation_repository import DonationRepository
from src.repositories.donation_target_repository import DonationTargetRepository
from src.repositories.member_snapshot_repository import MemberSnapshotRepository
from src.services.permission_service import PermissionService


class DonationService:
    """Service for donation event management"""

    def __init__(self):
        """Initialize donation service"""
        self._donation_repo = DonationRepository()
        self._target_repo = DonationTargetRepository()
        self._snapshot_repo = MemberSnapshotRepository()
        self._permission_service = PermissionService()

    async def require_alliance_access(self, user_id: UUID, alliance_id: UUID) -> None:
        """
        Verify user has owner or collaborator access to alliance

        Args:
            user_id: User UUID
            alliance_id: Alliance UUID

        Raises:
            HTTPException: If user lacks access
        """
        await self._permission_service.require_owner_or_collaborator(user_id, alliance_id)

    async def verify_donation_access(self, user_id: UUID, donation_id: UUID) -> Donation:
        """
        Verify user has access to donation's alliance and return the donation

        Args:
            user_id: User UUID
            donation_id: Donation UUID

        Returns:
            Donation instance if user has access

        Raises:
            HTTPException: If user lacks access or donation not found
        """
        donation = await self._donation_repo.get_by_id(donation_id)
        if not donation:
            raise HTTPException(status_code=404, detail="Donation event not found")
        await self._permission_service.require_owner_or_collaborator(
            user_id, donation.alliance_id
        )
        return donation

    async def get_donations_by_alliance_and_season(
        self, alliance_id: UUID, season_id: UUID
    ) -> list[Donation]:
        """
        Get all donation events for an alliance in a season

        Args:
            alliance_id: Alliance UUID
            season_id: Season UUID

        Returns:
            List of donation events
        """
        return await self._donation_repo.get_by_alliance_and_season(
            alliance_id, season_id
        )

    async def create_donation(self, donation_data: DonationCreate) -> Donation:
        """
        Create new donation event

        Args:
            donation_data: Donation creation data

        Returns:
            Created donation event
        """
        return await self._donation_repo.create(donation_data)

    async def get_donation_with_info(
        self, donation_id: UUID, target_amount: int | None = None
    ) -> DonationWithInfo:
        """
        Get donation event with member donation info.

        Returns per-member data from the end snapshot:
        - If type is REGULAR: target comes from stored `target_amount`
        - If type is PENALTY: target comes from per-member overrides

        Args:
            donation_id: Donation UUID
            target_amount: Optional override for REGULAR type only; ignored for PENALTY

        Returns:
            Donation with member donation details
        """
        donation = await self._donation_repo.get_by_id(donation_id)
        if not donation:
            raise HTTPException(status_code=404, detail="Donation event not found")

        is_regular = donation.type == DonationType.REGULAR
        is_penalty = donation.type == DonationType.PENALTY
        effective_target = (
            target_amount
            if (is_regular and target_amount is not None)
            else donation.target_amount
        )

        # Check if this is a retrospective donation (created after deadline)
        is_retrospective = donation.created_at > donation.deadline

        # Get snapshots closest to creation_time and deadline
        if is_retrospective:
            start_snapshots = []
        else:
            start_snapshots = await self._snapshot_repo.get_closest_to_date(
                alliance_id=donation.alliance_id,
                season_id=donation.season_id,
                target_date=donation.created_at,
            )

        end_snapshots = await self._snapshot_repo.get_closest_to_date(
            alliance_id=donation.alliance_id,
            season_id=donation.season_id,
            target_date=donation.deadline,
        )

        if not end_snapshots:
            return DonationWithInfo(**donation.model_dump(), member_info=[])

        # Build lookup dictionaries
        start_snapshot_map = {snap.member_id: snap for snap in start_snapshots}
        end_snapshot_map = {snap.member_id: snap for snap in end_snapshots}

        # Calculate donations for members
        member_info_list: list[DonationMemberInfo] = []

        if is_penalty:
            overrides = await self._target_repo.get_by_donation_event(donation_id)
            member_source = {
                ov.member_id: end_snapshot_map.get(ov.member_id)
                for ov in overrides
            }
            member_source = {k: v for k, v in member_source.items() if v is not None}
            # Build target map from overrides
            target_map = {ov.member_id: ov.target_amount for ov in overrides}
        else:
            member_source = end_snapshot_map
            target_map = {}

        for member_id, end_snap in member_source.items():
            # Calculate donation made based on retrospective status
            if is_retrospective:
                donated_amount = end_snap.weekly_donation
            else:
                start_snap = start_snapshot_map.get(member_id)
                if start_snap and start_snap.csv_upload_id == end_snap.csv_upload_id:
                    donated_amount = end_snap.weekly_donation
                else:
                    start_total = start_snap.total_donation if start_snap else 0
                    end_total = end_snap.total_donation
                    donated_amount = max(0, end_total - start_total)

            # Get target: from override for penalty, from effective_target for regular
            member_target = target_map.get(member_id, effective_target)

            member_info = DonationMemberInfo(
                member_id=member_id,
                member_name=end_snap.member_name,
                target_amount=member_target,
                donated_amount=donated_amount,
            )
            member_info_list.append(member_info)

        # Sort by donated amount descending
        member_info_list.sort(key=lambda x: x.donated_amount, reverse=False)

        return DonationWithInfo(**donation.model_dump(), member_info=member_info_list)

    async def set_member_target_override(
        self,
        donation_id: UUID,
        member_id: UUID,
        target_amount: int,
        user_id: UUID,
    ) -> DonationTarget:
        """Set or update a per-member donation target override"""
        donation = await self.verify_donation_access(user_id, donation_id)
        return await self._target_repo.upsert_target(
            donation_id, donation.alliance_id, member_id, target_amount
        )

    async def delete_donation(self, donation_id: UUID, user_id: UUID) -> None:
        """Delete a donation event after access check"""
        await self.verify_donation_access(user_id, donation_id)
        await self._donation_repo.delete(donation_id)

    async def delete_member_target_override(
        self, donation_id: UUID, member_id: UUID, user_id: UUID
    ) -> None:
        """Delete a member's target override after access check"""
        await self.verify_donation_access(user_id, donation_id)
        await self._target_repo.delete_target(donation_id, member_id)
