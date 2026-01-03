"""
Copper Mine Service

Business logic for copper mine management:
- Register copper mines from LIFF (with auto season/member matching)
- List and manage mines per alliance
- Dashboard ownership management

符合 CLAUDE.md 🔴:
- Business logic in Service layer
- No direct database calls (uses Repository)
- Exception handling with proper chaining
"""

from datetime import datetime
from uuid import UUID

from fastapi import HTTPException, status

from src.models.copper_mine import (
    CopperMine,
    CopperMineListResponse,
    CopperMineOwnershipResponse,
    CopperMineResponse,
    RegisterCopperResponse,
)
from src.repositories.copper_mine_repository import CopperMineRepository
from src.repositories.line_binding_repository import LineBindingRepository
from src.repositories.member_repository import MemberRepository
from src.repositories.season_repository import SeasonRepository


class CopperMineService:
    """Service for copper mine operations (LIFF + Dashboard)"""

    def __init__(
        self,
        repository: CopperMineRepository | None = None,
        line_binding_repository: LineBindingRepository | None = None,
        season_repository: SeasonRepository | None = None,
        member_repository: MemberRepository | None = None,
    ):
        self.repository = repository or CopperMineRepository()
        self.line_binding_repository = (
            line_binding_repository or LineBindingRepository()
        )
        self.season_repository = season_repository or SeasonRepository()
        self.member_repository = member_repository or MemberRepository()

    async def _get_alliance_id_from_group(self, line_group_id: str) -> UUID:
        """
        Get alliance ID from LINE group ID

        Raises:
            HTTPException 404: If group not bound to any alliance
        """
        group_binding = await self.line_binding_repository.get_group_binding_by_line_group_id(
            line_group_id
        )
        if not group_binding:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Group not bound to any alliance"
            )
        return group_binding.alliance_id

    def _to_response(self, mine: CopperMine) -> CopperMineResponse:
        """Convert CopperMine entity to response model"""
        return CopperMineResponse(
            id=str(mine.id),
            game_id=mine.game_id,
            coord_x=mine.coord_x,
            coord_y=mine.coord_y,
            level=mine.level,
            status=mine.status,
            notes=mine.notes,
            registered_at=mine.registered_at
        )

    async def get_mines_list(
        self,
        line_group_id: str,
        line_user_id: str
    ) -> CopperMineListResponse:
        """
        Get copper mines list for LIFF display

        Args:
            line_group_id: LINE group ID
            line_user_id: LINE user ID (for potential filtering)

        Returns:
            CopperMineListResponse with mines and total count
        """
        alliance_id = await self._get_alliance_id_from_group(line_group_id)

        mines = await self.repository.get_mines_by_alliance(alliance_id)

        return CopperMineListResponse(
            mines=[self._to_response(mine) for mine in mines],
            total=len(mines)
        )

    async def _get_active_season(self, alliance_id: UUID) -> UUID | None:
        """Get active season ID for an alliance"""
        season = await self.season_repository.get_active_season(alliance_id)
        return season.id if season else None

    async def _match_member_id(self, alliance_id: UUID, game_id: str) -> UUID | None:
        """Try to match game_id to a member"""
        member = await self.member_repository.get_member_by_name(alliance_id, game_id)
        return member.id if member else None

    async def register_mine(
        self,
        line_group_id: str,
        line_user_id: str,
        game_id: str,
        coord_x: int,
        coord_y: int,
        level: int,
        notes: str | None = None
    ) -> RegisterCopperResponse:
        """
        Register a new copper mine (LIFF)

        Auto-fills:
        - season_id: From alliance's active season
        - member_id: Matched from game_id → members.name

        Args:
            line_group_id: LINE group ID
            line_user_id: LINE user ID who is registering
            game_id: Game ID of the member
            coord_x: X coordinate
            coord_y: Y coordinate
            level: Mine level (1-10)
            notes: Optional notes

        Returns:
            RegisterCopperResponse with created mine

        Raises:
            HTTPException 404: If group not bound
            HTTPException 409: If mine already exists at coordinates
        """
        alliance_id = await self._get_alliance_id_from_group(line_group_id)

        # Check if mine already exists at these coordinates
        existing = await self.repository.get_mine_by_coords(
            alliance_id=alliance_id,
            coord_x=coord_x,
            coord_y=coord_y
        )
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Copper mine already exists at ({coord_x}, {coord_y})"
            )

        # Auto-fill season_id and member_id
        season_id = await self._get_active_season(alliance_id)
        member_id = await self._match_member_id(alliance_id, game_id)

        # Create the mine
        mine = await self.repository.create_mine(
            alliance_id=alliance_id,
            registered_by_line_user_id=line_user_id,
            game_id=game_id,
            coord_x=coord_x,
            coord_y=coord_y,
            level=level,
            notes=notes,
            season_id=season_id,
            member_id=member_id,
        )

        return RegisterCopperResponse(
            success=True,
            mine=self._to_response(mine),
            message="Copper mine registered successfully"
        )

    async def delete_mine(
        self,
        mine_id: UUID,
        line_group_id: str,
        line_user_id: str
    ) -> bool:
        """
        Delete a copper mine (LIFF)

        Args:
            mine_id: Mine UUID to delete
            line_group_id: LINE group ID (for authorization)
            line_user_id: LINE user ID (for authorization)

        Returns:
            True if deleted

        Raises:
            HTTPException 404: If group not bound or mine not found
        """
        # Validate group binding
        await self._get_alliance_id_from_group(line_group_id)

        deleted = await self.repository.delete_mine(mine_id)
        if not deleted:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Copper mine not found"
            )

        return True

    # =========================================================================
    # Dashboard Methods
    # =========================================================================

    async def get_ownerships_by_season(
        self,
        season_id: UUID,
        alliance_id: UUID
    ) -> list[CopperMineOwnershipResponse]:
        """
        Get copper mine ownerships for Dashboard display

        Joins member data for display purposes.
        """
        # Get raw ownership data
        ownerships = await self.repository.get_ownerships_by_season_simple(season_id)

        # Get member info for each ownership
        responses = []
        for ownership in ownerships:
            member_id = ownership.get("member_id")
            member_name = ownership.get("game_id", "Unknown")
            member_group = None
            line_display_name = None

            if member_id:
                member = await self.member_repository.get_by_id(UUID(member_id))
                if member:
                    member_name = member.name
                    # Get LINE display name using game_id (member name)
                    line_binding = await self.line_binding_repository.get_member_binding_by_game_id(
                        alliance_id,
                        member_name
                    )
                    if line_binding:
                        line_display_name = line_binding.line_display_name
                # Get latest snapshot for group info
                snapshot = await self._get_latest_snapshot(UUID(member_id), season_id)
                if snapshot:
                    member_group = snapshot.get("group_name")

            responses.append(CopperMineOwnershipResponse(
                id=str(ownership["id"]),
                season_id=str(ownership["season_id"]),
                member_id=str(member_id) if member_id else None,
                coord_x=ownership["coord_x"],
                coord_y=ownership["coord_y"],
                level=ownership["level"],
                applied_at=ownership["registered_at"],
                created_at=ownership["registered_at"],
                member_name=member_name,
                member_group=member_group,
                line_display_name=line_display_name,
            ))

        return responses

    async def _get_latest_snapshot(
        self,
        member_id: UUID,
        season_id: UUID
    ) -> dict | None:
        """Get latest snapshot for a member in a season"""
        # This would require a snapshot repository method
        # For now, return None - can be enhanced later
        return None

    async def create_ownership(
        self,
        season_id: UUID,
        alliance_id: UUID,
        member_id: UUID,
        coord_x: int,
        coord_y: int,
        level: int,
        applied_at: datetime | None = None
    ) -> CopperMineOwnershipResponse:
        """
        Create a copper mine ownership (Dashboard)

        Args:
            season_id: Season UUID
            alliance_id: Alliance UUID
            member_id: Member UUID
            coord_x: X coordinate
            coord_y: Y coordinate
            level: Mine level (9 or 10)
            applied_at: Optional application date

        Raises:
            HTTPException 404: If member not found
            HTTPException 409: If coordinates already taken
        """
        # Validate member exists
        member = await self.member_repository.get_by_id(member_id)
        if not member:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Member not found"
            )

        # Check coordinates not already taken in this season
        existing_ownerships = await self.repository.get_ownerships_by_season_simple(
            season_id
        )
        for ownership in existing_ownerships:
            if ownership["coord_x"] == coord_x and ownership["coord_y"] == coord_y:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Coordinates ({coord_x}, {coord_y}) already registered"
                )

        # Create ownership
        mine = await self.repository.create_ownership(
            season_id=season_id,
            alliance_id=alliance_id,
            member_id=member_id,
            game_id=member.name,
            coord_x=coord_x,
            coord_y=coord_y,
            level=level,
            applied_at=applied_at,
        )

        return CopperMineOwnershipResponse(
            id=str(mine.id),
            season_id=str(season_id),
            member_id=str(member_id),
            coord_x=mine.coord_x,
            coord_y=mine.coord_y,
            level=mine.level,
            applied_at=mine.registered_at,
            created_at=mine.registered_at,
            member_name=member.name,
            member_group=None,
            line_display_name=None,
        )

    async def delete_ownership(
        self,
        ownership_id: UUID,
        alliance_id: UUID
    ) -> bool:
        """
        Delete a copper mine ownership (Dashboard)

        Args:
            ownership_id: Ownership UUID to delete
            alliance_id: Alliance UUID (for authorization)

        Returns:
            True if deleted

        Raises:
            HTTPException 404: If ownership not found
        """
        # Verify ownership exists and belongs to alliance
        ownership = await self.repository.get_by_id(ownership_id)
        if not ownership:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Ownership not found"
            )

        if ownership.alliance_id != alliance_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Ownership does not belong to this alliance"
            )

        deleted = await self.repository.delete_mine(ownership_id)
        if not deleted:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Failed to delete ownership"
            )

        return True
