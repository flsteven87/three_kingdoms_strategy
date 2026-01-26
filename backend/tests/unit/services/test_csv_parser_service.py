"""
Unit Tests for CSVParserService

Tests cover:
1. Filename datetime extraction (happy path, edge cases, error cases)
2. CSV content parsing (field aliases, data types, edge cases)
3. Error handling (invalid format, missing fields)

符合 test-writing skill 規範:
- AAA pattern (Arrange-Act-Assert)
- Clear naming: test_[method]_should_[behavior]_when_[condition]
- Coverage: happy path + edge cases + error cases

Note: CSV filenames contain game server time (UTC+8 Taiwan timezone).
The parser converts this to UTC for consistent database storage.
"""

from datetime import UTC, datetime

import pytest

from src.services.csv_parser_service import CSVParserService


class TestExtractDatetimeFromFilename:
    """Tests for CSVParserService.extract_datetime_from_filename

    CSV filenames contain game server time (UTC+8 Taiwan timezone).
    The parser converts this to UTC for database storage.

    Example: "同盟統計2025年10月09日10时13分09秒.csv"
    - Game time: 2025-10-09 10:13:09 UTC+8
    - UTC result: 2025-10-09 02:13:09 UTC
    """

    # =========================================================================
    # Happy Path Tests
    # =========================================================================

    def test_should_extract_datetime_when_valid_filename(self):
        """Standard filename format should be parsed and converted to UTC"""
        # Arrange
        filename = "同盟統計2025年10月09日10时13分09秒.csv"
        # Game time: 10:13:09 UTC+8 → UTC: 02:13:09

        # Act
        result = CSVParserService.extract_datetime_from_filename(filename)

        # Assert
        assert result == datetime(2025, 10, 9, 2, 13, 9, tzinfo=UTC)
        assert result.tzinfo == UTC

    def test_should_extract_datetime_when_midnight(self):
        """Midnight UTC+8 timestamp should be converted to previous day in UTC"""
        # Arrange
        filename = "同盟統計2025年01月01日00时00分00秒.csv"
        # Game time: 2025-01-01 00:00:00 UTC+8 → UTC: 2024-12-31 16:00:00

        # Act
        result = CSVParserService.extract_datetime_from_filename(filename)

        # Assert
        assert result == datetime(2024, 12, 31, 16, 0, 0, tzinfo=UTC)
        assert result.tzinfo == UTC

    def test_should_extract_datetime_when_end_of_day(self):
        """End of day UTC+8 timestamp should be converted correctly"""
        # Arrange
        filename = "同盟統計2025年12月31日23时59分59秒.csv"
        # Game time: 2025-12-31 23:59:59 UTC+8 → UTC: 2025-12-31 15:59:59

        # Act
        result = CSVParserService.extract_datetime_from_filename(filename)

        # Assert
        assert result == datetime(2025, 12, 31, 15, 59, 59, tzinfo=UTC)
        assert result.tzinfo == UTC

    # =========================================================================
    # Edge Case Tests
    # =========================================================================

    def test_should_extract_datetime_when_single_digit_padded(self):
        """Single digit values with leading zeros should parse correctly"""
        # Arrange
        filename = "同盟統計2025年01月05日05时05分05秒.csv"
        # Game time: 2025-01-05 05:05:05 UTC+8 → UTC: 2025-01-04 21:05:05

        # Act
        result = CSVParserService.extract_datetime_from_filename(filename)

        # Assert
        assert result == datetime(2025, 1, 4, 21, 5, 5, tzinfo=UTC)
        assert result.tzinfo == UTC

    # =========================================================================
    # Error Case Tests
    # =========================================================================

    def test_should_raise_valueerror_when_invalid_format(self):
        """Invalid filename format should raise ValueError"""
        # Arrange
        invalid_filenames = [
            "invalid.csv",
            "同盟統計2025-10-09.csv",
            "同盟統計2025年10月09日.csv",  # Missing time
            "2025年10月09日10时13分09秒.csv",  # Missing prefix
            "同盟統計2025年10月09日10时13分09秒.txt",  # Wrong extension
            "",
        ]

        # Act & Assert
        for filename in invalid_filenames:
            with pytest.raises(ValueError) as exc_info:
                CSVParserService.extract_datetime_from_filename(filename)
            assert "Invalid filename format" in str(exc_info.value)

    def test_should_include_expected_format_in_error_message(self):
        """Error message should include expected format hint"""
        # Arrange
        filename = "invalid.csv"

        # Act & Assert
        with pytest.raises(ValueError) as exc_info:
            CSVParserService.extract_datetime_from_filename(filename)
        assert "同盟統計YYYY年MM月DD日HH时MM分SS秒.csv" in str(exc_info.value)


class TestParseCSVContent:
    """Tests for CSVParserService.parse_csv_content"""

    # =========================================================================
    # Happy Path Tests
    # =========================================================================

    def test_should_parse_all_members_when_valid_csv(self, valid_csv_content: str):
        """Valid CSV content should parse all members"""
        # Act
        result = CSVParserService.parse_csv_content(valid_csv_content)

        # Assert
        assert len(result) == 4
        assert result[0]["member_name"] == "張飛"
        assert result[1]["member_name"] == "關羽"
        assert result[2]["member_name"] == "趙雲"
        assert result[3]["member_name"] == "劉備"

    def test_should_parse_numeric_fields_as_integers(self, valid_csv_content: str):
        """Numeric fields should be parsed as integers"""
        # Act
        result = CSVParserService.parse_csv_content(valid_csv_content)
        first_member = result[0]

        # Assert
        assert first_member["contribution_rank"] == 1
        assert first_member["weekly_contribution"] == 15000
        assert first_member["weekly_merit"] == 85000
        assert first_member["weekly_assist"] == 320
        assert first_member["weekly_donation"] == 5000
        assert first_member["total_contribution"] == 150000
        assert first_member["total_merit"] == 850000
        assert first_member["total_assist"] == 3200
        assert first_member["total_donation"] == 50000
        assert first_member["power_value"] == 125000

    def test_should_parse_group_name_correctly(self, valid_csv_content: str):
        """Group name should be parsed, with '未分組' converted to None"""
        # Act
        result = CSVParserService.parse_csv_content(valid_csv_content)

        # Assert
        assert result[0]["group_name"] == "前鋒隊"
        assert result[2]["group_name"] == "後勤隊"
        assert result[3]["group_name"] is None  # "未分組" → None

    def test_should_parse_simplified_chinese_field_names(self, valid_csv_content_simplified: str):
        """Simplified Chinese field names should be recognized"""
        # Act
        result = CSVParserService.parse_csv_content(valid_csv_content_simplified)

        # Assert
        assert len(result) == 1
        assert result[0]["member_name"] == "张飞"
        assert result[0]["weekly_merit"] == 85000

    # =========================================================================
    # Edge Case Tests
    # =========================================================================

    def test_should_handle_utf8_bom(self, csv_content_with_bom: str):
        """CSV content with UTF-8 BOM should be handled"""
        # Act
        result = CSVParserService.parse_csv_content(csv_content_with_bom)

        # Assert
        assert len(result) == 1
        assert result[0]["member_name"] == "張飛"

    def test_should_strip_whitespace_from_values(self):
        """Whitespace in field values should be stripped"""
        # Arrange
        csv_with_spaces = """成員, 貢獻排行, 貢獻本週, 戰功本週, 助攻本週, 捐獻本週, 貢獻總量, 戰功總量, 助攻總量, 捐獻總量, 勢力值, 所屬州, 分組
  張飛  , 1, 15000, 85000, 320, 5000, 150000, 850000, 3200, 50000, 125000, 徐州,   前鋒隊  """

        # Act
        result = CSVParserService.parse_csv_content(csv_with_spaces)

        # Assert
        assert result[0]["member_name"] == "張飛"
        assert result[0]["group_name"] == "前鋒隊"

    def test_should_handle_empty_state_field(self):
        """Empty state field should be parsed as empty string"""
        # Arrange
        csv_empty_state = """成員, 貢獻排行, 貢獻本週, 戰功本週, 助攻本週, 捐獻本週, 貢獻總量, 戰功總量, 助攻總量, 捐獻總量, 勢力值, 所屬州, 分組
張飛, 1, 15000, 85000, 320, 5000, 150000, 850000, 3200, 50000, 125000, , 前鋒隊"""

        # Act
        result = CSVParserService.parse_csv_content(csv_empty_state)

        # Assert
        assert result[0]["state"] == ""

    def test_should_handle_wei_fen_zu_simplified(self):
        """Simplified '未分组' should also be converted to None"""
        # Arrange
        csv_simplified_group = """成员, 贡献排行, 贡献本周, 战功本周, 助攻本周, 捐献本周, 贡献总量, 战功总量, 助攻总量, 捐献总量, 势力值, 所属州, 分组
张飞, 1, 15000, 85000, 320, 5000, 150000, 850000, 3200, 50000, 125000, 徐州, 未分组"""

        # Act
        result = CSVParserService.parse_csv_content(csv_simplified_group)

        # Assert
        assert result[0]["group_name"] is None

    # =========================================================================
    # Error Case Tests
    # =========================================================================

    def test_should_raise_valueerror_when_empty_csv(self):
        """Empty CSV should raise ValueError"""
        # Arrange
        empty_csv = ""

        # Act & Assert
        with pytest.raises(ValueError) as exc_info:
            CSVParserService.parse_csv_content(empty_csv)
        assert "empty" in str(exc_info.value).lower()

    def test_should_raise_keyerror_when_missing_required_field(self):
        """Missing required field should raise KeyError"""
        # Arrange - Missing "成員" column
        csv_missing_field = """貢獻排行, 貢獻本週, 戰功本週, 助攻本週, 捐獻本週, 貢獻總量, 戰功總量, 助攻總量, 捐獻總量, 勢力值, 所屬州, 分組
1, 15000, 85000, 320, 5000, 150000, 850000, 3200, 50000, 125000, 徐州, 前鋒隊"""

        # Act & Assert
        with pytest.raises(KeyError) as exc_info:
            CSVParserService.parse_csv_content(csv_missing_field)
        assert "member_name" in str(exc_info.value)


class TestGetFieldValue:
    """Tests for CSVParserService._get_field_value (internal method)"""

    def test_should_find_field_by_primary_alias(self):
        """Should find field using primary alias"""
        # Arrange
        row = {"成員": "張飛"}

        # Act
        result = CSVParserService._get_field_value(row, "member_name")

        # Assert
        assert result == "張飛"

    def test_should_find_field_by_alternative_alias(self):
        """Should find field using alternative alias"""
        # Arrange
        row = {"玩家": "張飛"}

        # Act
        result = CSVParserService._get_field_value(row, "member_name")

        # Assert
        assert result == "張飛"

    def test_should_return_none_for_optional_missing_field(self):
        """Should return None for missing optional field"""
        # Arrange
        row = {"成員": "張飛"}

        # Act
        result = CSVParserService._get_field_value(row, "group_name", required=False)

        # Assert
        assert result is None

    def test_should_raise_keyerror_for_required_missing_field(self):
        """Should raise KeyError for missing required field"""
        # Arrange
        row = {"其他欄位": "值"}

        # Act & Assert
        with pytest.raises(KeyError) as exc_info:
            CSVParserService._get_field_value(row, "member_name", required=True)
        assert "找不到欄位" in str(exc_info.value)


class TestFieldAliases:
    """Tests for field alias mapping coverage"""

    def test_all_field_aliases_should_be_defined(self):
        """All expected internal field names should have aliases defined"""
        # Arrange
        expected_fields = [
            "member_name",
            "contribution_rank",
            "weekly_contribution",
            "weekly_merit",
            "weekly_assist",
            "weekly_donation",
            "total_contribution",
            "total_merit",
            "total_assist",
            "total_donation",
            "power_value",
            "state",
            "group_name",
        ]

        # Assert
        for field in expected_fields:
            assert field in CSVParserService.FIELD_ALIASES
            assert len(CSVParserService.FIELD_ALIASES[field]) > 0

    def test_field_aliases_should_include_both_traditional_and_simplified(self):
        """Field aliases should include both traditional and simplified Chinese"""
        # Assert - spot check key fields
        assert "成員" in CSVParserService.FIELD_ALIASES["member_name"]
        assert "成员" in CSVParserService.FIELD_ALIASES["member_name"]
        assert "戰功本週" in CSVParserService.FIELD_ALIASES["weekly_merit"]
        assert "战功本周" in CSVParserService.FIELD_ALIASES["weekly_merit"]
