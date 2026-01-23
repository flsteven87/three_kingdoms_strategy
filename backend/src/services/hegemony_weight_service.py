"""
Hegemony Weight Service

Business logic layer for hegemony weight management and score calculation.
Follows CLAUDE.md 🔴: Service layer orchestrates repositories, no direct database calls.
"""

import asyncio
import logging
from decimal import Decimal
from uuid import UUID

from fastapi import HTTPException, status

from src.core.utils.date_helpers import format_date_key
from src.models.hegemony_weight import (
    HegemonyScorePreview,
    HegemonyWeight,
    HegemonyWeightCreate,
    HegemonyWeightUpdate,
    HegemonyWeightWithSnapshot,
    SnapshotWeightsSummary,
)
from src.models.member_snapshot import MemberSnapshot
from src.repositories.alliance_collaborator_repository import (
    AllianceCollaboratorRepository,
)
from src.repositories.alliance_repository import AllianceRepository
from src.repositories.csv_upload_repository import CsvUploadRepository
from src.repositories.hegemony_weight_repository import HegemonyWeightRepository
from src.repositories.member_snapshot_repository import MemberSnapshotRepository
from src.repositories.season_repository import SeasonRepository
from src.services.permission_service import PermissionService

logger = logging.getLogger(__name__)


class HegemonyWeightService:
    """Service for hegemony weight configuration and score calculation"""

    def __init__(self):
        """Initialize service with required repositories"""
        self._weight_repo = HegemonyWeightRepository()
        self._alliance_repo = AllianceRepository()
        self._season_repo = SeasonRepository()
        self._upload_repo = CsvUploadRepository()
        self._snapshot_repo = MemberSnapshotRepository()
        self._collaborator_repo = AllianceCollaboratorRepository()
        self._permission_service = PermissionService()

    async def _verify_season_access(
        self, user_id: UUID, season_id: UUID, required_roles: list[str]
    ) -> tuple:
        """
        Verify user has access to season with required role and return season and alliance.

        Performance optimized: Uses asyncio.gather to parallelize DB queries.

        Args:
            user_id: User UUID
            season_id: Season UUID
            required_roles: List of acceptable roles (e.g., ['owner', 'collaborator'])

        Returns:
            Tuple of (season, alliance)

        Raises:
            ValueError: If season not found
            PermissionError: If user doesn't own the season
            HTTPException 403: If user doesn't have required role
        """
        # Parallel fetch: season and alliance data
        # 符合 CLAUDE.md: Use asyncio.gather to avoid sequential DB calls
        season, alliance = await asyncio.gather(
            self._season_repo.get_by_id(season_id),
            self._alliance_repo.get_by_collaborator(user_id),
        )

        if not season:
            raise ValueError(f"Season {season_id} not found")

        if not alliance or alliance.id != season.alliance_id:
            raise PermissionError("You don't have permission to access this season")

        # Now check role (requires alliance.id from above)
        try:
            role = await self._collaborator_repo.get_collaborator_role(alliance.id, user_id)
        except ValueError:
            role = None

        if role is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="You are not a member of this alliance",
            )

        if role not in required_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"You don't have permission to manage hegemony weights. "
                f"Required role: {' or '.join(required_roles)}, your role: {role}",
            )

        return season, alliance

    async def get_season_weights(
        self, user_id: UUID, season_id: UUID
    ) -> list[HegemonyWeightWithSnapshot]:
        """
        Get all hegemony weight configurations for a season with snapshot info.

        Permission: all members (read-only)

        Args:
            user_id: User UUID (for permission check)
            season_id: Season UUID

        Returns:
            List of HegemonyWeightWithSnapshot objects

        Raises:
            PermissionError: If user doesn't own the season
            HTTPException 403: If user is not a member
        """
        # All members can view weights
        await self._verify_season_access(user_id, season_id, ["owner", "collaborator", "member"])
        return await self._weight_repo.get_with_snapshot_info(season_id)

    async def get_weights_summary(self, user_id: UUID, season_id: UUID) -> SnapshotWeightsSummary:
        """
        Get summary of all snapshot weights for a season.

        Args:
            user_id: User UUID
            season_id: Season UUID

        Returns:
            SnapshotWeightsSummary with validation status
        """
        weights = await self.get_season_weights(user_id, season_id)
        season = await self._season_repo.get_by_id(season_id)

        total_weight_sum = sum(w.snapshot_weight for w in weights)
        is_valid = abs(total_weight_sum - Decimal("1.0")) < Decimal("0.0001")

        return SnapshotWeightsSummary(
            season_id=season_id,
            season_name=season.name,
            total_snapshots=len(weights),
            total_weight_sum=total_weight_sum,
            is_valid=is_valid,
            weights=weights,
        )

    async def initialize_weights_for_season(
        self, user_id: UUID, season_id: UUID
    ) -> list[HegemonyWeight]:
        """
        Initialize default hegemony weight configurations for all CSV uploads in a season.

        Permission: owner + collaborator

        Creates weight configurations with default values:
        - Equal distribution: Contribution 25%, Merit 25%, Assist 25%, Donation 25%
        - Snapshot weights evenly distributed (e.g., 2 uploads = 50% each)

        Args:
            user_id: User UUID
            season_id: Season UUID

        Returns:
            List of created HegemonyWeight objects

        Raises:
            HTTPException 403: If user doesn't have permission
        """
        try:
            _, alliance = await self._verify_season_access(
                user_id, season_id, ["owner", "collaborator"]
            )

            # Verify quota: trial or available seasons required
            await self._permission_service.require_active_quota(
                alliance.id, "initialize hegemony weights"
            )

            uploads = await self._upload_repo.get_by_season(season_id)
            if not uploads:
                return []

            snapshot_weight = Decimal("1.0") / Decimal(len(uploads))
            created_weights = []

            for upload in uploads:
                existing = await self._weight_repo.get_by_csv_upload(upload.id)
                if existing:
                    created_weights.append(existing)
                    continue

                weight = await self._weight_repo.create_with_alliance(
                    alliance_id=alliance.id,
                    season_id=season_id,
                    csv_upload_id=upload.id,
                    weight_contribution=Decimal("0.2500"),
                    weight_merit=Decimal("0.2500"),
                    weight_assist=Decimal("0.2500"),
                    weight_donation=Decimal("0.2500"),
                    snapshot_weight=snapshot_weight,
                )
                created_weights.append(weight)

            return created_weights

        except Exception as e:
            logger.error(
                f"Failed to initialize weights - season_id={season_id}, "
                f"error={type(e).__name__}: {str(e)}",
                exc_info=True,
            )
            raise

    async def create_weight(
        self, user_id: UUID, season_id: UUID, data: HegemonyWeightCreate
    ) -> HegemonyWeight:
        """
        Create a new hegemony weight configuration.

        Permission: owner + collaborator

        Args:
            user_id: User UUID
            season_id: Season UUID
            data: HegemonyWeightCreate data

        Returns:
            Created HegemonyWeight object

        Raises:
            HTTPException 403: If user doesn't have permission
        """
        _, alliance = await self._verify_season_access(
            user_id, season_id, ["owner", "collaborator"]
        )

        # Verify quota: trial or available seasons required
        await self._permission_service.require_active_quota(
            alliance.id, "create hegemony weights"
        )

        # Verify CSV upload exists and belongs to this season
        upload = await self._upload_repo.get_by_id(data.csv_upload_id)
        if not upload or upload.season_id != season_id:
            raise ValueError("Invalid CSV upload ID for this season")

        return await self._weight_repo.create_with_alliance(
            alliance_id=alliance.id,
            season_id=season_id,
            csv_upload_id=data.csv_upload_id,
            weight_contribution=data.weight_contribution,
            weight_merit=data.weight_merit,
            weight_assist=data.weight_assist,
            weight_donation=data.weight_donation,
            snapshot_weight=data.snapshot_weight,
        )

    async def _verify_weight_access(
        self, user_id: UUID, weight_id: UUID, action: str
    ) -> tuple[HegemonyWeight, UUID]:
        """
        Verify user has access to modify a weight.

        Performance optimized: Uses asyncio.gather to parallelize DB queries.

        Args:
            user_id: User UUID
            weight_id: HegemonyWeight UUID
            action: Description of the action (for error messages)

        Returns:
            Tuple of (HegemonyWeight object, alliance_id)

        Raises:
            ValueError: If weight not found
            PermissionError: If user doesn't have permission
            HTTPException 403: If user is not owner or collaborator
        """
        # Parallel fetch: weight and alliance data
        weight, alliance = await asyncio.gather(
            self._weight_repo.get_by_id(weight_id),
            self._alliance_repo.get_by_collaborator(user_id),
        )

        if not weight:
            raise ValueError(f"Weight {weight_id} not found")

        if not alliance or alliance.id != weight.alliance_id:
            raise PermissionError(f"You don't have permission to {action}")

        # Check role (requires alliance.id from above)
        try:
            role = await self._collaborator_repo.get_collaborator_role(alliance.id, user_id)
        except ValueError:
            role = None

        if role not in ["owner", "collaborator"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"You don't have permission to {action}. "
                f"Required role: owner or collaborator, your role: {role or 'none'}",
            )

        return weight, alliance.id

    async def update_weight(
        self, user_id: UUID, weight_id: UUID, data: HegemonyWeightUpdate
    ) -> HegemonyWeight:
        """
        Update an existing hegemony weight configuration.

        Permission: owner + collaborator

        Args:
            user_id: User UUID
            weight_id: HegemonyWeight UUID
            data: HegemonyWeightUpdate data

        Returns:
            Updated HegemonyWeight object

        Raises:
            HTTPException 403: If user doesn't have permission
        """
        _, alliance_id = await self._verify_weight_access(
            user_id, weight_id, "update hegemony weights"
        )

        # Verify quota: trial or available seasons required
        await self._permission_service.require_active_quota(
            alliance_id, "update hegemony weights"
        )

        return await self._weight_repo.update_weights(
            weight_id=weight_id,
            weight_contribution=data.weight_contribution,
            weight_merit=data.weight_merit,
            weight_assist=data.weight_assist,
            weight_donation=data.weight_donation,
            snapshot_weight=data.snapshot_weight,
        )

    async def delete_weight(self, user_id: UUID, weight_id: UUID) -> bool:
        """
        Delete a hegemony weight configuration.

        Permission: owner + collaborator

        Args:
            user_id: User UUID
            weight_id: HegemonyWeight UUID

        Returns:
            True if deleted successfully

        Raises:
            HTTPException 403: If user doesn't have permission
        """
        _, alliance_id = await self._verify_weight_access(
            user_id, weight_id, "delete hegemony weights"
        )

        # Verify quota: trial or available seasons required
        await self._permission_service.require_active_quota(
            alliance_id, "delete hegemony weights"
        )

        return await self._weight_repo.delete(weight_id)

    async def calculate_hegemony_scores(
        self, user_id: UUID, season_id: UUID, limit: int = 20
    ) -> list[HegemonyScorePreview]:
        """
        Calculate hegemony scores for top members in a season.

        Permission: all members (read-only)

        Calculation steps:
        1. For each snapshot, calculate member score using tier 1 weights:
           score = (contribution × weight_contribution) + (merit × weight_merit) +
                   (assist × weight_assist) + (donation × weight_donation)
        2. Apply tier 2 weights to get final score:
           final_score = Σ(snapshot_score × snapshot_weight)

        Args:
            user_id: User UUID
            season_id: Season UUID
            limit: Maximum number of top members to return (default: 10)

        Returns:
            List of HegemonyScorePreview objects sorted by final score (descending)

        Raises:
            HTTPException 403: If user is not a member

        Performance: Optimized to avoid N+1 queries by fetching all snapshots at once
        """
        # All members can view scores
        _, alliance = await self._verify_season_access(
            user_id, season_id, ["owner", "collaborator", "member"]
        )

        # Get all weight configurations for this season
        weights = await self._weight_repo.get_with_snapshot_info(season_id)
        if not weights:
            raise ValueError("No weight configurations found. Please initialize weights first.")

        # Get all CSV upload IDs
        csv_upload_ids = [w.csv_upload_id for w in weights]

        # Batch fetch all snapshots in a single query for performance optimization
        # 符合 CLAUDE.md: Avoid N+1 queries - use batch query instead of loop
        all_snapshots = await self._snapshot_repo.get_by_uploads_batch(csv_upload_ids)

        # Group snapshots by member_id for O(1) lookup
        # Structure: {member_id: {csv_upload_id: snapshot}}
        snapshots_by_member: dict[UUID, dict[UUID, MemberSnapshot]] = {}
        member_names: dict[UUID, str] = {}

        for snapshot in all_snapshots:
            if snapshot.member_id not in snapshots_by_member:
                snapshots_by_member[snapshot.member_id] = {}
                member_names[snapshot.member_id] = snapshot.member_name

            snapshots_by_member[snapshot.member_id][snapshot.csv_upload_id] = snapshot

        # Calculate scores for each member
        member_scores: list[dict] = []

        for member_id, member_snapshots in snapshots_by_member.items():
            member_final_score = Decimal("0")
            snapshot_scores = {}

            for weight_config in weights:
                snapshot = member_snapshots.get(weight_config.csv_upload_id)

                if snapshot is None:
                    # Member has no data for this snapshot, score = 0
                    snapshot_score = Decimal("0")
                else:
                    # Calculate snapshot score using tier 1 weights
                    snapshot_score = (
                        Decimal(str(snapshot.total_contribution or 0))
                        * weight_config.weight_contribution
                        + Decimal(str(snapshot.total_merit or 0)) * weight_config.weight_merit
                        + Decimal(str(snapshot.total_assist or 0)) * weight_config.weight_assist
                        + Decimal(str(snapshot.total_donation or 0)) * weight_config.weight_donation
                    )

                # Store snapshot score using consistent date formatting
                # 符合 CLAUDE.md 🟢: Use centralized date helper for consistency
                date_key = format_date_key(weight_config.snapshot_date)
                snapshot_scores[date_key] = snapshot_score

                # Apply tier 2 weight
                member_final_score += snapshot_score * weight_config.snapshot_weight

            member_scores.append(
                {
                    "member_id": member_id,
                    "member_name": member_names[member_id],
                    "final_score": member_final_score,
                    "snapshot_scores": snapshot_scores,
                }
            )

        # Sort by final score (descending) and assign ranks
        member_scores.sort(key=lambda x: x["final_score"], reverse=True)

        # Build preview results
        previews = []
        for rank, member_data in enumerate(member_scores[:limit], start=1):
            previews.append(
                HegemonyScorePreview(
                    member_id=member_data["member_id"],
                    member_name=member_data["member_name"],
                    final_score=member_data["final_score"],
                    rank=rank,
                    snapshot_scores=member_data["snapshot_scores"],
                )
            )

        return previews
