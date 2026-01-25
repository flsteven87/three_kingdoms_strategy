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
        mock_alliance_repo.update.assert_called_once_with(
            alliance_id, {"used_seasons": 3}
        )

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
        mock_alliance_repo.update = AsyncMock()

        # Act
        result = await quota_service.add_purchased_seasons(alliance_id, 5)

        # Assert
        assert result == 6  # 2 + 5 - 1 = 6 available
        mock_alliance_repo.update.assert_called_once_with(
            alliance_id, {"purchased_seasons": 7}
        )

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
