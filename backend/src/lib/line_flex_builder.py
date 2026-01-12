"""
LINE Flex Message Builder

Utility functions for building LINE Flex Messages.

This module provides builders for various report types:
- Event group analytics report (戰役報告)
"""

import logging
from datetime import datetime

from src.models.battle_event_metrics import EventGroupAnalytics, GroupEventStats

logger = logging.getLogger(__name__)


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


def build_event_report_flex(analytics: EventGroupAnalytics):
    """
    Build a Flex Message for battle event report.

    Args:
        analytics: EventGroupAnalytics with all data

    Returns:
        FlexMessage object ready to send
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

    # Build header section
    header_contents = [
        FlexText(
            text=f"⚔️ {analytics.event_name}",
            weight="bold",
            size="xl",
            color="#1a1a1a",
        ),
    ]

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

    # Section 1: Overall participation rate
    body_contents.extend(
        [
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
                color="#1DB446",
                align="center",
                margin="md",
            ),
            FlexText(
                text=f"{summary.participated_count}/{summary.participated_count + summary.absent_count}人 參戰",
                size="sm",
                color="#666666",
                align="center",
            ),
            FlexSeparator(margin="lg"),
        ]
    )

    # Section 2: Group attendance rates with progress bars
    if analytics.group_stats:
        body_contents.append(
            FlexText(
                text="🏘️ 組別出席率",
                weight="bold",
                size="md",
                color="#1a1a1a",
                margin="lg",
            )
        )
        body_contents.append(FlexSeparator(margin="sm"))

        for group in analytics.group_stats[:5]:
            body_contents.extend(_build_group_attendance_row(group))

        body_contents.append(FlexSeparator(margin="lg"))

    # Section 3: Group average merit distribution
    participating_groups = [g for g in analytics.group_stats[:5] if g.participated_count > 0]
    if participating_groups:
        body_contents.append(
            FlexText(
                text="⚔️ 組別人均戰功",
                weight="bold",
                size="md",
                color="#1a1a1a",
                margin="lg",
            )
        )
        body_contents.append(FlexSeparator(margin="sm"))

        # Find max avg_merit for bar scaling
        max_avg_merit = max(g.avg_merit for g in participating_groups)

        for i, group in enumerate(participating_groups):
            body_contents.extend(
                _build_group_merit_row(group, max_avg_merit, is_top=(i == 0))
            )

        body_contents.append(FlexSeparator(margin="lg"))

    # Section 4: Top 5 ranking
    if analytics.top_members:
        body_contents.append(
            FlexText(
                text="🏆 戰功 Top 5",
                weight="bold",
                size="md",
                color="#1a1a1a",
                margin="lg",
            )
        )
        body_contents.append(FlexSeparator(margin="sm"))

        for member in analytics.top_members:
            body_contents.append(_build_ranking_row(member))

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
        alt_text=f"⚔️ {analytics.event_name} 戰役報告",
        contents=bubble,
    )


def _build_group_attendance_row(group: GroupEventStats) -> list:
    """Build attendance row with progress bar for a group."""
    from linebot.v3.messaging import FlexBox, FlexText

    bar_color = "#06C755"  # LINE Green
    bar_width = max(2, int(group.participation_rate))

    return [
        # Group name and stats row
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
                    color="#06C755",
                    weight="bold",
                    align="end",
                    flex=1,
                ),
            ],
            margin="md",
        ),
        # Progress bar
        FlexBox(
            layout="horizontal",
            contents=[
                FlexBox(
                    layout="vertical",
                    contents=[],
                    backgroundColor=bar_color,
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


def _build_group_merit_row(
    group: GroupEventStats, max_avg_merit: float, is_top: bool = False
) -> list:
    """Build merit distribution row with bar chart for a group."""
    from linebot.v3.messaging import FlexBox, FlexText

    name_text = group.group_name
    if is_top:
        name_text += " ⭐"

    merit_range = f"{format_number(group.merit_min)}~{format_number(group.merit_max)}"
    bar_color = "#06C755"  # LINE Green
    bar_width = max(5, int((group.avg_merit / max_avg_merit) * 100)) if max_avg_merit > 0 else 5

    return [
        # Group name and avg merit row
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
                    text=f"均 {format_number(int(group.avg_merit))}",
                    size="sm",
                    color="#06C755",
                    weight="bold",
                    align="end",
                    flex=2,
                ),
                FlexText(
                    text=merit_range,
                    size="xs",
                    color="#888888",
                    align="end",
                    flex=2,
                ),
            ],
            margin="md",
        ),
        # Bar chart
        FlexBox(
            layout="horizontal",
            contents=[
                FlexBox(
                    layout="vertical",
                    contents=[],
                    backgroundColor=bar_color,
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


def _build_ranking_row(member):
    """Build a ranking row for top members."""
    from linebot.v3.messaging import FlexBox, FlexText

    # Medal for top 3
    rank_icons = {1: "🥇", 2: "🥈", 3: "🥉"}
    rank_text = rank_icons.get(member.rank, f" {member.rank}")

    # Display name: prefer LINE name if available
    display_name = member.member_name
    if member.line_display_name:
        display_name = f"{member.member_name} ({member.line_display_name})"

    return FlexBox(
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
                text=format_number(member.merit_diff),
                size="sm",
                color="#666666",
                align="end",
                flex=2,
            ),
        ],
        margin="sm",
    )
