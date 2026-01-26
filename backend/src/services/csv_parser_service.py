"""
CSV Parser Service

符合 CLAUDE.md 🟡:
- Stateless data transformation (Processor pattern would also work)
- Extracts datetime from filename
- Parses CSV content into structured data
"""

import csv
import re
from datetime import UTC, datetime
from io import StringIO

from src.core.config import GAME_TIMEZONE


class CSVParserService:
    """Service for parsing Three Kingdoms CSV files"""

    # Filename pattern: 同盟統計2025年10月09日10时13分09秒.csv
    FILENAME_PATTERN = re.compile(
        r"同盟統計(\d{4})年(\d{2})月(\d{2})日(\d{2})时(\d{2})分(\d{2})秒\.csv"
    )

    # Field name mapping: internal_name -> list of possible CSV column names
    # Supports multiple game versions with different field naming conventions
    FIELD_ALIASES: dict[str, list[str]] = {
        "member_name": ["成員", "成员", "玩家", "名稱", "名称"],
        "contribution_rank": ["貢獻排行", "贡献排行", "排行", "排名"],
        "weekly_contribution": ["貢獻本週", "贡献本周", "本週貢獻", "本周贡献"],
        "weekly_merit": ["戰功本週", "战功本周", "本週戰功", "本周战功"],
        "weekly_assist": ["助攻本週", "助攻本周", "本週助攻", "本周助攻"],
        "weekly_donation": ["捐獻本週", "捐献本周", "本週捐獻", "本周捐献"],
        "total_contribution": ["貢獻總量", "贡献总量", "總貢獻", "总贡献"],
        "total_merit": ["戰功總量", "战功总量", "總戰功", "总战功"],
        "total_assist": ["助攻總量", "助攻总量", "總助攻", "总助攻"],
        "total_donation": ["捐獻總量", "捐献总量", "總捐獻", "总捐献"],
        "power_value": ["勢力值", "势力值", "戰力", "战力", "實力", "实力"],
        "state": ["所屬州", "所属州", "所屬勢力", "所属势力", "州郡", "勢力", "势力"],
        "group_name": ["分組", "分组", "組別", "组别", "小組", "小组"],
    }

    @classmethod
    def extract_datetime_from_filename(cls, filename: str) -> datetime:
        """
        Extract datetime from Three Kingdoms CSV filename.

        CSV filenames contain game server time (UTC+8 Taiwan/China timezone).
        Returns UTC-aware datetime for consistent database storage.

        Args:
            filename: CSV filename (e.g., "同盟統計2025年10月09日10时13分09秒.csv")

        Returns:
            UTC-aware datetime object parsed from filename

        Raises:
            ValueError: If filename format is invalid

        Example:
            >>> dt = CSVParserService.extract_datetime_from_filename(
            ...     "同盟統計2025年10月09日10时13分09秒.csv"
            ... )
            >>> dt.tzinfo  # UTC
            datetime.timezone.utc
        """
        match = cls.FILENAME_PATTERN.match(filename)

        if not match:
            raise ValueError(
                f"Invalid filename format: {filename}. "
                f"Expected format: 同盟統計YYYY年MM月DD日HH时MM分SS秒.csv"
            )

        year, month, day, hour, minute, second = map(int, match.groups())

        # Create datetime in game timezone (UTC+8), then convert to UTC
        local_dt = datetime(
            year, month, day, hour, minute, second, tzinfo=GAME_TIMEZONE
        )
        return local_dt.astimezone(UTC)

    @classmethod
    def _get_field_value(
        cls, row: dict[str, str], field_name: str, required: bool = True
    ) -> str | None:
        """
        Get field value from row using alias mapping

        Args:
            row: CSV row dictionary
            field_name: Internal field name (key in FIELD_ALIASES)
            required: Whether the field is required

        Returns:
            Field value or None if not found and not required

        Raises:
            KeyError: If field is required but not found
        """
        aliases = cls.FIELD_ALIASES.get(field_name, [])

        for alias in aliases:
            if alias in row:
                return row[alias]

        if required:
            raise KeyError(
                f"找不到欄位 '{field_name}'，嘗試了以下名稱: {aliases}。"
                f"CSV 欄位: {list(row.keys())}"
            )

        return None

    @classmethod
    def _parse_int(cls, value: str | None, default: int = 0) -> int:
        """
        Safely parse string to int, returning default for empty/None values.

        Args:
            value: String value to parse
            default: Default value if empty or None

        Returns:
            Parsed integer or default value
        """
        if value is None or value.strip() == "":
            return default
        return int(value)

    @classmethod
    def parse_csv_content(cls, csv_content: str) -> list[dict]:
        """
        Parse CSV content into structured data

        Args:
            csv_content: CSV file content as string

        Returns:
            List of member data dictionaries

        CSV Format:
            成員, 貢獻排行, 貢獻本週, 戰功本週, 助攻本週, 捐獻本週,
            貢獻總量, 戰功總量, 助攻總量, 捐獻總量, 勢力值, 所屬州/所屬勢力, 分組

        符合 CLAUDE.md 🟡: Pure data transformation
        """
        # Remove UTF-8 BOM if present
        if csv_content.startswith("\ufeff"):
            csv_content = csv_content[1:]

        # Read CSV and strip whitespace from field names
        lines = csv_content.splitlines()

        if not lines:
            raise ValueError("CSV file is empty")

        # Strip whitespace from header
        header = [field.strip() for field in lines[0].split(",")]

        # Create new CSV content with cleaned header
        cleaned_csv = ",".join(header) + "\n" + "\n".join(lines[1:])

        reader = csv.DictReader(StringIO(cleaned_csv))

        members = []
        for row in reader:
            # Strip whitespace from all values
            row = {k.strip(): v.strip() for k, v in row.items()}

            # Get group name and handle "未分組" as None
            group_value = cls._get_field_value(row, "group_name", required=False)
            group_name = None if group_value in (None, "未分組", "未分组") else group_value

            member_data = {
                "member_name": cls._get_field_value(row, "member_name"),
                "contribution_rank": cls._parse_int(cls._get_field_value(row, "contribution_rank", required=False), default=0),
                "weekly_contribution": cls._parse_int(cls._get_field_value(row, "weekly_contribution", required=False), default=0),
                "weekly_merit": cls._parse_int(cls._get_field_value(row, "weekly_merit", required=False), default=0),
                "weekly_assist": cls._parse_int(cls._get_field_value(row, "weekly_assist", required=False), default=0),
                "weekly_donation": cls._parse_int(cls._get_field_value(row, "weekly_donation", required=False), default=0),
                "total_contribution": cls._parse_int(cls._get_field_value(row, "total_contribution", required=False), default=0),
                "total_merit": cls._parse_int(cls._get_field_value(row, "total_merit", required=False), default=0),
                "total_assist": cls._parse_int(cls._get_field_value(row, "total_assist", required=False), default=0),
                "total_donation": cls._parse_int(cls._get_field_value(row, "total_donation", required=False), default=0),
                "power_value": cls._parse_int(cls._get_field_value(row, "power_value", required=False), default=0),
                "state": cls._get_field_value(row, "state", required=False) or "",
                "group_name": group_name,
            }

            members.append(member_data)

        return members
