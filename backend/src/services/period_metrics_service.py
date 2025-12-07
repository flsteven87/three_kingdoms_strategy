"""
Period Metrics Service

計算並管理期間指標（diff + 每日均）

核心功能：
1. 上傳 CSV 時自動計算期間指標
2. 支援「中間插入」導致的全部重新計算
3. 第一期使用賽季開始日期作為起始點

符合 CLAUDE.md 🔴:
- Service layer orchestrates repositories and business logic
- NO direct database calls (delegates to repositories)
"""

from datetime import date
from decimal import Decimal
from uuid import UUID

from src.models.csv_upload import CsvUpload
from src.models.member_snapshot import MemberSnapshot
from src.models.period import Period
from src.repositories.csv_upload_repository import CsvUploadRepository
from src.repositories.member_period_metrics_repository import MemberPeriodMetricsRepository
from src.repositories.member_snapshot_repository import MemberSnapshotRepository
from src.repositories.period_repository import PeriodRepository
from src.repositories.season_repository import SeasonRepository


class PeriodMetricsService:
    """Service for period metrics calculation and management"""

    def __init__(self):
        """Initialize period metrics service with required repositories"""
        self._period_repo = PeriodRepository()
        self._metrics_repo = MemberPeriodMetricsRepository()
        self._upload_repo = CsvUploadRepository()
        self._snapshot_repo = MemberSnapshotRepository()
        self._season_repo = SeasonRepository()

    async def calculate_periods_for_season(self, season_id: UUID) -> list[Period]:
        """
        Calculate (or recalculate) all periods for a season.

        This is the main entry point that handles:
        - First upload (uses season start_date)
        - Sequential uploads
        - Insert in middle (recalculates everything)

        Args:
            season_id: Season UUID

        Returns:
            List of created/updated periods

        符合 CLAUDE.md 🔴: Service layer orchestration
        """
        # 1. Get season info
        season = await self._season_repo.get_by_id(season_id)
        if not season:
            raise ValueError(f"Season {season_id} not found")

        # 2. Get all uploads for this season, ordered by snapshot_date
        uploads = await self._upload_repo.get_by_season(season_id)
        if not uploads:
            return []  # No uploads, no periods

        # Sort by snapshot_date (ascending) - repo returns desc
        uploads = sorted(uploads, key=lambda u: u.snapshot_date)

        # 3. Delete existing periods and metrics (for clean recalculation)
        await self._period_repo.delete_by_season(season_id)

        # 4. Calculate each period
        created_periods: list[Period] = []

        for i, end_upload in enumerate(uploads):
            if i == 0:
                # First upload: use season start_date as start
                period = await self._calculate_first_period(
                    season_id=season_id,
                    alliance_id=season.alliance_id,
                    season_start_date=season.start_date,
                    end_upload=end_upload,
                    period_number=1,
                )
            else:
                # Subsequent uploads: use previous upload as start
                start_upload = uploads[i - 1]
                period = await self._calculate_period(
                    season_id=season_id,
                    alliance_id=season.alliance_id,
                    start_upload=start_upload,
                    end_upload=end_upload,
                    period_number=i + 1,
                )

            if period:
                created_periods.append(period)

        return created_periods

    async def _calculate_first_period(
        self,
        season_id: UUID,
        alliance_id: UUID,
        season_start_date: date,
        end_upload: CsvUpload,
        period_number: int,
    ) -> Period | None:
        """
        Calculate the first period (from season start to first upload).

        For the first period, we don't have a start snapshot, so:
        - diff = end snapshot total values (assuming start from 0)
        - All members are marked as is_new_member = True

        Args:
            season_id: Season UUID
            alliance_id: Alliance UUID
            season_start_date: Season start date
            end_upload: First CSV upload
            period_number: Should be 1

        Returns:
            Created period or None if days <= 0
        """
        end_date = end_upload.snapshot_date.date()
        days = (end_date - season_start_date).days

        if days <= 0:
            # Invalid period (upload date is before or same as season start)
            return None

        # Create period record
        period_data = {
            "season_id": str(season_id),
            "alliance_id": str(alliance_id),
            "start_upload_id": None,  # First period has no start upload
            "end_upload_id": str(end_upload.id),
            "start_date": season_start_date.isoformat(),
            "end_date": end_date.isoformat(),
            "days": days,
            "period_number": period_number,
        }

        period = await self._period_repo.create(period_data)

        # Get end snapshots
        end_snapshots = await self._snapshot_repo.get_by_upload(end_upload.id)

        # Calculate metrics for each member (all are "new" in first period)
        metrics_list = []
        for end_snap in end_snapshots:
            metrics = self._build_first_period_metrics(
                period_id=period.id,
                alliance_id=alliance_id,
                end_snapshot=end_snap,
                days=days,
            )
            metrics_list.append(metrics)

        if metrics_list:
            await self._metrics_repo.create_batch(metrics_list)

        return period

    async def _calculate_period(
        self,
        season_id: UUID,
        alliance_id: UUID,
        start_upload: CsvUpload,
        end_upload: CsvUpload,
        period_number: int,
    ) -> Period | None:
        """
        Calculate a period between two uploads.

        Args:
            season_id: Season UUID
            alliance_id: Alliance UUID
            start_upload: Start CSV upload
            end_upload: End CSV upload
            period_number: Period number within season

        Returns:
            Created period or None if days <= 0
        """
        start_date = start_upload.snapshot_date.date()
        end_date = end_upload.snapshot_date.date()
        days = (end_date - start_date).days

        if days <= 0:
            # Invalid period (same or earlier date)
            return None

        # Create period record
        period_data = {
            "season_id": str(season_id),
            "alliance_id": str(alliance_id),
            "start_upload_id": str(start_upload.id),
            "end_upload_id": str(end_upload.id),
            "start_date": start_date.isoformat(),
            "end_date": end_date.isoformat(),
            "days": days,
            "period_number": period_number,
        }

        period = await self._period_repo.create(period_data)

        # Get snapshots for both uploads
        start_snapshots = await self._snapshot_repo.get_by_upload(start_upload.id)
        end_snapshots = await self._snapshot_repo.get_by_upload(end_upload.id)

        # Build member_id -> snapshot maps
        start_map = {snap.member_id: snap for snap in start_snapshots}
        end_map = {snap.member_id: snap for snap in end_snapshots}

        # Calculate metrics for each member in end_upload
        metrics_list = []
        for member_id, end_snap in end_map.items():
            start_snap = start_map.get(member_id)

            if start_snap:
                # Existing member: calculate diff
                metrics = self._build_period_metrics(
                    period_id=period.id,
                    alliance_id=alliance_id,
                    start_snapshot=start_snap,
                    end_snapshot=end_snap,
                    days=days,
                )
            else:
                # New member: treat as first period for this member
                metrics = self._build_first_period_metrics(
                    period_id=period.id,
                    alliance_id=alliance_id,
                    end_snapshot=end_snap,
                    days=days,
                )

            metrics_list.append(metrics)

        if metrics_list:
            await self._metrics_repo.create_batch(metrics_list)

        return period

    def _build_period_metrics(
        self,
        period_id: UUID,
        alliance_id: UUID,
        start_snapshot: MemberSnapshot,
        end_snapshot: MemberSnapshot,
        days: int,
    ) -> dict:
        """
        Build metrics data for an existing member.

        Args:
            period_id: Period UUID
            alliance_id: Alliance UUID
            start_snapshot: Start period snapshot
            end_snapshot: End period snapshot
            days: Number of days in period

        Returns:
            Metrics data dictionary ready for insertion
        """
        # Calculate diffs (ensure non-negative for cumulative values)
        contribution_diff = max(0, end_snapshot.total_contribution - start_snapshot.total_contribution)
        merit_diff = max(0, end_snapshot.total_merit - start_snapshot.total_merit)
        assist_diff = max(0, end_snapshot.total_assist - start_snapshot.total_assist)
        donation_diff = max(0, end_snapshot.total_donation - start_snapshot.total_donation)
        power_diff = end_snapshot.power_value - start_snapshot.power_value  # Can be negative

        # Calculate daily averages
        daily_contribution = Decimal(contribution_diff) / Decimal(days)
        daily_merit = Decimal(merit_diff) / Decimal(days)
        daily_assist = Decimal(assist_diff) / Decimal(days)
        daily_donation = Decimal(donation_diff) / Decimal(days)

        # Calculate rank change (positive = improved, lower rank is better)
        rank_change = start_snapshot.contribution_rank - end_snapshot.contribution_rank

        return {
            "period_id": str(period_id),
            "member_id": str(end_snapshot.member_id),
            "alliance_id": str(alliance_id),
            "start_snapshot_id": str(start_snapshot.id),
            "end_snapshot_id": str(end_snapshot.id),
            "contribution_diff": contribution_diff,
            "merit_diff": merit_diff,
            "assist_diff": assist_diff,
            "donation_diff": donation_diff,
            "power_diff": power_diff,
            "daily_contribution": str(daily_contribution.quantize(Decimal("0.01"))),
            "daily_merit": str(daily_merit.quantize(Decimal("0.01"))),
            "daily_assist": str(daily_assist.quantize(Decimal("0.01"))),
            "daily_donation": str(daily_donation.quantize(Decimal("0.01"))),
            "start_rank": start_snapshot.contribution_rank,
            "end_rank": end_snapshot.contribution_rank,
            "rank_change": rank_change,
            "end_power": end_snapshot.power_value,
            "end_state": end_snapshot.state,
            "end_group": end_snapshot.group_name,
            "is_new_member": False,
        }

    def _build_first_period_metrics(
        self,
        period_id: UUID,
        alliance_id: UUID,
        end_snapshot: MemberSnapshot,
        days: int,
    ) -> dict:
        """
        Build metrics data for a new member (first period or just joined).

        For new members, we use the total values as the diff
        (assuming they started from 0).

        Args:
            period_id: Period UUID
            alliance_id: Alliance UUID
            end_snapshot: End period snapshot
            days: Number of days in period

        Returns:
            Metrics data dictionary ready for insertion
        """
        # For new members, diff = total (assuming start from 0)
        contribution_diff = end_snapshot.total_contribution
        merit_diff = end_snapshot.total_merit
        assist_diff = end_snapshot.total_assist
        donation_diff = end_snapshot.total_donation
        power_diff = end_snapshot.power_value

        # Calculate daily averages
        daily_contribution = Decimal(contribution_diff) / Decimal(days)
        daily_merit = Decimal(merit_diff) / Decimal(days)
        daily_assist = Decimal(assist_diff) / Decimal(days)
        daily_donation = Decimal(donation_diff) / Decimal(days)

        return {
            "period_id": str(period_id),
            "member_id": str(end_snapshot.member_id),
            "alliance_id": str(alliance_id),
            "start_snapshot_id": None,
            "end_snapshot_id": str(end_snapshot.id),
            "contribution_diff": contribution_diff,
            "merit_diff": merit_diff,
            "assist_diff": assist_diff,
            "donation_diff": donation_diff,
            "power_diff": power_diff,
            "daily_contribution": str(daily_contribution.quantize(Decimal("0.01"))),
            "daily_merit": str(daily_merit.quantize(Decimal("0.01"))),
            "daily_assist": str(daily_assist.quantize(Decimal("0.01"))),
            "daily_donation": str(daily_donation.quantize(Decimal("0.01"))),
            "start_rank": None,
            "end_rank": end_snapshot.contribution_rank,
            "rank_change": None,
            "end_power": end_snapshot.power_value,
            "end_state": end_snapshot.state,
            "end_group": end_snapshot.group_name,
            "is_new_member": True,
        }

    async def get_periods_by_season(self, season_id: UUID) -> list[Period]:
        """
        Get all periods for a season.

        Args:
            season_id: Season UUID

        Returns:
            List of periods ordered by period_number
        """
        return await self._period_repo.get_by_season(season_id)

    async def get_period_metrics(self, period_id: UUID) -> list[dict]:
        """
        Get all member metrics for a period (with member names).

        Args:
            period_id: Period UUID

        Returns:
            List of metrics with member_name field
        """
        return await self._metrics_repo.get_by_period_with_member(period_id)

    async def get_member_trend(
        self, member_id: UUID, season_id: UUID | None = None
    ) -> list[dict]:
        """
        Get period metrics trend for a member.

        Args:
            member_id: Member UUID
            season_id: Optional season filter

        Returns:
            List of metrics ordered by period
        """
        metrics = await self._metrics_repo.get_by_member(member_id, season_id)
        return [m.model_dump() for m in metrics]

    async def get_group_averages(self, period_id: UUID) -> list[dict]:
        """
        Get average metrics by group for a period.

        Args:
            period_id: Period UUID

        Returns:
            List of group averages
        """
        return await self._metrics_repo.get_group_averages(period_id)

    async def recalculate_all_periods(self, alliance_id: UUID) -> dict:
        """
        Recalculate all periods for all seasons in an alliance.

        This deletes all existing periods and metrics, then recalculates
        based on current csv_uploads data.

        Args:
            alliance_id: Alliance UUID

        Returns:
            Summary of recalculation results

        符合 CLAUDE.md 🔴: Service layer orchestration
        """
        # 1. Get all seasons for this alliance
        from src.repositories.season_repository import SeasonRepository
        season_repo = SeasonRepository()

        seasons = await season_repo.get_by_alliance(alliance_id)

        if not seasons:
            return {
                "success": True,
                "seasons_processed": 0,
                "total_periods": 0,
                "total_metrics": 0,
                "message": "No seasons found for this alliance",
            }

        # 2. Delete all existing metrics for this alliance (CASCADE will handle periods)
        await self._metrics_repo.delete_by_alliance(alliance_id)

        # 3. Recalculate periods for each season
        total_periods = 0
        total_metrics = 0
        season_results = []

        for season in seasons:
            periods = await self.calculate_periods_for_season(season.id)
            period_count = len(periods)
            total_periods += period_count

            # Count metrics for this season
            metrics_count = 0
            for period in periods:
                metrics = await self._metrics_repo.get_by_period(period.id)
                metrics_count += len(metrics)
            total_metrics += metrics_count

            season_results.append({
                "season_id": str(season.id),
                "season_name": season.name,
                "periods_created": period_count,
                "metrics_created": metrics_count,
            })

        return {
            "success": True,
            "seasons_processed": len(seasons),
            "total_periods": total_periods,
            "total_metrics": total_metrics,
            "details": season_results,
        }
