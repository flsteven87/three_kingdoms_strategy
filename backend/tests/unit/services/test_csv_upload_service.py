"""
Unit Tests for CSVUploadService

Tests cover:
1. CSV upload workflow (upload_csv)
2. Upload retrieval (get_uploads_by_season)
3. Upload deletion (delete_upload)
4. Permission and quota checking
5. Edge cases (duplicate date handling, custom snapshot date)

符合 test-writing skill 規範:
- AAA pattern (Arrange-Act-Assert)
- Mocked repository dependencies
- Coverage: happy path + edge cases + error cases
"""

from datetime import datetime
from unittest.mock import AsyncMock, MagicMock
from uuid import UUID, uuid4

import pytest
from fastapi import HTTPException

from src.models.csv_upload import CsvUpload
from src.models.season import Season
from src.services.csv_upload_service import CSVUploadService

# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def user_id() -> UUID:
    """Fixed user UUID for testing"""
    return UUID("11111111-1111-1111-1111-111111111111")


@pytest.fixture
def alliance_id() -> UUID:
    """Fixed alliance UUID for testing"""
    return UUID("22222222-2222-2222-2222-222222222222")


@pytest.fixture
def season_id() -> UUID:
    """Fixed season UUID for testing"""
    return UUID("33333333-3333-3333-3333-333333333333")


@pytest.fixture
def upload_id() -> UUID:
    """Fixed upload UUID for testing"""
    return UUID("44444444-4444-4444-4444-444444444444")


@pytest.fixture
def mock_csv_upload_repo() -> MagicMock:
    """Create mock CSV upload repository"""
    return MagicMock()


@pytest.fixture
def mock_member_repo() -> MagicMock:
    """Create mock member repository"""
    return MagicMock()


@pytest.fixture
def mock_snapshot_repo() -> MagicMock:
    """Create mock snapshot repository"""
    return MagicMock()


@pytest.fixture
def mock_season_repo() -> MagicMock:
    """Create mock season repository"""
    return MagicMock()


@pytest.fixture
def mock_alliance_repo() -> MagicMock:
    """Create mock alliance repository"""
    return MagicMock()


@pytest.fixture
def mock_permission_service() -> MagicMock:
    """Create mock permission service"""
    return MagicMock()


@pytest.fixture
def mock_period_metrics_service() -> MagicMock:
    """Create mock period metrics service"""
    return MagicMock()


@pytest.fixture
def mock_line_binding_repo() -> MagicMock:
    """Create mock LINE binding repository"""
    return MagicMock()


@pytest.fixture
def csv_upload_service(
    mock_csv_upload_repo: MagicMock,
    mock_member_repo: MagicMock,
    mock_snapshot_repo: MagicMock,
    mock_season_repo: MagicMock,
    mock_alliance_repo: MagicMock,
    mock_permission_service: MagicMock,
    mock_period_metrics_service: MagicMock,
    mock_line_binding_repo: MagicMock,
) -> CSVUploadService:
    """Create CSVUploadService with mocked dependencies"""
    service = CSVUploadService()
    service._csv_upload_repo = mock_csv_upload_repo
    service._member_repo = mock_member_repo
    service._snapshot_repo = mock_snapshot_repo
    service._season_repo = mock_season_repo
    service._alliance_repo = mock_alliance_repo
    service._permission_service = mock_permission_service
    service._period_metrics_service = mock_period_metrics_service
    service._line_binding_repo = mock_line_binding_repo
    return service


@pytest.fixture
def valid_csv_content() -> str:
    """Valid CSV content for testing"""
    return """成員, 貢獻排行, 貢獻本週, 戰功本週, 助攻本週, 捐獻本週, 貢獻總量, 戰功總量, 助攻總量, 捐獻總量, 勢力值, 所屬州, 分組
張飛, 1, 15000, 85000, 320, 5000, 150000, 850000, 3200, 50000, 125000, 徐州, 前鋒隊
關羽, 2, 12000, 72000, 280, 4500, 140000, 720000, 2800, 45000, 118000, 徐州, 前鋒隊"""


def create_mock_season(
    season_id: UUID,
    alliance_id: UUID,
    name: str = "S1",
) -> Season:
    """Factory for creating mock Season objects"""
    from datetime import date

    now = datetime.now()
    return Season(
        id=season_id,
        alliance_id=alliance_id,
        name=name,
        start_date=date(2025, 1, 1),
        end_date=None,
        is_active=True,
        description=None,
        created_at=now,
        updated_at=now,
    )


def create_mock_alliance(alliance_id: UUID) -> MagicMock:
    """Factory for creating mock Alliance objects"""
    alliance = MagicMock()
    alliance.id = alliance_id
    return alliance


def create_mock_upload(
    upload_id: UUID,
    season_id: UUID,
    alliance_id: UUID,
    snapshot_date: datetime | None = None,
) -> CsvUpload:
    """Factory for creating mock CsvUpload objects"""
    now = datetime.now()
    return CsvUpload(
        id=upload_id,
        season_id=season_id,
        alliance_id=alliance_id,
        snapshot_date=snapshot_date or now,
        file_name="test.csv",
        total_members=2,
        uploaded_at=now,
        created_at=now,
        upload_type="regular",
    )


def create_mock_member(name: str) -> MagicMock:
    """Factory for creating mock Member objects"""
    member = MagicMock()
    member.id = uuid4()
    member.name = name
    return member


# =============================================================================
# Tests for upload_csv
# =============================================================================


class TestUploadCsv:
    """Tests for CSVUploadService.upload_csv"""

    @pytest.mark.asyncio
    async def test_should_complete_upload_workflow(
        self,
        csv_upload_service: CSVUploadService,
        mock_season_repo: MagicMock,
        mock_alliance_repo: MagicMock,
        mock_permission_service: MagicMock,
        mock_csv_upload_repo: MagicMock,
        mock_member_repo: MagicMock,
        mock_snapshot_repo: MagicMock,
        mock_period_metrics_service: MagicMock,
        mock_line_binding_repo: MagicMock,
        user_id: UUID,
        season_id: UUID,
        alliance_id: UUID,
        upload_id: UUID,
        valid_csv_content: str,
    ):
        """Should complete full upload workflow successfully"""
        # Arrange
        mock_season = create_mock_season(season_id, alliance_id)
        mock_season_repo.get_by_id = AsyncMock(return_value=mock_season)

        mock_alliance = create_mock_alliance(alliance_id)
        mock_alliance_repo.get_by_id = AsyncMock(return_value=mock_alliance)

        mock_permission_service.require_write_permission = AsyncMock()
        mock_csv_upload_repo.get_by_date = AsyncMock(return_value=None)

        mock_upload = create_mock_upload(upload_id, season_id, alliance_id)
        mock_csv_upload_repo.replace_same_day_upload = AsyncMock(return_value=(mock_upload, None))

        mock_members = [
            create_mock_member("張飛"),
            create_mock_member("關羽"),
        ]
        mock_member_repo.upsert_batch = AsyncMock(return_value=mock_members)
        mock_snapshot_repo.create_batch = AsyncMock(return_value=[MagicMock(), MagicMock()])
        mock_period_metrics_service.calculate_periods_for_season = AsyncMock(return_value=[])

        # Mock LINE binding reverification (no unverified bindings)
        mock_line_binding_repo.get_unverified_bindings = AsyncMock(return_value=[])

        filename = "同盟統計2025年10月09日10时13分09秒.csv"

        # Act
        result = await csv_upload_service.upload_csv(
            user_id, season_id, filename, valid_csv_content
        )

        # Assert
        assert result["upload_id"] == upload_id
        assert result["total_members"] == 2
        assert result["total_snapshots"] == 2
        assert result["reverified_bindings"] == 0
        mock_permission_service.require_write_permission.assert_called_once()
        mock_csv_upload_repo.replace_same_day_upload.assert_called_once()

    @pytest.mark.asyncio
    async def test_should_raise_404_when_season_not_found(
        self,
        csv_upload_service: CSVUploadService,
        mock_season_repo: MagicMock,
        user_id: UUID,
        season_id: UUID,
        valid_csv_content: str,
    ):
        """Should raise 404 when season not found"""
        # Arrange
        mock_season_repo.get_by_id = AsyncMock(return_value=None)

        # Act & Assert
        with pytest.raises(HTTPException) as exc_info:
            await csv_upload_service.upload_csv(user_id, season_id, "test.csv", valid_csv_content)
        assert exc_info.value.status_code == 404
        assert "Season not found" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_should_raise_400_when_invalid_filename(
        self,
        csv_upload_service: CSVUploadService,
        mock_season_repo: MagicMock,
        mock_alliance_repo: MagicMock,
        mock_permission_service: MagicMock,
        user_id: UUID,
        season_id: UUID,
        alliance_id: UUID,
        valid_csv_content: str,
    ):
        """Should raise 400 when filename format is invalid"""
        # Arrange
        mock_season = create_mock_season(season_id, alliance_id)
        mock_season_repo.get_by_id = AsyncMock(return_value=mock_season)
        mock_alliance = create_mock_alliance(alliance_id)
        mock_alliance_repo.get_by_id = AsyncMock(return_value=mock_alliance)
        mock_permission_service.require_write_permission = AsyncMock()

        # Act & Assert
        with pytest.raises(HTTPException) as exc_info:
            await csv_upload_service.upload_csv(
                user_id, season_id, "invalid_filename.csv", valid_csv_content
            )
        assert exc_info.value.status_code == 400
        assert "Invalid filename format" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_should_use_custom_snapshot_date_when_provided(
        self,
        csv_upload_service: CSVUploadService,
        mock_season_repo: MagicMock,
        mock_alliance_repo: MagicMock,
        mock_permission_service: MagicMock,
        mock_csv_upload_repo: MagicMock,
        mock_member_repo: MagicMock,
        mock_snapshot_repo: MagicMock,
        mock_period_metrics_service: MagicMock,
        mock_line_binding_repo: MagicMock,
        user_id: UUID,
        season_id: UUID,
        alliance_id: UUID,
        upload_id: UUID,
        valid_csv_content: str,
    ):
        """Should use custom snapshot date when provided"""
        # Arrange
        mock_season = create_mock_season(season_id, alliance_id)
        mock_season_repo.get_by_id = AsyncMock(return_value=mock_season)
        mock_alliance = create_mock_alliance(alliance_id)
        mock_alliance_repo.get_by_id = AsyncMock(return_value=mock_alliance)
        mock_permission_service.require_write_permission = AsyncMock()
        mock_upload = create_mock_upload(upload_id, season_id, alliance_id)
        mock_csv_upload_repo.replace_same_day_upload = AsyncMock(return_value=(mock_upload, None))
        mock_member_repo.upsert_batch = AsyncMock(
            return_value=[create_mock_member("張飛"), create_mock_member("關羽")]
        )
        mock_snapshot_repo.create_batch = AsyncMock(return_value=[MagicMock(), MagicMock()])
        mock_period_metrics_service.calculate_periods_for_season = AsyncMock(return_value=[])
        mock_line_binding_repo.get_unverified_bindings = AsyncMock(return_value=[])

        custom_date = "2025-12-25T12:00:00"

        # Act
        result = await csv_upload_service.upload_csv(
            user_id,
            season_id,
            "any_filename.csv",
            valid_csv_content,
            custom_snapshot_date=custom_date,
        )

        # Assert
        assert "2025-12-25" in result["snapshot_date"]

    @pytest.mark.asyncio
    async def test_should_replace_existing_upload_on_same_date(
        self,
        csv_upload_service: CSVUploadService,
        mock_season_repo: MagicMock,
        mock_alliance_repo: MagicMock,
        mock_permission_service: MagicMock,
        mock_csv_upload_repo: MagicMock,
        mock_member_repo: MagicMock,
        mock_snapshot_repo: MagicMock,
        mock_period_metrics_service: MagicMock,
        mock_line_binding_repo: MagicMock,
        user_id: UUID,
        season_id: UUID,
        alliance_id: UUID,
        upload_id: UUID,
        valid_csv_content: str,
    ):
        """Should delete and replace existing upload on same date for regular uploads"""
        # Arrange
        mock_season = create_mock_season(season_id, alliance_id)
        mock_season_repo.get_by_id = AsyncMock(return_value=mock_season)
        mock_alliance = create_mock_alliance(alliance_id)
        mock_alliance_repo.get_by_id = AsyncMock(return_value=mock_alliance)
        mock_permission_service.require_write_permission = AsyncMock()

        # Existing upload on same date (replaced)
        existing_upload = create_mock_upload(uuid4(), season_id, alliance_id)
        mock_upload = create_mock_upload(upload_id, season_id, alliance_id)
        mock_csv_upload_repo.replace_same_day_upload = AsyncMock(
            return_value=(mock_upload, existing_upload)
        )

        mock_member_repo.upsert_batch = AsyncMock(
            return_value=[create_mock_member("張飛"), create_mock_member("關羽")]
        )
        mock_snapshot_repo.create_batch = AsyncMock(return_value=[MagicMock(), MagicMock()])
        mock_period_metrics_service.calculate_periods_for_season = AsyncMock(return_value=[])
        mock_line_binding_repo.get_unverified_bindings = AsyncMock(return_value=[])

        filename = "同盟統計2025年10月09日10时13分09秒.csv"

        # Act
        result = await csv_upload_service.upload_csv(
            user_id, season_id, filename, valid_csv_content
        )

        # Assert
        assert result["replaced_existing"] is True
        mock_csv_upload_repo.replace_same_day_upload.assert_called_once()

    @pytest.mark.asyncio
    async def test_should_not_replace_for_event_uploads(
        self,
        csv_upload_service: CSVUploadService,
        mock_season_repo: MagicMock,
        mock_alliance_repo: MagicMock,
        mock_permission_service: MagicMock,
        mock_csv_upload_repo: MagicMock,
        mock_member_repo: MagicMock,
        mock_snapshot_repo: MagicMock,
        mock_line_binding_repo: MagicMock,
        user_id: UUID,
        season_id: UUID,
        alliance_id: UUID,
        upload_id: UUID,
        valid_csv_content: str,
    ):
        """Should not check for existing uploads for event type uploads"""
        # Arrange
        mock_season = create_mock_season(season_id, alliance_id)
        mock_season_repo.get_by_id = AsyncMock(return_value=mock_season)
        mock_alliance = create_mock_alliance(alliance_id)
        mock_alliance_repo.get_by_id = AsyncMock(return_value=mock_alliance)
        mock_permission_service.require_write_permission = AsyncMock()
        mock_upload = create_mock_upload(upload_id, season_id, alliance_id)
        mock_csv_upload_repo.create = AsyncMock(return_value=mock_upload)
        mock_member_repo.upsert_batch = AsyncMock(
            return_value=[create_mock_member("張飛"), create_mock_member("關羽")]
        )
        mock_snapshot_repo.create_batch = AsyncMock(return_value=[MagicMock(), MagicMock()])
        mock_line_binding_repo.get_unverified_bindings = AsyncMock(return_value=[])

        filename = "同盟統計2025年10月09日10时13分09秒.csv"

        # Act
        result = await csv_upload_service.upload_csv(
            user_id, season_id, filename, valid_csv_content, upload_type="event"
        )

        # Assert
        assert result["upload_type"] == "event"
        mock_csv_upload_repo.replace_same_day_upload.assert_not_called()

    @pytest.mark.asyncio
    async def test_should_reverify_pending_bindings_after_upload(
        self,
        csv_upload_service: CSVUploadService,
        mock_season_repo: MagicMock,
        mock_alliance_repo: MagicMock,
        mock_permission_service: MagicMock,
        mock_csv_upload_repo: MagicMock,
        mock_member_repo: MagicMock,
        mock_snapshot_repo: MagicMock,
        mock_period_metrics_service: MagicMock,
        mock_line_binding_repo: MagicMock,
        user_id: UUID,
        season_id: UUID,
        alliance_id: UUID,
        upload_id: UUID,
        valid_csv_content: str,
    ):
        """Should reverify pending LINE bindings when matching members appear in CSV"""
        # Arrange
        mock_season = create_mock_season(season_id, alliance_id)
        mock_season_repo.get_by_id = AsyncMock(return_value=mock_season)
        mock_alliance = create_mock_alliance(alliance_id)
        mock_alliance_repo.get_by_id = AsyncMock(return_value=mock_alliance)
        mock_permission_service.require_write_permission = AsyncMock()
        mock_upload = create_mock_upload(upload_id, season_id, alliance_id)
        mock_csv_upload_repo.replace_same_day_upload = AsyncMock(return_value=(mock_upload, None))

        # Members from CSV (張飛, 關羽)
        mock_members = [
            create_mock_member("張飛"),
            create_mock_member("關羽"),
        ]
        mock_member_repo.upsert_batch = AsyncMock(return_value=mock_members)
        mock_snapshot_repo.create_batch = AsyncMock(return_value=[MagicMock(), MagicMock()])
        mock_period_metrics_service.calculate_periods_for_season = AsyncMock(return_value=[])

        # Unverified binding for 張飛 (registered before CSV upload)
        unverified_binding = MagicMock()
        unverified_binding.id = uuid4()
        unverified_binding.game_id = "張飛"  # Matches member from CSV
        mock_line_binding_repo.get_unverified_bindings = AsyncMock(
            return_value=[unverified_binding]
        )
        mock_line_binding_repo.batch_verify_bindings = AsyncMock(return_value=1)

        filename = "同盟統計2025年10月09日10时13分09秒.csv"

        # Act
        result = await csv_upload_service.upload_csv(
            user_id, season_id, filename, valid_csv_content
        )

        # Assert
        assert result["reverified_bindings"] == 1
        mock_line_binding_repo.get_unverified_bindings.assert_called_once_with(alliance_id)
        mock_line_binding_repo.batch_verify_bindings.assert_called_once()

        # Verify the correct binding was passed for update
        update_call_args = mock_line_binding_repo.batch_verify_bindings.call_args[0][0]
        assert len(update_call_args) == 1
        assert update_call_args[0]["id"] == str(unverified_binding.id)


# =============================================================================
# Tests for get_uploads_by_season
# =============================================================================


class TestGetUploadsBySeason:
    """Tests for CSVUploadService.get_uploads_by_season"""

    @pytest.mark.asyncio
    async def test_should_return_uploads_for_member(
        self,
        csv_upload_service: CSVUploadService,
        mock_season_repo: MagicMock,
        mock_permission_service: MagicMock,
        mock_csv_upload_repo: MagicMock,
        user_id: UUID,
        season_id: UUID,
        alliance_id: UUID,
        upload_id: UUID,
    ):
        """Should return uploads when user is alliance member"""
        # Arrange
        mock_season = create_mock_season(season_id, alliance_id)
        mock_season_repo.get_by_id = AsyncMock(return_value=mock_season)
        mock_permission_service.get_user_role = AsyncMock(return_value="member")

        mock_uploads = [create_mock_upload(upload_id, season_id, alliance_id)]
        mock_csv_upload_repo.get_by_season = AsyncMock(return_value=mock_uploads)

        # Act
        result = await csv_upload_service.get_uploads_by_season(user_id, season_id)

        # Assert
        assert len(result) == 1
        assert result[0]["id"] == upload_id

    @pytest.mark.asyncio
    async def test_should_raise_403_when_user_not_member(
        self,
        csv_upload_service: CSVUploadService,
        mock_season_repo: MagicMock,
        mock_permission_service: MagicMock,
        user_id: UUID,
        season_id: UUID,
        alliance_id: UUID,
    ):
        """Should raise 403 when user is not alliance member"""
        # Arrange
        mock_season = create_mock_season(season_id, alliance_id)
        mock_season_repo.get_by_id = AsyncMock(return_value=mock_season)
        mock_permission_service.get_user_role = AsyncMock(return_value=None)

        # Act & Assert
        with pytest.raises(HTTPException) as exc_info:
            await csv_upload_service.get_uploads_by_season(user_id, season_id)
        assert exc_info.value.status_code == 403
        assert "not a member" in exc_info.value.detail


# =============================================================================
# Tests for delete_upload
# =============================================================================


class TestDeleteUpload:
    """Tests for CSVUploadService.delete_upload"""

    @pytest.mark.asyncio
    async def test_should_delete_upload_when_user_has_permission(
        self,
        csv_upload_service: CSVUploadService,
        mock_csv_upload_repo: MagicMock,
        mock_season_repo: MagicMock,
        mock_permission_service: MagicMock,
        mock_period_metrics_service: MagicMock,
        user_id: UUID,
        season_id: UUID,
        alliance_id: UUID,
        upload_id: UUID,
    ):
        """Should delete upload when user has write permission"""
        # Arrange
        mock_upload = create_mock_upload(upload_id, season_id, alliance_id)
        mock_csv_upload_repo.get_by_id = AsyncMock(return_value=mock_upload)

        mock_season = create_mock_season(season_id, alliance_id)
        mock_season_repo.get_by_id = AsyncMock(return_value=mock_season)

        mock_permission_service.require_write_permission = AsyncMock()
        mock_csv_upload_repo.delete = AsyncMock(return_value=True)
        mock_period_metrics_service.calculate_periods_for_season = AsyncMock(return_value=[])

        # Act
        result = await csv_upload_service.delete_upload(user_id, upload_id)

        # Assert
        assert result["success"] is True
        assert result["deleted_upload_id"] == upload_id
        mock_permission_service.require_write_permission.assert_called_once_with(
            user_id, alliance_id, "delete CSV uploads"
        )
        mock_csv_upload_repo.delete.assert_called_once_with(upload_id)

    @pytest.mark.asyncio
    async def test_should_raise_404_when_upload_not_found(
        self,
        csv_upload_service: CSVUploadService,
        mock_csv_upload_repo: MagicMock,
        user_id: UUID,
        upload_id: UUID,
    ):
        """Should raise 404 when upload not found"""
        # Arrange
        mock_csv_upload_repo.get_by_id = AsyncMock(return_value=None)

        # Act & Assert
        with pytest.raises(HTTPException) as exc_info:
            await csv_upload_service.delete_upload(user_id, upload_id)
        assert exc_info.value.status_code == 404
        assert "Upload not found" in exc_info.value.detail
