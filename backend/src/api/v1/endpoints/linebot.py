"""
LINE Bot API Endpoints

Endpoints for LINE Bot integration:
- Web App: Generate binding code, get status, unbind
- LIFF: Get member info, register game ID
- Webhook: Handle LINE events

符合 CLAUDE.md 🔴:
- API Layer only handles HTTP concerns
- Business logic delegated to Service layer
- Root routes defined as @router.get("") not "/"
"""

import json
import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status

from src.core.config import Settings, get_settings
from src.core.dependencies import (
    AllianceServiceDep,
    CopperMineServiceDep,
    LineBindingServiceDep,
    PermissionServiceDep,
    UserIdDep,
)
from src.core.line_auth import WebhookBodyDep, create_liff_url, get_line_bot_api
from src.models.copper_mine import (
    CopperMineCreate,
    CopperMineListResponse,
    RegisterCopperResponse,
)
from src.models.line_binding import (
    LineBindingCodeResponse,
    LineBindingStatusResponse,
    LineWebhookRequest,
    MemberInfoResponse,
    MemberLineBindingCreate,
    RegisterMemberResponse,
)
from src.services.line_binding_service import LineBindingService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/linebot", tags=["LINE Bot"])


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
    """
    Generate a new binding code for the user's alliance

    - Requires owner or admin role
    - Code expires in 5 minutes
    - Rate limited to 3 codes per hour
    """
    # Get user's alliance
    alliance = await alliance_service.get_user_alliance(user_id)
    if not alliance:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User has no alliance"
        )

    # Check permission (owner or collaborator)
    await permission_service.require_update_permission(user_id, alliance.id)

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
    """
    Get current LINE binding status

    Returns:
    - is_bound: Whether alliance has active LINE group binding
    - binding: Group binding details (if bound)
    - pending_code: Pending binding code (if not bound but code generated)
    """
    # Get user's alliance
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
    """
    Unbind LINE group from alliance

    - Requires owner or admin role
    - Member bindings are preserved
    """
    # Get user's alliance
    alliance = await alliance_service.get_user_alliance(user_id)
    if not alliance:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User has no alliance"
        )

    # Check permission
    await permission_service.require_update_permission(user_id, alliance.id)

    await service.unbind_group(alliance.id)
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
    """
    Get member info for LIFF page

    Query params:
    - u: LINE user ID
    - g: LINE group ID
    """
    return await service.get_member_info(
        line_user_id=u,
        line_group_id=g
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
    """
    Register a game ID for a LINE user

    - Game ID is matched against members table for auto-verification
    - Returns 409 if game ID already registered by another user
    """
    return await service.register_member(
        line_group_id=data.line_group_id,
        line_user_id=data.line_user_id,
        line_display_name=data.line_display_name,
        game_id=data.game_id
    )


# =============================================================================
# Copper Mine LIFF Endpoints
# =============================================================================


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
    """
    Get copper mines list for LIFF page

    Query params:
    - u: LINE user ID
    - g: LINE group ID
    """
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
    """
    Register a copper mine location

    - Coordinates must be unique within alliance
    - Returns 409 if mine already exists at coordinates
    """
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
    """
    Delete a copper mine by ID

    Query params:
    - u: LINE user ID
    - g: LINE group ID
    """
    from uuid import UUID
    await service.delete_mine(
        mine_id=UUID(mine_id),
        line_group_id=g,
        line_user_id=u
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# =============================================================================
# LINE Webhook Endpoint
# =============================================================================


@router.post(
    "/webhook",
    summary="LINE webhook",
    description="Handle LINE webhook events"
)
async def handle_webhook(
    body: WebhookBodyDep,
    service: LineBindingServiceDep,
    settings: Settings = Depends(get_settings),
) -> str:
    """
    Handle LINE webhook events

    - Validates X-Line-Signature header
    - Processes message events for bot commands
    """
    try:
        data = json.loads(body.decode("utf-8"))
        webhook_request = LineWebhookRequest(**data)
    except (json.JSONDecodeError, ValueError) as e:
        logger.error(f"Failed to parse webhook request: {e}")
        return "OK"

    for event in webhook_request.events:
        await _handle_event(event, service, settings)

    return "OK"


async def _handle_event(
    event: dict,
    service: LineBindingService,
    settings: Settings,
) -> None:
    """Handle a single LINE event"""
    event_type = event.get("type")

    if event_type != "message":
        return

    message = event.get("message", {})
    if message.get("type") != "text":
        return

    text = message.get("text", "").strip()
    source = event.get("source", {})
    reply_token = event.get("replyToken")

    # Only handle group messages
    if source.get("type") != "group":
        return

    line_group_id = source.get("groupId")
    line_user_id = source.get("userId")

    if not line_group_id or not line_user_id or not reply_token:
        return

    # Handle commands
    if text.startswith("/綁定 ") or text.startswith("/绑定 "):
        code = text.split(" ", 1)[1].strip().upper()
        await _handle_bind_command(
            code=code,
            line_group_id=line_group_id,
            line_user_id=line_user_id,
            reply_token=reply_token,
            service=service,
        )
    elif text in ("/綁定ID", "/绑定ID", "/綁定id", "/绑定id"):
        await _handle_bind_id_command(
            line_group_id=line_group_id,
            reply_token=reply_token,
            settings=settings,
        )
    elif text in ("/狀態", "/状态"):
        await _handle_status_command(
            line_group_id=line_group_id,
            reply_token=reply_token,
            service=service,
        )
    elif text in ("/幫助", "/帮助", "/help"):
        await _handle_help_command(reply_token=reply_token)


async def _handle_bind_command(
    code: str,
    line_group_id: str,
    line_user_id: str,
    reply_token: str,
    service: LineBindingService,
) -> None:
    """Handle /綁定 command"""
    success, message, alliance_id = await service.validate_and_bind_group(
        code=code,
        line_group_id=line_group_id,
        line_user_id=line_user_id,
    )

    if success:
        reply_text = (
            "✅ 綁定成功！\n\n"
            "盟友們可以發送 /綁定ID 來註冊您的遊戲帳號，\n"
            "讓盟主能更方便追蹤您的表現！\n\n"
            "輸入 /幫助 查看更多指令"
        )
    else:
        reply_text = f"❌ {message}"

    await _reply_text(reply_token, reply_text)


async def _handle_bind_id_command(
    line_group_id: str,
    reply_token: str,
    settings: Settings,
) -> None:
    """Handle /綁定ID command - send LIFF button"""
    if not settings.liff_id:
        await _reply_text(reply_token, "❌ LIFF 未設定")
        return

    liff_url = create_liff_url(settings.liff_id, line_group_id)

    # Try to send Flex Message, fallback to text
    line_bot = get_line_bot_api()
    if line_bot:
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
                            text="註冊遊戲 ID",
                            weight="bold",
                            size="lg",
                        ),
                        FlexText(
                            text="點擊下方按鈕註冊您的遊戲帳號",
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
                                label="開始註冊",
                                uri=liff_url,
                            ),
                            style="primary",
                        ),
                    ],
                ),
            )

            flex_message = FlexMessage(
                alt_text="註冊遊戲 ID",
                contents=bubble,
            )

            line_bot.reply_message(
                ReplyMessageRequest(
                    reply_token=reply_token,
                    messages=[flex_message],
                )
            )
            return
        except Exception as e:
            logger.error(f"Failed to send Flex Message: {e}")

    # Fallback to text
    await _reply_text(
        reply_token,
        f"📝 請點擊以下連結註冊您的遊戲 ID：\n{liff_url}"
    )


async def _handle_status_command(
    line_group_id: str,
    reply_token: str,
    service: LineBindingService,
) -> None:
    """Handle /狀態 command"""
    status_info = await service.get_group_status(line_group_id)

    if status_info:
        reply_text = (
            f"📊 群組綁定狀態\n\n"
            f"已綁定同盟\n"
            f"已註冊成員: {status_info['member_count']} 人\n"
            f"綁定時間: {status_info['bound_at']}"
        )
    else:
        reply_text = "❌ 此群組尚未綁定任何同盟"

    await _reply_text(reply_token, reply_text)


async def _handle_help_command(reply_token: str) -> None:
    """Handle /幫助 command"""
    reply_text = (
        "📖 指令說明\n\n"
        "/綁定 <綁定碼> - 綁定同盟\n"
        "/綁定ID - 註冊遊戲帳號\n"
        "/狀態 - 查看綁定狀態\n"
        "/幫助 - 顯示此說明"
    )
    await _reply_text(reply_token, reply_text)


async def _reply_text(reply_token: str, text: str) -> None:
    """Send text reply via LINE API"""
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
