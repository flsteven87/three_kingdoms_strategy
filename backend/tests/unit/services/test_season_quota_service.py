"""
Unit Tests for SeasonQuotaService - Season-Based Trial System

Tests cover:
1. Trial availability checking (based on activated seasons count)
2. Quota status calculation
3. Write access checking (purchased_seasons > 0 OR trial active)
4. Season activation checking
5. Season consumption (trial vs paid)

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
from src.models.season import Season
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
def season_id() -> UUID:
    """Fixed season UUID for testing"""
    return UUID("33333333-3333-3333-3333-333333333333")


@pytest.fixture
def mock_alliance_repo() -> MagicMock:
    """Create mock alliance repository"""
    return MagicMock()


@pytest.fixture
def mock_season_repo() -> MagicMock:
    """Create mock season repository"""
    return MagicMock()


@pytest.fixture
def quota_service(mock_alliance_repo: MagicMock, mock_season_repo: MagicMock) -> SeasonQuotaService:
    """Create SeasonQuotaService with mocked repositories"""
    service = SeasonQuotaService()
    service._alliance_repo = mock_alliance_repo
    service._season_repo = mock_season_repo
    return service


def create_mock_alliance(
    alliance_id: UUID,
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
        purchased_seasons=purchased_seasons,
        used_seasons=used_seasons,
    )


def create_mock_season(
    season_id: UUID,
    alliance_id: UUID,
    is_trial: bool = False,
    activated_at: datetime | None = None,
    is_current: bool = True,
    activation_status: str = "activated",
) -> Season:
    """Factory for creating mock Season objects"""
    from datetime import date

    now = datetime.now(UTC)
    return Season(
        id=season_id,
        alliance_id=alliance_id,
        name="Test Season",
        start_date=date.today(),
        end_date=None,
        is_current=is_current,
        activation_status=activation_status,
        description=None,
        created_at=now,
        updated_at=now,
        is_trial=is_trial,
        activated_at=activated_at,
    )


# =============================================================================
# Tests for Trial Availability
# =============================================================================


class TestTrialAvailability:
    """Tests for trial availability based on activated seasons count"""

    @pytest.mark.asyncio
    async def test_trial_available_when_no_activated_seasons(
        self,
        quota_service: SeasonQuotaService,
        mock_season_repo: MagicMock,
        alliance_id: UUID,
    ):
        """Should have trial available when no seasons have been activated"""
        # Arrange
        mock_season_repo.get_activated_seasons_count = AsyncMock(return_value=0)

        # Act
        result = await quota_service._has_trial_available(alliance_id)

        # Assert
        assert result is True

    @pytest.mark.asyncio
    async def test_trial_not_available_when_has_activated_seasons(
        self,
        quota_service: SeasonQuotaService,
        mock_season_repo: MagicMock,
        alliance_id: UUID,
    ):
        """Should not have trial available when seasons have been activated"""
        # Arrange
        mock_season_repo.get_activated_seasons_count = AsyncMock(return_value=1)

        # Act
        result = await quota_service._has_trial_available(alliance_id)

        # Assert
        assert result is False


# =============================================================================
# Tests for Trial Active Check (Season-based)
# =============================================================================


class TestTrialActiveCheck:
    """Tests for checking if a trial season is still active"""

    def test_trial_active_within_14_days(
        self,
        quota_service: SeasonQuotaService,
        season_id: UUID,
        alliance_id: UUID,
    ):
        """Should return True when trial season activated within 14 days"""
        # Arrange
        activated_at = datetime.now(UTC) - timedelta(days=7)
        season = create_mock_season(
            season_id, alliance_id, is_trial=True, activated_at=activated_at
        )

        # Act
        result = quota_service._is_trial_active(season)

        # Assert
        assert result is True

    def test_trial_expired_after_14_days(
        self,
        quota_service: SeasonQuotaService,
        season_id: UUID,
        alliance_id: UUID,
    ):
        """Should return False when trial season activated more than 14 days ago"""
        # Arrange
        activated_at = datetime.now(UTC) - timedelta(days=15)
        season = create_mock_season(
            season_id, alliance_id, is_trial=True, activated_at=activated_at
        )

        # Act
        result = quota_service._is_trial_active(season)

        # Assert
        assert result is False

    def test_non_trial_season_returns_false(
        self,
        quota_service: SeasonQuotaService,
        season_id: UUID,
        alliance_id: UUID,
    ):
        """Should return False for non-trial season"""
        # Arrange
        season = create_mock_season(
            season_id, alliance_id, is_trial=False, activated_at=datetime.now(UTC)
        )

        # Act
        result = quota_service._is_trial_active(season)

        # Assert
        assert result is False


# =============================================================================
# Tests for Trial Days Remaining
# =============================================================================


class TestTrialDaysRemaining:
    """Tests for calculating trial days remaining"""

    def test_returns_correct_days_remaining(
        self,
        quota_service: SeasonQuotaService,
        season_id: UUID,
        alliance_id: UUID,
    ):
        """Should return correct days remaining in trial"""
        # Arrange - Set activated_at to exactly 7 days ago at start of day
        # to ensure consistent calculation across time zones
        now = datetime.now(UTC)
        activated_at = now.replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=6)
        season = create_mock_season(
            season_id, alliance_id, is_trial=True, activated_at=activated_at
        )

        # Act
        result = quota_service._calculate_trial_days_remaining(season)

        # Assert - At least 7 days remaining (14 - 6 = 8, but partial day may reduce to 7)
        assert result >= 7

    def test_returns_zero_when_trial_expired(
        self,
        quota_service: SeasonQuotaService,
        season_id: UUID,
        alliance_id: UUID,
    ):
        """Should return 0 when trial has expired"""
        # Arrange
        activated_at = datetime.now(UTC) - timedelta(days=20)
        season = create_mock_season(
            season_id, alliance_id, is_trial=True, activated_at=activated_at
        )

        # Act
        result = quota_service._calculate_trial_days_remaining(season)

        # Assert
        assert result == 0

    def test_returns_none_for_non_trial_season(
        self,
        quota_service: SeasonQuotaService,
        season_id: UUID,
        alliance_id: UUID,
    ):
        """Should return None for non-trial season"""
        # Arrange
        season = create_mock_season(season_id, alliance_id, is_trial=False)

        # Act
        result = quota_service._calculate_trial_days_remaining(season)

        # Assert
        assert result is None


# =============================================================================
# Tests for Can Write to Season
# =============================================================================


class TestCanWriteToSeason:
    """Tests for checking if user can write (upload CSV) to current season"""

    @pytest.mark.asyncio
    async def test_can_write_when_has_purchased_seasons(
        self,
        quota_service: SeasonQuotaService,
        alliance_id: UUID,
        season_id: UUID,
    ):
        """Should allow write when alliance has purchased seasons"""
        # Arrange
        alliance = create_mock_alliance(alliance_id, purchased_seasons=5)
        season = create_mock_season(season_id, alliance_id, is_trial=False)

        # Act
        result = await quota_service._can_write_to_season(alliance, season)

        # Assert
        assert result is True

    @pytest.mark.asyncio
    async def test_can_write_when_trial_active(
        self,
        quota_service: SeasonQuotaService,
        alliance_id: UUID,
        season_id: UUID,
    ):
        """Should allow write when trial season is active"""
        # Arrange
        alliance = create_mock_alliance(alliance_id, purchased_seasons=0)
        activated_at = datetime.now(UTC) - timedelta(days=5)
        season = create_mock_season(
            season_id, alliance_id, is_trial=True, activated_at=activated_at
        )

        # Act
        result = await quota_service._can_write_to_season(alliance, season)

        # Assert
        assert result is True

    @pytest.mark.asyncio
    async def test_cannot_write_when_trial_expired_and_no_purchased(
        self,
        quota_service: SeasonQuotaService,
        alliance_id: UUID,
        season_id: UUID,
    ):
        """Should deny write when trial expired and no purchased seasons"""
        # Arrange
        alliance = create_mock_alliance(alliance_id, purchased_seasons=0)
        activated_at = datetime.now(UTC) - timedelta(days=20)
        season = create_mock_season(
            season_id, alliance_id, is_trial=True, activated_at=activated_at
        )

        # Act
        result = await quota_service._can_write_to_season(alliance, season)

        # Assert
        assert result is False

    @pytest.mark.asyncio
    async def test_cannot_write_when_no_current_season_and_no_purchased(
        self,
        quota_service: SeasonQuotaService,
        alliance_id: UUID,
    ):
        """Should deny write when no current season and no purchased seasons"""
        # Arrange
        alliance = create_mock_alliance(alliance_id, purchased_seasons=0)

        # Act
        result = await quota_service._can_write_to_season(alliance, None)

        # Assert
        assert result is False


# =============================================================================
# Tests for Can Activate Season
# =============================================================================


class TestCanActivateSeason:
    """Tests for checking if alliance can activate a new season"""

    @pytest.mark.asyncio
    async def test_can_activate_when_has_available_seasons(
        self,
        quota_service: SeasonQuotaService,
        mock_season_repo: MagicMock,
        alliance_id: UUID,
    ):
        """Should allow activation when has available purchased seasons"""
        # Arrange
        alliance = create_mock_alliance(alliance_id, purchased_seasons=5, used_seasons=2)
        mock_season_repo.get_activated_seasons_count = AsyncMock(return_value=2)

        # Act
        result = await quota_service._can_activate_season(alliance)

        # Assert
        assert result is True

    @pytest.mark.asyncio
    async def test_can_activate_when_trial_available(
        self,
        quota_service: SeasonQuotaService,
        mock_season_repo: MagicMock,
        alliance_id: UUID,
    ):
        """Should allow activation when trial is available (no activated seasons)"""
        # Arrange
        alliance = create_mock_alliance(alliance_id, purchased_seasons=0)
        mock_season_repo.get_activated_seasons_count = AsyncMock(return_value=0)

        # Act
        result = await quota_service._can_activate_season(alliance)

        # Assert
        assert result is True

    @pytest.mark.asyncio
    async def test_cannot_activate_when_no_quota_and_trial_used(
        self,
        quota_service: SeasonQuotaService,
        mock_season_repo: MagicMock,
        alliance_id: UUID,
    ):
        """Should deny activation when no available seasons and trial already used"""
        # Arrange
        alliance = create_mock_alliance(alliance_id, purchased_seasons=0)
        mock_season_repo.get_activated_seasons_count = AsyncMock(return_value=1)

        # Act
        result = await quota_service._can_activate_season(alliance)

        # Assert
        assert result is False


# =============================================================================
# Tests for Quota Status
# =============================================================================


class TestGetQuotaStatus:
    """Tests for getting full quota status"""

    @pytest.mark.asyncio
    async def test_returns_correct_status_with_trial_available(
        self,
        quota_service: SeasonQuotaService,
        mock_alliance_repo: MagicMock,
        mock_season_repo: MagicMock,
        user_id: UUID,
        alliance_id: UUID,
    ):
        """Should return correct status when trial is available"""
        # Arrange
        alliance = create_mock_alliance(alliance_id, purchased_seasons=0)
        mock_alliance_repo.get_by_collaborator = AsyncMock(return_value=alliance)
        mock_season_repo.get_current_season = AsyncMock(return_value=None)
        mock_season_repo.get_activated_seasons_count = AsyncMock(return_value=0)

        # Act
        result = await quota_service.get_quota_status(user_id)

        # Assert
        assert result.has_trial_available is True
        assert result.can_activate_season is True
        assert result.can_write is False  # No current season, no purchased
        assert result.available_seasons == 0

    @pytest.mark.asyncio
    async def test_returns_correct_status_with_active_trial_season(
        self,
        quota_service: SeasonQuotaService,
        mock_alliance_repo: MagicMock,
        mock_season_repo: MagicMock,
        user_id: UUID,
        alliance_id: UUID,
        season_id: UUID,
    ):
        """Should return correct status when current season is active trial"""
        # Arrange - Use start of day to ensure consistent calculation
        now = datetime.now(UTC)
        activated_at = now.replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=4)
        alliance = create_mock_alliance(alliance_id, purchased_seasons=0)
        season = create_mock_season(
            season_id, alliance_id, is_trial=True, activated_at=activated_at
        )
        mock_alliance_repo.get_by_collaborator = AsyncMock(return_value=alliance)
        mock_season_repo.get_current_season = AsyncMock(return_value=season)
        mock_season_repo.get_activated_seasons_count = AsyncMock(return_value=1)

        # Act
        result = await quota_service.get_quota_status(user_id)

        # Assert
        assert result.has_trial_available is False
        assert result.current_season_is_trial is True
        assert result.trial_days_remaining >= 9  # 14 - 4 = 10, but partial day may reduce
        assert result.can_write is True

    @pytest.mark.asyncio
    async def test_returns_correct_status_with_purchased_seasons(
        self,
        quota_service: SeasonQuotaService,
        mock_alliance_repo: MagicMock,
        mock_season_repo: MagicMock,
        user_id: UUID,
        alliance_id: UUID,
        season_id: UUID,
    ):
        """Should return correct status when has purchased seasons"""
        # Arrange
        alliance = create_mock_alliance(alliance_id, purchased_seasons=10, used_seasons=4)
        season = create_mock_season(season_id, alliance_id, is_trial=False)
        mock_alliance_repo.get_by_collaborator = AsyncMock(return_value=alliance)
        mock_season_repo.get_current_season = AsyncMock(return_value=season)
        mock_season_repo.get_activated_seasons_count = AsyncMock(return_value=4)

        # Act
        result = await quota_service.get_quota_status(user_id)

        # Assert
        assert result.has_trial_available is False
        assert result.current_season_is_trial is False
        assert result.available_seasons == 6  # 10 - 4 = 6
        assert result.can_activate_season is True
        assert result.can_write is True

    @pytest.mark.asyncio
    async def test_raises_when_user_has_no_alliance(
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
# Tests for Require Write Access
# =============================================================================


class TestRequireWriteAccess:
    """Tests for enforcing write access requirements"""

    @pytest.mark.asyncio
    async def test_passes_when_has_purchased_seasons(
        self,
        quota_service: SeasonQuotaService,
        mock_alliance_repo: MagicMock,
        mock_season_repo: MagicMock,
        alliance_id: UUID,
        season_id: UUID,
    ):
        """Should pass when alliance has purchased seasons"""
        # Arrange
        alliance = create_mock_alliance(alliance_id, purchased_seasons=5)
        season = create_mock_season(season_id, alliance_id, is_trial=False)
        mock_alliance_repo.get_by_id = AsyncMock(return_value=alliance)
        mock_season_repo.get_current_season = AsyncMock(return_value=season)

        # Act & Assert - should not raise
        await quota_service.require_write_access(alliance_id, "upload CSV")

    @pytest.mark.asyncio
    async def test_passes_when_trial_active(
        self,
        quota_service: SeasonQuotaService,
        mock_alliance_repo: MagicMock,
        mock_season_repo: MagicMock,
        alliance_id: UUID,
        season_id: UUID,
    ):
        """Should pass when trial is active"""
        # Arrange
        alliance = create_mock_alliance(alliance_id, purchased_seasons=0)
        activated_at = datetime.now(UTC) - timedelta(days=5)
        season = create_mock_season(
            season_id, alliance_id, is_trial=True, activated_at=activated_at
        )
        mock_alliance_repo.get_by_id = AsyncMock(return_value=alliance)
        mock_season_repo.get_current_season = AsyncMock(return_value=season)

        # Act & Assert - should not raise
        await quota_service.require_write_access(alliance_id, "upload CSV")

    @pytest.mark.asyncio
    async def test_raises_when_trial_expired_and_no_purchased(
        self,
        quota_service: SeasonQuotaService,
        mock_alliance_repo: MagicMock,
        mock_season_repo: MagicMock,
        alliance_id: UUID,
        season_id: UUID,
    ):
        """Should raise when trial expired and no purchased seasons"""
        # Arrange
        alliance = create_mock_alliance(alliance_id, purchased_seasons=0)
        activated_at = datetime.now(UTC) - timedelta(days=20)
        season = create_mock_season(
            season_id, alliance_id, is_trial=True, activated_at=activated_at
        )
        mock_alliance_repo.get_by_id = AsyncMock(return_value=alliance)
        mock_season_repo.get_current_season = AsyncMock(return_value=season)

        # Act & Assert
        with pytest.raises(SeasonQuotaExhaustedError) as exc_info:
            await quota_service.require_write_access(alliance_id, "upload CSV")
        assert "試用期已結束" in str(exc_info.value)


# =============================================================================
# Tests for Consume Season
# =============================================================================


class TestConsumeSeason:
    """Tests for consuming season quota"""

    @pytest.mark.asyncio
    async def test_consumes_purchased_season_first(
        self,
        quota_service: SeasonQuotaService,
        mock_alliance_repo: MagicMock,
        mock_season_repo: MagicMock,
        alliance_id: UUID,
    ):
        """Should consume purchased season when available"""
        # Arrange
        alliance = create_mock_alliance(alliance_id, purchased_seasons=5, used_seasons=2)
        mock_alliance_repo.get_by_id = AsyncMock(return_value=alliance)
        mock_alliance_repo.update = AsyncMock()
        mock_season_repo.get_activated_seasons_count = AsyncMock(return_value=2)

        # Act
        remaining, used_trial, trial_ends_at = await quota_service.consume_season(alliance_id)

        # Assert
        assert remaining == 2  # 5 - 3 = 2
        assert used_trial is False
        assert trial_ends_at is None
        mock_alliance_repo.update.assert_called_once_with(alliance_id, {"used_seasons": 3})

    @pytest.mark.asyncio
    async def test_uses_trial_when_no_purchased_seasons(
        self,
        quota_service: SeasonQuotaService,
        mock_alliance_repo: MagicMock,
        mock_season_repo: MagicMock,
        alliance_id: UUID,
    ):
        """Should use trial when no purchased seasons available"""
        # Arrange
        alliance = create_mock_alliance(alliance_id, purchased_seasons=0)
        mock_alliance_repo.get_by_id = AsyncMock(return_value=alliance)
        mock_season_repo.get_activated_seasons_count = AsyncMock(return_value=0)

        # Act
        remaining, used_trial, trial_ends_at = await quota_service.consume_season(alliance_id)

        # Assert
        assert remaining == 0
        assert used_trial is True
        assert trial_ends_at is not None

    @pytest.mark.asyncio
    async def test_raises_when_no_quota_and_no_trial(
        self,
        quota_service: SeasonQuotaService,
        mock_alliance_repo: MagicMock,
        mock_season_repo: MagicMock,
        alliance_id: UUID,
    ):
        """Should raise when no purchased seasons and trial already used"""
        # Arrange
        alliance = create_mock_alliance(alliance_id, purchased_seasons=0)
        mock_alliance_repo.get_by_id = AsyncMock(return_value=alliance)
        mock_season_repo.get_activated_seasons_count = AsyncMock(return_value=1)

        # Act & Assert
        with pytest.raises(ValueError) as exc_info:
            await quota_service.consume_season(alliance_id)
        assert "No available seasons or trial" in str(exc_info.value)


# =============================================================================
# Tests for Add Purchased Seasons
# =============================================================================


class TestAddPurchasedSeasons:
    """Tests for adding purchased seasons"""

    @pytest.mark.asyncio
    async def test_adds_seasons_correctly(
        self,
        quota_service: SeasonQuotaService,
        mock_alliance_repo: MagicMock,
        alliance_id: UUID,
    ):
        """Should add seasons to alliance correctly"""
        # Arrange
        alliance = create_mock_alliance(alliance_id, purchased_seasons=2, used_seasons=1)
        mock_alliance_repo.get_by_id = AsyncMock(return_value=alliance)
        # Atomic increment returns new total: 2 + 5 = 7
        mock_alliance_repo.increment_purchased_seasons = AsyncMock(return_value=7)

        # Act
        result = await quota_service.add_purchased_seasons(alliance_id, 5)

        # Assert
        assert result == 6  # 7 purchased - 1 used = 6 available
        mock_alliance_repo.increment_purchased_seasons.assert_called_once_with(alliance_id, 5)

    @pytest.mark.asyncio
    async def test_raises_when_seasons_not_positive(
        self,
        quota_service: SeasonQuotaService,
        alliance_id: UUID,
    ):
        """Should raise when seasons parameter is not positive"""
        # Act & Assert
        with pytest.raises(ValueError) as exc_info:
            await quota_service.add_purchased_seasons(alliance_id, 0)
        assert "Seasons must be positive" in str(exc_info.value)


# =============================================================================
# Tests for get_quota_status_by_alliance
# =============================================================================


class TestGetQuotaStatusByAlliance:
    """Tests for getting quota status by alliance ID"""

    @pytest.mark.asyncio
    async def test_returns_status_for_valid_alliance(
        self,
        quota_service: SeasonQuotaService,
        mock_alliance_repo: MagicMock,
        mock_season_repo: MagicMock,
        alliance_id: UUID,
        season_id: UUID,
    ):
        """Should return quota status for existing alliance"""
        alliance = create_mock_alliance(alliance_id, purchased_seasons=3, used_seasons=1)
        season = create_mock_season(season_id, alliance_id, is_trial=False)
        mock_alliance_repo.get_by_id = AsyncMock(return_value=alliance)
        mock_season_repo.get_current_season = AsyncMock(return_value=season)
        mock_season_repo.get_activated_seasons_count = AsyncMock(return_value=1)

        result = await quota_service.get_quota_status_by_alliance(alliance_id)

        assert result.purchased_seasons == 3
        assert result.available_seasons == 2
        assert result.can_write is True

    @pytest.mark.asyncio
    async def test_raises_when_alliance_not_found(
        self,
        quota_service: SeasonQuotaService,
        mock_alliance_repo: MagicMock,
        alliance_id: UUID,
    ):
        """Should raise ValueError when alliance doesn't exist"""
        mock_alliance_repo.get_by_id = AsyncMock(return_value=None)

        with pytest.raises(ValueError, match="Alliance not found"):
            await quota_service.get_quota_status_by_alliance(alliance_id)


# =============================================================================
# Tests for check_write_access (public method)
# =============================================================================


class TestCheckWriteAccess:
    """Tests for the public check_write_access method"""

    @pytest.mark.asyncio
    async def test_returns_true_when_has_write_access(
        self,
        quota_service: SeasonQuotaService,
        mock_alliance_repo: MagicMock,
        mock_season_repo: MagicMock,
        alliance_id: UUID,
        season_id: UUID,
    ):
        """Should return True when alliance can write"""
        alliance = create_mock_alliance(alliance_id, purchased_seasons=5)
        season = create_mock_season(season_id, alliance_id, is_trial=False)
        mock_alliance_repo.get_by_id = AsyncMock(return_value=alliance)
        mock_season_repo.get_current_season = AsyncMock(return_value=season)
        mock_season_repo.get_activated_seasons_count = AsyncMock(return_value=1)

        result = await quota_service.check_write_access(alliance_id)

        assert result is True

    @pytest.mark.asyncio
    async def test_returns_false_when_no_write_access(
        self,
        quota_service: SeasonQuotaService,
        mock_alliance_repo: MagicMock,
        mock_season_repo: MagicMock,
        alliance_id: UUID,
        season_id: UUID,
    ):
        """Should return False when trial expired and no purchased seasons"""
        alliance = create_mock_alliance(alliance_id, purchased_seasons=0)
        activated_at = datetime.now(UTC) - timedelta(days=20)
        season = create_mock_season(
            season_id, alliance_id, is_trial=True, activated_at=activated_at
        )
        mock_alliance_repo.get_by_id = AsyncMock(return_value=alliance)
        mock_season_repo.get_current_season = AsyncMock(return_value=season)
        mock_season_repo.get_activated_seasons_count = AsyncMock(return_value=1)

        result = await quota_service.check_write_access(alliance_id)

        assert result is False

    @pytest.mark.asyncio
    async def test_returns_false_when_alliance_not_found(
        self,
        quota_service: SeasonQuotaService,
        mock_alliance_repo: MagicMock,
        alliance_id: UUID,
    ):
        """Should return False (not raise) when alliance doesn't exist"""
        mock_alliance_repo.get_by_id = AsyncMock(return_value=None)

        result = await quota_service.check_write_access(alliance_id)

        assert result is False


# =============================================================================
# Tests for can_activate_season (public method)
# =============================================================================


class TestCanActivateSeasonPublic:
    """Tests for the public can_activate_season method"""

    @pytest.mark.asyncio
    async def test_returns_true_when_can_activate(
        self,
        quota_service: SeasonQuotaService,
        mock_alliance_repo: MagicMock,
        mock_season_repo: MagicMock,
        alliance_id: UUID,
        season_id: UUID,
    ):
        """Should return True when has available seasons"""
        alliance = create_mock_alliance(alliance_id, purchased_seasons=5, used_seasons=2)
        season = create_mock_season(season_id, alliance_id, is_trial=False)
        mock_alliance_repo.get_by_id = AsyncMock(return_value=alliance)
        mock_season_repo.get_current_season = AsyncMock(return_value=season)
        mock_season_repo.get_activated_seasons_count = AsyncMock(return_value=2)

        result = await quota_service.can_activate_season(alliance_id)

        assert result is True

    @pytest.mark.asyncio
    async def test_returns_false_when_cannot_activate(
        self,
        quota_service: SeasonQuotaService,
        mock_alliance_repo: MagicMock,
        mock_season_repo: MagicMock,
        alliance_id: UUID,
        season_id: UUID,
    ):
        """Should return False when no quota and trial used"""
        alliance = create_mock_alliance(alliance_id, purchased_seasons=0)
        season = create_mock_season(season_id, alliance_id, is_trial=False)
        mock_alliance_repo.get_by_id = AsyncMock(return_value=alliance)
        mock_season_repo.get_current_season = AsyncMock(return_value=season)
        mock_season_repo.get_activated_seasons_count = AsyncMock(return_value=1)

        result = await quota_service.can_activate_season(alliance_id)

        assert result is False

    @pytest.mark.asyncio
    async def test_returns_false_when_alliance_not_found(
        self,
        quota_service: SeasonQuotaService,
        mock_alliance_repo: MagicMock,
        alliance_id: UUID,
    ):
        """Should return False (not raise) when alliance doesn't exist"""
        mock_alliance_repo.get_by_id = AsyncMock(return_value=None)

        result = await quota_service.can_activate_season(alliance_id)

        assert result is False


# =============================================================================
# Tests for require_season_activation
# =============================================================================


class TestRequireSeasonActivation:
    """Tests for enforcing season activation requirements"""

    @pytest.mark.asyncio
    async def test_passes_when_can_activate(
        self,
        quota_service: SeasonQuotaService,
        mock_alliance_repo: MagicMock,
        mock_season_repo: MagicMock,
        alliance_id: UUID,
    ):
        """Should pass silently when alliance can activate"""
        alliance = create_mock_alliance(alliance_id, purchased_seasons=5, used_seasons=2)
        mock_alliance_repo.get_by_id = AsyncMock(return_value=alliance)
        mock_season_repo.get_activated_seasons_count = AsyncMock(return_value=2)

        await quota_service.require_season_activation(alliance_id)

    @pytest.mark.asyncio
    async def test_raises_when_cannot_activate(
        self,
        quota_service: SeasonQuotaService,
        mock_alliance_repo: MagicMock,
        mock_season_repo: MagicMock,
        alliance_id: UUID,
    ):
        """Should raise SeasonQuotaExhaustedError when no quota and trial used"""
        alliance = create_mock_alliance(alliance_id, purchased_seasons=0)
        mock_alliance_repo.get_by_id = AsyncMock(return_value=alliance)
        mock_season_repo.get_activated_seasons_count = AsyncMock(return_value=1)

        with pytest.raises(SeasonQuotaExhaustedError) as exc_info:
            await quota_service.require_season_activation(alliance_id)
        assert "購買季數" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_raises_when_alliance_not_found(
        self,
        quota_service: SeasonQuotaService,
        mock_alliance_repo: MagicMock,
        alliance_id: UUID,
    ):
        """Should raise ValueError when alliance doesn't exist"""
        mock_alliance_repo.get_by_id = AsyncMock(return_value=None)

        with pytest.raises(ValueError, match="Alliance not found"):
            await quota_service.require_season_activation(alliance_id)


# =============================================================================
# Tests for require_write_access — additional branches
# =============================================================================


class TestRequireWriteAccessAdditional:
    """Additional tests for require_write_access covering missing branches"""

    @pytest.mark.asyncio
    async def test_raises_non_trial_message_when_no_purchased(
        self,
        quota_service: SeasonQuotaService,
        mock_alliance_repo: MagicMock,
        mock_season_repo: MagicMock,
        alliance_id: UUID,
        season_id: UUID,
    ):
        """Should raise with '可用季數已用完' message for non-trial expired season"""
        alliance = create_mock_alliance(alliance_id, purchased_seasons=0)
        season = create_mock_season(season_id, alliance_id, is_trial=False)
        mock_alliance_repo.get_by_id = AsyncMock(return_value=alliance)
        mock_season_repo.get_current_season = AsyncMock(return_value=season)

        with pytest.raises(SeasonQuotaExhaustedError) as exc_info:
            await quota_service.require_write_access(alliance_id, "upload CSV")
        assert "可用季數已用完" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_raises_when_alliance_not_found(
        self,
        quota_service: SeasonQuotaService,
        mock_alliance_repo: MagicMock,
        alliance_id: UUID,
    ):
        """Should raise ValueError when alliance doesn't exist"""
        mock_alliance_repo.get_by_id = AsyncMock(return_value=None)

        with pytest.raises(ValueError, match="Alliance not found"):
            await quota_service.require_write_access(alliance_id)

    @pytest.mark.asyncio
    async def test_raises_when_no_current_season_and_no_purchased(
        self,
        quota_service: SeasonQuotaService,
        mock_alliance_repo: MagicMock,
        mock_season_repo: MagicMock,
        alliance_id: UUID,
    ):
        """Should raise with non-trial message when no current season"""
        alliance = create_mock_alliance(alliance_id, purchased_seasons=0)
        mock_alliance_repo.get_by_id = AsyncMock(return_value=alliance)
        mock_season_repo.get_current_season = AsyncMock(return_value=None)

        with pytest.raises(SeasonQuotaExhaustedError) as exc_info:
            await quota_service.require_write_access(alliance_id)
        assert "可用季數已用完" in str(exc_info.value)


# =============================================================================
# Tests for consume_season — additional edge cases
# =============================================================================


class TestConsumeSeasonAdditional:
    """Additional tests for consume_season edge cases"""

    @pytest.mark.asyncio
    async def test_raises_when_alliance_not_found(
        self,
        quota_service: SeasonQuotaService,
        mock_alliance_repo: MagicMock,
        alliance_id: UUID,
    ):
        """Should raise ValueError when alliance doesn't exist"""
        mock_alliance_repo.get_by_id = AsyncMock(return_value=None)

        with pytest.raises(ValueError, match="Alliance not found"):
            await quota_service.consume_season(alliance_id)


# =============================================================================
# Tests for add_purchased_seasons — additional edge cases
# =============================================================================


class TestAddPurchasedSeasonsAdditional:
    """Additional tests for add_purchased_seasons edge cases"""

    @pytest.mark.asyncio
    async def test_raises_when_alliance_not_found(
        self,
        quota_service: SeasonQuotaService,
        mock_alliance_repo: MagicMock,
        alliance_id: UUID,
    ):
        """Should raise when alliance doesn't exist (RPC raises exception)"""
        mock_alliance_repo.increment_purchased_seasons = AsyncMock(
            side_effect=Exception("Alliance not found")
        )

        with pytest.raises(Exception, match="Alliance not found"):
            await quota_service.add_purchased_seasons(alliance_id, 5)

    @pytest.mark.asyncio
    async def test_raises_when_negative_seasons(
        self,
        quota_service: SeasonQuotaService,
        alliance_id: UUID,
    ):
        """Should raise for negative seasons parameter"""
        with pytest.raises(ValueError, match="Seasons must be positive"):
            await quota_service.add_purchased_seasons(alliance_id, -3)


# =============================================================================
# Tests for _calculate_trial_end edge cases
# =============================================================================


class TestCalculateTrialEndEdgeCases:
    """Edge case tests for trial end date calculation"""

    def test_returns_none_for_non_trial_season(
        self,
        quota_service: SeasonQuotaService,
        season_id: UUID,
        alliance_id: UUID,
    ):
        """Should return None for non-trial season"""
        season = create_mock_season(
            season_id, alliance_id, is_trial=False, activated_at=datetime.now(UTC)
        )

        result = quota_service._calculate_trial_end(season)

        assert result is None

    def test_returns_none_when_no_activated_at(
        self,
        quota_service: SeasonQuotaService,
        season_id: UUID,
        alliance_id: UUID,
    ):
        """Should return None for trial season without activated_at"""
        season = create_mock_season(season_id, alliance_id, is_trial=True, activated_at=None)

        result = quota_service._calculate_trial_end(season)

        assert result is None

    def test_handles_naive_datetime(
        self,
        quota_service: SeasonQuotaService,
        season_id: UUID,
        alliance_id: UUID,
    ):
        """Should handle naive datetime by adding UTC timezone"""
        naive_dt = datetime(2026, 3, 1, 12, 0, 0)  # No tzinfo
        season = create_mock_season(season_id, alliance_id, is_trial=True, activated_at=naive_dt)

        result = quota_service._calculate_trial_end(season)

        assert result is not None
        assert result.tzinfo is not None


# =============================================================================
# Tests for _calculate_available_seasons edge cases
# =============================================================================


class TestCalculateAvailableSeasonsEdgeCases:
    """Edge case tests for available seasons calculation"""

    def test_returns_zero_when_used_exceeds_purchased(
        self,
        quota_service: SeasonQuotaService,
        alliance_id: UUID,
    ):
        """Should return 0 (not negative) when used > purchased"""
        alliance = create_mock_alliance(alliance_id, purchased_seasons=2, used_seasons=5)

        result = quota_service._calculate_available_seasons(alliance)

        assert result == 0

    def test_returns_correct_difference(
        self,
        quota_service: SeasonQuotaService,
        alliance_id: UUID,
    ):
        """Should return purchased - used"""
        alliance = create_mock_alliance(alliance_id, purchased_seasons=10, used_seasons=3)

        result = quota_service._calculate_available_seasons(alliance)

        assert result == 7


# =============================================================================
# Tests for get_quota_status — expired trial + no purchased combination
# =============================================================================


class TestGetQuotaStatusExpiredTrial:
    """Tests for quota status with expired trial and no purchased seasons"""

    @pytest.mark.asyncio
    async def test_expired_trial_shows_correct_status(
        self,
        quota_service: SeasonQuotaService,
        mock_alliance_repo: MagicMock,
        mock_season_repo: MagicMock,
        user_id: UUID,
        alliance_id: UUID,
        season_id: UUID,
    ):
        """Should show expired trial with no write access"""
        alliance = create_mock_alliance(alliance_id, purchased_seasons=0)
        activated_at = datetime.now(UTC) - timedelta(days=20)
        season = create_mock_season(
            season_id, alliance_id, is_trial=True, activated_at=activated_at
        )
        mock_alliance_repo.get_by_collaborator = AsyncMock(return_value=alliance)
        mock_season_repo.get_current_season = AsyncMock(return_value=season)
        mock_season_repo.get_activated_seasons_count = AsyncMock(return_value=1)

        result = await quota_service.get_quota_status(user_id)

        assert result.can_write is False
        assert result.can_activate_season is False
        assert result.current_season_is_trial is True
        assert result.trial_days_remaining == 0
        assert result.has_trial_available is False
