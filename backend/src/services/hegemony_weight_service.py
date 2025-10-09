"""
Hegemony Weight Service

Business logic layer for hegemony weight management and score calculation.
Follows CLAUDE.md 🔴: Service layer orchestrates repositories, no direct database calls.
"""

from decimal import Decimal
from uuid import UUID

from src.models.hegemony_weight import (
    HegemonyScorePreview,
    HegemonyWeight,
    HegemonyWeightCreate,
    HegemonyWeightUpdate,
    HegemonyWeightWithSnapshot,
    SnapshotWeightsSummary,
)
from src.repositories.alliance_repository import AllianceRepository
from src.repositories.csv_upload_repository import CsvUploadRepository
from src.repositories.hegemony_weight_repository import HegemonyWeightRepository
from src.repositories.member_repository import MemberRepository
from src.repositories.member_snapshot_repository import MemberSnapshotRepository
from src.repositories.season_repository import SeasonRepository


class HegemonyWeightService:
    """Service for hegemony weight configuration and score calculation"""

    def __init__(self):
        """Initialize service with required repositories"""
        self._weight_repo = HegemonyWeightRepository()
        self._alliance_repo = AllianceRepository()
        self._season_repo = SeasonRepository()
        self._upload_repo = CsvUploadRepository()
        self._member_repo = MemberRepository()
        self._snapshot_repo = MemberSnapshotRepository()

    async def _verify_season_access(self, user_id: UUID, season_id: UUID) -> tuple:
        """
        Verify user has access to season and return season and alliance.

        Args:
            user_id: User UUID
            season_id: Season UUID

        Returns:
            Tuple of (season, alliance)

        Raises:
            ValueError: If season not found
            PermissionError: If user doesn't own the season
        """
        season = await self._season_repo.get_by_id(season_id)
        if not season:
            raise ValueError(f"Season {season_id} not found")

        alliance = await self._alliance_repo.get_by_user_id(user_id)
        if not alliance or alliance.id != season.alliance_id:
            raise PermissionError("You don't have permission to access this season")

        return season, alliance

    async def get_season_weights(
        self, user_id: UUID, season_id: UUID
    ) -> list[HegemonyWeightWithSnapshot]:
        """
        Get all hegemony weight configurations for a season with snapshot info.

        Args:
            user_id: User UUID (for permission check)
            season_id: Season UUID

        Returns:
            List of HegemonyWeightWithSnapshot objects

        Raises:
            PermissionError: If user doesn't own the season
        """
        await self._verify_season_access(user_id, season_id)
        return await self._weight_repo.get_with_snapshot_info(season_id)

    async def get_weights_summary(
        self, user_id: UUID, season_id: UUID
    ) -> SnapshotWeightsSummary:
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

        Creates weight configurations with default values:
        - Equal distribution: Contribution 25%, Merit 25%, Assist 25%, Donation 25%
        - Snapshot weights evenly distributed (e.g., 2 uploads = 50% each)

        Args:
            user_id: User UUID
            season_id: Season UUID

        Returns:
            List of created HegemonyWeight objects
        """
        _, alliance = await self._verify_season_access(user_id, season_id)

        # Get all CSV uploads for this season
        uploads = await self._upload_repo.get_by_season(season_id)
        if not uploads:
            # Return empty list if no uploads exist yet (not an error)
            return []

        # Calculate even distribution of snapshot weights
        snapshot_weight = Decimal("1.0") / Decimal(len(uploads))

        # Create weight configurations
        created_weights = []
        for upload in uploads:
            # Skip if weight already exists
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

    async def create_weight(
        self, user_id: UUID, season_id: UUID, data: HegemonyWeightCreate
    ) -> HegemonyWeight:
        """
        Create a new hegemony weight configuration.

        Args:
            user_id: User UUID
            season_id: Season UUID
            data: HegemonyWeightCreate data

        Returns:
            Created HegemonyWeight object
        """
        _, alliance = await self._verify_season_access(user_id, season_id)

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

    async def update_weight(
        self, user_id: UUID, weight_id: UUID, data: HegemonyWeightUpdate
    ) -> HegemonyWeight:
        """
        Update an existing hegemony weight configuration.

        Args:
            user_id: User UUID
            weight_id: HegemonyWeight UUID
            data: HegemonyWeightUpdate data

        Returns:
            Updated HegemonyWeight object
        """
        # Verify weight exists and user owns it
        weight = await self._weight_repo.get_by_id(weight_id)
        if not weight:
            raise ValueError(f"Weight {weight_id} not found")

        alliance = await self._alliance_repo.get_by_user_id(user_id)
        if not alliance or alliance.id != weight.alliance_id:
            raise PermissionError("You don't have permission to update this weight")

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

        Args:
            user_id: User UUID
            weight_id: HegemonyWeight UUID

        Returns:
            True if deleted successfully
        """
        # Verify weight exists and user owns it
        weight = await self._weight_repo.get_by_id(weight_id)
        if not weight:
            raise ValueError(f"Weight {weight_id} not found")

        alliance = await self._alliance_repo.get_by_user_id(user_id)
        if not alliance or alliance.id != weight.alliance_id:
            raise PermissionError("You don't have permission to delete this weight")

        return await self._weight_repo.delete(weight_id)

    async def calculate_hegemony_scores(
        self, user_id: UUID, season_id: UUID, limit: int = 10
    ) -> list[HegemonyScorePreview]:
        """
        Calculate hegemony scores for top members in a season.

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
        """
        _, alliance = await self._verify_season_access(user_id, season_id)

        # Get all weight configurations for this season
        weights = await self._weight_repo.get_with_snapshot_info(season_id)
        if not weights:
            raise ValueError("No weight configurations found. Please initialize weights first.")

        # Get all members in the alliance
        members = await self._member_repo.get_by_alliance(alliance.id)

        # Calculate scores for each member
        member_scores: dict[UUID, dict] = {}

        for member in members:
            member_final_score = Decimal("0")
            snapshot_scores = {}

            for weight_config in weights:
                # Get member's snapshot for this CSV upload
                snapshot = await self._snapshot_repo.get_by_member_and_upload(
                    member.id, weight_config.csv_upload_id
                )

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

                # Store snapshot score
                date_key = weight_config.snapshot_date.strftime("%Y-%m-%d %H:%M:%S")
                snapshot_scores[date_key] = snapshot_score

                # Apply tier 2 weight
                member_final_score += snapshot_score * weight_config.snapshot_weight

            member_scores[member.id] = {
                "member_id": member.id,
                "member_name": member.name,
                "final_score": member_final_score,
                "snapshot_scores": snapshot_scores,
            }

        # Sort by final score (descending) and assign ranks
        sorted_members = sorted(
            member_scores.values(), key=lambda x: x["final_score"], reverse=True
        )

        # Build preview results
        previews = []
        for rank, member_data in enumerate(sorted_members[:limit], start=1):
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
