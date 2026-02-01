"""
CSV Upload Service

符合 CLAUDE.md 🔴:
- Service layer orchestrates repositories and business logic
- NO direct database calls (delegates to repositories)
- Implements complete CSV upload workflow
"""

from datetime import datetime
from uuid import UUID

from fastapi import HTTPException

from src.core.config import GAME_TIMEZONE
from src.models.csv_upload import UploadType
from src.repositories.alliance_collaborator_repository import (
    AllianceCollaboratorRepository,
)
from src.repositories.alliance_repository import AllianceRepository
from src.repositories.csv_upload_repository import CsvUploadRepository
from src.repositories.member_repository import MemberRepository
from src.repositories.member_snapshot_repository import MemberSnapshotRepository
from src.repositories.season_repository import SeasonRepository
from src.services.csv_parser_service import CSVParserService
from src.services.period_metrics_service import PeriodMetricsService
from src.services.permission_service import PermissionService


class CSVUploadService:
    """Service for CSV upload orchestration"""

    def __init__(self):
        """Initialize CSV upload service with required repositories"""
        self._csv_upload_repo = CsvUploadRepository()
        self._member_repo = MemberRepository()
        self._snapshot_repo = MemberSnapshotRepository()
        self._season_repo = SeasonRepository()
        self._alliance_repo = AllianceRepository()
        self._collaborator_repo = AllianceCollaboratorRepository()
        self._permission_service = PermissionService()
        self._period_metrics_service = PeriodMetricsService()
        self._parser = CSVParserService()

    async def upload_csv(
        self,
        user_id: UUID,
        season_id: UUID,
        filename: str,
        csv_content: str,
        custom_snapshot_date: str | None = None,
        upload_type: UploadType = "regular",
    ) -> dict:
        """
        Complete CSV upload workflow

        Permission: owner + collaborator

        Args:
            user_id: User UUID (for authorization)
            season_id: Season UUID
            filename: CSV filename
            csv_content: CSV file content as string
            custom_snapshot_date: Optional custom snapshot datetime (ISO format string)
            upload_type: Type of upload - 'regular' for data management (triggers period
                        calculation, replaces same-day uploads) or 'event' for battle
                        event analysis (no period calculation, multiple per day allowed)

        Returns:
            Upload result with statistics

        Raises:
            HTTPException: If validation fails or user unauthorized
            HTTPException 403: If user doesn't have permission

        Workflow:
            1. Validate user owns the season
            2. Extract snapshot date from filename or custom date
            3. Parse CSV content
            4. For 'regular' uploads: Check for existing upload on same date (delete if exists)
            5. Create CSV upload record
            6. Upsert members
            7. Batch create snapshots
            8. For 'regular' uploads: Calculate period metrics

        符合 CLAUDE.md 🔴: Service layer orchestration
        """
        # Step 1: Validate user owns the season
        season = await self._season_repo.get_by_id(season_id)
        if not season:
            raise HTTPException(status_code=404, detail="Season not found")

        # Verify write permission (role + quota check)
        await self._permission_service.require_write_permission(
            user_id, season.alliance_id, "upload CSV data"
        )

        # Get alliance for subsequent operations
        alliance = await self._alliance_repo.get_by_id(season.alliance_id)
        if not alliance:
            raise HTTPException(status_code=404, detail="Alliance not found")

        # Step 2: Determine snapshot date (custom or from filename)
        if custom_snapshot_date:
            try:
                snapshot_date = datetime.fromisoformat(custom_snapshot_date.replace("Z", "+00:00"))
            except ValueError as e:
                raise HTTPException(
                    status_code=400, detail=f"Invalid snapshot date format: {str(e)}"
                ) from e
        else:
            try:
                snapshot_date = self._parser.extract_datetime_from_filename(filename)
            except ValueError as e:
                raise HTTPException(status_code=400, detail=str(e)) from e

        # Step 2.5: Validate snapshot date is within season date range
        # Convert UTC timestamp to game timezone to get the correct local date
        snapshot_date_only = snapshot_date.astimezone(GAME_TIMEZONE).date()

        if snapshot_date_only < season.start_date:
            raise HTTPException(
                status_code=400,
                detail=f"CSV 日期 ({snapshot_date_only}) 早於賽季開始日期 ({season.start_date})",
            )

        if season.end_date and snapshot_date_only > season.end_date:
            raise HTTPException(
                status_code=400,
                detail=f"CSV 日期 ({snapshot_date_only}) 晚於賽季結束日期 ({season.end_date})",
            )

        # Step 3: Parse CSV content
        try:
            members_data = self._parser.parse_csv_content(csv_content)
        except Exception as e:
            raise HTTPException(
                status_code=400, detail=f"Failed to parse CSV content: {str(e)}"
            ) from e

        if not members_data:
            raise HTTPException(status_code=400, detail="CSV file is empty")

        # Step 4-5: Create CSV upload record
        # For 'regular' uploads, atomically replace same-day upload if exists
        # Combined with Idempotency Middleware, this prevents race conditions
        upload_data = {
            "season_id": str(season_id),
            "alliance_id": str(alliance.id),
            "snapshot_date": snapshot_date.isoformat(),
            "file_name": filename,
            "total_members": len(members_data),
            "upload_type": upload_type,
        }

        existing_upload = None
        if upload_type == "regular":
            csv_upload, existing_upload = await self._csv_upload_repo.replace_same_day_upload(
                alliance_id=alliance.id,
                season_id=season_id,
                snapshot_date=snapshot_date,
                upload_data=upload_data,
            )
        else:
            # Event uploads don't replace - multiple per day allowed
            csv_upload = await self._csv_upload_repo.create(upload_data)

        # Step 6: Upsert members (update last_seen_at for existing, insert new)
        members_upsert_data = [
            {
                "alliance_id": str(alliance.id),
                "name": member_data["member_name"],
                "first_seen_at": snapshot_date.isoformat(),
                "last_seen_at": snapshot_date.isoformat(),
                "is_active": True,
            }
            for member_data in members_data
        ]

        members = await self._member_repo.upsert_batch(members_upsert_data)
        member_ids_map = {member.name: member.id for member in members}

        # Step 7: Batch create snapshots
        snapshots_data = []
        for member_data in members_data:
            member_name = member_data["member_name"]
            member_id = member_ids_map[member_name]

            snapshot_data = {
                "csv_upload_id": str(csv_upload.id),
                "member_id": str(member_id),
                "alliance_id": str(alliance.id),
                "member_name": member_data["member_name"],
                "contribution_rank": member_data["contribution_rank"],
                "weekly_contribution": member_data["weekly_contribution"],
                "weekly_merit": member_data["weekly_merit"],
                "weekly_assist": member_data["weekly_assist"],
                "weekly_donation": member_data["weekly_donation"],
                "total_contribution": member_data["total_contribution"],
                "total_merit": member_data["total_merit"],
                "total_assist": member_data["total_assist"],
                "total_donation": member_data["total_donation"],
                "power_value": member_data["power_value"],
                "state": member_data["state"],
                "group_name": member_data["group_name"],
            }

            snapshots_data.append(snapshot_data)

        snapshots = await self._snapshot_repo.create_batch(snapshots_data)

        # Step 8: For 'regular' uploads only - calculate period metrics
        total_periods = 0
        if upload_type == "regular":
            periods = await self._period_metrics_service.calculate_periods_for_season(season_id)
            total_periods = len(periods)

        # Step 9: Return result
        return {
            "upload_id": csv_upload.id,
            "season_id": season_id,
            "alliance_id": alliance.id,
            "snapshot_date": snapshot_date.isoformat(),
            "filename": filename,
            "total_members": len(members_data),
            "total_snapshots": len(snapshots),
            "total_periods": total_periods,
            "replaced_existing": existing_upload is not None,
            "upload_type": upload_type,
        }

    async def get_uploads_by_season(self, user_id: UUID, season_id: UUID) -> list[dict]:
        """
        Get all CSV uploads for a season

        Permission: all members (read-only)

        Args:
            user_id: User UUID (for authorization)
            season_id: Season UUID

        Returns:
            List of upload records

        Raises:
            HTTPException 403: If user doesn't have permission

        符合 CLAUDE.md 🔴: Service layer authorization
        """
        # Validate user is a member of the season's alliance
        season = await self._season_repo.get_by_id(season_id)
        if not season:
            raise HTTPException(status_code=404, detail="Season not found")

        # Verify permission: all members can view uploads
        role = await self._permission_service.get_user_role(user_id, season.alliance_id)
        if role is None:
            raise HTTPException(status_code=403, detail="You are not a member of this alliance")

        uploads = await self._csv_upload_repo.get_by_season(season_id)

        return [
            {
                "id": upload.id,
                "season_id": upload.season_id,
                "alliance_id": upload.alliance_id,
                "snapshot_date": upload.snapshot_date.isoformat(),
                "file_name": upload.file_name,
                "total_members": upload.total_members,
                "uploaded_at": upload.uploaded_at.isoformat(),
            }
            for upload in uploads
        ]

    async def delete_upload(self, user_id: UUID, upload_id: UUID) -> dict:
        """
        Delete a CSV upload (with cascading snapshots) and recalculate periods

        Permission: owner + collaborator

        Args:
            user_id: User UUID (for authorization)
            upload_id: CSV upload UUID

        Returns:
            Dict with deletion result and recalculated periods count

        Raises:
            HTTPException 403: If user doesn't have permission

        符合 CLAUDE.md 🔴: Service layer authorization
        """
        # Get upload to verify ownership
        upload = await self._csv_upload_repo.get_by_id(upload_id)
        if not upload:
            raise HTTPException(status_code=404, detail="Upload not found")

        # Verify user is owner or collaborator of the alliance
        season = await self._season_repo.get_by_id(upload.season_id)
        if not season:
            raise HTTPException(status_code=404, detail="Season not found")

        # Verify write permission (role + quota check)
        await self._permission_service.require_write_permission(
            user_id, season.alliance_id, "delete CSV uploads"
        )

        season_id = upload.season_id
        upload_type = upload.upload_type

        # Delete upload (CASCADE will delete snapshots)
        await self._csv_upload_repo.delete(upload_id)

        # Recalculate periods for regular uploads
        total_periods = 0
        if upload_type == "regular":
            periods = await self._period_metrics_service.calculate_periods_for_season(season_id)
            total_periods = len(periods)

        return {
            "success": True,
            "deleted_upload_id": upload_id,
            "recalculated_periods": total_periods,
        }
