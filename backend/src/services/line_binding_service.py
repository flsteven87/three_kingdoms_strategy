"""
LINE Binding Service

Business logic for LINE Bot integration:
- Binding code generation and validation
- Group binding management
- Member registration

符合 CLAUDE.md 🔴:
- Business logic in Service layer
- No direct database calls (uses Repository)
- Exception handling with proper chaining
"""

import asyncio
import logging
import secrets
from datetime import UTC, datetime, timedelta
from uuid import UUID

from fastapi import HTTPException, status

from src.models.battle_event import EventCategory
from src.models.battle_event_metrics import (
    BattleEventMetrics,
    BattleEventMetricsWithMember,
    EventGroupAnalytics,
)
from src.models.line_binding import (
    EventListItem,
    EventListResponse,
    LineBindingCodeResponse,
    LineBindingStatusResponse,
    LineCustomCommand,
    LineCustomCommandCreate,
    LineCustomCommandResponse,
    LineCustomCommandUpdate,
    LineGroupBinding,
    LineGroupBindingResponse,
    MemberCandidate,
    MemberCandidatesResponse,
    MemberInfoResponse,
    MemberLineBinding,
    MemberPerformanceResponse,
    PerformanceMetrics,
    PerformanceRank,
    PerformanceSeasonTotal,
    PerformanceTrendItem,
    RegisteredAccount,
    RegisteredMemberItem,
    RegisteredMembersResponse,
    RegisterMemberResponse,
    SimilarMembersResponse,
    UnregisteredMemberItem,
    UserEventParticipation,
)
from src.repositories.battle_event_metrics_repository import BattleEventMetricsRepository
from src.repositories.battle_event_repository import BattleEventRepository
from src.repositories.line_binding_repository import LineBindingRepository
from src.repositories.season_repository import SeasonRepository
from src.services.analytics import MemberAnalyticsService

logger = logging.getLogger(__name__)

# Constants
BINDING_CODE_LENGTH = 6
BINDING_CODE_EXPIRY_MINUTES = 5
MAX_CODES_PER_HOUR = 3
# Remove confusing characters: 0, O, I, 1
BINDING_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


class LineBindingService:
    """Service for LINE binding operations"""

    def __init__(self, repository: LineBindingRepository | None = None):
        self.repository = repository or LineBindingRepository()
        self._event_repo = BattleEventRepository()
        self._metrics_repo = BattleEventMetricsRepository()
        self._season_repo = SeasonRepository()
        self._analytics_service = MemberAnalyticsService()

    # =========================================================================
    # Common Lookups (used by webhook handlers and endpoints)
    # =========================================================================

    async def get_group_binding(self, line_group_id: str) -> LineGroupBinding | None:
        """Get group binding by LINE group ID."""
        return await self.repository.get_group_binding_by_line_group_id(line_group_id)

    async def get_current_season_id(self, alliance_id: UUID) -> UUID | None:
        """Get the current season ID for an alliance."""
        season = await self._season_repo.get_current_season(alliance_id)
        return season.id if season else None

    async def get_line_names_for_game_ids(
        self, alliance_id: UUID, game_ids: list[str]
    ) -> dict[str, str]:
        """Get LINE display names for a list of game IDs."""
        bindings = await self.repository.get_member_bindings_by_game_ids(
            alliance_id=alliance_id,
            game_ids=game_ids,
        )
        return {b.game_id: b.line_display_name for b in bindings}

    async def enrich_analytics_with_line_names(
        self,
        alliance_id: UUID,
        analytics: EventGroupAnalytics,
    ) -> None:
        """Enrich EventGroupAnalytics ranking lists with LINE display names."""
        game_ids: list[str] = []
        for lst in (
            analytics.top_members,
            analytics.top_contributors,
            analytics.top_assisters,
            analytics.violators,
        ):
            if lst:
                game_ids.extend(m.member_name for m in lst)

        if not game_ids:
            return

        name_map = await self.get_line_names_for_game_ids(
            alliance_id=alliance_id,
            game_ids=list(set(game_ids)),
        )

        for lst in (
            analytics.top_members,
            analytics.top_contributors,
            analytics.top_assisters,
            analytics.violators,
        ):
            for member in lst or []:
                member.line_display_name = name_map.get(member.member_name)

    # =========================================================================
    # Binding Code Operations (Web App)
    # =========================================================================

    async def generate_binding_code(
        self, alliance_id: UUID, user_id: UUID, is_test: bool = False
    ) -> LineBindingCodeResponse:
        """
        Generate a new binding code for an alliance

        Args:
            alliance_id: Alliance UUID
            user_id: User UUID who is generating the code
            is_test: Whether this code is for a test group binding

        Returns:
            LineBindingCodeResponse with code and expiry

        Raises:
            HTTPException 400: If alliance already has same-type group binding
            HTTPException 429: If rate limit exceeded
        """
        # Check if alliance already has same-type binding (production or test)
        existing_binding = await self.repository.get_active_group_binding_by_alliance(
            alliance_id, is_test=is_test
        )
        if existing_binding:
            binding_type = "測試" if is_test else "正式"
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"同盟已有{binding_type}群組綁定",
            )

        # Rate limiting: max 3 codes per hour
        one_hour_ago = datetime.now(UTC) - timedelta(hours=1)
        recent_count = await self.repository.count_recent_codes(alliance_id, one_hour_ago)
        if recent_count >= MAX_CODES_PER_HOUR:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Rate limit exceeded. Please wait before generating a new code.",
            )

        # Generate cryptographically secure code
        code = "".join(secrets.choice(BINDING_CODE_ALPHABET) for _ in range(BINDING_CODE_LENGTH))

        # Calculate expiry time
        expires_at = datetime.now(UTC) + timedelta(minutes=BINDING_CODE_EXPIRY_MINUTES)

        # Create code in database with is_test flag
        binding_code = await self.repository.create_binding_code(
            alliance_id=alliance_id,
            code=code,
            created_by=user_id,
            expires_at=expires_at,
            is_test=is_test,
        )

        return LineBindingCodeResponse(
            code=binding_code.code,
            expires_at=binding_code.expires_at,
            is_test=binding_code.is_test,
            created_at=binding_code.created_at,
        )

    async def get_binding_status(self, alliance_id: UUID) -> LineBindingStatusResponse:
        """
        Get current LINE binding status for an alliance

        Args:
            alliance_id: Alliance UUID

        Returns:
            LineBindingStatusResponse with bindings list and pending code
        """
        # Get all active group bindings (production + test)
        group_bindings = await self.repository.get_all_active_group_bindings_by_alliance(
            alliance_id
        )

        bindings_response = []
        for binding in group_bindings:
            member_count = await self.repository.count_group_members_registered(
                alliance_id, binding.line_group_id
            )
            bindings_response.append(
                LineGroupBindingResponse(
                    id=binding.id,
                    alliance_id=binding.alliance_id,
                    line_group_id=binding.line_group_id,
                    group_name=binding.group_name,
                    group_picture_url=binding.group_picture_url,
                    bound_at=binding.bound_at,
                    is_active=binding.is_active,
                    is_test=binding.is_test,
                    member_count=member_count,
                )
            )

        # Check for pending code
        pending_code = await self.repository.get_pending_code_by_alliance(alliance_id)
        pending_code_response = None

        if pending_code:
            pending_code_response = LineBindingCodeResponse(
                code=pending_code.code,
                expires_at=pending_code.expires_at,
                is_test=pending_code.is_test,
                created_at=pending_code.created_at,
            )

        return LineBindingStatusResponse(
            is_bound=len(bindings_response) > 0,
            bindings=bindings_response,
            pending_code=pending_code_response,
        )

    async def unbind_group(self, alliance_id: UUID, is_test: bool | None = None) -> None:
        """
        Unbind LINE group from alliance

        Args:
            alliance_id: Alliance UUID
            is_test: If specified, unbind only production (False) or test (True) group.
                     If None, unbind the first active binding found.

        Raises:
            HTTPException 404: If no active binding found
        """
        group_binding = await self.repository.get_active_group_binding_by_alliance(
            alliance_id, is_test=is_test
        )

        if not group_binding:
            binding_type = ""
            if is_test is not None:
                binding_type = "測試" if is_test else "正式"
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"找不到{binding_type}群組綁定",
            )

        await self.repository.deactivate_group_binding(group_binding.id)

    async def refresh_group_info(
        self, alliance_id: UUID, is_test: bool | None = None
    ) -> LineGroupBindingResponse:
        """
        Refresh group name and picture from LINE API for an existing binding

        Args:
            alliance_id: Alliance UUID
            is_test: If specified, refresh only production (False) or test (True) group.

        Returns:
            Updated LineGroupBindingResponse

        Raises:
            HTTPException 404: If no active binding found
            HTTPException 502: If failed to fetch group info from LINE API
        """
        from src.core.line_auth import get_group_info

        group_binding = await self.repository.get_active_group_binding_by_alliance(
            alliance_id, is_test=is_test
        )

        if not group_binding:
            binding_type = ""
            if is_test is not None:
                binding_type = "測試" if is_test else "正式"
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"找不到{binding_type}群組綁定",
            )

        # Fetch group info from LINE API
        group_info = get_group_info(group_binding.line_group_id)

        if not group_info or not group_info.name:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Failed to fetch group info from LINE API",
            )

        # Update group info in database
        updated_binding = await self.repository.update_group_info(
            binding_id=group_binding.id,
            group_name=group_info.name,
            group_picture_url=group_info.picture_url,
        )

        # Get member count from group member tracking table
        member_count = await self.repository.count_group_members_registered(
            alliance_id, updated_binding.line_group_id
        )

        return LineGroupBindingResponse(
            id=updated_binding.id,
            alliance_id=updated_binding.alliance_id,
            line_group_id=updated_binding.line_group_id,
            group_name=updated_binding.group_name,
            group_picture_url=updated_binding.group_picture_url,
            bound_at=updated_binding.bound_at,
            is_active=updated_binding.is_active,
            is_test=updated_binding.is_test,
            member_count=member_count,
        )

    async def get_registered_members(self, alliance_id: UUID) -> RegisteredMembersResponse:
        """
        Get registered and unregistered LINE members in the alliance's active group(s).

        Registered = in group AND has game ID binding.
        Unregistered = in group but NO game ID binding.
        """
        active_bindings = await self.repository.get_all_active_group_bindings_by_alliance(
            alliance_id
        )

        empty = RegisteredMembersResponse(
            members=[], unregistered=[], total=0, unregistered_count=0
        )

        if not active_bindings:
            return empty

        line_group_ids = [b.line_group_id for b in active_bindings]

        all_group_members = await self.repository.get_group_members(line_group_ids)
        if not all_group_members:
            return empty

        # Deduplicate by line_user_id (user may appear in multiple groups)
        group_member_map: dict[str, dict] = {}
        for m in all_group_members:
            uid = m["line_user_id"]
            if uid not in group_member_map or m["tracked_at"] > group_member_map[uid]["tracked_at"]:
                group_member_map[uid] = m

        tracked_user_ids = set(group_member_map.keys())

        # Scoped query: only fetch bindings for users actually in the group
        bindings = await self.repository.get_member_bindings_by_line_user_ids(
            alliance_id, tracked_user_ids
        )

        registered_user_ids = {b.line_user_id for b in bindings}

        members = [
            RegisteredMemberItem(
                line_user_id=b.line_user_id,
                line_display_name=b.line_display_name,
                game_id=b.game_id,
                is_verified=b.is_verified,
                registered_at=b.created_at,
            )
            for b in bindings
        ]

        unregistered = [
            UnregisteredMemberItem(
                line_user_id=uid,
                line_display_name=group_member_map[uid].get("line_display_name"),
                tracked_at=group_member_map[uid]["tracked_at"],
            )
            for uid in tracked_user_ids - registered_user_ids
        ]

        return RegisteredMembersResponse(
            members=members,
            unregistered=unregistered,
            total=len(members),
            unregistered_count=len(unregistered),
        )

    async def search_registered_members(
        self, line_group_id: str, query: str
    ) -> list[MemberLineBinding]:
        """Search registered members for a group by game ID or LINE user ID.

        First searches by game ID. If no results found, searches by LINE user ID.

        Returns a list of MemberLineBinding instances (may be empty).
        """
        group_binding = await self.repository.get_group_binding_by_line_group_id(line_group_id)
        if not group_binding:
            return []

        results = await self.repository.search_id_bindings(group_binding.alliance_id, query)
        return results

    # =========================================================================
    # Group Binding Operations (Webhook)
    # =========================================================================

    async def validate_and_bind_group(
        self,
        code: str,
        line_group_id: str,
        line_user_id: str,
        group_name: str | None = None,
        group_picture_url: str | None = None,
    ) -> tuple[bool, str, UUID | None]:
        """
        Validate binding code and create group binding

        Args:
            code: Binding code from user
            line_group_id: LINE group ID
            line_user_id: LINE user ID who initiated binding
            group_name: Optional group name
            group_picture_url: Optional group picture URL

        Returns:
            Tuple of (success, message, alliance_id)
        """
        # Validate code
        code_upper = code.upper()
        logger.info(f"[BIND] Attempting to validate code: {code_upper}")
        binding_code = await self.repository.get_valid_code(code_upper)
        if not binding_code:
            logger.warning(f"[BIND] Code not found or expired: {code_upper}")
            return False, "綁定碼無效或已過期", None
        logger.info(
            f"[BIND] Code valid: {code_upper}, is_test={binding_code.is_test}, expires_at={binding_code.expires_at}"
        )

        # Get is_test from the binding code
        is_test = binding_code.is_test

        # Check if group is already bound (regardless of is_test)
        existing_binding = await self.repository.get_group_binding_by_line_group_id(line_group_id)
        if existing_binding:
            return False, "此群組已綁定到其他同盟", None

        # Check if alliance already has same-type binding (production or test)
        alliance_binding = await self.repository.get_active_group_binding_by_alliance(
            binding_code.alliance_id, is_test=is_test
        )
        if alliance_binding:
            binding_type = "測試" if is_test else "正式"
            return False, f"此同盟已有{binding_type}群組綁定", None

        # Create group binding with is_test from code
        await self.repository.create_group_binding(
            alliance_id=binding_code.alliance_id,
            line_group_id=line_group_id,
            bound_by_line_user_id=line_user_id,
            group_name=group_name,
            group_picture_url=group_picture_url,
            is_test=is_test,
        )

        # Mark code as used
        await self.repository.mark_code_used(binding_code.id)

        binding_type = "測試" if is_test else ""
        return True, f"{binding_type}綁定成功！", binding_code.alliance_id

    # =========================================================================
    # Member Registration Operations (LIFF)
    # =========================================================================

    @staticmethod
    def _bindings_to_registered_accounts(
        bindings: list[MemberLineBinding],
    ) -> list[RegisteredAccount]:
        """Convert binding models to RegisteredAccount response objects."""
        return [
            RegisteredAccount(
                game_id=b.game_id,
                display_name=b.line_display_name,
                is_verified=b.is_verified,
                created_at=b.created_at,
            )
            for b in bindings
        ]

    async def get_member_info(self, line_user_id: str, line_group_id: str) -> MemberInfoResponse:
        """
        Get member info for LIFF display

        Args:
            line_user_id: LINE user ID
            line_group_id: LINE group ID

        Returns:
            MemberInfoResponse with registration status

        Raises:
            HTTPException 404: If group not bound to any alliance
        """
        # Find alliance by group ID
        group_binding = await self.repository.get_group_binding_by_line_group_id(line_group_id)

        if not group_binding:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Group not bound to any alliance"
            )

        # Get user's registrations
        bindings = await self.repository.get_member_bindings_by_line_user(
            alliance_id=group_binding.alliance_id, line_user_id=line_user_id
        )

        registered_ids = self._bindings_to_registered_accounts(bindings)

        return MemberInfoResponse(
            has_registered=len(registered_ids) > 0,
            registered_ids=registered_ids,
            alliance_name=None,  # Could fetch from alliance table if needed
        )

    async def register_member(
        self, line_group_id: str, line_user_id: str, line_display_name: str, game_id: str
    ) -> RegisterMemberResponse:
        """
        Register a game ID for a LINE user

        Args:
            line_group_id: LINE group ID
            line_user_id: LINE user ID
            line_display_name: LINE display name
            game_id: Game ID to register

        Returns:
            RegisterMemberResponse with updated registration list

        Raises:
            HTTPException 404: If group not bound
            HTTPException 409: If game ID already registered by another user
        """
        # Find alliance by group ID
        group_binding = await self.repository.get_group_binding_by_line_group_id(line_group_id)

        if not group_binding:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Group not bound to any alliance"
            )

        alliance_id = group_binding.alliance_id

        # Check if game ID already registered
        existing = await self.repository.get_member_binding_by_game_id(
            alliance_id=alliance_id, game_id=game_id
        )

        if existing and existing.line_user_id != line_user_id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Game ID already registered by another user",
            )

        if existing and existing.line_user_id == line_user_id:
            # Same user re-registering same game_id (e.g. after group re-binding).
            # Update group_binding_id so the member appears in the new group's list.
            if existing.group_binding_id != group_binding.id:
                await self.repository.update_member_binding_group(
                    binding_id=existing.id, group_binding_id=group_binding.id
                )
        else:
            # Try to auto-match with existing member
            member_id = await self.repository.find_member_by_name(
                alliance_id=alliance_id, name=game_id
            )

            # Create new binding
            await self.repository.create_member_binding(
                alliance_id=alliance_id,
                line_user_id=line_user_id,
                line_display_name=line_display_name,
                game_id=game_id,
                member_id=member_id,
                group_binding_id=group_binding.id,
            )

        # Return updated list
        bindings = await self.repository.get_member_bindings_by_line_user(
            alliance_id=alliance_id, line_user_id=line_user_id
        )

        registered_ids = self._bindings_to_registered_accounts(bindings)

        return RegisterMemberResponse(has_registered=True, registered_ids=registered_ids)

    async def unregister_member(
        self, line_group_id: str, line_user_id: str, game_id: str
    ) -> RegisterMemberResponse:
        """
        Unregister a game ID for a LINE user

        Args:
            line_group_id: LINE group ID
            line_user_id: LINE user ID
            game_id: Game ID to unregister

        Returns:
            RegisterMemberResponse with updated registration list

        Raises:
            HTTPException 404: If group not bound or game ID not found
            HTTPException 403: If game ID belongs to another user
        """
        # Find alliance by group ID
        group_binding = await self.repository.get_group_binding_by_line_group_id(line_group_id)

        if not group_binding:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Group not bound to any alliance"
            )

        alliance_id = group_binding.alliance_id

        # Verify ownership
        existing = await self.repository.get_member_binding_by_game_id(
            alliance_id=alliance_id, game_id=game_id
        )

        if not existing:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Game ID not registered"
            )

        if existing.line_user_id != line_user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail="Game ID belongs to another user"
            )

        # Delete binding
        await self.repository.delete_member_binding(
            alliance_id=alliance_id, line_user_id=line_user_id, game_id=game_id
        )

        # Return updated list
        bindings = await self.repository.get_member_bindings_by_line_user(
            alliance_id=alliance_id, line_user_id=line_user_id
        )

        registered_ids = self._bindings_to_registered_accounts(bindings)

        return RegisterMemberResponse(
            has_registered=len(registered_ids) > 0, registered_ids=registered_ids
        )

    # =========================================================================
    # LIFF Notification Operations (Webhook - 30 分鐘群組層級 CD 機制)
    # =========================================================================

    # Cooldown period for LIFF notifications (in minutes) - group level
    NOTIFICATION_COOLDOWN_MINUTES = 30

    async def _is_group_in_cooldown(self, line_group_id: str) -> bool:
        """Check if group is within notification cooldown period (30 minutes)"""
        cooldown_threshold = datetime.now(UTC) - timedelta(
            minutes=self.NOTIFICATION_COOLDOWN_MINUTES
        )
        return await self.repository.has_group_been_notified_since(
            line_group_id=line_group_id, since=cooldown_threshold
        )

    async def should_send_liff_notification(self, line_group_id: str, line_user_id: str) -> bool:
        """
        Check if we should send LIFF notification for unregistered user message.
        Single RPC replaces 3 sequential queries.

        Conditions:
        1. Group is bound to an alliance
        2. User has NOT registered any game ID
        3. Group is NOT in cooldown (30 minutes)
        """
        result = await self.repository.check_liff_notification_eligibility(
            line_group_id, line_user_id, cooldown_minutes=self.NOTIFICATION_COOLDOWN_MINUTES,
        )
        return result["is_bound"] and not result["is_registered"] and not result["in_cooldown"]

    # =========================================================================
    # Group Member Tracking (webhook-based)
    # =========================================================================

    async def track_members_joined(
        self,
        line_group_id: str,
        user_ids: list[str],
        display_names: dict[str, str] | None = None,
    ) -> None:
        """Track users who joined a LINE group (from memberJoined webhook)."""
        names = display_names or {}
        await asyncio.gather(
            *(
                self.repository.upsert_group_member(line_group_id, uid, names.get(uid))
                for uid in user_ids
            )
        )

    async def track_members_left(self, line_group_id: str, user_ids: list[str]) -> None:
        """Remove users who left a LINE group (from memberLeft webhook)."""
        await asyncio.gather(
            *(self.repository.remove_group_member(line_group_id, uid) for uid in user_ids)
        )

    async def track_group_presence(
        self, line_group_id: str, user_id: str, line_display_name: str | None = None
    ) -> None:
        """Track a user's presence from any group event (passive tracking)."""
        await self.repository.upsert_group_member(line_group_id, user_id, line_display_name)

    # =========================================================================
    # LIFF Notification CD Operations (30 分鐘群組層級 CD)
    # =========================================================================

    async def should_send_member_joined_notification(self, line_group_id: str) -> bool:
        """
        Check if we should send welcome notification for new member joined

        Conditions:
        1. Group is bound to an alliance
        2. Group is NOT in cooldown (30 minutes)
        """
        if not await self.is_group_bound(line_group_id):
            return False

        return not await self._is_group_in_cooldown(line_group_id)

    async def record_liff_notification(self, line_group_id: str) -> None:
        """Record that group has been notified (group-level CD)"""
        await self.repository.record_group_notification(line_group_id)

    # =========================================================================
    # Event Report CD Operations (5 分鐘群組層級 CD)
    # =========================================================================

    EVENT_REPORT_COOLDOWN_MINUTES = 5
    EVENT_REPORT_CD_SENTINEL = "__EVENT_REPORT__"

    async def get_event_report_cd_remaining(self, line_group_id: str) -> int:
        """
        Get remaining cooldown time in minutes for event report.

        Returns:
            Remaining minutes (0 if not in cooldown)
        """
        last_sent = await self.repository.get_last_notification_time(
            line_group_id=line_group_id,
            line_user_id=self.EVENT_REPORT_CD_SENTINEL,
        )

        if not last_sent:
            return 0

        elapsed = datetime.now(UTC) - last_sent
        elapsed_minutes = int(elapsed.total_seconds() / 60)

        if elapsed_minutes >= self.EVENT_REPORT_COOLDOWN_MINUTES:
            return 0

        return self.EVENT_REPORT_COOLDOWN_MINUTES - elapsed_minutes

    async def record_event_report_cd(self, line_group_id: str) -> None:
        """Record event report sent time for cooldown tracking."""
        await self.repository.record_notification(
            line_group_id=line_group_id,
            line_user_id=self.EVENT_REPORT_CD_SENTINEL,
        )

    async def list_custom_commands(self, alliance_id: UUID) -> list[LineCustomCommandResponse]:
        commands = await self.repository.list_custom_commands(alliance_id)
        return [self._to_custom_command_response(command) for command in commands]

    async def create_custom_command(
        self, alliance_id: UUID, user_id: UUID, data: LineCustomCommandCreate
    ) -> LineCustomCommandResponse:
        existing = await self.repository.get_custom_command_by_trigger_any(
            alliance_id, data.trigger_keyword
        )
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT, detail="Trigger keyword already exists"
            )

        command = await self.repository.create_custom_command(
            alliance_id=alliance_id,
            command_name=data.command_name,
            trigger_keyword=data.trigger_keyword,
            response_message=data.response_message,
            is_enabled=data.is_enabled,
            created_by=user_id,
        )
        return self._to_custom_command_response(command)

    async def update_custom_command(
        self, alliance_id: UUID, command_id: UUID, data: LineCustomCommandUpdate
    ) -> LineCustomCommandResponse:
        command = await self.repository.get_custom_command_by_id(command_id)
        if not command or command.alliance_id != alliance_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Command not found")

        update_data = data.model_dump(exclude_unset=True)
        if "trigger_keyword" in update_data:
            existing = await self.repository.get_custom_command_by_trigger_any(
                alliance_id, update_data["trigger_keyword"]
            )
            if existing and existing.id != command_id:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT, detail="Trigger keyword already exists"
                )

        update_data["updated_at"] = datetime.now(UTC).isoformat()
        updated = await self.repository.update_custom_command(command_id, update_data)
        return self._to_custom_command_response(updated)

    async def delete_custom_command(self, alliance_id: UUID, command_id: UUID) -> None:
        command = await self.repository.get_custom_command_by_id(command_id)
        if not command or command.alliance_id != alliance_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Command not found")

        await self.repository.delete_custom_command(command_id)

    async def get_custom_command_response(
        self, line_group_id: str, trigger_keyword: str
    ) -> LineCustomCommandResponse | None:
        group_binding = await self.repository.get_group_binding_by_line_group_id(line_group_id)
        if not group_binding:
            return None

        command = await self.repository.get_custom_command_by_trigger(
            group_binding.alliance_id, trigger_keyword
        )
        if not command:
            return None

        return self._to_custom_command_response(command)

    def _to_custom_command_response(self, command: LineCustomCommand) -> LineCustomCommandResponse:
        return LineCustomCommandResponse(
            id=command.id,
            command_name=command.command_name,
            trigger_keyword=command.trigger_keyword,
            response_message=command.response_message,
            is_enabled=command.is_enabled,
            created_at=command.created_at,
            updated_at=command.updated_at,
        )

    async def is_group_bound(self, line_group_id: str) -> bool:
        """
        Check if a group is bound to an alliance

        Args:
            line_group_id: LINE group ID

        Returns:
            True if group is bound
        """
        group_binding = await self.repository.get_group_binding_by_line_group_id(line_group_id)
        return group_binding is not None

    # =========================================================================
    # Performance Analytics Operations (LIFF)
    # =========================================================================

    async def get_member_performance(
        self, line_group_id: str, line_user_id: str, game_id: str
    ) -> MemberPerformanceResponse:
        """
        Get member performance analytics for LIFF display

        Args:
            line_group_id: LINE group ID
            line_user_id: LINE user ID
            game_id: Game ID to get performance for

        Returns:
            MemberPerformanceResponse with analytics data

        Raises:
            HTTPException 404: If group not bound or game_id not found
        """
        # Find alliance by group ID
        group_binding = await self.repository.get_group_binding_by_line_group_id(line_group_id)

        if not group_binding:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Group not bound to any alliance"
            )

        alliance_id = group_binding.alliance_id

        # Verify user owns this game_id
        member_binding = await self.repository.get_member_binding_by_game_id(
            alliance_id=alliance_id, game_id=game_id
        )

        if not member_binding or member_binding.line_user_id != line_user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail="Game ID not registered by this user"
            )

        # Get member_id from binding
        member_id = member_binding.member_id
        if not member_id:
            # Game ID registered but not matched to member yet
            return MemberPerformanceResponse(has_data=False, game_id=game_id)

        # Get current (selected) season
        current_season = await self._season_repo.get_current_season(alliance_id)

        if not current_season:
            return MemberPerformanceResponse(has_data=False, game_id=game_id)

        # Get member trend data
        trend_data = await self._analytics_service.get_member_trend(
            member_id=member_id, season_id=current_season.id
        )

        if not trend_data:
            return MemberPerformanceResponse(
                has_data=False, game_id=game_id, season_name=current_season.name
            )

        # Get season summary
        season_summary = await self._analytics_service.get_season_summary(
            member_id=member_id, season_id=current_season.id
        )

        # Get latest period data
        latest = trend_data[-1]

        # Build rank info
        rank = PerformanceRank(
            current=latest["end_rank"],
            total=latest["alliance_member_count"],
            change=latest["rank_change"],
        )

        # Build latest metrics
        latest_metrics = PerformanceMetrics(
            daily_contribution=latest["daily_contribution"],
            daily_merit=latest["daily_merit"],
            daily_assist=latest["daily_assist"],
            daily_donation=latest["daily_donation"],
            power=latest["end_power"],
        )

        # Build alliance average metrics
        alliance_avg = PerformanceMetrics(
            daily_contribution=latest["alliance_avg_contribution"],
            daily_merit=latest["alliance_avg_merit"],
            daily_assist=latest["alliance_avg_assist"],
            daily_donation=latest["alliance_avg_donation"],
            power=int(latest["alliance_avg_power"]),
        )

        # Build alliance median metrics
        alliance_median = PerformanceMetrics(
            daily_contribution=latest["alliance_median_contribution"],
            daily_merit=latest["alliance_median_merit"],
            daily_assist=latest["alliance_median_assist"],
            daily_donation=latest["alliance_median_donation"],
            power=int(latest["alliance_median_power"]),
        )

        # Build trend items (limit to 10 most recent)
        trend_items = [
            PerformanceTrendItem(
                period_label=item["period_label"],
                date=item["start_date"],
                daily_contribution=item["daily_contribution"],
                daily_merit=item["daily_merit"],
            )
            for item in trend_data[-10:]
        ]

        # Build season totals
        season_total = None
        if season_summary:
            season_total = PerformanceSeasonTotal(
                contribution=season_summary["total_contribution"],
                donation=season_summary["total_donation"],
                power=season_summary["current_power"],
                power_change=season_summary["total_power_change"],
            )

        return MemberPerformanceResponse(
            has_data=True,
            game_id=game_id,
            season_name=current_season.name,
            rank=rank,
            latest=latest_metrics,
            alliance_avg=alliance_avg,
            alliance_median=alliance_median,
            trend=trend_items,
            season_total=season_total,
        )

    # =========================================================================
    # Member Candidates Operations (for LIFF autocomplete)
    # =========================================================================

    async def get_member_candidates(self, line_group_id: str) -> MemberCandidatesResponse:
        """
        Get active member candidates for autocomplete in LIFF.

        Args:
            line_group_id: LINE group ID

        Returns:
            MemberCandidatesResponse with list of candidates
        """
        group_binding = await self.repository.get_group_binding_by_line_group_id(line_group_id)
        if not group_binding:
            return MemberCandidatesResponse(candidates=[])

        data = await self.repository.get_active_member_candidates(group_binding.alliance_id)

        candidates = [
            MemberCandidate(name=row["name"], group_name=row.get("group_name")) for row in data
        ]

        return MemberCandidatesResponse(candidates=candidates)

    async def find_similar_members(self, line_group_id: str, name: str) -> SimilarMembersResponse:
        """
        Find members with similar names for fuzzy matching.

        Args:
            line_group_id: LINE group ID
            name: Name to search for

        Returns:
            SimilarMembersResponse with similar candidates and exact match flag
        """
        group_binding = await self.repository.get_group_binding_by_line_group_id(line_group_id)
        if not group_binding:
            return SimilarMembersResponse(similar=[], has_exact_match=False)

        data = await self.repository.find_similar_members(
            alliance_id=group_binding.alliance_id,
            name=name,
            limit=5,
        )

        similar = [
            MemberCandidate(name=row["name"], group_name=row.get("group_name")) for row in data
        ]

        # Check if first result is exact match
        has_exact_match = len(similar) > 0 and similar[0].name == name

        return SimilarMembersResponse(similar=similar, has_exact_match=has_exact_match)

    # =========================================================================
    # Event List Operations (LIFF Battle Tab)
    # =========================================================================

    async def get_event_list_for_liff(
        self, line_group_id: str, game_id: str, limit: int = 10, offset: int = 0
    ) -> EventListResponse:
        """
        Get list of completed events with user participation status for LIFF.

        Args:
            line_group_id: LINE group ID
            game_id: User's game ID to check participation
            limit: Maximum number of events to return (1-50)
            offset: Number of events to skip for pagination

        Returns:
            EventListResponse with events, user participation status, and pagination info

        Raises:
            HTTPException 404: If group not bound
        """
        from src.models.battle_event import EventStatus

        # 1. Get alliance from group binding
        group_binding = await self.repository.get_group_binding_by_line_group_id(line_group_id)
        if not group_binding:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="此群組尚未綁定同盟",
            )

        alliance_id = group_binding.alliance_id

        # 2. Get current season
        current_season = await self._season_repo.get_current_season(alliance_id)
        season_name = current_season.name if current_season else None
        season_id = current_season.id if current_season else None

        if not season_id:
            return EventListResponse(season_name=None, events=[], has_more=False, total_count=0)

        # 3. Get completed events for this season, paginated
        events = await self._event_repo.get_by_season(season_id)
        completed_events = [e for e in events if e.status == EventStatus.COMPLETED]
        total_count = len(completed_events)
        completed_events = completed_events[offset : offset + limit]

        if not completed_events:
            return EventListResponse(
                season_name=season_name, events=[], has_more=False, total_count=total_count
            )

        # 4. Get member_id from game_id
        member = await self.repository.get_member_by_game_id(alliance_id, game_id)
        member_id = member.id if member else None

        # 5. Batch fetch user's metrics for all events
        event_ids = [e.id for e in completed_events]
        user_metrics_map: dict[UUID, BattleEventMetrics] = {}
        if member_id:
            user_metrics_map = await self._metrics_repo.get_user_metrics_for_events(
                event_ids, member_id
            )

        # 6. Batch fetch event summaries (avoid N+1)
        all_metrics_map = await self._metrics_repo.get_by_events_with_member_and_group(event_ids)

        # 7. Build response items
        items: list[EventListItem] = []
        for event in completed_events:
            event_metrics = all_metrics_map.get(event.id, [])

            # Calculate overall stats
            total_members = len(event_metrics)
            participated_count = sum(1 for m in event_metrics if m.participated)
            participation_rate = (
                (participated_count / total_members * 100) if total_members > 0 else 0.0
            )

            # User participation
            user_metric = user_metrics_map.get(event.id) if member_id else None
            user_participation = self._build_user_participation(
                user_metric, event.event_type, event_metrics
            )

            items.append(
                EventListItem(
                    event_id=str(event.id),
                    event_name=event.name,
                    event_type=event.event_type.value if event.event_type else "battle",
                    event_start=event.event_start,
                    total_members=total_members,
                    participated_count=participated_count,
                    participation_rate=round(participation_rate, 1),
                    user_participation=user_participation,
                )
            )

        return EventListResponse(
            season_name=season_name,
            events=items,
            has_more=(offset + limit) < total_count,
            total_count=total_count,
        )

    def _build_user_participation(
        self,
        user_metric: BattleEventMetrics | None,
        event_type: EventCategory | None,
        all_metrics: list[BattleEventMetricsWithMember],
    ) -> UserEventParticipation:
        """Build user participation object based on event type."""
        if not user_metric:
            return UserEventParticipation(
                participated=False,
                rank=None,
                score=None,
                score_label=None,
                violated=None,
            )

        # Determine participation and score based on event type
        event_type = event_type or EventCategory.BATTLE

        if event_type == EventCategory.FORBIDDEN:
            # For forbidden: check if user violated (power_diff > 0)
            violated = user_metric.power_diff > 0
            return UserEventParticipation(
                participated=not violated,  # "participated" means compliance
                rank=None,
                score=None,
                score_label=None,
                violated=violated,
            )

        elif event_type == EventCategory.SIEGE:
            # For siege: use contribution as primary metric
            participated = user_metric.participated
            score = user_metric.contribution_diff + user_metric.assist_diff
            rank = (
                self._calculate_rank(
                    user_metric.contribution_diff + user_metric.assist_diff,
                    all_metrics,
                    lambda m: m.contribution_diff + m.assist_diff,
                )
                if participated
                else None
            )

            return UserEventParticipation(
                participated=participated,
                rank=rank,
                score=score if participated else None,
                score_label="貢獻" if participated else None,
                violated=None,
            )

        else:  # BATTLE
            # For battle: use merit as primary metric
            participated = user_metric.participated
            score = user_metric.merit_diff
            rank = (
                self._calculate_rank(
                    user_metric.merit_diff,
                    all_metrics,
                    lambda m: m.merit_diff,
                )
                if participated
                else None
            )

            return UserEventParticipation(
                participated=participated,
                rank=rank,
                score=score if participated else None,
                score_label="戰功" if participated else None,
                violated=None,
            )

    def _calculate_rank(
        self,
        user_score: int,
        all_metrics: list[BattleEventMetricsWithMember],
        score_fn: callable,
    ) -> int:
        """Calculate user's rank based on score."""
        scores = sorted([score_fn(m) for m in all_metrics if m.participated], reverse=True)
        try:
            return scores.index(user_score) + 1
        except ValueError:
            return len(scores) + 1
