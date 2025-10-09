"""
Hegemony Weight Models

Pydantic models for hegemony weight configuration system.
Each record represents weight configuration for one CSV snapshot.
"""

from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


class HegemonyWeightBase(BaseModel):
    """Base hegemony weight model with shared fields"""

    # Tier 1: Data indicator weights (must sum to 1.0)
    weight_contribution: Decimal = Field(
        default=Decimal("0.4000"),
        ge=0,
        le=1,
        description="Weight for total_contribution (default 40%)",
    )
    weight_merit: Decimal = Field(
        default=Decimal("0.3000"),
        ge=0,
        le=1,
        description="Weight for total_merit (default 30%)",
    )
    weight_assist: Decimal = Field(
        default=Decimal("0.2000"),
        ge=0,
        le=1,
        description="Weight for total_assist (default 20%)",
    )
    weight_donation: Decimal = Field(
        default=Decimal("0.1000"),
        ge=0,
        le=1,
        description="Weight for total_donation (default 10%)",
    )

    # Tier 2: This snapshot's weight in final calculation
    snapshot_weight: Decimal = Field(
        default=Decimal("1.0000"),
        ge=0,
        le=1,
        description="This snapshot's weight in final hegemony score calculation",
    )

    @field_validator("weight_contribution", "weight_merit", "weight_assist", "weight_donation")
    @classmethod
    def validate_weight_range(cls, v: Decimal) -> Decimal:
        """Validate weight is between 0 and 1"""
        if v < 0 or v > 1:
            raise ValueError("Weight must be between 0 and 1")
        return v

    @field_validator("snapshot_weight")
    @classmethod
    def validate_snapshot_weight_range(cls, v: Decimal) -> Decimal:
        """Validate snapshot weight is between 0 and 1"""
        if v < 0 or v > 1:
            raise ValueError("Snapshot weight must be between 0 and 1")
        return v

    def validate_indicator_weights_sum(self) -> bool:
        """Validate that tier 1 weights sum to 1.0 (with small tolerance)"""
        total = (
            self.weight_contribution
            + self.weight_merit
            + self.weight_assist
            + self.weight_donation
        )
        return abs(total - Decimal("1.0")) < Decimal("0.0001")


class HegemonyWeightCreate(HegemonyWeightBase):
    """Model for creating a new hegemony weight configuration"""

    csv_upload_id: UUID = Field(description="CSV upload ID this weight configuration applies to")


class HegemonyWeightUpdate(BaseModel):
    """Model for updating an existing hegemony weight configuration"""

    weight_contribution: Decimal | None = Field(default=None, ge=0, le=1)
    weight_merit: Decimal | None = Field(default=None, ge=0, le=1)
    weight_assist: Decimal | None = Field(default=None, ge=0, le=1)
    weight_donation: Decimal | None = Field(default=None, ge=0, le=1)
    snapshot_weight: Decimal | None = Field(default=None, ge=0, le=1)


class HegemonyWeight(HegemonyWeightBase):
    """Complete hegemony weight model (from database)"""

    id: UUID
    alliance_id: UUID
    season_id: UUID
    csv_upload_id: UUID
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class HegemonyWeightWithSnapshot(HegemonyWeight):
    """Hegemony weight with CSV upload snapshot information"""

    snapshot_date: datetime = Field(description="Date of the CSV snapshot")
    snapshot_filename: str = Field(description="Original CSV filename")
    total_members: int = Field(description="Total members in this snapshot")


class HegemonyScorePreview(BaseModel):
    """Preview model for hegemony score calculation results"""

    member_id: UUID
    member_name: str
    final_score: Decimal = Field(description="Final hegemony score")
    rank: int = Field(description="Ranking based on final score")

    # Detailed breakdown by snapshot
    snapshot_scores: dict[str, Decimal] = Field(
        default_factory=dict,
        description="Scores by snapshot date (key: date string, value: score)",
    )


class SnapshotWeightsSummary(BaseModel):
    """Summary of all snapshot weights for a season"""

    season_id: UUID
    season_name: str
    total_snapshots: int
    total_weight_sum: Decimal = Field(
        description="Sum of all snapshot weights (should be close to 1.0)"
    )
    is_valid: bool = Field(description="Whether the total weight sum is valid (≈ 1.0)")
    weights: list[HegemonyWeightWithSnapshot]
