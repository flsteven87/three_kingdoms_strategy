"""
Unit Tests for SeasonQuotaService

Tests cover:
1. Quota status calculation (trial, active, expired)
2. Write access checking
3. Write access enforcement with proper error messages
4. Season activation checking
5. Edge cases (timezone handling, boundary conditions)

Following test-writing skill conventions:
- AAA pattern (Arrange-Act-Assert)
- Mocked repository dependencies
- Coverage: happy path + edge cases + error cases
"""

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock
from uuid import UUID

import pytest

from src.core.exceptions import SeasonQuotaExhaustedError
from src.models.alliance import Alliance
from src.services.season_quota_service import SeasonQuotaService

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
def mock_alliance_repo() -> MagicMock:
    """Create mock alliance repository"""
    return MagicMock()


@pytest.fixture
def quota_service(mock_alliance_repo: MagicMock) -> SeasonQuotaService:
    """Create SeasonQuotaService with mocked repository"""
    service = SeasonQuotaService()
    service._alliance_repo = mock_alliance_repo
    return service


def create_mock_alliance(
    alliance_id: UUID,
    subscription_status: str = "trial",
    trial_ends_at: datetime | None = None,
    purchased_seasons: int = 0,
    used_seasons: int = 0,
) -> Alliance:
    """Factory for creating mock Alliance objects"""
    now = datetime.now(UTC)
    return Alliance(
        id=alliance_id,
        name="Test Alliance",
        server_name="Server 1",
        created_at=now,
        updated_at=now,
        subscription_status=subscription_status,
        trial_started_at=now - timedelta(days=7) if subscription_status == "trial" else None,
        trial_ends_at=trial_ends_at,
        purchased_seasons=purchased_seasons,
        used_seasons=used_seasons,
    )


# =============================================================================
# Tests for _calculate_quota_status
# =============================================================================


class TestCalculateQuotaStatus:
    """Tests for SeasonQuotaService._calculate_quota_status"""

    # =========================================================================
    # Happy Path Tests - Trial
    # =========================================================================

    def test_should_return_active_trial_when_trial_not_expired(
        self,
        quota_service: SeasonQuotaService,
        alliance_id: UUID,
    ):
        """Should return is_active=True when trial has not expired"""
        # Arrange - Use full days + extra hours to ensure correct day calculation
        trial_ends_at = datetime.now(UTC) + timedelta(days=7, hours=12)
        alliance = create_mock_alliance(
            alliance_id,
            subscription_status="trial",
            trial_ends_at=trial_ends_at,
        )

        # Act
        result = quota_service._calculate_quota_status(alliance)

        # Assert
        assert result.status == "trial"
        assert result.is_active is True
        assert result.is_trial is True
        assert result.is_trial_active is True
        assert result.trial_days_remaining >= 7  # At least 7 days remaining

    def test_should_return_inactive_trial_when_trial_expired(
        self,
        quota_service: SeasonQuotaService,
        alliance_id: UUID,
    ):
        """Should return is_active=False when trial has expired"""
        # Arrange
        trial_ends_at = datetime.now(UTC) - timedelta(days=1)
        alliance = create_mock_alliance(
            alliance_id,
            subscription_status="trial",
            trial_ends_at=trial_ends_at,
        )

        # Act
        result = quota_service._calculate_quota_status(alliance)

        # Assert
        assert result.status == "expired"
        assert result.is_active is False
        assert result.is_trial is True
        assert result.is_trial_active is False
        assert result.trial_days_remaining == 0

    # =========================================================================
    # Happy Path Tests - Active with Purchased Seasons
    # =========================================================================

    def test_should_return_active_when_has_available_seasons(
        self,
        quota_service: SeasonQuotaService,
        alliance_id: UUID,
    ):
        """Should return is_active=True when has available purchased seasons"""
        # Arrange
        trial_ends_at = datetime.now(UTC) - timedelta(days=1)  # Trial expired
        alliance = create_mock_alliance(
            alliance_id,
            subscription_status="active",
            trial_ends_at=trial_ends_at,
            purchased_seasons=5,
            used_seasons=2,
        )

        # Act
        result = quota_service._calculate_quota_status(alliance)

        # Assert
        assert result.status == "active"
        assert result.is_active is True
        assert result.is_trial is False
        assert result.available_seasons == 3
        assert result.can_activate_season is True

    def test_should_return_inactive_when_all_seasons_used(
        self,
        quota_service: SeasonQuotaService,
        alliance_id: UUID,
    ):
        """Should return is_active=False when all purchased seasons are used"""
        # Arrange
        trial_ends_at = datetime.now(UTC) - timedelta(days=1)
        alliance = create_mock_alliance(
            alliance_id,
            subscription_status="active",
            trial_ends_at=trial_ends_at,
            purchased_seasons=5,
            used_seasons=5,
        )

        # Act
        result = quota_service._calculate_quota_status(alliance)

        # Assert
        assert result.status == "expired"
        assert result.is_active is False
        assert result.available_seasons == 0
        assert result.can_activate_season is False

    # =========================================================================
    # Edge Case Tests
    # =========================================================================

    def test_should_handle_timezone_naive_trial_ends_at(
        self,
        quota_service: SeasonQuotaService,
        alliance_id: UUID,
    ):
        """Should handle timezone-naive datetime correctly"""
        # Arrange - Create timezone-naive datetime
        trial_ends_at = datetime.now() + timedelta(days=5)  # No timezone
        alliance = create_mock_alliance(
            alliance_id,
            subscription_status="trial",
            trial_ends_at=trial_ends_at,
        )

        # Act
        result = quota_service._calculate_quota_status(alliance)

        # Assert - Should not crash and should calculate correctly
        assert result.is_trial is True
        assert result.trial_days_remaining is not None
        assert result.trial_days_remaining >= 4  # Allow for timing differences

    def test_should_return_zero_days_when_expiring_today(
        self,
        quota_service: SeasonQuotaService,
        alliance_id: UUID,
    ):
        """Should return 0 days remaining when expiring today"""
        # Arrange
        trial_ends_at = datetime.now(UTC) + timedelta(hours=12)
        alliance = create_mock_alliance(
            alliance_id,
            subscription_status="trial",
            trial_ends_at=trial_ends_at,
        )

        # Act
        result = quota_service._calculate_quota_status(alliance)

        # Assert
        assert result.is_active is True
        assert result.trial_days_remaining == 0

    def test_should_handle_expired_status(
        self,
        quota_service: SeasonQuotaService,
        alliance_id: UUID,
    ):
        """Should handle 'expired' subscription status"""
        # Arrange
        alliance = create_mock_alliance(
            alliance_id,
            subscription_status="expired",
        )

        # Act
        result = quota_service._calculate_quota_status(alliance)

        # Assert
        assert result.status == "expired"
        assert result.is_active is False
        assert result.is_trial is False


# =============================================================================
# Tests for get_quota_status
# =============================================================================


class TestGetQuotaStatus:
    """Tests for SeasonQuotaService.get_quota_status"""

    @pytest.mark.asyncio
    async def test_should_return_status_when_user_has_alliance(
        self,
        quota_service: SeasonQuotaService,
        mock_alliance_repo: MagicMock,
        user_id: UUID,
        alliance_id: UUID,
    ):
        """Should return quota status when user has alliance"""
        # Arrange
        trial_ends_at = datetime.now(UTC) + timedelta(days=10)
        mock_alliance = create_mock_alliance(
            alliance_id,
            subscription_status="trial",
            trial_ends_at=trial_ends_at,
        )
        mock_alliance_repo.get_by_collaborator = AsyncMock(return_value=mock_alliance)

        # Act
        result = await quota_service.get_quota_status(user_id)

        # Assert
        assert result.is_active is True
        assert result.is_trial is True
        mock_alliance_repo.get_by_collaborator.assert_called_once_with(user_id)

    @pytest.mark.asyncio
    async def test_should_raise_valueerror_when_user_has_no_alliance(
        self,
        quota_service: SeasonQuotaService,
        mock_alliance_repo: MagicMock,
        user_id: UUID,
    ):
        """Should raise ValueError when user has no alliance"""
        # Arrange
        mock_alliance_repo.get_by_collaborator = AsyncMock(return_value=None)

        # Act & Assert
        with pytest.raises(ValueError) as exc_info:
            await quota_service.get_quota_status(user_id)
        assert "No alliance found" in str(exc_info.value)


# =============================================================================
# Tests for check_write_access
# =============================================================================


class TestCheckWriteAccess:
    """Tests for SeasonQuotaService.check_write_access"""

    @pytest.mark.asyncio
    async def test_should_return_true_when_trial_active(
        self,
        quota_service: SeasonQuotaService,
        mock_alliance_repo: MagicMock,
        alliance_id: UUID,
    ):
        """Should return True when trial is active"""
        # Arrange
        trial_ends_at = datetime.now(UTC) + timedelta(days=7)
        mock_alliance = create_mock_alliance(
            alliance_id,
            subscription_status="trial",
            trial_ends_at=trial_ends_at,
        )
        mock_alliance_repo.get_by_id = AsyncMock(return_value=mock_alliance)

        # Act
        result = await quota_service.check_write_access(alliance_id)

        # Assert
        assert result is True

    @pytest.mark.asyncio
    async def test_should_return_true_when_has_available_seasons(
        self,
        quota_service: SeasonQuotaService,
        mock_alliance_repo: MagicMock,
        alliance_id: UUID,
    ):
        """Should return True when has available seasons"""
        # Arrange
        mock_alliance = create_mock_alliance(
            alliance_id,
            subscription_status="active",
            purchased_seasons=3,
            used_seasons=1,
        )
        mock_alliance_repo.get_by_id = AsyncMock(return_value=mock_alliance)

        # Act
        result = await quota_service.check_write_access(alliance_id)

        # Assert
        assert result is True

    @pytest.mark.asyncio
    async def test_should_return_false_when_trial_expired_and_no_seasons(
        self,
        quota_service: SeasonQuotaService,
        mock_alliance_repo: MagicMock,
        alliance_id: UUID,
    ):
        """Should return False when trial has expired and no seasons available"""
        # Arrange
        trial_ends_at = datetime.now(UTC) - timedelta(days=1)
        mock_alliance = create_mock_alliance(
            alliance_id,
            subscription_status="trial",
            trial_ends_at=trial_ends_at,
        )
        mock_alliance_repo.get_by_id = AsyncMock(return_value=mock_alliance)

        # Act
        result = await quota_service.check_write_access(alliance_id)

        # Assert
        assert result is False

    @pytest.mark.asyncio
    async def test_should_return_false_when_alliance_not_found(
        self,
        quota_service: SeasonQuotaService,
        mock_alliance_repo: MagicMock,
        alliance_id: UUID,
    ):
        """Should return False when alliance not found"""
        # Arrange
        mock_alliance_repo.get_by_id = AsyncMock(return_value=None)

        # Act
        result = await quota_service.check_write_access(alliance_id)

        # Assert
        assert result is False


# =============================================================================
# Tests for require_write_access
# =============================================================================


class TestRequireWriteAccess:
    """Tests for SeasonQuotaService.require_write_access"""

    @pytest.mark.asyncio
    async def test_should_pass_when_trial_active(
        self,
        quota_service: SeasonQuotaService,
        mock_alliance_repo: MagicMock,
        alliance_id: UUID,
    ):
        """Should not raise when trial is active"""
        # Arrange
        trial_ends_at = datetime.now(UTC) + timedelta(days=7)
        mock_alliance = create_mock_alliance(
            alliance_id,
            subscription_status="trial",
            trial_ends_at=trial_ends_at,
        )
        mock_alliance_repo.get_by_id = AsyncMock(return_value=mock_alliance)

        # Act & Assert - should not raise
        await quota_service.require_write_access(alliance_id, "upload CSV")

    @pytest.mark.asyncio
    async def test_should_raise_quota_exhausted_error_when_trial_expired(
        self,
        quota_service: SeasonQuotaService,
        mock_alliance_repo: MagicMock,
        alliance_id: UUID,
    ):
        """Should raise SeasonQuotaExhaustedError when trial expired"""
        # Arrange
        trial_ends_at = datetime.now(UTC) - timedelta(days=1)
        mock_alliance = create_mock_alliance(
            alliance_id,
            subscription_status="trial",
            trial_ends_at=trial_ends_at,
        )
        mock_alliance_repo.get_by_id = AsyncMock(return_value=mock_alliance)

        # Act & Assert
        with pytest.raises(SeasonQuotaExhaustedError) as exc_info:
            await quota_service.require_write_access(alliance_id, "upload CSV")
        assert "試用期已結束" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_should_raise_quota_exhausted_error_when_no_seasons_left(
        self,
        quota_service: SeasonQuotaService,
        mock_alliance_repo: MagicMock,
        alliance_id: UUID,
    ):
        """Should raise SeasonQuotaExhaustedError when no seasons available"""
        # Arrange
        mock_alliance = create_mock_alliance(
            alliance_id,
            subscription_status="active",
            purchased_seasons=2,
            used_seasons=2,
        )
        mock_alliance_repo.get_by_id = AsyncMock(return_value=mock_alliance)

        # Act & Assert
        with pytest.raises(SeasonQuotaExhaustedError) as exc_info:
            await quota_service.require_write_access(alliance_id, "create event")
        assert "季數已用完" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_should_raise_valueerror_when_alliance_not_found(
        self,
        quota_service: SeasonQuotaService,
        mock_alliance_repo: MagicMock,
        alliance_id: UUID,
    ):
        """Should raise ValueError when alliance not found"""
        # Arrange
        mock_alliance_repo.get_by_id = AsyncMock(return_value=None)

        # Act & Assert
        with pytest.raises(ValueError) as exc_info:
            await quota_service.require_write_access(alliance_id, "upload CSV")
        assert "not found" in str(exc_info.value)


# =============================================================================
# Tests for can_activate_season
# =============================================================================


class TestCanActivateSeason:
    """Tests for SeasonQuotaService.can_activate_season"""

    @pytest.mark.asyncio
    async def test_should_return_true_when_trial_active(
        self,
        quota_service: SeasonQuotaService,
        mock_alliance_repo: MagicMock,
        alliance_id: UUID,
    ):
        """Should return True when trial is active"""
        # Arrange
        trial_ends_at = datetime.now(UTC) + timedelta(days=7)
        mock_alliance = create_mock_alliance(
            alliance_id,
            subscription_status="trial",
            trial_ends_at=trial_ends_at,
        )
        mock_alliance_repo.get_by_id = AsyncMock(return_value=mock_alliance)

        # Act
        result = await quota_service.can_activate_season(alliance_id)

        # Assert
        assert result is True

    @pytest.mark.asyncio
    async def test_should_return_true_when_has_available_seasons(
        self,
        quota_service: SeasonQuotaService,
        mock_alliance_repo: MagicMock,
        alliance_id: UUID,
    ):
        """Should return True when has available seasons"""
        # Arrange
        mock_alliance = create_mock_alliance(
            alliance_id,
            subscription_status="active",
            purchased_seasons=3,
            used_seasons=1,
        )
        mock_alliance_repo.get_by_id = AsyncMock(return_value=mock_alliance)

        # Act
        result = await quota_service.can_activate_season(alliance_id)

        # Assert
        assert result is True

    @pytest.mark.asyncio
    async def test_should_return_false_when_no_seasons_available(
        self,
        quota_service: SeasonQuotaService,
        mock_alliance_repo: MagicMock,
        alliance_id: UUID,
    ):
        """Should return False when no seasons available"""
        # Arrange
        mock_alliance = create_mock_alliance(
            alliance_id,
            subscription_status="active",
            purchased_seasons=2,
            used_seasons=2,
        )
        mock_alliance_repo.get_by_id = AsyncMock(return_value=mock_alliance)

        # Act
        result = await quota_service.can_activate_season(alliance_id)

        # Assert
        assert result is False


# =============================================================================
# Tests for 14-Day Trial Specific Logic
# =============================================================================


class TestFourteenDayTrialLogic:
    """Tests specifically for 14-day trial business logic"""

    def test_should_return_14_days_remaining_on_first_day(
        self,
        quota_service: SeasonQuotaService,
        alliance_id: UUID,
    ):
        """Should return 14 days remaining on first day of trial"""
        # Arrange - Use full days + extra hours to ensure correct day calculation
        trial_ends_at = datetime.now(UTC) + timedelta(days=14, hours=12)
        alliance = create_mock_alliance(
            alliance_id,
            subscription_status="trial",
            trial_ends_at=trial_ends_at,
        )

        # Act
        result = quota_service._calculate_quota_status(alliance)

        # Assert
        assert result.trial_days_remaining >= 14  # At least 14 days remaining
        assert result.is_trial_active is True

    def test_should_return_1_day_remaining_on_last_day(
        self,
        quota_service: SeasonQuotaService,
        alliance_id: UUID,
    ):
        """Should return 1 day remaining on last day of trial"""
        # Arrange
        trial_ends_at = datetime.now(UTC) + timedelta(days=1, hours=1)
        alliance = create_mock_alliance(
            alliance_id,
            subscription_status="trial",
            trial_ends_at=trial_ends_at,
        )

        # Act
        result = quota_service._calculate_quota_status(alliance)

        # Assert
        assert result.trial_days_remaining == 1
        assert result.is_trial_active is True

    def test_should_format_trial_ends_at_as_iso_string(
        self,
        quota_service: SeasonQuotaService,
        alliance_id: UUID,
    ):
        """Should format trial_ends_at as ISO string in response"""
        # Arrange
        trial_ends_at = datetime(2025, 2, 15, 12, 0, 0, tzinfo=UTC)
        alliance = create_mock_alliance(
            alliance_id,
            subscription_status="trial",
            trial_ends_at=trial_ends_at,
        )

        # Act
        result = quota_service._calculate_quota_status(alliance)

        # Assert
        assert result.trial_ends_at is not None
        assert "2025-02-15" in result.trial_ends_at
