"""
Copper Mine Coordinate Repository

Data access layer for copper_mine_coordinates table (source of truth reference data).
"""

from src.models.copper_mine_coordinate import CopperMineCoordinate
from src.repositories.base import SupabaseRepository


class CopperMineCoordinateRepository(SupabaseRepository[CopperMineCoordinate]):
    """Repository for copper mine coordinate reference data"""

    def __init__(self):
        super().__init__(
            table_name="copper_mine_coordinates",
            model_class=CopperMineCoordinate,
        )

    async def get_by_coords(
        self, game_season_tag: str, coord_x: int, coord_y: int
    ) -> CopperMineCoordinate | None:
        """Look up a coordinate in the source of truth"""
        result = await self._execute_async(
            lambda: self.client.from_(self.table_name)
            .select("*")
            .eq("game_season_tag", game_season_tag)
            .eq("coord_x", coord_x)
            .eq("coord_y", coord_y)
            .execute()
        )

        data = self._handle_supabase_result(result, allow_empty=True, expect_single=True)
        if not data:
            return None
        return CopperMineCoordinate(**data)

    async def has_data(self, game_season_tag: str) -> bool:
        """Check if any reference data exists for a game season tag"""
        result = await self._execute_async(
            lambda: self.client.from_(self.table_name)
            .select("id", count="exact")
            .eq("game_season_tag", game_season_tag)
            .limit(1)
            .execute()
        )

        return (result.count or 0) > 0

    async def list_searchable_counties(
        self, game_season_tag: str, level_filter: list[int] | None = None
    ) -> list[str]:
        """List distinct county names available in source-of-truth search data."""
        query = (
            self.client.from_(self.table_name)
            .select("county")
            .eq("game_season_tag", game_season_tag)
        )
        if level_filter:
            query = query.in_("level", level_filter)

        result = await self._execute_async(lambda: query.execute())
        data = self._handle_supabase_result(result, allow_empty=True)

        counties = {
            str(row["county"]).strip()
            for row in data
            if row.get("county") and str(row["county"]).strip()
        }
        return sorted(counties)

    async def search_by_location(
        self, game_season_tag: str, query: str, level_filter: list[int] | None = None
    ) -> list[CopperMineCoordinate]:
        """
        Search coordinates by county or district name (ilike).

        Args:
            game_season_tag: Game season tag (e.g. 'PK23')
            query: Search text for county/district name
            level_filter: Optional level filter (e.g. [9, 10])

        Returns:
            List of matching coordinates
        """
        search_pattern = f"%{query}%"

        # Search county
        county_query = (
            self.client.from_(self.table_name)
            .select("*")
            .eq("game_season_tag", game_season_tag)
            .ilike("county", search_pattern)
        )
        if level_filter:
            county_query = county_query.in_("level", level_filter)

        county_result = await self._execute_async(lambda: county_query.execute())
        county_data = self._handle_supabase_result(county_result, allow_empty=True)

        # Search district
        district_query = (
            self.client.from_(self.table_name)
            .select("*")
            .eq("game_season_tag", game_season_tag)
            .ilike("district", search_pattern)
        )
        if level_filter:
            district_query = district_query.in_("level", level_filter)

        district_result = await self._execute_async(lambda: district_query.execute())
        district_data = self._handle_supabase_result(district_result, allow_empty=True)

        # Merge and deduplicate by id
        seen_ids: set[str] = set()
        merged: list[CopperMineCoordinate] = []
        for row in [*county_data, *district_data]:
            row_id = str(row["id"])
            if row_id not in seen_ids:
                seen_ids.add(row_id)
                merged.append(CopperMineCoordinate(**row))

        return merged
