"""
LINE Bot API Endpoints

Endpoints for LINE Bot integration:
- Web App: Generate binding code, get status, unbind
- LIFF: Get member info, register game ID
- Webhook: Handle LINE events (極簡設計)

極簡 Bot 設計原則:
1. Bot 只做「群組綁定」和「LIFF 入口推送」
2. 所有功能都在 LIFF Web UI 完成
3. 觸發條件：被 @ / 新成員加入 / 未註冊者首次發言
"""

import json
import logging
import re
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status

from src.core.config import Settings, get_settings
from src.core.dependencies import (
    AllianceServiceDep,
    BattleEventServiceDep,
    CopperMineServiceDep,
    LineBindingServiceDep,
    PermissionServiceDep,
    UserIdDep,
)
from src.core.line_auth import WebhookBodyDep, create_liff_url, get_group_info, get_line_bot_api
from src.models.copper_mine import (
    CopperMineCreate,
    CopperMineListResponse,
    RegisterCopperResponse,
)
from src.models.line_binding import (
    LineBindingCodeResponse,
    LineBindingStatusResponse,
    LineCustomCommandCreate,
    LineCustomCommandResponse,
    LineCustomCommandUpdate,
    LineGroupBindingResponse,
    LineWebhookEvent,
    LineWebhookRequest,
    MemberInfoResponse,
    MemberLineBindingCreate,
    MemberPerformanceResponse,
    RegisteredMembersResponse,
    RegisterMemberResponse,
)
from src.services.battle_event_service import BattleEventService
from src.services.line_binding_service import LineBindingService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/linebot", tags=["LINE Bot"])

# 綁定碼格式：6 位英數字
BIND_CODE_PATTERN = re.compile(r"^[A-Z0-9]{6}$")


# =============================================================================
# Web App Endpoints (Supabase JWT Auth)
# =============================================================================


@router.post(
    "/codes",
    response_model=LineBindingCodeResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Generate binding code",
    description="Generate a one-time binding code for linking LINE group to alliance"
)
async def generate_binding_code(
    user_id: UserIdDep,
    service: LineBindingServiceDep,
    alliance_service: AllianceServiceDep,
    permission_service: PermissionServiceDep,
) -> LineBindingCodeResponse:
    """Generate a new binding code for the user's alliance"""
    alliance = await alliance_service.get_user_alliance(user_id)
    if not alliance:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User has no alliance"
        )

    await permission_service.require_owner_or_collaborator(
        user_id, alliance.id, "generate LINE binding code"
    )

    return await service.generate_binding_code(
        alliance_id=alliance.id,
        user_id=user_id
    )


@router.get(
    "/binding",
    response_model=LineBindingStatusResponse,
    summary="Get binding status",
    description="Get current LINE binding status for user's alliance"
)
async def get_binding_status(
    user_id: UserIdDep,
    service: LineBindingServiceDep,
    alliance_service: AllianceServiceDep,
) -> LineBindingStatusResponse:
    """Get current LINE binding status"""
    alliance = await alliance_service.get_user_alliance(user_id)
    if not alliance:
        return LineBindingStatusResponse(
            is_bound=False,
            binding=None,
            pending_code=None
        )

    return await service.get_binding_status(alliance.id)


@router.delete(
    "/binding",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Unbind LINE group",
    description="Remove LINE group binding from alliance"
)
async def unbind_line_group(
    user_id: UserIdDep,
    service: LineBindingServiceDep,
    alliance_service: AllianceServiceDep,
    permission_service: PermissionServiceDep,
) -> Response:
    """Unbind LINE group from alliance"""
    alliance = await alliance_service.get_user_alliance(user_id)
    if not alliance:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User has no alliance"
        )

    await permission_service.require_owner_or_collaborator(
        user_id, alliance.id, "unbind LINE group"
    )

    await service.unbind_group(alliance.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/binding/refresh-info",
    response_model=LineGroupBindingResponse,
    summary="Refresh group info",
    description="Refresh LINE group name and picture from LINE API"
)
async def refresh_group_info(
    user_id: UserIdDep,
    service: LineBindingServiceDep,
    alliance_service: AllianceServiceDep,
    permission_service: PermissionServiceDep,
) -> LineGroupBindingResponse:
    """Refresh LINE group name and picture from LINE API"""
    alliance = await alliance_service.get_user_alliance(user_id)
    if not alliance:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User has no alliance"
        )

    await permission_service.require_owner_or_collaborator(
        user_id, alliance.id, "refresh LINE group info"
    )

    return await service.refresh_group_info(alliance.id)


@router.get(
    "/binding/members",
    response_model=RegisteredMembersResponse,
    summary="Get registered members",
    description="Get list of LINE users who registered game IDs"
)
async def get_registered_members(
    user_id: UserIdDep,
    service: LineBindingServiceDep,
    alliance_service: AllianceServiceDep,
) -> RegisteredMembersResponse:
    """Get registered members list for alliance admin view"""
    alliance = await alliance_service.get_user_alliance(user_id)
    if not alliance:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User has no alliance"
        )

    return await service.get_registered_members(alliance.id)


@router.get(
    "/commands",
    response_model=list[LineCustomCommandResponse],
    summary="Get custom commands",
    description="Get custom commands for current alliance"
)
async def get_custom_commands(
    user_id: UserIdDep,
    service: LineBindingServiceDep,
    alliance_service: AllianceServiceDep,
) -> list[LineCustomCommandResponse]:
    alliance = await alliance_service.get_user_alliance(user_id)
    if not alliance:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User has no alliance"
        )

    return await service.list_custom_commands(alliance.id)


@router.post(
    "/commands",
    response_model=LineCustomCommandResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create custom command",
    description="Create a LINE custom command"
)
async def create_custom_command(
    user_id: UserIdDep,
    data: LineCustomCommandCreate,
    service: LineBindingServiceDep,
    alliance_service: AllianceServiceDep,
    permission_service: PermissionServiceDep,
) -> LineCustomCommandResponse:
    alliance = await alliance_service.get_user_alliance(user_id)
    if not alliance:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User has no alliance"
        )

    await permission_service.require_owner_or_collaborator(
        user_id, alliance.id, "create LINE custom command"
    )

    return await service.create_custom_command(
        alliance_id=alliance.id,
        user_id=user_id,
        data=data,
    )


@router.patch(
    "/commands/{command_id}",
    response_model=LineCustomCommandResponse,
    summary="Update custom command",
    description="Update a LINE custom command"
)
async def update_custom_command(
    command_id: UUID,
    user_id: UserIdDep,
    data: LineCustomCommandUpdate,
    service: LineBindingServiceDep,
    alliance_service: AllianceServiceDep,
    permission_service: PermissionServiceDep,
) -> LineCustomCommandResponse:
    alliance = await alliance_service.get_user_alliance(user_id)
    if not alliance:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User has no alliance"
        )

    await permission_service.require_owner_or_collaborator(
        user_id, alliance.id, "update LINE custom command"
    )

    return await service.update_custom_command(
        alliance_id=alliance.id,
        command_id=command_id,
        data=data,
    )


@router.delete(
    "/commands/{command_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete custom command",
    description="Delete a LINE custom command"
)
async def delete_custom_command(
    command_id: UUID,
    user_id: UserIdDep,
    service: LineBindingServiceDep,
    alliance_service: AllianceServiceDep,
    permission_service: PermissionServiceDep,
) -> Response:
    alliance = await alliance_service.get_user_alliance(user_id)
    if not alliance:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User has no alliance"
        )

    await permission_service.require_owner_or_collaborator(
        user_id, alliance.id, "delete LINE custom command"
    )

    await service.delete_custom_command(alliance.id, command_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# =============================================================================
# LIFF Endpoints (LINE Group ID Auth)
# =============================================================================


@router.get(
    "/member/info",
    response_model=MemberInfoResponse,
    summary="Get member info",
    description="Get member registration info for LIFF display"
)
async def get_member_info(
    service: LineBindingServiceDep,
    u: Annotated[str, Query(description="LINE user ID")],
    g: Annotated[str, Query(description="LINE group ID")],
) -> MemberInfoResponse:
    """Get member info for LIFF page"""
    return await service.get_member_info(
        line_user_id=u,
        line_group_id=g
    )


@router.get(
    "/member/performance",
    response_model=MemberPerformanceResponse,
    summary="Get member performance",
    description="Get member performance analytics for LIFF display"
)
async def get_member_performance(
    service: LineBindingServiceDep,
    u: Annotated[str, Query(description="LINE user ID")],
    g: Annotated[str, Query(description="LINE group ID")],
    game_id: Annotated[str, Query(description="Game ID to get performance for")],
) -> MemberPerformanceResponse:
    """Get member performance analytics for LIFF page"""
    return await service.get_member_performance(
        line_group_id=g,
        line_user_id=u,
        game_id=game_id
    )


@router.post(
    "/member/register",
    response_model=RegisterMemberResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register game ID",
    description="Register a game ID for a LINE user"
)
async def register_game_id(
    service: LineBindingServiceDep,
    data: MemberLineBindingCreate,
) -> RegisterMemberResponse:
    """Register a game ID for a LINE user"""
    return await service.register_member(
        line_group_id=data.line_group_id,
        line_user_id=data.line_user_id,
        line_display_name=data.line_display_name,
        game_id=data.game_id
    )


@router.delete(
    "/member/unregister",
    response_model=RegisterMemberResponse,
    summary="Unregister game ID",
    description="Remove a game ID registration for a LINE user"
)
async def unregister_game_id(
    service: LineBindingServiceDep,
    u: Annotated[str, Query(description="LINE user ID")],
    g: Annotated[str, Query(description="LINE group ID")],
    game_id: Annotated[str, Query(description="Game ID to unregister")],
) -> RegisterMemberResponse:
    """Unregister a game ID for a LINE user"""
    return await service.unregister_member(
        line_group_id=g,
        line_user_id=u,
        game_id=game_id
    )


# =============================================================================
# Copper Mine LIFF Endpoints
# =============================================================================


@router.get(
    "/copper/rules",
    summary="Get copper mine rules",
    description="Get copper mine rules for LIFF display"
)
async def get_copper_rules(
    service: CopperMineServiceDep,
    g: Annotated[str, Query(description="LINE group ID")],
) -> list:
    """Get copper mine rules for LIFF page"""
    return await service.get_rules_for_liff(line_group_id=g)


@router.get(
    "/copper/list",
    response_model=CopperMineListResponse,
    summary="Get copper mines list",
    description="Get copper mines for LIFF display"
)
async def get_copper_mines(
    service: CopperMineServiceDep,
    u: Annotated[str, Query(description="LINE user ID")],
    g: Annotated[str, Query(description="LINE group ID")],
) -> CopperMineListResponse:
    """Get copper mines list for LIFF page"""
    return await service.get_mines_list(
        line_group_id=g,
        line_user_id=u
    )


@router.post(
    "/copper/register",
    response_model=RegisterCopperResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register copper mine",
    description="Register a new copper mine location"
)
async def register_copper_mine(
    service: CopperMineServiceDep,
    data: CopperMineCreate,
) -> RegisterCopperResponse:
    """Register a copper mine location"""
    return await service.register_mine(
        line_group_id=data.line_group_id,
        line_user_id=data.line_user_id,
        game_id=data.game_id,
        coord_x=data.coord_x,
        coord_y=data.coord_y,
        level=data.level,
        notes=data.notes
    )


@router.delete(
    "/copper/{mine_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete copper mine",
    description="Remove a copper mine record"
)
async def delete_copper_mine(
    mine_id: str,
    service: CopperMineServiceDep,
    u: Annotated[str, Query(description="LINE user ID")],
    g: Annotated[str, Query(description="LINE group ID")],
) -> Response:
    """Delete a copper mine by ID"""
    from uuid import UUID
    await service.delete_mine(
        mine_id=UUID(mine_id),
        line_group_id=g,
        line_user_id=u
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# =============================================================================
# LINE Webhook Endpoint (極簡設計)
# =============================================================================


@router.post(
    "/webhook",
    summary="LINE webhook",
    description="Handle LINE webhook events"
)
async def handle_webhook(
    body: WebhookBodyDep,
    service: LineBindingServiceDep,
    battle_event_service: BattleEventServiceDep,
    settings: Settings = Depends(get_settings),
) -> str:
    """Handle LINE webhook events"""
    try:
        data = json.loads(body.decode("utf-8"))
        webhook_request = LineWebhookRequest(**data)
    except (json.JSONDecodeError, ValueError) as e:
        logger.error(f"Failed to parse webhook request: {e}")
        return "OK"

    for event in webhook_request.events:
        await _handle_event(event, service, battle_event_service, settings)

    return "OK"


async def _handle_event(
    event: LineWebhookEvent,
    service: LineBindingService,
    battle_event_service: BattleEventService,
    settings: Settings,
) -> None:
    """
    極簡事件處理：
    1. join: Bot 加入群組 → 發送綁定說明
    2. memberJoined: 新成員加入 → 發送 LIFF 入口（每用戶一次）
    3. message:
       - /綁定 CODE → 執行綁定
       - @bot → 發送 LIFF 入口
       - 未註冊者首次發言 → 發送 LIFF 入口（每用戶一次）
    4. follow: 用戶加好友 → 簡短說明
    """
    source = event.source
    source_type = source.get("type")

    # Bot 加入群組
    if event.type == "join" and source_type == "group":
        await _handle_join_event(event)
        return

    # 新成員加入群組
    if event.type == "memberJoined" and source_type == "group":
        await _handle_member_joined(event, service, settings)
        return

    # 用戶加好友
    if event.type == "follow":
        await _handle_follow_event(event)
        return

    # 訊息事件
    if event.type == "message":
        message = event.message or {}
        if message.get("type") != "text":
            return

        # 私聊
        if source_type == "user":
            await _handle_private_message(event)
            return

        # 群組訊息
        if source_type == "group":
            await _handle_group_message(event, service, battle_event_service, settings)
            return


# =============================================================================
# Event Handlers
# =============================================================================


async def _handle_join_event(event: LineWebhookEvent) -> None:
    """Bot 加入群組 → 發送綁定說明"""
    reply_token = event.reply_token
    if not reply_token:
        return

    await _reply_text(
        reply_token,
        "👋 我是三國小幫手！\n\n"
        "📌 開始使用：\n"
        "盟主請發送「/綁定 XXXXXX」完成綁定\n"
        "（綁定碼請在 Web App 生成）"
    )


async def _handle_member_joined(
    event: LineWebhookEvent,
    service: LineBindingService,
    settings: Settings,
) -> None:
    """新成員加入 → 發送 LIFF 入口（每用戶一次）"""
    source = event.source
    line_group_id = source.get("groupId")
    reply_token = event.reply_token

    if not line_group_id or not reply_token:
        return

    # 檢查群組是否已綁定
    is_bound = await service.is_group_bound(line_group_id)
    if not is_bound:
        return

    if not settings.liff_id:
        return

    # 發送歡迎訊息
    liff_url = create_liff_url(settings.liff_id, line_group_id)
    await _send_liff_welcome(reply_token, liff_url)


async def _handle_follow_event(event: LineWebhookEvent) -> None:
    """用戶加好友 → 簡短說明"""
    reply_token = event.reply_token
    if not reply_token:
        return

    await _reply_text(
        reply_token,
        "👋 嗨！我主要在群組中使用。\n"
        "請在已綁定的同盟群組中 @我 開始使用！"
    )


async def _handle_private_message(event: LineWebhookEvent) -> None:
    """私聊 → 統一簡短回覆"""
    reply_token = event.reply_token
    if not reply_token:
        return

    await _reply_text(
        reply_token,
        "💡 請在同盟群組中 @我 使用功能～"
    )


async def _handle_group_message(
    event: LineWebhookEvent,
    service: LineBindingService,
    battle_event_service: BattleEventService,
    settings: Settings,
) -> None:
    """
    群組訊息處理：
    1. /綁定 CODE → 執行綁定
    2. @bot → 發送 LIFF 入口
    3. 未註冊者首次發言 → 發送 LIFF 入口
    """
    source = event.source
    message = event.message or {}
    text = message.get("text", "").strip()
    line_group_id = source.get("groupId")
    line_user_id = source.get("userId")
    reply_token = event.reply_token

    if not line_group_id or not line_user_id or not reply_token:
        return

    # 1. 處理綁定指令
    if _is_bind_command(text):
        code = _extract_bind_code(text)
        if code:
            await _handle_bind_command(
                code=code,
                line_group_id=line_group_id,
                line_user_id=line_user_id,
                reply_token=reply_token,
                service=service,
                settings=settings,
            )
        return

    # 2. 檢查是否被 @
    mention = message.get("mention", {})
    mentionees = mention.get("mentionees", [])
    bot_user_id = settings.line_bot_user_id

    if bot_user_id and _is_bot_mentioned(mentionees, bot_user_id):
        # If bot is mentioned, try to extract the text arguments that follow the mention.
        # LINE mention payload usually includes index/length for the mention; use that if available.
        mentionee = next((m for m in mentionees if m.get("userId") == bot_user_id), None)
        args_text = ""
        if mentionee and isinstance(mentionee.get("index"), int) and isinstance(mentionee.get("length"), int):
            start = mentionee["index"] + mentionee["length"]
            args_text = text[start:].strip()
        else:
            # Fallback: remove the first token (likely the mention) if present
            parts = text.split()
            args_text = " ".join(parts[1:]).strip() if len(parts) > 1 else ""

        # If arguments start with '/', treat as a command and route to existing command handling
        if args_text.startswith("/"):
            command_keyword = _extract_custom_command(args_text)
            if command_keyword in {"/綁定", "/绑定"}:
                command_keyword = None

            # Built-in command: /最新戰役 or /最新战役
            if command_keyword in {"/最新戰役", "/最新战役"}:
                await _handle_latest_event_report(
                    line_group_id=line_group_id,
                    reply_token=reply_token,
                    line_binding_service=service,
                    battle_event_service=battle_event_service,
                )
                return

            # Check custom commands
            if command_keyword:
                command = await service.get_custom_command_response(
                    line_group_id=line_group_id,
                    trigger_keyword=command_keyword,
                )
                if command:
                    await _reply_text(reply_token, command.response_message)
                    return
            # Unknown command: fall back to LIFF entry
            await _send_liff_entry(
                line_group_id=line_group_id,
                reply_token=reply_token,
                settings=settings,
            )
            return

        # If there are arguments that do NOT start with '/', perform a search on registered members
        if args_text:
            results = await service.search_registered_members(
                line_group_id=line_group_id,
                query=args_text,
            )

            # Format response
            if not results:
                await _reply_text(reply_token, "搜尋結果 (共0筆):")
                return

            lines = [f"搜尋結果 (共{len(results)}筆):"]
            for i, r in enumerate(results, start=1):
                display = r.line_display_name or ""
                lines.append(f"{i}. {r.game_id} ({display})")

            await _reply_text(reply_token, "\n".join(lines))
            return

        # No arguments after mention: send LIFF entry
        await _send_liff_entry(
            line_group_id=line_group_id,
            reply_token=reply_token,
            settings=settings,
        )
        return

    # 3. 未註冊者首次發言 → 發送 LIFF 入口
    should_notify = await service.should_send_liff_notification(
        line_group_id=line_group_id,
        line_user_id=line_user_id
    )

    if should_notify:
        # 先記錄，防止重複發送
        await service.record_liff_notification(
            line_group_id=line_group_id,
            line_user_id=line_user_id
        )
        await _send_liff_first_message_reminder(
            line_group_id=line_group_id,
            reply_token=reply_token,
            settings=settings,
        )


# =============================================================================
# Command Handlers
# =============================================================================


def _is_bind_command(text: str) -> bool:
    """檢查是否為綁定指令"""
    return text.startswith("/綁定 ") or text.startswith("/绑定 ")


def _extract_bind_code(text: str) -> str | None:
    """從綁定指令中提取綁定碼"""
    parts = text.split(" ", 1)
    if len(parts) < 2:
        return None
    code = parts[1].strip().upper()
    if BIND_CODE_PATTERN.match(code):
        return code
    return None


def _extract_custom_command(text: str) -> str | None:
    match = re.search(r"/\S+", text)
    if not match:
        return None
    return match.group(0)


def _is_bot_mentioned(mentionees: list, bot_user_id: str) -> bool:
    """檢查 Bot 是否被 @"""
    return any(m.get("userId") == bot_user_id for m in mentionees)


async def _handle_latest_event_report(
    line_group_id: str,
    reply_token: str,
    line_binding_service: LineBindingService,
    battle_event_service: BattleEventService,
) -> None:
    """
    處理 /最新戰役 指令

    查詢該群組綁定同盟的最新已完成戰役，並發送分析報告。
    """
    from src.lib.line_flex_builder import build_event_report_flex

    # 1. 查詢群組綁定的同盟
    group_binding = await line_binding_service.repository.get_group_binding_by_line_group_id(
        line_group_id
    )

    if not group_binding:
        await _reply_text(
            reply_token,
            "❌ 此群組尚未綁定同盟\n\n"
            "請盟主在 Web App 生成綁定碼，\n"
            "然後發送「/綁定 XXXXXX」完成綁定"
        )
        return

    alliance_id = group_binding.alliance_id

    # 2. 查詢最新已完成戰役
    latest_event = await battle_event_service.get_latest_completed_event_for_alliance(
        alliance_id
    )

    if not latest_event:
        await _reply_text(
            reply_token,
            "📭 目前沒有已完成的戰役分析\n\n"
            "請先在 Web App 建立並完成戰役分析"
        )
        return

    # 3. 取得組別分析
    analytics = await battle_event_service.get_event_group_analytics(latest_event.id)

    if not analytics:
        await _reply_text(
            reply_token,
            "❌ 無法取得戰役分析資料"
        )
        return

    # 4. 補充 Top Members 的 LINE 名稱
    if analytics.top_members:
        game_ids = [m.member_name for m in analytics.top_members]
        line_bindings = await line_binding_service.repository.get_member_bindings_by_game_ids(
            alliance_id=alliance_id,
            game_ids=game_ids,
        )
        # 建立 game_id -> line_display_name 映射
        line_name_map = {b.game_id: b.line_display_name for b in line_bindings}

        # 更新 top_members 的 line_display_name
        for member in analytics.top_members:
            member.line_display_name = line_name_map.get(member.member_name)

    # 5. 建構 Flex Message 並發送
    flex_message = build_event_report_flex(analytics)

    if not flex_message:
        # Fallback to text if Flex build fails
        await _reply_text(
            reply_token,
            f"⚔️ {analytics.event_name}\n\n"
            f"📊 出席率: {analytics.summary.participation_rate:.0f}%\n"
            f"⚔️ 總戰功: {analytics.summary.total_merit:,}\n"
            f"🏆 MVP: {analytics.summary.mvp_member_name or '-'}"
        )
        return

    line_bot = get_line_bot_api()
    if not line_bot:
        logger.error("LINE Bot API not available")
        return

    try:
        from linebot.v3.messaging import ReplyMessageRequest

        line_bot.reply_message(
            ReplyMessageRequest(
                reply_token=reply_token,
                messages=[flex_message],
            )
        )
    except Exception as e:
        logger.error(f"Failed to send event report: {e}")


async def _handle_bind_command(
    code: str,
    line_group_id: str,
    line_user_id: str,
    reply_token: str,
    service: LineBindingService,
    settings: Settings,
) -> None:
    """處理 /綁定 指令"""
    # 獲取群組資訊
    group_info = get_group_info(line_group_id)

    success, message, alliance_id = await service.validate_and_bind_group(
        code=code,
        line_group_id=line_group_id,
        line_user_id=line_user_id,
        group_name=group_info.name if group_info else None,
        group_picture_url=group_info.picture_url if group_info else None,
    )

    if not success:
        await _reply_text(reply_token, f"❌ {message}")
        return

    # 綁定成功 → 發送歡迎訊息 + LIFF
    if not settings.liff_id:
        await _reply_text(
            reply_token,
            "✅ 綁定成功！\n\n"
            "盟友們請註冊您的遊戲 ID～"
        )
        return

    liff_url = create_liff_url(settings.liff_id, line_group_id)
    await _send_bind_success_message(reply_token, liff_url)


# =============================================================================
# Message Senders
# =============================================================================


async def _send_bind_success_message(reply_token: str, liff_url: str) -> None:
    """發送綁定成功訊息（Flex Message）"""
    line_bot = get_line_bot_api()
    if not line_bot:
        return

    try:
        from linebot.v3.messaging import (
            FlexBox,
            FlexBubble,
            FlexButton,
            FlexMessage,
            FlexSeparator,
            FlexText,
            ReplyMessageRequest,
            URIAction,
        )

        bubble = FlexBubble(
            body=FlexBox(
                layout="vertical",
                contents=[
                    FlexText(
                        text="✅ 綁定成功！",
                        weight="bold",
                        size="xl",
                        color="#1DB446",
                    ),
                    FlexSeparator(margin="lg"),
                    FlexText(
                        text="各位盟友，請點擊下方按鈕",
                        size="md",
                        margin="lg",
                    ),
                    FlexText(
                        text="開始使用同盟管理功能！",
                        size="md",
                    ),
                ],
            ),
            footer=FlexBox(
                layout="vertical",
                contents=[
                    FlexButton(
                        action=URIAction(
                            label="開始使用",
                            uri=liff_url,
                        ),
                        style="primary",
                        color="#1DB446",
                    ),
                ],
            ),
        )

        line_bot.reply_message(
            ReplyMessageRequest(
                reply_token=reply_token,
                messages=[FlexMessage(
                    alt_text="✅ 綁定成功！點擊開始使用",
                    contents=bubble,
                )],
            )
        )
    except Exception as e:
        logger.error(f"Failed to send bind success message: {e}")


async def _send_liff_entry(
    line_group_id: str,
    reply_token: str,
    settings: Settings,
) -> None:
    """發送 LIFF 入口（被 @ 時）"""
    if not settings.liff_id:
        await _reply_text(reply_token, "💡 功能開發中～")
        return

    liff_url = create_liff_url(settings.liff_id, line_group_id)
    line_bot = get_line_bot_api()

    if not line_bot:
        await _reply_text(reply_token, f"📱 點擊開始使用：\n{liff_url}")
        return

    try:
        from linebot.v3.messaging import (
            FlexBox,
            FlexBubble,
            FlexButton,
            FlexMessage,
            FlexText,
            ReplyMessageRequest,
            URIAction,
        )

        bubble = FlexBubble(
            body=FlexBox(
                layout="vertical",
                contents=[
                    FlexText(
                        text="📱 三國小幫手",
                        weight="bold",
                        size="lg",
                    ),
                    FlexText(
                        text="查看表現、註冊帳號、管理銅礦",
                        size="sm",
                        color="#666666",
                        margin="md",
                    ),
                ],
            ),
            footer=FlexBox(
                layout="vertical",
                contents=[
                    FlexButton(
                        action=URIAction(
                            label="開啟",
                            uri=liff_url,
                        ),
                        style="primary",
                    ),
                ],
            ),
        )

        line_bot.reply_message(
            ReplyMessageRequest(
                reply_token=reply_token,
                messages=[FlexMessage(
                    alt_text="📱 點擊開始使用",
                    contents=bubble,
                )],
            )
        )
    except Exception as e:
        logger.error(f"Failed to send LIFF entry: {e}")


async def _send_liff_welcome(reply_token: str, liff_url: str) -> None:
    """發送新成員歡迎訊息"""
    line_bot = get_line_bot_api()
    if not line_bot:
        return

    try:
        from linebot.v3.messaging import (
            FlexBox,
            FlexBubble,
            FlexButton,
            FlexMessage,
            FlexText,
            ReplyMessageRequest,
            URIAction,
        )

        bubble = FlexBubble(
            body=FlexBox(
                layout="vertical",
                contents=[
                    FlexText(
                        text="👋 歡迎加入！",
                        weight="bold",
                        size="lg",
                    ),
                    FlexText(
                        text="點擊下方按鈕開始使用～",
                        size="sm",
                        color="#666666",
                        margin="md",
                    ),
                ],
            ),
            footer=FlexBox(
                layout="vertical",
                contents=[
                    FlexButton(
                        action=URIAction(
                            label="開始使用",
                            uri=liff_url,
                        ),
                        style="primary",
                    ),
                ],
            ),
        )

        line_bot.reply_message(
            ReplyMessageRequest(
                reply_token=reply_token,
                messages=[FlexMessage(
                    alt_text="👋 歡迎加入！點擊開始使用",
                    contents=bubble,
                )],
            )
        )
    except Exception as e:
        logger.error(f"Failed to send welcome message: {e}")


async def _send_liff_first_message_reminder(
    line_group_id: str,
    reply_token: str,
    settings: Settings,
) -> None:
    """發送首次發言提醒（輕量版）"""
    if not settings.liff_id:
        return

    liff_url = create_liff_url(settings.liff_id, line_group_id)

    # 使用簡短文字訊息，減少打擾感
    await _reply_text(
        reply_token,
        f"💡 尚未註冊？點這裡開始 → {liff_url}"
    )


async def _reply_text(reply_token: str, text: str) -> None:
    """發送文字回覆"""
    line_bot = get_line_bot_api()
    if not line_bot:
        logger.warning("LINE Bot API not available")
        return

    try:
        from linebot.v3.messaging import ReplyMessageRequest, TextMessage

        line_bot.reply_message(
            ReplyMessageRequest(
                reply_token=reply_token,
                messages=[TextMessage(text=text)],
            )
        )
    except Exception as e:
        logger.error(f"Failed to reply: {e}")
