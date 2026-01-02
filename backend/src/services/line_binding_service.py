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

import secrets
from datetime import datetime, timedelta
from uuid import UUID

from fastapi import HTTPException, status

from src.models.line_binding import (
    LineBindingCodeResponse,
    LineBindingStatusResponse,
    LineGroupBindingResponse,
    MemberInfoResponse,
    MemberPerformanceResponse,
    PerformanceMetrics,
    PerformanceRank,
    PerformanceSeasonTotal,
    PerformanceTrendItem,
    RegisteredAccount,
    RegisterMemberResponse,
)
from src.repositories.line_binding_repository import LineBindingRepository

# Constants
BINDING_CODE_LENGTH = 6
BINDING_CODE_EXPIRY_MINUTES = 5
MAX_CODES_PER_HOUR = 3
GROUP_REMINDER_COOLDOWN_MINUTES = 30  # Auto-reminder cooldown per group
# Remove confusing characters: 0, O, I, 1
BINDING_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


class LineBindingService:
    """Service for LINE binding operations"""

    def __init__(self, repository: LineBindingRepository | None = None):
        self.repository = repository or LineBindingRepository()

    # =========================================================================
    # Binding Code Operations (Web App)
    # =========================================================================

    async def generate_binding_code(
        self,
        alliance_id: UUID,
        user_id: UUID
    ) -> LineBindingCodeResponse:
        """
        Generate a new binding code for an alliance

        Args:
            alliance_id: Alliance UUID
            user_id: User UUID who is generating the code

        Returns:
            LineBindingCodeResponse with code and expiry

        Raises:
            HTTPException 400: If alliance already has active LINE group binding
            HTTPException 429: If rate limit exceeded
        """
        # Check if alliance already has active binding
        existing_binding = await self.repository.get_active_group_binding_by_alliance(
            alliance_id
        )
        if existing_binding:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Alliance already has active LINE group binding"
            )

        # Rate limiting: max 3 codes per hour
        one_hour_ago = datetime.utcnow() - timedelta(hours=1)
        recent_count = await self.repository.count_recent_codes(
            alliance_id, one_hour_ago
        )
        if recent_count >= MAX_CODES_PER_HOUR:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Rate limit exceeded. Please wait before generating a new code."
            )

        # Generate cryptographically secure code
        code = "".join(
            secrets.choice(BINDING_CODE_ALPHABET)
            for _ in range(BINDING_CODE_LENGTH)
        )

        # Calculate expiry time
        expires_at = datetime.utcnow() + timedelta(minutes=BINDING_CODE_EXPIRY_MINUTES)

        # Create code in database
        binding_code = await self.repository.create_binding_code(
            alliance_id=alliance_id,
            code=code,
            created_by=user_id,
            expires_at=expires_at
        )

        return LineBindingCodeResponse(
            code=binding_code.code,
            expires_at=binding_code.expires_at,
            created_at=binding_code.created_at
        )

    async def get_binding_status(
        self,
        alliance_id: UUID
    ) -> LineBindingStatusResponse:
        """
        Get current LINE binding status for an alliance

        Args:
            alliance_id: Alliance UUID

        Returns:
            LineBindingStatusResponse with binding info or pending code
        """
        # Check for active group binding
        group_binding = await self.repository.get_active_group_binding_by_alliance(
            alliance_id
        )

        if group_binding:
            # Get member count
            member_count = await self.repository.count_member_bindings_by_alliance(
                alliance_id
            )

            return LineBindingStatusResponse(
                is_bound=True,
                binding=LineGroupBindingResponse(
                    id=group_binding.id,
                    alliance_id=group_binding.alliance_id,
                    line_group_id=group_binding.line_group_id,
                    group_name=group_binding.group_name,
                    bound_at=group_binding.bound_at,
                    is_active=group_binding.is_active,
                    member_count=member_count
                ),
                pending_code=None
            )

        # Check for pending code
        pending_code = await self.repository.get_pending_code_by_alliance(alliance_id)

        if pending_code:
            return LineBindingStatusResponse(
                is_bound=False,
                binding=None,
                pending_code=LineBindingCodeResponse(
                    code=pending_code.code,
                    expires_at=pending_code.expires_at,
                    created_at=pending_code.created_at
                )
            )

        # No binding and no pending code
        return LineBindingStatusResponse(
            is_bound=False,
            binding=None,
            pending_code=None
        )

    async def unbind_group(self, alliance_id: UUID) -> None:
        """
        Unbind LINE group from alliance

        Args:
            alliance_id: Alliance UUID

        Raises:
            HTTPException 404: If no active binding found
        """
        group_binding = await self.repository.get_active_group_binding_by_alliance(
            alliance_id
        )

        if not group_binding:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No active LINE group binding found"
            )

        await self.repository.deactivate_group_binding(group_binding.id)

    # =========================================================================
    # Group Binding Operations (Webhook)
    # =========================================================================

    async def validate_and_bind_group(
        self,
        code: str,
        line_group_id: str,
        line_user_id: str,
        group_name: str | None = None
    ) -> tuple[bool, str, UUID | None]:
        """
        Validate binding code and create group binding

        Args:
            code: Binding code from user
            line_group_id: LINE group ID
            line_user_id: LINE user ID who initiated binding
            group_name: Optional group name

        Returns:
            Tuple of (success, message, alliance_id)
        """
        # Validate code
        binding_code = await self.repository.get_valid_code(code.upper())
        if not binding_code:
            return False, "綁定碼無效或已過期", None

        # Check if group is already bound
        existing_binding = await self.repository.get_group_binding_by_line_group_id(
            line_group_id
        )
        if existing_binding:
            return False, "此群組已綁定到其他同盟", None

        # Check if alliance already has active binding
        alliance_binding = await self.repository.get_active_group_binding_by_alliance(
            binding_code.alliance_id
        )
        if alliance_binding:
            return False, "此同盟已綁定其他 LINE 群組", None

        # Create group binding
        await self.repository.create_group_binding(
            alliance_id=binding_code.alliance_id,
            line_group_id=line_group_id,
            bound_by_line_user_id=line_user_id,
            group_name=group_name
        )

        # Mark code as used
        await self.repository.mark_code_used(binding_code.id)

        return True, "綁定成功！", binding_code.alliance_id

    # =========================================================================
    # Member Registration Operations (LIFF)
    # =========================================================================

    async def get_member_info(
        self,
        line_user_id: str,
        line_group_id: str
    ) -> MemberInfoResponse:
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
        group_binding = await self.repository.get_group_binding_by_line_group_id(
            line_group_id
        )

        if not group_binding:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Group not bound to any alliance"
            )

        # Get user's registrations
        bindings = await self.repository.get_member_bindings_by_line_user(
            alliance_id=group_binding.alliance_id,
            line_user_id=line_user_id
        )

        registered_ids = [
            RegisteredAccount(
                game_id=b.game_id,
                display_name=b.line_display_name,
                created_at=b.created_at
            )
            for b in bindings
        ]

        return MemberInfoResponse(
            has_registered=len(registered_ids) > 0,
            registered_ids=registered_ids,
            alliance_name=None  # Could fetch from alliance table if needed
        )

    async def register_member(
        self,
        line_group_id: str,
        line_user_id: str,
        line_display_name: str,
        game_id: str
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
        group_binding = await self.repository.get_group_binding_by_line_group_id(
            line_group_id
        )

        if not group_binding:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Group not bound to any alliance"
            )

        alliance_id = group_binding.alliance_id

        # Check if game ID already registered
        existing = await self.repository.get_member_binding_by_game_id(
            alliance_id=alliance_id,
            game_id=game_id
        )

        if existing and existing.line_user_id != line_user_id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Game ID already registered by another user"
            )

        if not existing:
            # Try to auto-match with existing member
            member_id = await self.repository.find_member_by_name(
                alliance_id=alliance_id,
                name=game_id
            )

            # Create new binding
            await self.repository.create_member_binding(
                alliance_id=alliance_id,
                line_user_id=line_user_id,
                line_display_name=line_display_name,
                game_id=game_id,
                member_id=member_id
            )

        # Return updated list
        bindings = await self.repository.get_member_bindings_by_line_user(
            alliance_id=alliance_id,
            line_user_id=line_user_id
        )

        registered_ids = [
            RegisteredAccount(
                game_id=b.game_id,
                display_name=b.line_display_name,
                created_at=b.created_at
            )
            for b in bindings
        ]

        return RegisterMemberResponse(
            has_registered=True,
            registered_ids=registered_ids
        )

    async def get_group_status(self, line_group_id: str) -> dict | None:
        """
        Get group binding status for webhook status command

        Args:
            line_group_id: LINE group ID

        Returns:
            Dict with member_count and bound_at, or None if not bound
        """
        group_binding = await self.repository.get_group_binding_by_line_group_id(
            line_group_id
        )
        if not group_binding:
            return None

        member_count = await self.repository.count_member_bindings_by_alliance(
            group_binding.alliance_id
        )

        return {
            "member_count": member_count,
            "bound_at": group_binding.bound_at.strftime("%Y-%m-%d %H:%M")
        }

    # =========================================================================
    # Auto-Reminder Operations (Webhook)
    # =========================================================================

    async def should_send_binding_reminder(
        self,
        line_group_id: str,
        line_user_id: str
    ) -> bool:
        """
        Check if we should send an auto-reminder to register game ID

        Conditions for sending:
        1. Group is bound to an alliance
        2. User has NOT registered any game ID
        3. Group hasn't received a reminder in the last 30 minutes

        Args:
            line_group_id: LINE group ID
            line_user_id: LINE user ID of the message sender

        Returns:
            True if reminder should be sent
        """
        # Check if group is bound
        group_binding = await self.repository.get_group_binding_by_line_group_id(
            line_group_id
        )
        if not group_binding:
            return False

        # Check if user already registered
        is_registered = await self.repository.is_user_registered_in_group(
            line_group_id=line_group_id,
            line_user_id=line_user_id
        )
        if is_registered:
            return False

        # Check group cooldown (30 minutes)
        last_reminder = await self.repository.get_group_reminder_cooldown(line_group_id)
        if last_reminder:
            cooldown_end = last_reminder + timedelta(minutes=GROUP_REMINDER_COOLDOWN_MINUTES)
            if datetime.utcnow().replace(tzinfo=last_reminder.tzinfo) < cooldown_end:
                return False

        return True

    async def update_group_reminder_cooldown(self, line_group_id: str) -> None:
        """
        Update the group reminder cooldown timestamp

        Args:
            line_group_id: LINE group ID
        """
        await self.repository.upsert_group_reminder_cooldown(line_group_id)

    # =========================================================================
    # Performance Analytics Operations (LIFF)
    # =========================================================================

    async def get_member_performance(
        self,
        line_group_id: str,
        line_user_id: str,
        game_id: str
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
        # Lazy import to avoid circular dependency
        from src.repositories.season_repository import SeasonRepository
        from src.services.analytics_service import AnalyticsService

        # Find alliance by group ID
        group_binding = await self.repository.get_group_binding_by_line_group_id(
            line_group_id
        )

        if not group_binding:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Group not bound to any alliance"
            )

        alliance_id = group_binding.alliance_id

        # Verify user owns this game_id
        member_binding = await self.repository.get_member_binding_by_game_id(
            alliance_id=alliance_id,
            game_id=game_id
        )

        if not member_binding or member_binding.line_user_id != line_user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Game ID not registered by this user"
            )

        # Get member_id from binding
        member_id = member_binding.member_id
        if not member_id:
            # Game ID registered but not matched to member yet
            return MemberPerformanceResponse(
                has_data=False,
                game_id=game_id
            )

        # Get active season
        season_repo = SeasonRepository()
        active_season = await season_repo.get_active_by_alliance(alliance_id)

        if not active_season:
            return MemberPerformanceResponse(
                has_data=False,
                game_id=game_id
            )

        # Get analytics data
        analytics_service = AnalyticsService()

        # Get member trend data
        trend_data = await analytics_service.get_member_trend(
            member_id=member_id,
            season_id=active_season.id
        )

        if not trend_data:
            return MemberPerformanceResponse(
                has_data=False,
                game_id=game_id,
                season_name=active_season.name
            )

        # Get season summary
        season_summary = await analytics_service.get_season_summary(
            member_id=member_id,
            season_id=active_season.id
        )

        # Get latest period data
        latest = trend_data[-1]

        # Build rank info
        rank = PerformanceRank(
            current=latest["end_rank"],
            total=latest["alliance_member_count"],
            change=latest["rank_change"]
        )

        # Build latest metrics
        latest_metrics = PerformanceMetrics(
            daily_contribution=latest["daily_contribution"],
            daily_merit=latest["daily_merit"],
            daily_assist=latest["daily_assist"],
            daily_donation=latest["daily_donation"],
            power=latest["end_power"]
        )

        # Build alliance average metrics
        alliance_avg = PerformanceMetrics(
            daily_contribution=latest["alliance_avg_contribution"],
            daily_merit=latest["alliance_avg_merit"],
            daily_assist=latest["alliance_avg_assist"],
            daily_donation=latest["alliance_avg_donation"],
            power=int(latest["alliance_avg_power"])
        )

        # Build alliance median metrics
        alliance_median = PerformanceMetrics(
            daily_contribution=latest["alliance_median_contribution"],
            daily_merit=latest["alliance_median_merit"],
            daily_assist=latest["alliance_median_assist"],
            daily_donation=latest["alliance_median_donation"],
            power=int(latest["alliance_median_power"])
        )

        # Build trend items (limit to 10 most recent)
        trend_items = [
            PerformanceTrendItem(
                period_label=item["period_label"],
                date=item["start_date"],
                daily_contribution=item["daily_contribution"],
                daily_merit=item["daily_merit"]
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
                power_change=season_summary["total_power_change"]
            )

        return MemberPerformanceResponse(
            has_data=True,
            game_id=game_id,
            season_name=active_season.name,
            rank=rank,
            latest=latest_metrics,
            alliance_avg=alliance_avg,
            alliance_median=alliance_median,
            trend=trend_items,
            season_total=season_total
        )
