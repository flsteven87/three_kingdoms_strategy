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
from src.models.copper_mine_coordinate import (
    CopperCoordinateLookupResult,
    CopperCoordinateSearchResult,
)
from src.repositories.copper_mine_coordinate_repository import CopperMineCoordinateRepository
from src.repositories.copper_mine_repository import CopperMineRepository
from src.repositories.copper_mine_rule_repository import CopperMineRuleRepository
from src.repositories.line_binding_repository import LineBindingRepository
from src.repositories.member_repository import MemberRepository
from src.repositories.member_snapshot_repository import MemberSnapshotRepository
from src.repositories.season_repository import SeasonRepository

# 等級文字對照表（避免重複定義）
LEVEL_TEXT = {"nine": "9 級", "ten": "10 級", "both": "9 或 10 級"}


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
        coordinate_repository: CopperMineCoordinateRepository | None = None,
    ):
        self.repository = repository or CopperMineRepository()
        self.line_binding_repository = line_binding_repository or LineBindingRepository()
        self.season_repository = season_repository or SeasonRepository()
        self.member_repository = member_repository or MemberRepository()
        self.rule_repository = rule_repository or CopperMineRuleRepository()
        self.snapshot_repository = snapshot_repository or MemberSnapshotRepository()
        self.coordinate_repository = coordinate_repository or CopperMineCoordinateRepository()

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
                status_code=status.HTTP_404_NOT_FOUND, detail="Group not bound to any alliance"
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
            registered_at=mine.registered_at,
        )

    async def get_rules_for_liff(self, line_group_id: str) -> list:
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

    async def get_mines_list(self, line_group_id: str, line_user_id: str) -> CopperMineListResponse:
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

        # 獲取當前選中的賽季
        # 如果沒有當前賽季，current_season_id 為 None，會顯示所有銅礦（跨賽季歷史資料）
        current_season_id = await self._get_current_season_id(alliance_id)

        # 只顯示當前賽季的銅礦（公開資訊）
        # 當 current_season_id 為 None 時，repository 會返回所有銅礦
        mines = await self.repository.get_mines_by_alliance(
            alliance_id, season_id=current_season_id
        )

        # P0 修復: 計算用戶銅礦申請狀態
        # 取得規則數量作為上限
        rules = await self.rule_repository.get_rules_by_alliance(alliance_id)
        max_allowed = len(rules)

        # Check if source of truth data exists for this season
        game_season_tag = await self._get_game_season_tag(current_season_id)
        has_source_data = False
        available_counties: list[str] = []
        if game_season_tag:
            has_source_data = await self.coordinate_repository.has_data(game_season_tag)
            if has_source_data:
                available_counties = await self.coordinate_repository.list_searchable_counties(
                    game_season_tag, level_filter=[9, 10]
                )

        # 計算每個綁定 game_id 的銅礦數量
        mine_counts_by_game_id: dict[str, int] = {}
        member_bindings = await self.line_binding_repository.get_member_bindings_by_line_user(
            alliance_id, line_user_id
        )
        if member_bindings:
            my_game_ids = {b.game_id for b in member_bindings}
            # 為每個綁定的 game_id 初始化計數為 0
            mine_counts_by_game_id = dict.fromkeys(my_game_ids, 0)
            # 計算每個 game_id 的銅礦數量
            for mine in mines:
                if mine.game_id in my_game_ids:
                    mine_counts_by_game_id[mine.game_id] += 1

        return CopperMineListResponse(
            mines=[self._to_response(mine) for mine in mines],
            total=len(mines),
            mine_counts_by_game_id=mine_counts_by_game_id,
            max_allowed=max_allowed,
            has_source_data=has_source_data,
            current_game_season_tag=game_season_tag,
            available_counties=available_counties,
        )

    async def _get_current_season_id(self, alliance_id: UUID) -> UUID | None:
        """Get current (selected) season ID for an alliance."""
        season = await self.season_repository.get_current_season(alliance_id)
        return season.id if season else None

    async def _match_member_id(self, alliance_id: UUID, game_id: str) -> UUID | None:
        """Try to match game_id to a member"""
        member = await self.member_repository.get_by_name(alliance_id, game_id)
        return member.id if member else None

    async def _get_game_season_tag(self, season_id: UUID | None) -> str | None:
        """Get game_season_tag from a season, returning None if not set or no season."""
        if not season_id:
            return None
        season = await self.season_repository.get_by_id(season_id)
        if not season:
            return None
        return season.game_season_tag

    async def _resolve_level_from_source(
        self, game_season_tag: str | None, coord_x: int, coord_y: int, level: int
    ) -> int:
        """
        Resolve copper mine level against source-of-truth reference data.

        Contract: never raises — coordinate presence is a soft signal.
        - No tag or no reference data → return user-provided level
        - Coord found in source → return source level (silent override)
        - Coord NOT found in source → return user-provided level
          (warning surfaced at lookup layer so the UI can hint before submit)
        """
        if not game_season_tag:
            return level

        has_data = await self.coordinate_repository.has_data(game_season_tag)
        if not has_data:
            return level

        coordinate = await self.coordinate_repository.get_by_coords(
            game_season_tag, coord_x, coord_y
        )
        if not coordinate:
            return level
        return coordinate.level

    async def _check_coord_available(
        self, alliance_id: UUID, coord_x: int, coord_y: int, season_id: UUID | None = None
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
            alliance_id=alliance_id, coord_x=coord_x, coord_y=coord_y, season_id=season_id
        )
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT, detail=f"座標 ({coord_x}, {coord_y}) 已被註冊"
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
        self, alliance_id: UUID, member_id: UUID | None, season_id: UUID | None, level: int
    ) -> int | None:
        """
        Validate copper mine registration against alliance rules.

        Flexible tier system:
        - Users can skip tiers if they have enough merit and level matches
        - System tracks which tiers have been claimed to prevent double-claiming
        - Returns the claimed tier number for storage

        Args:
            alliance_id: Alliance UUID
            member_id: Member UUID (may be None if not matched)
            season_id: Season UUID (may be None if no active season)
            level: Mine level (9 or 10)

        Returns:
            The tier number that was claimed (to be stored with the mine)

        Raises:
            HTTPException 403: If rule validation fails
        """
        # 1. 取得所有規則，規則數量 = 銅礦上限
        all_rules = await self.rule_repository.get_rules_by_alliance(alliance_id)
        max_allowed = len(all_rules)

        # 如果沒有設定任何規則，不允許申請銅礦
        if max_allowed == 0:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail="同盟尚未設定銅礦規則，請聯繫盟主"
            )

        # 2. 如果無法識別成員身份，無法驗證個人上限
        # 至少驗證等級是否符合第一座銅礦的規則
        if not member_id or not season_id:
            first_rule = all_rules[0]  # 一定存在，因為 max_allowed > 0
            if not self._is_level_allowed(level, first_rule.allowed_level):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"銅礦等級限制：{LEVEL_TEXT[first_rule.allowed_level]}",
                )
            return None

        # 3. 取得已領取的 tier 集合
        claimed_tiers = await self.repository.get_claimed_tiers(season_id, member_id)

        if len(claimed_tiers) >= max_allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"已達銅礦上限（{len(claimed_tiers)}/{max_allowed} 座）",
            )

        # 4. 取得成員快照驗證戰功
        snapshot = await self.snapshot_repository.get_latest_by_member_in_season(
            member_id, season_id
        )

        if not snapshot:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail="成員戰功不存在，無法驗證戰功要求"
            )

        # 5. 找出符合條件且未被領取的最低階規則
        # 條件：(1) 戰功符合 (2) 等級符合 (3) 該 tier 尚未被領取
        eligible_rule = None
        sorted_rules = sorted(all_rules, key=lambda r: r.tier)

        for candidate_rule in sorted_rules:
            # 跳過已領取的 tier
            if candidate_rule.tier in claimed_tiers:
                continue
            # 檢查戰功是否符合
            if snapshot.total_merit < candidate_rule.required_merit:
                continue
            # 檢查等級是否符合
            if not self._is_level_allowed(level, candidate_rule.allowed_level):
                continue
            # 找到第一個符合的規則
            eligible_rule = candidate_rule
            break

        if not eligible_rule:
            # 沒有符合的規則，給出明確的錯誤訊息
            # 檢查是所有已領取、戰功不足、還是等級不符
            unclaimed_rules = [r for r in sorted_rules if r.tier not in claimed_tiers]
            if not unclaimed_rules:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"已達銅礦上限（{len(claimed_tiers)}/{max_allowed} 座）",
                )

            # 檢查是否有符合戰功但等級不符的規則
            merit_ok_rules = [
                r for r in unclaimed_rules if snapshot.total_merit >= r.required_merit
            ]
            if merit_ok_rules:
                # 有符合戰功的，但等級不符
                allowed_levels = set()
                for r in merit_ok_rules:
                    if r.allowed_level == "nine":
                        allowed_levels.add("9級")
                    elif r.allowed_level == "ten":
                        allowed_levels.add("10級")
                    else:
                        allowed_levels.add("9或10級")
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"目前可申請的銅礦等級：{', '.join(sorted(allowed_levels))}",
                )
            else:
                # 戰功不足
                next_rule = unclaimed_rules[0]
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"總戰功不足：需要 {next_rule.required_merit:,}，目前 {snapshot.total_merit:,}",
                )

        return eligible_rule.tier

    async def register_mine(
        self,
        line_group_id: str,
        line_user_id: str,
        game_id: str,
        coord_x: int,
        coord_y: int,
        level: int,
        notes: str | None = None,
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
        season_id = await self._get_current_season_id(alliance_id)
        member_id = await self._match_member_id(alliance_id, game_id)

        # Source of truth: validate coordinates and override level
        game_season_tag = await self._get_game_season_tag(season_id)
        level = await self._resolve_level_from_source(game_season_tag, coord_x, coord_y, level)

        # P0 修復: 使用統一的座標檢查方法
        # 當有活躍賽季時，只檢查該賽季內的座標
        await self._check_coord_available(
            alliance_id=alliance_id, coord_x=coord_x, coord_y=coord_y, season_id=season_id
        )

        # P1 修復: 驗證銅礦申請規則，返回領取的 tier
        claimed_tier = await self._validate_rule(
            alliance_id=alliance_id, member_id=member_id, season_id=season_id, level=level
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
            claimed_tier=claimed_tier,
        )

        return RegisterCopperResponse(
            success=True,
            mine=self._to_response(mine),
            message="Copper mine registered successfully",
        )

    async def delete_mine(self, mine_id: UUID, line_group_id: str, line_user_id: str) -> bool:
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
                status_code=status.HTTP_404_NOT_FOUND, detail="Copper mine not found"
            )

        # P0 修復: 驗證是否為本人註冊
        if mine.registered_by_line_user_id != line_user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail="只能刪除自己註冊的銅礦"
            )

        deleted = await self.repository.delete_mine(mine_id)
        if not deleted:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Failed to delete copper mine"
            )

        return True

    # =========================================================================
    # Dashboard Methods
    # =========================================================================

    async def get_ownerships_by_season(
        self, season_id: UUID, alliance_id: UUID
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
        bindings_list = (
            await self.line_binding_repository.get_member_bindings_by_game_ids(
                alliance_id, game_ids
            )
            if game_ids
            else []
        )
        snapshots_map = (
            await self.snapshot_repository.get_latest_by_members_in_season(member_ids, season_id)
            if member_ids
            else {}
        )

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

            responses.append(
                CopperMineOwnershipResponse(
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
                )
            )

        return responses

    async def _get_latest_snapshot(self, member_id: UUID, season_id: UUID) -> dict | None:
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
        applied_at: datetime | None = None,
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
                    status_code=status.HTTP_404_NOT_FOUND, detail="Member not found"
                )
            member_name = member.name

        # P0 修復: 使用統一的座標檢查方法
        await self._check_coord_available(
            alliance_id=alliance_id, coord_x=coord_x, coord_y=coord_y, season_id=season_id
        )

        # Source of truth: validate coordinates and override level
        game_season_tag = await self._get_game_season_tag(season_id)
        level = await self._resolve_level_from_source(game_season_tag, coord_x, coord_y, level)

        # P0 修復: 驗證銅礦申請規則（與 LIFF 行為一致）
        # Skip validation for reserved mines
        claimed_tier = None
        if not is_reserved:
            claimed_tier = await self._validate_rule(
                alliance_id=alliance_id, member_id=member_id, season_id=season_id, level=level
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
            claimed_tier=claimed_tier,
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

    async def delete_ownership(self, ownership_id: UUID, alliance_id: UUID) -> bool:
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
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ownership not found")

        if ownership.alliance_id != alliance_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Ownership does not belong to this alliance",
            )

        deleted = await self.repository.delete_mine(ownership_id)
        if not deleted:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Failed to delete ownership"
            )

        return True

    async def update_ownership(
        self, ownership_id: UUID, season_id: UUID, alliance_id: UUID, member_id: UUID
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
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ownership not found")

        if ownership.alliance_id != alliance_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Ownership does not belong to this alliance",
            )

        # Validate new member exists
        member = await self.member_repository.get_by_id(member_id)
        if not member:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")

        # Validate rules for the new member
        await self._validate_rule(
            alliance_id=alliance_id, member_id=member_id, season_id=season_id, level=ownership.level
        )

        # Update the ownership
        updated_mine = await self.repository.update_ownership(
            ownership_id=ownership_id, member_id=member_id, game_id=member.name
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

    # =========================================================================
    # Search Methods (Source of Truth)
    # =========================================================================

    async def search_copper_coordinates(
        self, line_group_id: str, query: str
    ) -> list[CopperCoordinateSearchResult]:
        """
        Search available 9/10 copper mine coordinates by county/district name (LIFF).

        Args:
            line_group_id: LINE group ID
            query: Search text for county/district name

        Returns:
            List of matching coordinates with availability info
        """
        alliance_id = await self._get_alliance_id_from_group(line_group_id)
        season_id = await self._get_current_season_id(alliance_id)
        game_season_tag = await self._get_game_season_tag(season_id)

        if not game_season_tag:
            return []

        has_data = await self.coordinate_repository.has_data(game_season_tag)
        if not has_data:
            return []

        # Search for 9/10 level coordinates
        coordinates = await self.coordinate_repository.search_by_location(
            game_season_tag, query, level_filter=[9, 10]
        )

        if not coordinates:
            return []

        # Get registered mines in current season to mark taken ones
        registered_mines = await self.repository.get_mines_by_alliance(
            alliance_id, season_id=season_id
        )
        taken_coords = {(m.coord_x, m.coord_y) for m in registered_mines}

        return [
            CopperCoordinateSearchResult(
                coord_x=c.coord_x,
                coord_y=c.coord_y,
                level=c.level,
                county=c.county,
                district=c.district,
                is_taken=(c.coord_x, c.coord_y) in taken_coords,
            )
            for c in coordinates
        ]

    async def lookup_copper_coordinate(
        self, line_group_id: str, coord_x: int, coord_y: int
    ) -> CopperCoordinateLookupResult:
        """
        Look up a single coordinate with optional source-of-truth enrichment (LIFF).

        Returns county/level when reference data exists, plus current registration status.
        """
        alliance_id = await self._get_alliance_id_from_group(line_group_id)
        season_id = await self._get_current_season_id(alliance_id)
        game_season_tag = await self._get_game_season_tag(season_id)
        existing_mine = await self.repository.get_mine_by_coords(
            alliance_id=alliance_id, coord_x=coord_x, coord_y=coord_y, season_id=season_id
        )

        has_source_data = False
        if game_season_tag:
            has_source_data = await self.coordinate_repository.has_data(game_season_tag)

        if has_source_data and game_season_tag:
            coordinate = await self.coordinate_repository.get_by_coords(
                game_season_tag, coord_x, coord_y
            )
            if not coordinate:
                return CopperCoordinateLookupResult(
                    coord_x=coord_x,
                    coord_y=coord_y,
                    is_taken=existing_mine is not None,
                    can_register=existing_mine is None,
                    requires_manual_level=True,
                    message=(
                        "此座標已被註冊"
                        if existing_mine
                        else f"座標不在 {game_season_tag} 官方資料中，仍可申請，請確認等級"
                    ),
                )

            return CopperCoordinateLookupResult(
                coord_x=coord_x,
                coord_y=coord_y,
                level=coordinate.level,
                county=coordinate.county,
                district=coordinate.district,
                is_taken=existing_mine is not None,
                can_register=existing_mine is None,
                message="此座標已被註冊" if existing_mine else None,
            )

        return CopperCoordinateLookupResult(
            coord_x=coord_x,
            coord_y=coord_y,
            is_taken=existing_mine is not None,
            can_register=existing_mine is None,
            requires_manual_level=True,
            message="此座標已被註冊" if existing_mine else None,
        )

    async def lookup_copper_coordinate_by_season(
        self, season_id: UUID, coord_x: int, coord_y: int
    ) -> CopperCoordinateLookupResult:
        """
        Look up a single coordinate for the Dashboard (season-scoped).

        Mirror of `lookup_copper_coordinate` (LIFF group-scoped) keyed by season_id,
        since the Dashboard form already knows the active season.
        """
        season = await self.season_repository.get_by_id(season_id)
        if not season:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Season not found")
        alliance_id = season.alliance_id
        game_season_tag = season.game_season_tag

        existing_mine = await self.repository.get_mine_by_coords(
            alliance_id=alliance_id, coord_x=coord_x, coord_y=coord_y, season_id=season_id
        )

        has_source_data = False
        if game_season_tag:
            has_source_data = await self.coordinate_repository.has_data(game_season_tag)

        if has_source_data and game_season_tag:
            coordinate = await self.coordinate_repository.get_by_coords(
                game_season_tag, coord_x, coord_y
            )
            if not coordinate:
                return CopperCoordinateLookupResult(
                    coord_x=coord_x,
                    coord_y=coord_y,
                    is_taken=existing_mine is not None,
                    can_register=existing_mine is None,
                    requires_manual_level=True,
                    message=(
                        "此座標已被註冊"
                        if existing_mine
                        else f"座標不在 {game_season_tag} 官方資料中，仍可申請，請確認等級"
                    ),
                )

            return CopperCoordinateLookupResult(
                coord_x=coord_x,
                coord_y=coord_y,
                level=coordinate.level,
                county=coordinate.county,
                district=coordinate.district,
                is_taken=existing_mine is not None,
                can_register=existing_mine is None,
                message="此座標已被註冊" if existing_mine else None,
            )

        return CopperCoordinateLookupResult(
            coord_x=coord_x,
            coord_y=coord_y,
            is_taken=existing_mine is not None,
            can_register=existing_mine is None,
            requires_manual_level=True,
            message="此座標已被註冊" if existing_mine else None,
        )

    async def search_copper_coordinates_by_season(
        self, season_id: UUID, query: str
    ) -> list[CopperCoordinateSearchResult]:
        """
        Search available 9/10 copper mine coordinates by county/district name (Dashboard).

        Args:
            season_id: Season UUID
            query: Search text for county/district name

        Returns:
            List of matching coordinates with availability info
        """
        game_season_tag = await self._get_game_season_tag(season_id)

        if not game_season_tag:
            return []

        has_data = await self.coordinate_repository.has_data(game_season_tag)
        if not has_data:
            return []

        coordinates = await self.coordinate_repository.search_by_location(
            game_season_tag, query, level_filter=[9, 10]
        )

        if not coordinates:
            return []

        # Get season to find alliance_id
        season = await self.season_repository.get_by_id(season_id)
        if not season:
            return []

        registered_mines = await self.repository.get_mines_by_alliance(
            season.alliance_id, season_id=season_id
        )
        taken_coords = {(m.coord_x, m.coord_y) for m in registered_mines}

        return [
            CopperCoordinateSearchResult(
                coord_x=c.coord_x,
                coord_y=c.coord_y,
                level=c.level,
                county=c.county,
                district=c.district,
                is_taken=(c.coord_x, c.coord_y) in taken_coords,
            )
            for c in coordinates
        ]
