"""
Unit Tests for HegemonyWeightService

Tests cover:
1. _verify_season_access - permission verification
2. get_season_weights - weight retrieval
3. initialize_weights_for_season - weight initialization
4. update_weight - weight modification
5. delete_weight - weight deletion

符合 test-writing skill 規範:
- AAA pattern (Arrange-Act-Assert)
- Mocked repository dependencies
- Coverage: happy path + edge cases + error cases
"""

from datetime import date, datetime
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock
from uuid import UUID, uuid4

import pytest
from fastapi import HTTPException

from src.models.hegemony_weight import HegemonyWeight, HegemonyWeightWithSnapshot
from src.models.season import Season
from src.services.hegemony_weight_service import HegemonyWeightService

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
def weight_id() -> UUID:
    """Fixed weight UUID for testing"""
    return UUID("44444444-4444-4444-4444-444444444444")


@pytest.fixture
def mock_weight_repo() -> MagicMock:
    """Create mock HegemonyWeightRepository"""
    return MagicMock()


@pytest.fixture
def mock_alliance_repo() -> MagicMock:
    """Create mock AllianceRepository"""
    return MagicMock()


@pytest.fixture
def mock_season_repo() -> MagicMock:
    """Create mock SeasonRepository"""
    return MagicMock()


@pytest.fixture
def mock_upload_repo() -> MagicMock:
    """Create mock CsvUploadRepository"""
    return MagicMock()


@pytest.fixture
def mock_snapshot_repo() -> MagicMock:
    """Create mock MemberSnapshotRepository"""
    return MagicMock()


@pytest.fixture
def mock_collaborator_repo() -> MagicMock:
    """Create mock AllianceCollaboratorRepository"""
    return MagicMock()


@pytest.fixture
def mock_permission_service() -> MagicMock:
    """Create mock PermissionService"""
    return MagicMock()


@pytest.fixture
def hegemony_weight_service(
    mock_weight_repo: MagicMock,
    mock_alliance_repo: MagicMock,
    mock_season_repo: MagicMock,
    mock_upload_repo: MagicMock,
    mock_snapshot_repo: MagicMock,
    mock_collaborator_repo: MagicMock,
    mock_permission_service: MagicMock,
) -> HegemonyWeightService:
    """Create HegemonyWeightService with mocked dependencies"""
    service = HegemonyWeightService()
    service._weight_repo = mock_weight_repo
    service._alliance_repo = mock_alliance_repo
    service._season_repo = mock_season_repo
    service._upload_repo = mock_upload_repo
    service._snapshot_repo = mock_snapshot_repo
    service._collaborator_repo = mock_collaborator_repo
    service._permission_service = mock_permission_service
    return service


def create_mock_season(season_id: UUID, alliance_id: UUID, name: str = "S1") -> Season:
    """Factory for creating mock Season objects"""
    return Season(
        id=season_id,
        alliance_id=alliance_id,
        name=name,
        start_date=date(2025, 1, 1),
        end_date=None,
        is_current=True,
        activation_status="activated",
        description=None,
        created_at=datetime.now(),
        updated_at=datetime.now(),
    )


def create_mock_alliance(alliance_id: UUID) -> MagicMock:
    """Factory for creating mock Alliance objects"""
    alliance = MagicMock()
    alliance.id = alliance_id
    return alliance


def create_mock_weight(
    weight_id: UUID,
    alliance_id: UUID,
    season_id: UUID,
) -> HegemonyWeight:
    """Factory for creating mock HegemonyWeight objects"""
    return HegemonyWeight(
        id=weight_id,
        alliance_id=alliance_id,
        season_id=season_id,
        csv_upload_id=uuid4(),
        weight_contribution=Decimal("0.25"),
        weight_merit=Decimal("0.25"),
        weight_assist=Decimal("0.25"),
        weight_donation=Decimal("0.25"),
        snapshot_weight=Decimal("0.5"),
        created_at=datetime.now(),
        updated_at=datetime.now(),
    )


def create_mock_weight_with_snapshot(
    weight_id: UUID,
    snapshot_date: date,
) -> HegemonyWeightWithSnapshot:
    """Factory for creating mock HegemonyWeightWithSnapshot objects"""
    return HegemonyWeightWithSnapshot(
        id=weight_id,
        alliance_id=uuid4(),
        season_id=uuid4(),
        csv_upload_id=uuid4(),
        weight_contribution=Decimal("0.25"),
        weight_merit=Decimal("0.25"),
        weight_assist=Decimal("0.25"),
        weight_donation=Decimal("0.25"),
        snapshot_weight=Decimal("0.5"),
        created_at=datetime.now(),
        updated_at=datetime.now(),
        snapshot_date=snapshot_date,
        snapshot_filename="test_snapshot.csv",
        total_members=50,
    )


# =============================================================================
# Tests for _verify_season_access
# =============================================================================


class TestVerifySeasonAccess:
    """Tests for _verify_season_access method"""

    @pytest.mark.asyncio
    async def test_should_return_season_and_alliance_when_access_granted(
        self,
        hegemony_weight_service: HegemonyWeightService,
        mock_season_repo: MagicMock,
        mock_alliance_repo: MagicMock,
        mock_collaborator_repo: MagicMock,
        user_id: UUID,
        season_id: UUID,
        alliance_id: UUID,
    ):
        """Should return season and alliance when user has valid access"""
        # Arrange
        mock_season = create_mock_season(season_id, alliance_id)
        mock_alliance = create_mock_alliance(alliance_id)

        mock_season_repo.get_by_id = AsyncMock(return_value=mock_season)
        mock_alliance_repo.get_by_collaborator = AsyncMock(return_value=mock_alliance)
        mock_collaborator_repo.get_collaborator_role = AsyncMock(return_value="owner")

        # Act
        season, alliance = await hegemony_weight_service._verify_season_access(
            user_id, season_id, ["owner", "collaborator"]
        )

        # Assert
        assert season.id == season_id
        assert alliance.id == alliance_id

    @pytest.mark.asyncio
    async def test_should_raise_error_when_season_not_found(
        self,
        hegemony_weight_service: HegemonyWeightService,
        mock_season_repo: MagicMock,
        mock_alliance_repo: MagicMock,
        user_id: UUID,
        season_id: UUID,
    ):
        """Should raise ValueError when season not found"""
        # Arrange
        mock_season_repo.get_by_id = AsyncMock(return_value=None)
        mock_alliance_repo.get_by_collaborator = AsyncMock(return_value=None)

        # Act & Assert
        with pytest.raises(ValueError, match="Season .* not found"):
            await hegemony_weight_service._verify_season_access(
                user_id, season_id, ["owner"]
            )

    @pytest.mark.asyncio
    async def test_should_raise_error_when_user_has_no_alliance(
        self,
        hegemony_weight_service: HegemonyWeightService,
        mock_season_repo: MagicMock,
        mock_alliance_repo: MagicMock,
        user_id: UUID,
        season_id: UUID,
        alliance_id: UUID,
    ):
        """Should raise PermissionError when user has no alliance"""
        # Arrange
        mock_season = create_mock_season(season_id, alliance_id)
        mock_season_repo.get_by_id = AsyncMock(return_value=mock_season)
        mock_alliance_repo.get_by_collaborator = AsyncMock(return_value=None)

        # Act & Assert
        with pytest.raises(PermissionError, match="permission"):
            await hegemony_weight_service._verify_season_access(
                user_id, season_id, ["owner"]
            )

    @pytest.mark.asyncio
    async def test_should_raise_http_exception_when_role_not_sufficient(
        self,
        hegemony_weight_service: HegemonyWeightService,
        mock_season_repo: MagicMock,
        mock_alliance_repo: MagicMock,
        mock_collaborator_repo: MagicMock,
        user_id: UUID,
        season_id: UUID,
        alliance_id: UUID,
    ):
        """Should raise HTTPException 403 when user role is not in required roles"""
        # Arrange
        mock_season = create_mock_season(season_id, alliance_id)
        mock_alliance = create_mock_alliance(alliance_id)

        mock_season_repo.get_by_id = AsyncMock(return_value=mock_season)
        mock_alliance_repo.get_by_collaborator = AsyncMock(return_value=mock_alliance)
        mock_collaborator_repo.get_collaborator_role = AsyncMock(return_value="member")

        # Act & Assert
        with pytest.raises(HTTPException) as exc_info:
            await hegemony_weight_service._verify_season_access(
                user_id, season_id, ["owner", "collaborator"]  # member not allowed
            )
        assert exc_info.value.status_code == 403


# =============================================================================
# Tests for get_season_weights
# =============================================================================


class TestGetSeasonWeights:
    """Tests for get_season_weights method"""

    @pytest.mark.asyncio
    async def test_should_return_weights_when_user_has_access(
        self,
        hegemony_weight_service: HegemonyWeightService,
        mock_season_repo: MagicMock,
        mock_alliance_repo: MagicMock,
        mock_collaborator_repo: MagicMock,
        mock_weight_repo: MagicMock,
        user_id: UUID,
        season_id: UUID,
        alliance_id: UUID,
    ):
        """Should return weights when user has member access"""
        # Arrange
        mock_season = create_mock_season(season_id, alliance_id)
        mock_alliance = create_mock_alliance(alliance_id)
        weights = [
            create_mock_weight_with_snapshot(uuid4(), date(2025, 1, 1)),
            create_mock_weight_with_snapshot(uuid4(), date(2025, 1, 8)),
        ]

        mock_season_repo.get_by_id = AsyncMock(return_value=mock_season)
        mock_alliance_repo.get_by_collaborator = AsyncMock(return_value=mock_alliance)
        mock_collaborator_repo.get_collaborator_role = AsyncMock(return_value="member")
        mock_weight_repo.get_with_snapshot_info = AsyncMock(return_value=weights)

        # Act
        result = await hegemony_weight_service.get_season_weights(user_id, season_id)

        # Assert
        assert len(result) == 2
        mock_weight_repo.get_with_snapshot_info.assert_called_once_with(season_id)


# =============================================================================
# Tests for initialize_weights_for_season
# =============================================================================


class TestInitializeWeightsForSeason:
    """Tests for initialize_weights_for_season method"""

    @pytest.mark.asyncio
    async def test_should_return_empty_list_when_no_uploads(
        self,
        hegemony_weight_service: HegemonyWeightService,
        mock_season_repo: MagicMock,
        mock_alliance_repo: MagicMock,
        mock_collaborator_repo: MagicMock,
        mock_upload_repo: MagicMock,
        mock_permission_service: MagicMock,
        user_id: UUID,
        season_id: UUID,
        alliance_id: UUID,
    ):
        """Should return empty list when no CSV uploads exist"""
        # Arrange
        mock_season = create_mock_season(season_id, alliance_id)
        mock_alliance = create_mock_alliance(alliance_id)

        mock_season_repo.get_by_id = AsyncMock(return_value=mock_season)
        mock_alliance_repo.get_by_collaborator = AsyncMock(return_value=mock_alliance)
        mock_collaborator_repo.get_collaborator_role = AsyncMock(return_value="owner")
        mock_permission_service.require_active_quota = AsyncMock()
        mock_upload_repo.get_by_season = AsyncMock(return_value=[])

        # Act
        result = await hegemony_weight_service.initialize_weights_for_season(
            user_id, season_id
        )

        # Assert
        assert result == []


# =============================================================================
# Tests for update_weight
# =============================================================================


class TestUpdateWeight:
    """Tests for update_weight method"""

    @pytest.mark.asyncio
    async def test_should_raise_error_when_weight_not_found(
        self,
        hegemony_weight_service: HegemonyWeightService,
        mock_weight_repo: MagicMock,
        mock_alliance_repo: MagicMock,
        user_id: UUID,
        weight_id: UUID,
    ):
        """Should raise ValueError when weight not found"""
        # Arrange
        from src.models.hegemony_weight import HegemonyWeightUpdate

        mock_weight_repo.get_by_id = AsyncMock(return_value=None)
        mock_alliance_repo.get_by_collaborator = AsyncMock(return_value=None)

        update_data = HegemonyWeightUpdate(
            weight_contribution=Decimal("0.30"),
            weight_merit=Decimal("0.30"),
            weight_assist=Decimal("0.20"),
            weight_donation=Decimal("0.20"),
        )

        # Act & Assert
        with pytest.raises(ValueError, match="not found"):
            await hegemony_weight_service.update_weight(user_id, weight_id, update_data)


# =============================================================================
# Tests for delete_weight
# =============================================================================


class TestDeleteWeight:
    """Tests for delete_weight method"""

    @pytest.mark.asyncio
    async def test_should_delete_weight_successfully(
        self,
        hegemony_weight_service: HegemonyWeightService,
        mock_weight_repo: MagicMock,
        mock_alliance_repo: MagicMock,
        mock_collaborator_repo: MagicMock,
        mock_permission_service: MagicMock,
        user_id: UUID,
        weight_id: UUID,
        alliance_id: UUID,
        season_id: UUID,
    ):
        """Should delete weight when user has permission"""
        # Arrange
        mock_weight = create_mock_weight(weight_id, alliance_id, season_id)
        mock_alliance = create_mock_alliance(alliance_id)

        mock_weight_repo.get_by_id = AsyncMock(return_value=mock_weight)
        mock_alliance_repo.get_by_collaborator = AsyncMock(return_value=mock_alliance)
        mock_collaborator_repo.get_collaborator_role = AsyncMock(return_value="owner")
        mock_permission_service.require_active_quota = AsyncMock()
        mock_weight_repo.delete = AsyncMock(return_value=True)

        # Act
        result = await hegemony_weight_service.delete_weight(user_id, weight_id)

        # Assert
        assert result is True
        mock_weight_repo.delete.assert_called_once_with(weight_id)

    @pytest.mark.asyncio
    async def test_should_raise_error_when_weight_not_found(
        self,
        hegemony_weight_service: HegemonyWeightService,
        mock_weight_repo: MagicMock,
        mock_alliance_repo: MagicMock,
        user_id: UUID,
        weight_id: UUID,
    ):
        """Should raise ValueError when weight not found"""
        # Arrange
        mock_weight_repo.get_by_id = AsyncMock(return_value=None)
        mock_alliance_repo.get_by_collaborator = AsyncMock(return_value=None)

        # Act & Assert
        with pytest.raises(ValueError, match="not found"):
            await hegemony_weight_service.delete_weight(user_id, weight_id)
