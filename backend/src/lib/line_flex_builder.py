"""
LINE Flex Message Builder

Utility functions for building LINE Flex Messages.

This module provides builders for various report types:
- Event group analytics report (戰役報告) - category-aware
- Event list carousel (戰役列表)
- LIFF entry (熱血戰場風)
"""

import logging
from datetime import datetime

from src.models.battle_event import BattleEvent, EventCategory
from src.models.battle_event_metrics import (
    EventGroupAnalytics,
    GroupEventStats,
    TopMemberItem,
    ViolatorItem,
)

logger = logging.getLogger(__name__)

# =============================================================================
# Constants
# =============================================================================

LINE_GREEN = "#06C755"
LINE_RED = "#FF5555"
SIEGE_ORANGE = "#E67E22"
BATTLE_BLUE = "#4A90D9"

EVENT_TYPE_CONFIG = {
    EventCategory.BATTLE: {
        "icon": "⚔️",
        "label": "戰役",
        "color": BATTLE_BLUE,
        "metric_title": "組別人均戰功",
        "ranking_title": "🏆 戰功 Top 5",
    },
    EventCategory.SIEGE: {
        "icon": "🏰",
        "label": "攻城",
        "color": SIEGE_ORANGE,
        "metric_title": "組別人均貢獻",
        "ranking_title": "🏰 貢獻排行",
    },
    EventCategory.FORBIDDEN: {
        "icon": "🚫",
        "label": "禁地",
        "color": LINE_RED,
        "metric_title": None,  # No metric section for forbidden
        "ranking_title": "⚠️ 違規名單",
    },
}


# =============================================================================
# Formatters
# =============================================================================


def format_number(n: int | float) -> str:
    """
    Format number with K/M suffix for readability.

    Args:
        n: Number to format

    Returns:
        Formatted string (e.g., "85K", "1.5M", "8,500")
    """
    if n >= 1_000_000:
        return f"{n / 1_000_000:.1f}M"
    elif n >= 10_000:
        return f"{int(n / 1_000)}K"
    else:
        return f"{n:,}"


def format_duration(start: datetime | None, end: datetime | None) -> str:
    """
    Format duration between two datetimes.

    Args:
        start: Start datetime
        end: End datetime

    Returns:
        Duration string (e.g., "53分鐘", "2小時15分")
    """
    if not start or not end:
        return ""

    delta = end - start
    total_minutes = int(delta.total_seconds() / 60)

    if total_minutes < 60:
        return f"{total_minutes}分鐘"

    hours = total_minutes // 60
    minutes = total_minutes % 60

    if minutes == 0:
        return f"{hours}小時"
    return f"{hours}小時{minutes}分"


def format_event_time(dt: datetime | None) -> str:
    """
    Format datetime for event display.

    Args:
        dt: Datetime to format

    Returns:
        Formatted string (e.g., "01/15 06:42")
    """
    if not dt:
        return ""
    return dt.strftime("%m/%d %H:%M")


def _get_event_config(event_type: EventCategory | None) -> dict:
    """Get event type configuration, defaulting to BATTLE."""
    return EVENT_TYPE_CONFIG.get(event_type or EventCategory.BATTLE, EVENT_TYPE_CONFIG[EventCategory.BATTLE])


# =============================================================================
# Event Report Flex Message Builder (Category-aware)
# =============================================================================


def build_event_report_flex(analytics: EventGroupAnalytics):
    """
    Build a category-aware Flex Message for battle event report.

    Content varies by event_type:
    - BATTLE: participation rate, group merit, top 5 merit
    - SIEGE: participation rate, group contribution+assist, top 5 combined
    - FORBIDDEN: compliance rate, group violator distribution, violator list

    Args:
        analytics: EventGroupAnalytics with all data

    Returns:
        FlexMessage object ready to send, or None if SDK not available
    """
    try:
        from linebot.v3.messaging import (
            FlexBox,
            FlexBubble,
            FlexMessage,
            FlexSeparator,
            FlexText,
        )
    except ImportError:
        logger.error("linebot SDK not installed")
        return None

    summary = analytics.summary
    event_type = analytics.event_type or EventCategory.BATTLE
    config = _get_event_config(event_type)
    is_forbidden = event_type == EventCategory.FORBIDDEN

    # Build header section
    header_contents = [
        FlexText(
            text=f"{config['icon']} {analytics.event_name}",
            weight="bold",
            size="xl",
            color="#1a1a1a",
            wrap=True,
        ),
    ]

    # Add type tag
    header_contents.append(
        FlexBox(
            layout="horizontal",
            contents=[
                FlexText(
                    text=config["label"],
                    size="xs",
                    color="#ffffff",
                    align="center",
                ),
            ],
            backgroundColor=config["color"],
            cornerRadius="4px",
            paddingAll="4px",
            width="48px",
            margin="sm",
        )
    )

    # Add time info if available
    time_str = format_event_time(analytics.event_start)
    duration_str = format_duration(analytics.event_start, analytics.event_end)
    if time_str:
        time_line = time_str
        if duration_str:
            time_line += f" · {duration_str}"
        header_contents.append(
            FlexText(text=time_line, size="sm", color="#666666", margin="sm")
        )

    # Build body sections
    body_contents = []

    # Section 1: Overall rate (participation or compliance)
    if is_forbidden:
        body_contents.extend(_build_compliance_section(summary))
    else:
        body_contents.extend(_build_participation_section(summary))

    body_contents.append(FlexSeparator(margin="lg"))

    # Section 2: Group statistics
    if analytics.group_stats:
        if is_forbidden:
            body_contents.extend(_build_group_violator_section(analytics.group_stats[:5]))
        else:
            body_contents.extend(_build_group_attendance_section(analytics.group_stats[:5]))

        body_contents.append(FlexSeparator(margin="lg"))

    # Section 3: Group average metric (BATTLE/SIEGE only)
    if not is_forbidden:
        participating_groups = [g for g in analytics.group_stats[:5] if g.participated_count > 0]
        if participating_groups:
            body_contents.extend(
                _build_group_metric_section(participating_groups, event_type, config)
            )
            body_contents.append(FlexSeparator(margin="lg"))

    # Section 4: Ranking or violator list
    if is_forbidden:
        if analytics.violators:
            body_contents.extend(_build_violator_list_section(analytics.violators, config))
    else:
        if analytics.top_members:
            body_contents.extend(
                _build_ranking_section(analytics.top_members, event_type, config)
            )

    # Build bubble
    bubble = FlexBubble(
        header=FlexBox(
            layout="vertical",
            contents=header_contents,
            paddingAll="lg",
            backgroundColor="#f8f8f8",
        ),
        body=FlexBox(
            layout="vertical",
            contents=body_contents,
            paddingAll="lg",
        ),
    )

    return FlexMessage(
        alt_text=f"{config['icon']} {analytics.event_name} 報告",
        contents=bubble,
    )


def _build_participation_section(summary) -> list:
    """Build participation rate section for BATTLE/SIEGE events."""
    from linebot.v3.messaging import FlexSeparator, FlexText

    eligible_count = summary.participated_count + summary.absent_count
    return [
        FlexText(
            text="📊 整體出席率",
            weight="bold",
            size="md",
            color="#1a1a1a",
        ),
        FlexSeparator(margin="sm"),
        FlexText(
            text=f"{summary.participation_rate:.0f}%",
            weight="bold",
            size="xxl",
            color=LINE_GREEN,
            align="center",
            margin="md",
        ),
        FlexText(
            text=f"{summary.participated_count}/{eligible_count}人 參戰",
            size="sm",
            color="#666666",
            align="center",
        ),
    ]


def _build_compliance_section(summary) -> list:
    """Build compliance rate section for FORBIDDEN events."""
    from linebot.v3.messaging import FlexSeparator, FlexText

    compliance_rate = (
        ((summary.total_members - summary.violator_count) / summary.total_members * 100)
        if summary.total_members > 0
        else 100.0
    )
    has_violators = summary.violator_count > 0

    status_text = (
        f"{summary.violator_count} 人違規"
        if has_violators
        else "全員遵守規定 ✓"
    )
    status_color = LINE_RED if has_violators else LINE_GREEN

    return [
        FlexText(
            text="🚫 禁地守規率",
            weight="bold",
            size="md",
            color="#1a1a1a",
        ),
        FlexSeparator(margin="sm"),
        FlexText(
            text=f"{compliance_rate:.0f}%",
            weight="bold",
            size="xxl",
            color=LINE_GREEN if not has_violators else LINE_RED,
            align="center",
            margin="md",
        ),
        FlexText(
            text=status_text,
            size="sm",
            color=status_color,
            align="center",
            weight="bold" if has_violators else None,
        ),
    ]


def _build_group_attendance_section(groups: list[GroupEventStats]) -> list:
    """Build group attendance section with progress bars."""
    from linebot.v3.messaging import FlexSeparator, FlexText

    contents = [
        FlexText(
            text="🏘️ 組別出席率",
            weight="bold",
            size="md",
            color="#1a1a1a",
            margin="lg",
        ),
        FlexSeparator(margin="sm"),
    ]

    sorted_groups = sorted(groups, key=lambda g: g.participation_rate, reverse=True)
    for group in sorted_groups:
        contents.extend(_build_group_attendance_row(group))

    return contents


def _build_group_attendance_row(group: GroupEventStats) -> list:
    """Build attendance row with progress bar for a group."""
    from linebot.v3.messaging import FlexBox, FlexText

    bar_width = max(2, int(group.participation_rate))

    return [
        FlexBox(
            layout="horizontal",
            contents=[
                FlexText(
                    text=group.group_name,
                    size="sm",
                    color="#1a1a1a",
                    flex=3,
                ),
                FlexText(
                    text=f"{group.participated_count}/{group.member_count}",
                    size="sm",
                    color="#666666",
                    align="end",
                    flex=1,
                ),
                FlexText(
                    text=f"{group.participation_rate:.0f}%",
                    size="sm",
                    color=LINE_GREEN,
                    weight="bold",
                    align="end",
                    flex=1,
                ),
            ],
            margin="md",
        ),
        FlexBox(
            layout="horizontal",
            contents=[
                FlexBox(
                    layout="vertical",
                    contents=[],
                    backgroundColor=LINE_GREEN,
                    width=f"{bar_width}%",
                    height="6px",
                    cornerRadius="3px",
                ),
            ],
            backgroundColor="#E8E8E8",
            height="6px",
            cornerRadius="3px",
            margin="sm",
        ),
    ]


def _build_group_violator_section(groups: list[GroupEventStats]) -> list:
    """Build group violator distribution section for FORBIDDEN events."""
    from linebot.v3.messaging import FlexBox, FlexSeparator, FlexText

    # Filter groups with violators
    groups_with_violators = [g for g in groups if g.violator_count > 0]

    contents = [
        FlexText(
            text="⚠️ 分組違規統計",
            weight="bold",
            size="md",
            color="#1a1a1a",
            margin="lg",
        ),
        FlexSeparator(margin="sm"),
    ]

    if not groups_with_violators:
        contents.append(
            FlexText(
                text="無違規記錄 ✓",
                size="sm",
                color=LINE_GREEN,
                align="center",
                margin="md",
            )
        )
        return contents

    max_violators = max(g.violator_count for g in groups_with_violators)
    sorted_groups = sorted(groups_with_violators, key=lambda g: g.violator_count, reverse=True)

    for group in sorted_groups:
        bar_width = max(5, int((group.violator_count / max_violators) * 100))
        contents.extend([
            FlexBox(
                layout="horizontal",
                contents=[
                    FlexText(
                        text=group.group_name,
                        size="sm",
                        color="#1a1a1a",
                        flex=3,
                    ),
                    FlexText(
                        text=f"{group.violator_count} 人違規",
                        size="sm",
                        color=LINE_RED,
                        weight="bold",
                        align="end",
                        flex=2,
                    ),
                ],
                margin="md",
            ),
            FlexBox(
                layout="horizontal",
                contents=[
                    FlexBox(
                        layout="vertical",
                        contents=[],
                        backgroundColor=LINE_RED,
                        width=f"{bar_width}%",
                        height="6px",
                        cornerRadius="3px",
                    ),
                ],
                backgroundColor="#E8E8E8",
                height="6px",
                cornerRadius="3px",
                margin="sm",
            ),
        ])

    return contents


def _build_group_metric_section(
    groups: list[GroupEventStats], event_type: EventCategory, config: dict
) -> list:
    """Build group average metric section (BATTLE: merit, SIEGE: contribution+assist)."""
    from linebot.v3.messaging import FlexBox, FlexSeparator, FlexText

    is_siege = event_type == EventCategory.SIEGE

    def get_avg_value(g: GroupEventStats) -> float:
        if is_siege:
            return g.avg_contribution + g.avg_assist
        return g.avg_merit

    def get_range_text(g: GroupEventStats) -> str:
        if is_siege:
            return f"{format_number(g.combined_min)}~{format_number(g.combined_max)}"
        return f"{format_number(g.merit_min)}~{format_number(g.merit_max)}"

    sorted_groups = sorted(groups, key=get_avg_value, reverse=True)
    max_avg = max(get_avg_value(g) for g in sorted_groups) if sorted_groups else 1

    contents = [
        FlexText(
            text=f"{config['icon']} {config['metric_title']}",
            weight="bold",
            size="md",
            color="#1a1a1a",
            margin="lg",
        ),
        FlexSeparator(margin="sm"),
    ]

    for i, group in enumerate(sorted_groups):
        avg_value = get_avg_value(group)
        bar_width = max(5, int((avg_value / max_avg) * 100)) if max_avg > 0 else 5
        name_text = f"{group.group_name} ⭐" if i == 0 else group.group_name

        contents.extend([
            FlexBox(
                layout="horizontal",
                contents=[
                    FlexText(
                        text=name_text,
                        size="sm",
                        color="#1a1a1a",
                        flex=3,
                    ),
                    FlexText(
                        text=f"均 {format_number(int(avg_value))}",
                        size="sm",
                        color=config["color"],
                        weight="bold",
                        align="end",
                        flex=2,
                    ),
                    FlexText(
                        text=get_range_text(group),
                        size="xs",
                        color="#888888",
                        align="end",
                        flex=2,
                    ),
                ],
                margin="md",
            ),
            FlexBox(
                layout="horizontal",
                contents=[
                    FlexBox(
                        layout="vertical",
                        contents=[],
                        backgroundColor=config["color"],
                        width=f"{bar_width}%",
                        height="6px",
                        cornerRadius="3px",
                    ),
                ],
                backgroundColor="#E8E8E8",
                height="6px",
                cornerRadius="3px",
                margin="sm",
            ),
        ])

    return contents


def _build_ranking_section(
    top_members: list[TopMemberItem], event_type: EventCategory, config: dict
) -> list:
    """Build ranking section for BATTLE/SIEGE events."""
    from linebot.v3.messaging import FlexBox, FlexSeparator, FlexText

    is_siege = event_type == EventCategory.SIEGE

    contents = [
        FlexText(
            text=config["ranking_title"],
            weight="bold",
            size="md",
            color="#1a1a1a",
            margin="lg",
        ),
        FlexSeparator(margin="sm"),
    ]

    rank_icons = {1: "🥇", 2: "🥈", 3: "🥉"}

    for member in top_members:
        rank_text = rank_icons.get(member.rank, f" {member.rank}")
        display_name = member.member_name
        if member.line_display_name:
            display_name = f"{member.member_name} ({member.line_display_name})"

        # Score display
        if is_siege and member.contribution_diff is not None and member.assist_diff is not None:
            score_text = f"{format_number(member.score)} ({format_number(member.contribution_diff)}+{format_number(member.assist_diff)})"
        else:
            score_text = format_number(member.score)

        contents.append(
            FlexBox(
                layout="horizontal",
                contents=[
                    FlexText(
                        text=rank_text,
                        size="sm",
                        flex=0,
                    ),
                    FlexText(
                        text=display_name,
                        size="sm",
                        color="#1a1a1a",
                        flex=4,
                        margin="sm",
                    ),
                    FlexText(
                        text=score_text,
                        size="sm",
                        color="#666666",
                        align="end",
                        flex=2,
                    ),
                ],
                margin="sm",
            )
        )

    return contents


def _build_violator_list_section(violators: list[ViolatorItem], config: dict) -> list:
    """Build violator list section for FORBIDDEN events."""
    from linebot.v3.messaging import FlexBox, FlexSeparator, FlexText

    contents = [
        FlexText(
            text=config["ranking_title"],
            weight="bold",
            size="md",
            color="#1a1a1a",
            margin="lg",
        ),
        FlexSeparator(margin="sm"),
    ]

    if not violators:
        contents.append(
            FlexText(
                text="本次禁地期間無人違規 🎉",
                size="sm",
                color=LINE_GREEN,
                align="center",
                margin="md",
            )
        )
        return contents

    for i, violator in enumerate(violators):
        display_name = violator.member_name
        if violator.line_display_name:
            display_name = f"{violator.member_name} ({violator.line_display_name})"

        contents.append(
            FlexBox(
                layout="horizontal",
                contents=[
                    FlexText(
                        text=f"{i + 1}.",
                        size="sm",
                        color=LINE_RED,
                        weight="bold",
                        flex=0,
                    ),
                    FlexText(
                        text=display_name,
                        size="sm",
                        color="#1a1a1a",
                        flex=4,
                        margin="sm",
                    ),
                    FlexText(
                        text=f"+{format_number(violator.power_diff)}",
                        size="sm",
                        color=LINE_RED,
                        weight="bold",
                        align="end",
                        flex=2,
                    ),
                ],
                margin="sm",
            )
        )

    return contents


# =============================================================================
# Event List Carousel Builder
# =============================================================================


def build_event_list_carousel(
    events: list[BattleEvent],
    liff_id: str | None = None,
    group_id: str | None = None,
):
    """
    Build a Carousel Flex Message for event list.

    Each bubble shows:
    - Event name with type icon
    - Event date and duration
    - Key metric (based on type)
    - Button to open LIFF event report

    Args:
        events: List of BattleEvent objects
        liff_id: LIFF ID for generating event report URLs
        group_id: LINE group ID for generating event report URLs

    Returns:
        FlexMessage carousel, or None if SDK not available
    """
    try:
        from linebot.v3.messaging import (
            FlexBox,
            FlexBubble,
            FlexButton,
            FlexCarousel,
            FlexMessage,
            FlexSeparator,
            FlexText,
            MessageAction,
            URIAction,
        )
    except ImportError:
        logger.error("linebot SDK not installed")
        return None

    if not events:
        return None

    # Import here to avoid circular imports
    from src.core.line_auth import create_event_report_liff_url

    bubbles = []
    for event in events:
        config = _get_event_config(event.event_type)

        # Build bubble content
        body_contents = [
            # Event name with icon
            FlexText(
                text=f"{config['icon']} {event.name}",
                weight="bold",
                size="lg",
                color="#1a1a1a",
                wrap=True,
            ),
            # Type tag
            FlexBox(
                layout="horizontal",
                contents=[
                    FlexText(
                        text=config["label"],
                        size="xs",
                        color="#ffffff",
                        align="center",
                    ),
                ],
                backgroundColor=config["color"],
                cornerRadius="4px",
                paddingAll="4px",
                width="48px",
                margin="sm",
            ),
            FlexSeparator(margin="lg"),
        ]

        # Time info
        time_str = format_event_time(event.event_start)
        if time_str:
            duration_str = format_duration(event.event_start, event.event_end)
            time_line = time_str
            if duration_str:
                time_line += f" · {duration_str}"
            body_contents.append(
                FlexText(
                    text=time_line,
                    size="sm",
                    color="#666666",
                    margin="md",
                )
            )

        # Button action: URIAction for LIFF if available, else MessageAction fallback
        if liff_id and group_id:
            button_action = URIAction(
                label="查看報告",
                uri=create_event_report_liff_url(liff_id, group_id, str(event.id)),
            )
        else:
            button_action = MessageAction(
                label="查看報告",
                text=f"@bot /戰役 {event.name}",
            )

        bubble = FlexBubble(
            size="micro",
            body=FlexBox(
                layout="vertical",
                contents=body_contents,
                paddingAll="lg",
            ),
            footer=FlexBox(
                layout="vertical",
                contents=[
                    FlexButton(
                        action=button_action,
                        style="primary",
                        color=config["color"],
                    ),
                ],
            ),
        )
        bubbles.append(bubble)

    carousel = FlexCarousel(contents=bubbles)

    return FlexMessage(
        alt_text="⚔️ 最近戰役列表",
        contents=carousel,
    )


# =============================================================================
# LIFF Entry Flex Message Builder (熱血戰場風)
# =============================================================================


def build_liff_entry_flex(
    title: str,
    subtitle: str,
    button_label: str,
    liff_url: str,
    alt_text: str,
    *,
    title_color: str = "#1a1a1a",
    button_color: str | None = None,
    show_separator: bool = False,
):
    """
    Build a unified LIFF entry Flex Message.

    Args:
        title: Main title text (e.g., "🏰 同盟連結成功！")
        subtitle: Description text (e.g., "各位盟友，點擊登記名號！")
        button_label: Button text (e.g., "立即登記")
        liff_url: LIFF URL for the button action
        alt_text: Alternative text for non-Flex clients
        title_color: Title text color (default: #1a1a1a)
        button_color: Button background color (default: LINE default)
        show_separator: Whether to show separator between title and subtitle

    Returns:
        FlexMessage object ready to send, or None if SDK not available
    """
    try:
        from linebot.v3.messaging import (
            FlexBox,
            FlexBubble,
            FlexButton,
            FlexMessage,
            FlexSeparator,
            FlexText,
            URIAction,
        )
    except ImportError:
        logger.error("linebot SDK not installed")
        return None

    # Build body contents
    body_contents = [
        FlexText(
            text=title,
            weight="bold",
            size="lg" if not show_separator else "xl",
            color=title_color,
        ),
    ]

    if show_separator:
        body_contents.append(FlexSeparator(margin="lg"))

    body_contents.append(
        FlexText(
            text=subtitle,
            size="sm" if not show_separator else "md",
            color="#666666" if not show_separator else "#1a1a1a",
            margin="lg" if show_separator else "md",
        )
    )

    # Build button with optional color
    button_kwargs = {
        "action": URIAction(label=button_label, uri=liff_url),
        "style": "primary",
    }
    if button_color:
        button_kwargs["color"] = button_color

    bubble = FlexBubble(
        body=FlexBox(
            layout="vertical",
            contents=body_contents,
        ),
        footer=FlexBox(
            layout="vertical",
            contents=[FlexButton(**button_kwargs)],
        ),
    )

    return FlexMessage(alt_text=alt_text, contents=bubble)
