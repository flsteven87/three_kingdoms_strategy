"""
Hegemony Weights API Endpoints

API layer for hegemony weight configuration and score calculation.
Follows CLAUDE.md 🔴: API layer delegates to Service layer, uses @router.get("") pattern
"""

from uuid import UUID

from fastapi import APIRouter, HTTPException, Query
from fastapi.params import Depends

from src.api.dependencies.auth import get_current_user_id
from src.models.hegemony_weight import (
    HegemonyScorePreview,
    HegemonyWeight,
    HegemonyWeightCreate,
    HegemonyWeightUpdate,
    HegemonyWeightWithSnapshot,
    SnapshotWeightsSummary,
)
from src.services.hegemony_weight_service import HegemonyWeightService

# 符合 CLAUDE.md 🔴: Use @router.get("") not @router.get("/")
router = APIRouter(prefix="/hegemony-weights", tags=["hegemony-weights"])


# 符合 CLAUDE.md 🔴: More specific routes MUST come before general routes
@router.post("/initialize", response_model=list[HegemonyWeight])
async def initialize_season_weights(
    season_id: UUID = Query(..., description="Season UUID"),
    user_id: UUID = Depends(get_current_user_id),
):
    """
    Initialize default hegemony weight configurations for all CSV uploads in a season.

    Creates weight configurations with:
    - Default tier 1 weights: Contribution 25%, Merit 25%, Assist 25%, Donation 25%
    - Even distribution of tier 2 weights across all snapshots

    Skips CSV uploads that already have weight configurations.
    Returns empty list if no CSV uploads exist for the season.
    """
    service = HegemonyWeightService()

    try:
        return await service.initialize_weights_for_season(user_id, season_id)
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e)) from e
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to initialize weights: {str(e)}"
        ) from e


@router.get("", response_model=list[HegemonyWeightWithSnapshot])
async def get_season_weights(
    season_id: UUID = Query(..., description="Season UUID"),
    user_id: UUID = Depends(get_current_user_id),
):
    """
    Get all hegemony weight configurations for a season.

    Returns weight configurations with CSV snapshot information.
    """
    service = HegemonyWeightService()

    try:
        return await service.get_season_weights(user_id, season_id)
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e)) from e
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get weights: {str(e)}") from e


@router.get("/summary", response_model=SnapshotWeightsSummary)
async def get_weights_summary(
    season_id: UUID = Query(..., description="Season UUID"),
    user_id: UUID = Depends(get_current_user_id),
):
    """
    Get summary of all snapshot weights for a season.

    Includes validation status (whether weights sum to 1.0).
    """
    service = HegemonyWeightService()

    try:
        return await service.get_weights_summary(user_id, season_id)
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e)) from e
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get summary: {str(e)}") from e


@router.post("", response_model=HegemonyWeight, status_code=201)
async def create_weight(
    data: HegemonyWeightCreate,
    season_id: UUID = Query(..., description="Season UUID"),
    user_id: UUID = Depends(get_current_user_id),
):
    """
    Create a new hegemony weight configuration.

    The tier 1 weights (contribution, merit, assist, donation) must sum to 1.0.
    """
    service = HegemonyWeightService()

    # Validate tier 1 weights sum to 1.0
    if not data.validate_indicator_weights_sum():
        raise HTTPException(
            status_code=400,
            detail="Tier 1 weights must sum to 1.0. "
            "Please adjust weights so they sum to exactly 1.0",
        )

    try:
        return await service.create_weight(user_id, season_id, data)
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e)) from e
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create weight: {str(e)}") from e


@router.patch("/{weight_id}", response_model=HegemonyWeight)
async def update_weight(
    weight_id: UUID,
    data: HegemonyWeightUpdate,
    user_id: UUID = Depends(get_current_user_id),
):
    """
    Update an existing hegemony weight configuration.

    Only provided fields will be updated.
    """
    service = HegemonyWeightService()

    try:
        return await service.update_weight(user_id, weight_id, data)
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e)) from e
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update weight: {str(e)}") from e


@router.delete("/{weight_id}", status_code=204)
async def delete_weight(
    weight_id: UUID,
    user_id: UUID = Depends(get_current_user_id),
):
    """
    Delete a hegemony weight configuration.
    """
    service = HegemonyWeightService()

    try:
        await service.delete_weight(user_id, weight_id)
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e)) from e
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete weight: {str(e)}") from e


@router.get("/preview", response_model=list[HegemonyScorePreview])
async def preview_hegemony_scores(
    season_id: UUID = Query(..., description="Season UUID"),
    limit: int = Query(default=10, ge=1, le=100, description="Top N members to return"),
    user_id: UUID = Depends(get_current_user_id),
):
    """
    Calculate and preview hegemony scores for top members.

    Returns top N members ranked by final hegemony score, with detailed breakdown
    by snapshot.

    Calculation:
    1. For each snapshot: score = Σ(indicator × tier1_weight)
    2. Final score: Σ(snapshot_score × tier2_weight)
    """
    service = HegemonyWeightService()

    try:
        return await service.calculate_hegemony_scores(user_id, season_id, limit)
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e)) from e
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to calculate scores: {str(e)}"
        ) from e
