"""
CSV Parser Service

符合 CLAUDE.md 🟡:
- Stateless data transformation (Processor pattern would also work)
- Extracts datetime from filename
- Parses CSV content into structured data
"""

import csv
import re
from datetime import datetime
from io import StringIO


class CSVParserService:
    """Service for parsing Three Kingdoms CSV files"""

    # Filename pattern: 同盟統計2025年10月09日10时13分09秒.csv
    FILENAME_PATTERN = re.compile(
        r"同盟統計(\d{4})年(\d{2})月(\d{2})日(\d{2})时(\d{2})分(\d{2})秒\.csv"
    )

    @staticmethod
    def extract_datetime_from_filename(filename: str) -> datetime:
        """
        Extract datetime from Three Kingdoms CSV filename

        Args:
            filename: CSV filename (e.g., "同盟統計2025年10月09日10时13分09秒.csv")

        Returns:
            Datetime object parsed from filename

        Raises:
            ValueError: If filename format is invalid

        Example:
            >>> CSVParserService.extract_datetime_from_filename(
            ...     "同盟統計2025年10月09日10时13分09秒.csv"
            ... )
            datetime(2025, 10, 9, 10, 13, 9)
        """
        match = CSVParserService.FILENAME_PATTERN.match(filename)

        if not match:
            raise ValueError(
                f"Invalid filename format: {filename}. "
                f"Expected format: 同盟統計YYYY年MM月DD日HH时MM分SS秒.csv"
            )

        year, month, day, hour, minute, second = map(int, match.groups())

        return datetime(year, month, day, hour, minute, second)

    @staticmethod
    def parse_csv_content(csv_content: str) -> list[dict]:
        """
        Parse CSV content into structured data

        Args:
            csv_content: CSV file content as string

        Returns:
            List of member data dictionaries

        CSV Format:
            成員, 貢獻排行, 貢獻本週, 戰功本週, 助攻本週, 捐獻本週,
            貢獻總量, 戰功總量, 助攻總量, 捐獻總量, 勢力值, 所屬州, 分組

        符合 CLAUDE.md 🟡: Pure data transformation
        """
        # Remove UTF-8 BOM if present
        if csv_content.startswith('\ufeff'):
            csv_content = csv_content[1:]

        # Read CSV and strip whitespace from field names
        lines = csv_content.splitlines()
        if not lines:
            raise ValueError("CSV file is empty")

        # Strip whitespace from header
        header = [field.strip() for field in lines[0].split(',')]

        # Create new CSV content with cleaned header
        cleaned_csv = ','.join(header) + '\n' + '\n'.join(lines[1:])

        reader = csv.DictReader(StringIO(cleaned_csv))

        members = []
        for row in reader:
            # Strip whitespace from all values
            row = {k.strip(): v.strip() for k, v in row.items()}

            member_data = {
                "member_name": row["成員"],
                "contribution_rank": int(row["貢獻排行"]),
                "weekly_contribution": int(row["貢獻本週"]),
                "weekly_merit": int(row["戰功本週"]),
                "weekly_assist": int(row["助攻本週"]),
                "weekly_donation": int(row["捐獻本週"]),
                "total_contribution": int(row["貢獻總量"]),
                "total_merit": int(row["戰功總量"]),
                "total_assist": int(row["助攻總量"]),
                "total_donation": int(row["捐獻總量"]),
                "power_value": int(row["勢力值"]),
                "state": row["所屬州"],
                "group_name": row["分組"] if row["分組"] != "未分組" else None,
            }

            members.append(member_data)

        return members
