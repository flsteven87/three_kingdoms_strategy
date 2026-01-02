"""
Copper Mine Service

Business logic for copper mine management:
- Register copper mines from LIFF
- List and manage mines per alliance

符合 CLAUDE.md 🔴:
- Business logic in Service layer
- No direct database calls (uses Repository)
- Exception handling with proper chaining
"""

from uuid import UUID

from fastapi import HTTPException, status

from src.models.copper_mine import (
    CopperMine,
    CopperMineListResponse,
    CopperMineResponse,
    RegisterCopperResponse,
)
from src.repositories.copper_mine_repository import CopperMineRepository
from src.repositories.line_binding_repository import LineBindingRepository


class CopperMineService:
    """Service for copper mine operations"""

    def __init__(
        self,
        repository: CopperMineRepository | None = None,
        line_binding_repository: LineBindingRepository | None = None
    ):
        self.repository = repository or CopperMineRepository()
        self.line_binding_repository = (
            line_binding_repository or LineBindingRepository()
        )

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
        Register a new copper mine

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

        # Create the mine
        mine = await self.repository.create_mine(
            alliance_id=alliance_id,
            registered_by_line_user_id=line_user_id,
            game_id=game_id,
            coord_x=coord_x,
            coord_y=coord_y,
            level=level,
            notes=notes
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
        Delete a copper mine

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
