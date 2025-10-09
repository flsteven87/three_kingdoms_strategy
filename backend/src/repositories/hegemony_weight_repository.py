"""
Hegemony Weight Repository

Data access layer for hegemony weight configurations.
Follows CLAUDE.md 🔴: Must inherit from SupabaseRepository and use _handle_supabase_result()
"""

from decimal import Decimal
from uuid import UUID

from src.models.hegemony_weight import HegemonyWeight, HegemonyWeightWithSnapshot
from src.repositories.base import SupabaseRepository


class HegemonyWeightRepository(SupabaseRepository[HegemonyWeight]):
    """Repository for hegemony_weights table operations"""

    def __init__(self):
        """Initialize repository with table name and model class"""
        super().__init__(table_name="hegemony_weights", model_class=HegemonyWeight)

    async def get_by_season(self, season_id: UUID) -> list[HegemonyWeight]:
        """
        Get all hegemony weight configurations for a season.

        Args:
            season_id: Season UUID

        Returns:
            List of HegemonyWeight objects, empty list if none found
        """
        result = (
            self.client.from_(self.table_name)
            .select("*")
            .eq("season_id", str(season_id))
            .order("created_at")
            .execute()
        )

        data_list = self._handle_supabase_result(result, allow_empty=True)
        return self._build_models(data_list)

    async def get_by_csv_upload(self, csv_upload_id: UUID) -> HegemonyWeight | None:
        """
        Get hegemony weight configuration for a specific CSV upload.

        Args:
            csv_upload_id: CSV upload UUID

        Returns:
            HegemonyWeight object or None if not found
        """
        result = (
            self.client.from_(self.table_name)
            .select("*")
            .eq("csv_upload_id", str(csv_upload_id))
            .execute()
        )

        data_list = self._handle_supabase_result(result, allow_empty=True)
        return self._build_models(data_list)[0] if data_list else None

    async def get_with_snapshot_info(self, season_id: UUID) -> list[HegemonyWeightWithSnapshot]:
        """
        Get hegemony weights with CSV snapshot information.

        Joins with csv_uploads table to get snapshot details.

        Args:
            season_id: Season UUID

        Returns:
            List of HegemonyWeightWithSnapshot objects
        """
        result = (
            self.client.from_(self.table_name)
            .select(
                """
                *,
                csv_uploads!inner(
                    snapshot_date,
                    file_name,
                    total_members
                )
            """
            )
            .eq("season_id", str(season_id))
            .order("csv_uploads(snapshot_date)")
            .execute()
        )

        data_list = self._handle_supabase_result(result, allow_empty=True)

        # Transform nested data into HegemonyWeightWithSnapshot
        weights_with_snapshot = []
        for data in data_list:
            upload_data = data.pop("csv_uploads", {})
            weight_data = {
                **data,
                "snapshot_date": upload_data.get("snapshot_date"),
                "snapshot_filename": upload_data.get("file_name"),
                "total_members": upload_data.get("total_members"),
            }
            weights_with_snapshot.append(HegemonyWeightWithSnapshot(**weight_data))

        return weights_with_snapshot

    async def create_with_alliance(
        self,
        alliance_id: UUID,
        season_id: UUID,
        csv_upload_id: UUID,
        weight_contribution: Decimal,
        weight_merit: Decimal,
        weight_assist: Decimal,
        weight_donation: Decimal,
        snapshot_weight: Decimal,
    ) -> HegemonyWeight:
        """
        Create a new hegemony weight configuration.

        Args:
            alliance_id: Alliance UUID
            season_id: Season UUID
            csv_upload_id: CSV upload UUID
            weight_contribution: Weight for total_contribution
            weight_merit: Weight for total_merit
            weight_assist: Weight for total_assist
            weight_donation: Weight for total_donation
            snapshot_weight: This snapshot's weight in final calculation

        Returns:
            Created HegemonyWeight object

        Raises:
            ValueError: If weights are invalid or upload already has configuration
        """
        # Validate tier 1 weights sum to 1.0
        total = weight_contribution + weight_merit + weight_assist + weight_donation
        if abs(total - Decimal("1.0")) >= Decimal("0.0001"):
            raise ValueError(
                f"Tier 1 weights must sum to 1.0, got {total}. "
                "Please adjust weights so they sum to exactly 1.0"
            )

        result = (
            self.client.from_(self.table_name)
            .insert(
                {
                    "alliance_id": str(alliance_id),
                    "season_id": str(season_id),
                    "csv_upload_id": str(csv_upload_id),
                    "weight_contribution": str(weight_contribution),
                    "weight_merit": str(weight_merit),
                    "weight_assist": str(weight_assist),
                    "weight_donation": str(weight_donation),
                    "snapshot_weight": str(snapshot_weight),
                }
            )
            .execute()
        )

        data_list = self._handle_supabase_result(result)
        return self._build_models(data_list)[0]

    async def update_weights(
        self,
        weight_id: UUID,
        weight_contribution: Decimal | None = None,
        weight_merit: Decimal | None = None,
        weight_assist: Decimal | None = None,
        weight_donation: Decimal | None = None,
        snapshot_weight: Decimal | None = None,
    ) -> HegemonyWeight:
        """
        Update hegemony weight configuration.

        Args:
            weight_id: HegemonyWeight UUID
            weight_contribution: Optional new weight for total_contribution
            weight_merit: Optional new weight for total_merit
            weight_assist: Optional new weight for total_assist
            weight_donation: Optional new weight for total_donation
            snapshot_weight: Optional new snapshot weight

        Returns:
            Updated HegemonyWeight object

        Raises:
            ValueError: If updated weights would be invalid
        """
        # Build update data
        update_data = {}
        if weight_contribution is not None:
            update_data["weight_contribution"] = str(weight_contribution)
        if weight_merit is not None:
            update_data["weight_merit"] = str(weight_merit)
        if weight_assist is not None:
            update_data["weight_assist"] = str(weight_assist)
        if weight_donation is not None:
            update_data["weight_donation"] = str(weight_donation)
        if snapshot_weight is not None:
            update_data["snapshot_weight"] = str(snapshot_weight)

        if not update_data:
            # No updates provided, fetch current
            return await self.get_by_id(weight_id)

        result = (
            self.client.from_(self.table_name)
            .update(update_data)
            .eq("id", str(weight_id))
            .execute()
        )

        data_list = self._handle_supabase_result(result)
        return self._build_models(data_list)[0]

    async def delete_by_csv_upload(self, csv_upload_id: UUID) -> bool:
        """
        Delete hegemony weight configuration by CSV upload ID.

        Args:
            csv_upload_id: CSV upload UUID

        Returns:
            True if deleted successfully
        """
        result = (
            self.client.from_(self.table_name)
            .delete()
            .eq("csv_upload_id", str(csv_upload_id))
            .execute()
        )

        # For DELETE operations, empty result is acceptable
        self._handle_supabase_result(result, allow_empty=True)
        return True

    async def get_total_snapshot_weight_sum(self, season_id: UUID) -> Decimal:
        """
        Calculate the sum of all snapshot weights for a season.

        This should ideally be close to 1.0 for valid configuration.

        Args:
            season_id: Season UUID

        Returns:
            Sum of all snapshot_weight values
        """
        weights = await self.get_by_season(season_id)
        return sum(w.snapshot_weight for w in weights)

    async def validate_season_weights(self, season_id: UUID) -> bool:
        """
        Validate that all snapshot weights for a season sum to approximately 1.0.

        Args:
            season_id: Season UUID

        Returns:
            True if total snapshot weights ≈ 1.0, False otherwise
        """
        total = await self.get_total_snapshot_weight_sum(season_id)
        return abs(total - Decimal("1.0")) < Decimal("0.0001")
