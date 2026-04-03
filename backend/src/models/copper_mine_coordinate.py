"""
Copper Mine Coordinate Pydantic Models

Source of truth reference data for official copper mine positions per game season.
"""

from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class CopperMineCoordinate(BaseModel):
    """Copper mine coordinate entity from source of truth table"""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    game_season_tag: str
    county: str
    district: str
    coord_x: int
    coord_y: int
    level: int


class CopperMineCoordinateResponse(BaseModel):
    """Copper mine coordinate for search results"""

    coord_x: int
    coord_y: int
    level: int
    county: str
    district: str


class CopperCoordinateSearchResult(BaseModel):
    """Search result with availability info"""

    coord_x: int
    coord_y: int
    level: int
    county: str
    district: str
    is_taken: bool = Field(False, description="Whether this coordinate is already registered")
