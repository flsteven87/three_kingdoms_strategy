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
    AllowedLevel,
    CopperMine,
    CopperMineListResponse,
    CopperMineOwnershipResponse,
    CopperMineResponse,
    RegisterCopperResponse,
)
from src.repositories.copper_mine_repository import CopperMineRepository
from src.repositories.copper_mine_rule_repository import CopperMineRuleRepository
from src.repositories.line_binding_repository import LineBindingRepository
from src.repositories.member_repository import MemberRepository
from src.repositories.member_snapshot_repository import MemberSnapshotRepository
from src.repositories.season_repository import SeasonRepository

# 等級文字對照表（避免重複定義）
LEVEL_TEXT = {
    "nine": "9 級",
    "ten": "10 級",
    "both": "9 或 10 級"
}


class CopperMineService:
    """Service for copper mine operations (LIFF + Dashboard)"""

    def __init__(
        self,
        repository: CopperMineRepository | None = None,
        line_binding_repository: LineBindingRepository | None = None,
        season_repository: SeasonRepository | None = None,
        member_repository: MemberRepository | None = None,
        rule_repository: CopperMineRuleRepository | None = None,
        snapshot_repository: MemberSnapshotRepository | None = None,
    ):
        self.repository = repository or CopperMineRepository()
        self.line_binding_repository = (
            line_binding_repository or LineBindingRepository()
        )
        self.season_repository = season_repository or SeasonRepository()
        self.member_repository = member_repository or MemberRepository()
        self.rule_repository = rule_repository or CopperMineRuleRepository()
        self.snapshot_repository = snapshot_repository or MemberSnapshotRepository()

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

    async def get_rules_for_liff(
        self,
        line_group_id: str
    ) -> list:
        """
        Get copper mine rules for LIFF display

        P1 修復: 讓 LIFF 用戶能看到銅礦申請規則

        Args:
            line_group_id: LINE group ID

        Returns:
            List of CopperMineRuleResponse
        """
        alliance_id = await self._get_alliance_id_from_group(line_group_id)
        rules = await self.rule_repository.get_rules_by_alliance(alliance_id)

        return [
            {
                "tier": rule.tier,
                "required_merit": rule.required_merit,
                "allowed_level": rule.allowed_level,
            }
            for rule in sorted(rules, key=lambda r: r.tier)
        ]

    async def get_mines_list(
        self,
        line_group_id: str,
        line_user_id: str
    ) -> CopperMineListResponse:
        """
        Get copper mines list for LIFF display

        顯示全同盟銅礦位置（設計決策：銅礦位置為公開資訊）
        刪除權限由 delete_mine 單獨控制（只能刪除自己的）

        P0 修復: 新增用戶銅礦申請狀態（my_count, max_allowed）

        Args:
            line_group_id: LINE group ID
            line_user_id: LINE user ID

        Returns:
            CopperMineListResponse with all alliance mines and user quota info
        """
        alliance_id = await self._get_alliance_id_from_group(line_group_id)

        # 獲取當前活動賽季
        active_season_id = await self._get_active_season(alliance_id)

        # 只顯示當前賽季的銅礦（公開資訊）
        mines = await self.repository.get_mines_by_alliance(
            alliance_id,
            season_id=active_season_id
        )

        # P0 修復: 計算用戶銅礦申請狀態
        # 取得規則數量作為上限
        rules = await self.rule_repository.get_rules_by_alliance(alliance_id)
        max_allowed = len(rules)

        # 計算用戶已申請的銅礦數量
        # 需要先取得用戶綁定的 game_ids
        my_count = 0
        member_bindings = await self.line_binding_repository.get_member_bindings_by_line_user(
            alliance_id, line_user_id
        )
        if member_bindings:
            my_game_ids = {b.game_id for b in member_bindings}
            my_count = sum(1 for mine in mines if mine.game_id in my_game_ids)

        return CopperMineListResponse(
            mines=[self._to_response(mine) for mine in mines],
            total=len(mines),
            my_count=my_count,
            max_allowed=max_allowed
        )

    async def _get_active_season(self, alliance_id: UUID) -> UUID | None:
        """Get active season ID for an alliance"""
        season = await self.season_repository.get_active_season(alliance_id)
        return season.id if season else None

    async def _match_member_id(self, alliance_id: UUID, game_id: str) -> UUID | None:
        """Try to match game_id to a member"""
        member = await self.member_repository.get_by_name(alliance_id, game_id)
        return member.id if member else None

    async def _check_coord_available(
        self,
        alliance_id: UUID,
        coord_x: int,
        coord_y: int,
        season_id: UUID | None = None
    ) -> None:
        """
        Check if coordinates are available for a new copper mine.

        P0 修復: 統一座標唯一性驗證邏輯
        - 當有 season_id 時，只檢查該賽季內是否重複
        - 當沒有 season_id 時，檢查整個同盟是否重複

        Args:
            alliance_id: Alliance UUID
            coord_x: X coordinate
            coord_y: Y coordinate
            season_id: Optional season UUID for scoped check

        Raises:
            HTTPException 409: If coordinates are already taken
        """
        existing = await self.repository.get_mine_by_coords(
            alliance_id=alliance_id,
            coord_x=coord_x,
            coord_y=coord_y,
            season_id=season_id
        )
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"座標 ({coord_x}, {coord_y}) 已被註冊"
            )

    def _is_level_allowed(self, level: int, allowed_level: AllowedLevel) -> bool:
        """
        Check if the mine level is allowed by the rule.

        Args:
            level: Mine level (9 or 10)
            allowed_level: Rule's allowed level setting

        Returns:
            True if level is allowed
        """
        if allowed_level == "both":
            return True
        if allowed_level == "nine" and level == 9:
            return True
        if allowed_level == "ten" and level == 10:
            return True
        return False

    async def _validate_rule(
        self,
        alliance_id: UUID,
        member_id: UUID | None,
        season_id: UUID | None,
        level: int
    ) -> None:
        """
        Validate copper mine registration against alliance rules.

        P0 修復: 銅礦上限驗證邏輯

        Rules validation:
        1. Get all rules to determine max allowed mines
        2. Check member's current mine count in the season
        3. Validate not exceeding max allowed
        4. Validate member's total_merit >= rule.required_merit
        5. Validate level matches rule.allowed_level

        Args:
            alliance_id: Alliance UUID
            member_id: Member UUID (may be None if not matched)
            season_id: Season UUID (may be None if no active season)
            level: Mine level (1-10)

        Raises:
            HTTPException 403: If rule validation fails
        """
        # 1. 取得所有規則，規則數量 = 銅礦上限
        all_rules = await self.rule_repository.get_rules_by_alliance(alliance_id)
        max_allowed = len(all_rules)

        # 如果沒有設定任何規則，不允許申請銅礦
        if max_allowed == 0:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="同盟尚未設定銅礦規則，請聯繫盟主"
            )

        # 2. 如果無法識別成員身份，無法驗證個人上限
        # 至少驗證等級是否符合第一座銅礦的規則
        if not member_id or not season_id:
            first_rule = all_rules[0]  # 一定存在，因為 max_allowed > 0
            if not self._is_level_allowed(level, first_rule.allowed_level):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"銅礦等級限制：{LEVEL_TEXT[first_rule.allowed_level]}"
                )
            return

        # 3. 檢查是否已達上限
        current_count = await self.repository.count_member_mines(season_id, member_id)

        if current_count >= max_allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"已達銅礦上限（{current_count}/{max_allowed} 座）"
            )

        next_tier = current_count + 1

        # 4. 取得下一座銅礦的規則（一定存在，因為 current_count < max_allowed）
        rule = await self.rule_repository.get_rule_by_tier(alliance_id, next_tier)

        if not rule:
            # 防禦性檢查：理論上不應該發生
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"第 {next_tier} 座銅礦規則未設定"
            )

        # 5. 取得成員快照驗證戰功
        snapshot = await self.snapshot_repository.get_latest_by_member_in_season(
            member_id, season_id
        )

        if snapshot:
            # 驗證戰功要求
            if snapshot.total_merit < rule.required_merit:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"總戰功不足：需要 {rule.required_merit:,}，目前 {snapshot.total_merit:,}"
                )

        # 6. 驗證等級限制
        if not self._is_level_allowed(level, rule.allowed_level):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"第 {next_tier} 座銅礦只能申請{LEVEL_TEXT[rule.allowed_level]}"
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

        # Auto-fill season_id and member_id first (needed for coord check)
        season_id = await self._get_active_season(alliance_id)
        member_id = await self._match_member_id(alliance_id, game_id)

        # P0 修復: 使用統一的座標檢查方法
        # 當有活躍賽季時，只檢查該賽季內的座標
        await self._check_coord_available(
            alliance_id=alliance_id,
            coord_x=coord_x,
            coord_y=coord_y,
            season_id=season_id
        )

        # P1 修復: 驗證銅礦申請規則
        await self._validate_rule(
            alliance_id=alliance_id,
            member_id=member_id,
            season_id=season_id,
            level=level
        )

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

        P0 修復: 添加所有權驗證，只能刪除自己註冊的銅礦

        Args:
            mine_id: Mine UUID to delete
            line_group_id: LINE group ID (for authorization)
            line_user_id: LINE user ID (for authorization)

        Returns:
            True if deleted

        Raises:
            HTTPException 404: If group not bound or mine not found
            HTTPException 403: If user is not the owner of the mine
        """
        # Validate group binding
        await self._get_alliance_id_from_group(line_group_id)

        # P0 修復: 獲取銅礦並驗證所有權
        mine = await self.repository.get_by_id(mine_id)
        if not mine:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Copper mine not found"
            )

        # P0 修復: 驗證是否為本人註冊
        if mine.registered_by_line_user_id != line_user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="只能刪除自己註冊的銅礦"
            )

        deleted = await self.repository.delete_mine(mine_id)
        if not deleted:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Failed to delete copper mine"
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
        Get copper mine ownerships for Dashboard display.

        P2 修復: 使用批次查詢避免 N+1 問題
        原本: 1 + N*3 queries (N = ownership 數量)
        優化後: 4 queries (ownerships + members + bindings + snapshots)
        """
        # 1. Get raw ownership data
        ownerships = await self.repository.get_ownerships_by_season_simple(season_id)
        if not ownerships:
            return []

        # 2. Collect unique member_ids and game_ids
        member_ids: list[UUID] = []
        game_ids: list[str] = []
        for ownership in ownerships:
            if ownership.get("member_id"):
                member_ids.append(UUID(ownership["member_id"]))
            if ownership.get("game_id"):
                game_ids.append(ownership["game_id"])

        # 3. Batch fetch all related data
        members_list = await self.member_repository.get_by_ids(member_ids) if member_ids else []
        bindings_list = await self.line_binding_repository.get_member_bindings_by_game_ids(
            alliance_id, game_ids
        ) if game_ids else []
        snapshots_map = await self.snapshot_repository.get_latest_by_members_in_season(
            member_ids, season_id
        ) if member_ids else {}

        # 4. Build lookup maps
        members_map = {str(m.id): m for m in members_list}
        bindings_map = {b.game_id: b for b in bindings_list}

        # 5. Build response list
        responses = []
        for ownership in ownerships:
            member_id = ownership.get("member_id")
            member_name = ownership.get("game_id", "Unknown")
            member_group = None
            line_display_name = None

            if member_id:
                member = members_map.get(member_id)
                if member:
                    member_name = member.name
                    binding = bindings_map.get(member_name)
                    if binding:
                        line_display_name = binding.line_display_name

                snapshot = snapshots_map.get(member_id)
                if snapshot:
                    member_group = snapshot.group_name

            # P1 修復: 判斷註冊來源
            registered_by = ownership.get("registered_by_line_user_id", "dashboard")
            registered_via = "dashboard" if registered_by == "dashboard" else "liff"

            responses.append(CopperMineOwnershipResponse(
                id=str(ownership["id"]),
                season_id=str(ownership["season_id"]),
                member_id=str(member_id) if member_id else None,
                coord_x=ownership["coord_x"],
                coord_y=ownership["coord_y"],
                level=ownership["level"],
                applied_at=ownership["registered_at"],
                created_at=ownership["registered_at"],
                registered_via=registered_via,
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
        """
        Get latest snapshot for a member in a season.

        P1 修復: 實作快照查詢以取得 group_name

        Args:
            member_id: Member UUID
            season_id: Season UUID

        Returns:
            Dict with snapshot data including group_name, or None
        """
        snapshot = await self.snapshot_repository.get_latest_by_member_in_season(
            member_id, season_id
        )
        if not snapshot:
            return None

        return {
            "group_name": snapshot.group_name,
            "total_merit": snapshot.total_merit,
        }

    async def create_ownership(
        self,
        season_id: UUID,
        alliance_id: UUID,
        member_id: UUID | None,
        coord_x: int,
        coord_y: int,
        level: int,
        applied_at: datetime | None = None
    ) -> CopperMineOwnershipResponse:
        """
        Create a copper mine ownership (Dashboard)

        P0 修復: 添加規則驗證，確保 Dashboard 和 LIFF 行為一致

        Args:
            season_id: Season UUID
            alliance_id: Alliance UUID
            member_id: Member UUID, or None for reserved mines
            coord_x: X coordinate
            coord_y: Y coordinate
            level: Mine level (9 or 10)
            applied_at: Optional application date

        Raises:
            HTTPException 404: If member not found
            HTTPException 403: If rule validation fails
            HTTPException 409: If coordinates already taken
        """
        # Handle reserved copper mines (no member validation)
        is_reserved = member_id is None
        member_name = "【預留獎勵】" if is_reserved else None

        if not is_reserved:
            # Validate member exists
            member = await self.member_repository.get_by_id(member_id)
            if not member:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Member not found"
                )
            member_name = member.name

        # P0 修復: 使用統一的座標檢查方法
        await self._check_coord_available(
            alliance_id=alliance_id,
            coord_x=coord_x,
            coord_y=coord_y,
            season_id=season_id
        )

        # P0 修復: 驗證銅礦申請規則（與 LIFF 行為一致）
        # Skip validation for reserved mines
        if not is_reserved:
            await self._validate_rule(
                alliance_id=alliance_id,
                member_id=member_id,
                season_id=season_id,
                level=level
            )

        # Create ownership
        mine = await self.repository.create_ownership(
            season_id=season_id,
            alliance_id=alliance_id,
            member_id=member_id,
            game_id=member_name,
            coord_x=coord_x,
            coord_y=coord_y,
            level=level,
            applied_at=applied_at,
        )

        return CopperMineOwnershipResponse(
            id=str(mine.id),
            season_id=str(season_id),
            member_id=str(member_id) if member_id else None,
            coord_x=mine.coord_x,
            coord_y=mine.coord_y,
            level=mine.level,
            applied_at=mine.registered_at,
            created_at=mine.registered_at,
            member_name=member_name,
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

    async def update_ownership(
        self,
        ownership_id: UUID,
        season_id: UUID,
        alliance_id: UUID,
        member_id: UUID
    ) -> CopperMineOwnershipResponse:
        """
        Update a copper mine ownership (for transferring reserved mines to members)

        Args:
            ownership_id: Ownership UUID to update
            season_id: Season UUID
            alliance_id: Alliance UUID (for authorization)
            member_id: New member UUID

        Returns:
            Updated ownership response

        Raises:
            HTTPException 404: If ownership or member not found
            HTTPException 403: If ownership doesn't belong to alliance or rule validation fails
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

        # Validate new member exists
        member = await self.member_repository.get_by_id(member_id)
        if not member:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Member not found"
            )

        # Validate rules for the new member
        await self._validate_rule(
            alliance_id=alliance_id,
            member_id=member_id,
            season_id=season_id,
            level=ownership.level
        )

        # Update the ownership
        updated_mine = await self.repository.update_ownership(
            ownership_id=ownership_id,
            member_id=member_id,
            game_id=member.name
        )

        return CopperMineOwnershipResponse(
            id=str(updated_mine.id),
            season_id=str(season_id),
            member_id=str(member_id),
            coord_x=updated_mine.coord_x,
            coord_y=updated_mine.coord_y,
            level=updated_mine.level,
            applied_at=updated_mine.registered_at,
            created_at=updated_mine.registered_at,
            member_name=member.name,
            member_group=None,
            line_display_name=None,
        )
