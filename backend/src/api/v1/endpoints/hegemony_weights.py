"""
Hegemony Weights API Endpoints

API layer for hegemony weight configuration and score calculation.
符合 CLAUDE.md 🔴:
- API layer delegates to Service layer
- Uses Provider Pattern for dependency injection
- Uses @router.get("") pattern (no trailing slash)
- Specific routes (/initialize, /summary, /preview) MUST come before parametric routes (/{weight_id})
"""

from uuid import UUID

from fastapi import APIRouter, Query

from src.core.dependencies import HegemonyWeightServiceDep, UserIdDep
from src.models.hegemony_weight import (
    HegemonyScorePreview,
    HegemonyWeight,
    HegemonyWeightCreate,
    HegemonyWeightUpdate,
    HegemonyWeightWithSnapshot,
    SnapshotWeightsSummary,
)

router = APIRouter(prefix="/hegemony-weights", tags=["hegemony-weights"])


# =============================================================================
# Static Routes (MUST come before parametric routes like /{weight_id})
# 符合 CLAUDE.md 🔴: Specific routes MUST come before parametric routes
# =============================================================================


@router.post("/initialize", response_model=list[HegemonyWeight])
async def initialize_season_weights(
    service: HegemonyWeightServiceDep,
    user_id: UserIdDep,
    season_id: UUID = Query(..., description="Season UUID"),
):
    """
    Initialize default hegemony weight configurations for all CSV uploads in a season.

    Creates weight configurations with default tier 1 weights and even distribution
    of tier 2 weights across all snapshots.
    """
    return await service.initialize_weights_for_season(user_id, season_id)


@router.get("/summary", response_model=SnapshotWeightsSummary)
async def get_weights_summary(
    service: HegemonyWeightServiceDep,
    user_id: UserIdDep,
    season_id: UUID = Query(..., description="Season UUID"),
):
    """Get summary of all snapshot weights for a season with validation status."""
    return await service.get_weights_summary(user_id, season_id)


@router.get("/preview", response_model=list[HegemonyScorePreview])
async def preview_hegemony_scores(
    service: HegemonyWeightServiceDep,
    user_id: UserIdDep,
    season_id: UUID = Query(..., description="Season UUID"),
    limit: int = Query(default=20, ge=1, le=500, description="Top N members to return"),
):
    """Calculate and preview hegemony scores for top members."""
    return await service.calculate_hegemony_scores(user_id, season_id, limit)


# =============================================================================
# Collection Routes (root path)
# =============================================================================


@router.get("", response_model=list[HegemonyWeightWithSnapshot])
async def get_season_weights(
    service: HegemonyWeightServiceDep,
    user_id: UserIdDep,
    season_id: UUID = Query(..., description="Season UUID"),
):
    """Get all hegemony weight configurations for a season."""
    return await service.get_season_weights(user_id, season_id)


@router.post("", response_model=HegemonyWeight, status_code=201)
async def create_weight(
    data: HegemonyWeightCreate,
    service: HegemonyWeightServiceDep,
    user_id: UserIdDep,
    season_id: UUID = Query(..., description="Season UUID"),
):
    """Create a new hegemony weight configuration."""
    if not data.validate_indicator_weights_sum():
        raise ValueError("Tier 1 weights must sum to 1.0")

    return await service.create_weight(user_id, season_id, data)


# =============================================================================
# Parametric Routes (/{weight_id}) - MUST come after static routes
# =============================================================================


@router.patch("/{weight_id}", response_model=HegemonyWeight)
async def update_weight(
    weight_id: UUID,
    data: HegemonyWeightUpdate,
    service: HegemonyWeightServiceDep,
    user_id: UserIdDep,
):
    """Update an existing hegemony weight configuration."""
    return await service.update_weight(user_id, weight_id, data)


@router.delete("/{weight_id}", status_code=204)
async def delete_weight(
    weight_id: UUID,
    service: HegemonyWeightServiceDep,
    user_id: UserIdDep,
):
    """Delete a hegemony weight configuration."""
    await service.delete_weight(user_id, weight_id)
