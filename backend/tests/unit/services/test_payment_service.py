"""
Unit Tests for PaymentService

Tests cover:
1. _parse_external_customer_id validation
2. handle_checkout_completed webhook processing
3. Error handling for invalid inputs

符合 test-writing skill 規範:
- AAA pattern (Arrange-Act-Assert)
- Mocked dependencies
- Coverage: happy path + edge cases + error cases
"""

from unittest.mock import AsyncMock, MagicMock
from uuid import UUID

import pytest

from src.services.payment_service import PaymentService

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
def mock_quota_service() -> MagicMock:
    """Create mock SeasonQuotaService"""
    return MagicMock()


@pytest.fixture
def payment_service(mock_quota_service: MagicMock) -> PaymentService:
    """Create PaymentService with mocked dependencies"""
    service = PaymentService()
    service._quota_service = mock_quota_service
    return service


def create_mock_alliance(alliance_id: UUID) -> MagicMock:
    """Factory for creating mock Alliance objects"""
    alliance = MagicMock()
    alliance.id = alliance_id
    return alliance


# =============================================================================
# Tests for _parse_external_customer_id
# =============================================================================


class TestParseExternalCustomerId:
    """Tests for _parse_external_customer_id method"""

    def test_should_parse_valid_format(
        self, payment_service: PaymentService, user_id: UUID
    ):
        """Should correctly parse valid user_id:quantity format"""
        # Arrange
        external_id = f"{user_id}:3"

        # Act
        parsed_user_id, quantity = payment_service._parse_external_customer_id(
            external_id
        )

        # Assert
        assert parsed_user_id == user_id
        assert quantity == 3

    def test_should_parse_single_quantity(
        self, payment_service: PaymentService, user_id: UUID
    ):
        """Should correctly parse quantity of 1"""
        # Arrange
        external_id = f"{user_id}:1"

        # Act
        parsed_user_id, quantity = payment_service._parse_external_customer_id(
            external_id
        )

        # Assert
        assert parsed_user_id == user_id
        assert quantity == 1

    def test_should_raise_error_for_empty_string(self, payment_service: PaymentService):
        """Should raise ValueError for empty string"""
        # Arrange
        external_id = ""

        # Act & Assert
        with pytest.raises(ValueError, match="externalCustomerId is empty"):
            payment_service._parse_external_customer_id(external_id)

    def test_should_raise_error_for_missing_separator(
        self, payment_service: PaymentService, user_id: UUID
    ):
        """Should raise ValueError when colon separator is missing"""
        # Arrange
        external_id = str(user_id)  # No colon

        # Act & Assert
        with pytest.raises(ValueError, match="Invalid externalCustomerId format"):
            payment_service._parse_external_customer_id(external_id)

    def test_should_raise_error_for_multiple_separators(
        self, payment_service: PaymentService, user_id: UUID
    ):
        """Should raise ValueError for multiple colons"""
        # Arrange
        external_id = f"{user_id}:3:extra"

        # Act & Assert
        with pytest.raises(ValueError, match="Invalid externalCustomerId format"):
            payment_service._parse_external_customer_id(external_id)

    def test_should_raise_error_for_invalid_uuid(self, payment_service: PaymentService):
        """Should raise ValueError for invalid UUID format"""
        # Arrange
        external_id = "not-a-uuid:3"

        # Act & Assert
        with pytest.raises(ValueError, match="Invalid user_id in externalCustomerId"):
            payment_service._parse_external_customer_id(external_id)

    def test_should_raise_error_for_non_numeric_quantity(
        self, payment_service: PaymentService, user_id: UUID
    ):
        """Should raise ValueError for non-numeric quantity"""
        # Arrange
        external_id = f"{user_id}:abc"

        # Act & Assert
        with pytest.raises(ValueError, match="Invalid quantity in externalCustomerId"):
            payment_service._parse_external_customer_id(external_id)

    def test_should_raise_error_for_zero_quantity(
        self, payment_service: PaymentService, user_id: UUID
    ):
        """Should raise ValueError for zero quantity"""
        # Arrange
        external_id = f"{user_id}:0"

        # Act & Assert
        with pytest.raises(ValueError, match="Invalid quantity in externalCustomerId"):
            payment_service._parse_external_customer_id(external_id)

    def test_should_raise_error_for_negative_quantity(
        self, payment_service: PaymentService, user_id: UUID
    ):
        """Should raise ValueError for negative quantity"""
        # Arrange
        external_id = f"{user_id}:-5"

        # Act & Assert
        with pytest.raises(ValueError, match="Invalid quantity in externalCustomerId"):
            payment_service._parse_external_customer_id(external_id)


# =============================================================================
# Tests for handle_checkout_completed
# =============================================================================


class TestHandleCheckoutCompleted:
    """Tests for handle_checkout_completed method"""

    @pytest.mark.asyncio
    async def test_should_process_checkout_successfully(
        self,
        payment_service: PaymentService,
        mock_quota_service: MagicMock,
        user_id: UUID,
        alliance_id: UUID,
    ):
        """Should successfully process checkout and add seasons"""
        # Arrange
        mock_alliance = create_mock_alliance(alliance_id)
        mock_quota_service.get_alliance_by_user = AsyncMock(return_value=mock_alliance)
        mock_quota_service.add_purchased_seasons = AsyncMock(return_value=5)

        event_data = {
            "externalCustomerId": f"{user_id}:3",
            "amount": 29700,
            "productId": "prod_123",
        }

        # Act
        result = await payment_service.handle_checkout_completed(event_data)

        # Assert
        assert result["success"] is True
        assert result["alliance_id"] == str(alliance_id)
        assert result["user_id"] == str(user_id)
        assert result["seasons_added"] == 3
        assert result["available_seasons"] == 5

        mock_quota_service.get_alliance_by_user.assert_called_once_with(user_id)
        mock_quota_service.add_purchased_seasons.assert_called_once_with(
            alliance_id=alliance_id, seasons=3
        )

    @pytest.mark.asyncio
    async def test_should_accept_snake_case_field_name(
        self,
        payment_service: PaymentService,
        mock_quota_service: MagicMock,
        user_id: UUID,
        alliance_id: UUID,
    ):
        """Should accept external_customer_id (snake_case) as fallback"""
        # Arrange
        mock_alliance = create_mock_alliance(alliance_id)
        mock_quota_service.get_alliance_by_user = AsyncMock(return_value=mock_alliance)
        mock_quota_service.add_purchased_seasons = AsyncMock(return_value=2)

        event_data = {
            "external_customer_id": f"{user_id}:2",  # snake_case
            "amount": 19800,
        }

        # Act
        result = await payment_service.handle_checkout_completed(event_data)

        # Assert
        assert result["success"] is True
        assert result["seasons_added"] == 2

    @pytest.mark.asyncio
    async def test_should_raise_error_when_external_customer_id_missing(
        self, payment_service: PaymentService
    ):
        """Should raise ValueError when externalCustomerId is missing"""
        # Arrange
        event_data = {"amount": 29700, "productId": "prod_123"}

        # Act & Assert
        with pytest.raises(
            ValueError, match="Missing externalCustomerId in checkout.completed event"
        ):
            await payment_service.handle_checkout_completed(event_data)

    @pytest.mark.asyncio
    async def test_should_raise_error_when_user_has_no_alliance(
        self,
        payment_service: PaymentService,
        mock_quota_service: MagicMock,
        user_id: UUID,
    ):
        """Should raise ValueError when user has no alliance"""
        # Arrange
        mock_quota_service.get_alliance_by_user = AsyncMock(return_value=None)

        event_data = {"externalCustomerId": f"{user_id}:3"}

        # Act & Assert
        with pytest.raises(ValueError, match="No alliance found for user"):
            await payment_service.handle_checkout_completed(event_data)

    @pytest.mark.asyncio
    async def test_should_propagate_parse_errors(
        self, payment_service: PaymentService, user_id: UUID
    ):
        """Should propagate parsing errors from _parse_external_customer_id"""
        # Arrange
        event_data = {"externalCustomerId": "invalid-format"}

        # Act & Assert
        with pytest.raises(ValueError, match="Invalid externalCustomerId format"):
            await payment_service.handle_checkout_completed(event_data)
