"""
Unit Tests for DonationService

Tests cover:
1. require_alliance_access - permission verification
2. verify_donation_access - access control
3. get_donations_by_alliance_and_season - retrieval
4. create_donation - creation
5. delete_donation - deletion

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

from src.models.donation import Donation, DonationCreate, DonationType
from src.services.donation_service import DonationService

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
def donation_id() -> UUID:
    """Fixed donation UUID for testing"""
    return UUID("44444444-4444-4444-4444-444444444444")


@pytest.fixture
def mock_donation_repo() -> MagicMock:
    """Create mock DonationRepository"""
    return MagicMock()


@pytest.fixture
def mock_target_repo() -> MagicMock:
    """Create mock DonationTargetRepository"""
    return MagicMock()


@pytest.fixture
def mock_snapshot_repo() -> MagicMock:
    """Create mock MemberSnapshotRepository"""
    return MagicMock()


@pytest.fixture
def mock_permission_service() -> MagicMock:
    """Create mock PermissionService"""
    return MagicMock()


@pytest.fixture
def donation_service(
    mock_donation_repo: MagicMock,
    mock_target_repo: MagicMock,
    mock_snapshot_repo: MagicMock,
    mock_permission_service: MagicMock,
) -> DonationService:
    """Create DonationService with mocked dependencies"""
    service = DonationService()
    service._donation_repo = mock_donation_repo
    service._target_repo = mock_target_repo
    service._snapshot_repo = mock_snapshot_repo
    service._permission_service = mock_permission_service
    return service


def create_mock_donation(
    donation_id: UUID,
    alliance_id: UUID,
    season_id: UUID,
    donation_type: DonationType = DonationType.REGULAR,
) -> Donation:
    """Factory for creating mock Donation objects"""
    return Donation(
        id=donation_id,
        alliance_id=alliance_id,
        season_id=season_id,
        type=donation_type,
        title="Test Donation Event",
        target_amount=5000,
        deadline=datetime(2025, 1, 15),
        description="Test donation",
        created_by=uuid4(),
        created_at=datetime(2025, 1, 1),
        updated_at=datetime(2025, 1, 1),
    )


# =============================================================================
# Tests for require_alliance_access
# =============================================================================


class TestRequireAllianceAccess:
    """Tests for require_alliance_access method"""

    @pytest.mark.asyncio
    async def test_should_pass_when_user_has_permission(
        self,
        donation_service: DonationService,
        mock_permission_service: MagicMock,
        user_id: UUID,
        alliance_id: UUID,
    ):
        """Should pass when user has write permission"""
        # Arrange
        mock_permission_service.require_write_permission = AsyncMock()

        # Act & Assert (no exception)
        await donation_service.require_alliance_access(user_id, alliance_id)

        mock_permission_service.require_write_permission.assert_called_once_with(
            user_id, alliance_id, "manage donation events"
        )

    @pytest.mark.asyncio
    async def test_should_propagate_permission_error(
        self,
        donation_service: DonationService,
        mock_permission_service: MagicMock,
        user_id: UUID,
        alliance_id: UUID,
    ):
        """Should propagate PermissionError from permission service"""
        # Arrange
        mock_permission_service.require_write_permission = AsyncMock(
            side_effect=PermissionError("No access")
        )

        # Act & Assert
        with pytest.raises(PermissionError, match="No access"):
            await donation_service.require_alliance_access(user_id, alliance_id)


# =============================================================================
# Tests for verify_donation_access
# =============================================================================


class TestVerifyDonationAccess:
    """Tests for verify_donation_access method"""

    @pytest.mark.asyncio
    async def test_should_return_donation_when_user_has_access(
        self,
        donation_service: DonationService,
        mock_donation_repo: MagicMock,
        mock_permission_service: MagicMock,
        user_id: UUID,
        donation_id: UUID,
        alliance_id: UUID,
        season_id: UUID,
    ):
        """Should return donation when user has access"""
        # Arrange
        mock_donation = create_mock_donation(donation_id, alliance_id, season_id)
        mock_donation_repo.get_by_id = AsyncMock(return_value=mock_donation)
        mock_permission_service.require_write_permission = AsyncMock()

        # Act
        result = await donation_service.verify_donation_access(user_id, donation_id)

        # Assert
        assert result.id == donation_id
        mock_permission_service.require_write_permission.assert_called_once()

    @pytest.mark.asyncio
    async def test_should_raise_404_when_donation_not_found(
        self,
        donation_service: DonationService,
        mock_donation_repo: MagicMock,
        user_id: UUID,
        donation_id: UUID,
    ):
        """Should raise HTTPException 404 when donation not found"""
        # Arrange
        mock_donation_repo.get_by_id = AsyncMock(return_value=None)

        # Act & Assert
        with pytest.raises(HTTPException) as exc_info:
            await donation_service.verify_donation_access(user_id, donation_id)
        assert exc_info.value.status_code == 404


# =============================================================================
# Tests for get_donations_by_alliance_and_season
# =============================================================================


class TestGetDonationsByAllianceAndSeason:
    """Tests for get_donations_by_alliance_and_season method"""

    @pytest.mark.asyncio
    async def test_should_return_donations(
        self,
        donation_service: DonationService,
        mock_donation_repo: MagicMock,
        alliance_id: UUID,
        season_id: UUID,
    ):
        """Should return list of donations"""
        # Arrange
        donations = [
            create_mock_donation(uuid4(), alliance_id, season_id),
            create_mock_donation(uuid4(), alliance_id, season_id, DonationType.PENALTY),
        ]
        mock_donation_repo.get_by_alliance_and_season = AsyncMock(return_value=donations)

        # Act
        result = await donation_service.get_donations_by_alliance_and_season(
            alliance_id, season_id
        )

        # Assert
        assert len(result) == 2
        mock_donation_repo.get_by_alliance_and_season.assert_called_once_with(
            alliance_id, season_id
        )


# =============================================================================
# Tests for create_donation
# =============================================================================


class TestCreateDonation:
    """Tests for create_donation method"""

    @pytest.mark.asyncio
    async def test_should_create_donation_successfully(
        self,
        donation_service: DonationService,
        mock_donation_repo: MagicMock,
        alliance_id: UUID,
        season_id: UUID,
    ):
        """Should create donation successfully"""
        # Arrange
        donation_data = DonationCreate(
            alliance_id=alliance_id,
            season_id=season_id,
            type=DonationType.REGULAR,
            title="New Donation Event",
            target_amount=5000,
            deadline=datetime(2025, 1, 15),
        )
        expected_donation = create_mock_donation(uuid4(), alliance_id, season_id)
        mock_donation_repo.create = AsyncMock(return_value=expected_donation)

        # Act
        result = await donation_service.create_donation(donation_data)

        # Assert
        assert result.alliance_id == alliance_id
        mock_donation_repo.create.assert_called_once_with(donation_data)


# =============================================================================
# Tests for delete_donation
# =============================================================================


class TestDeleteDonation:
    """Tests for delete_donation method"""

    @pytest.mark.asyncio
    async def test_should_delete_donation_successfully(
        self,
        donation_service: DonationService,
        mock_donation_repo: MagicMock,
        mock_permission_service: MagicMock,
        user_id: UUID,
        donation_id: UUID,
        alliance_id: UUID,
        season_id: UUID,
    ):
        """Should delete donation when user has access"""
        # Arrange
        mock_donation = create_mock_donation(donation_id, alliance_id, season_id)
        mock_donation_repo.get_by_id = AsyncMock(return_value=mock_donation)
        mock_permission_service.require_write_permission = AsyncMock()
        mock_donation_repo.delete = AsyncMock()

        # Act
        await donation_service.delete_donation(donation_id, user_id)

        # Assert
        mock_donation_repo.delete.assert_called_once_with(donation_id)

    @pytest.mark.asyncio
    async def test_should_raise_error_when_donation_not_found(
        self,
        donation_service: DonationService,
        mock_donation_repo: MagicMock,
        user_id: UUID,
        donation_id: UUID,
    ):
        """Should raise HTTPException when donation not found"""
        # Arrange
        mock_donation_repo.get_by_id = AsyncMock(return_value=None)

        # Act & Assert
        with pytest.raises(HTTPException) as exc_info:
            await donation_service.delete_donation(donation_id, user_id)
        assert exc_info.value.status_code == 404
