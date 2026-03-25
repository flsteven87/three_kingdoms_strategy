"""
Tests for webhook idempotency (event dedup).

Covers:
- First event: try_claim_event succeeds → process + update details
- Duplicate event_id: try_claim_event fails → skip processing
- Missing event_id: process without dedup (graceful degradation)
- Atomic increment prevents read-modify-write race
"""

from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from src.services.payment_service import PaymentService


@pytest.fixture
def payment_service():
    service = PaymentService()
    service._quota_service = AsyncMock()
    service._webhook_repo = AsyncMock()
    return service


@pytest.fixture
def sample_event_data():
    user_id = uuid4()
    return {
        "externalCustomerId": f"{user_id}:3",
        "amount": 1000,
        "productId": "prod_season",
    }, user_id


class TestWebhookIdempotency:
    """Webhook event dedup prevents duplicate season credits."""

    @pytest.mark.asyncio
    async def test_first_event_processes_normally(self, payment_service, sample_event_data):
        """First time seeing an event_id should claim, process, and update details."""
        event_data, user_id = sample_event_data
        alliance = MagicMock(id=uuid4())

        payment_service._webhook_repo.try_claim_event = AsyncMock(return_value=True)
        payment_service._webhook_repo.update_event_details = AsyncMock()
        payment_service._quota_service.get_alliance_by_user = AsyncMock(return_value=alliance)
        payment_service._quota_service.add_purchased_seasons = AsyncMock(return_value=3)

        result = await payment_service.handle_checkout_completed(event_data, event_id="evt_abc123")

        assert result["success"] is True
        assert result["seasons_added"] == 3
        payment_service._quota_service.add_purchased_seasons.assert_called_once()
        payment_service._webhook_repo.try_claim_event.assert_called_once_with(
            "evt_abc123", "checkout.completed"
        )
        payment_service._webhook_repo.update_event_details.assert_called_once()

    @pytest.mark.asyncio
    async def test_duplicate_event_returns_without_processing(
        self, payment_service, sample_event_data
    ):
        """Duplicate event_id (claim fails) should return success without adding seasons."""
        event_data, user_id = sample_event_data

        payment_service._webhook_repo.try_claim_event = AsyncMock(return_value=False)

        result = await payment_service.handle_checkout_completed(event_data, event_id="evt_abc123")

        assert result["success"] is True
        assert result["duplicate"] is True
        payment_service._quota_service.add_purchased_seasons.assert_not_called()

    @pytest.mark.asyncio
    async def test_missing_event_id_still_processes(self, payment_service, sample_event_data):
        """If event_id is None (shouldn't happen but graceful), process without dedup."""
        event_data, user_id = sample_event_data
        alliance = MagicMock(id=uuid4())

        payment_service._quota_service.get_alliance_by_user = AsyncMock(return_value=alliance)
        payment_service._quota_service.add_purchased_seasons = AsyncMock(return_value=3)

        result = await payment_service.handle_checkout_completed(event_data, event_id=None)

        assert result["success"] is True
        payment_service._webhook_repo.try_claim_event.assert_not_called()


class TestAtomicIncrement:
    """Atomic DB increment prevents race conditions."""

    @pytest.mark.asyncio
    async def test_add_purchased_seasons_uses_atomic_increment(self):
        """add_purchased_seasons should use SQL increment, not read-modify-write."""
        from src.services.season_quota_service import SeasonQuotaService

        service = SeasonQuotaService()
        service._alliance_repo = AsyncMock()

        mock_alliance = MagicMock()
        mock_alliance.id = uuid4()
        mock_alliance.purchased_seasons = 5
        mock_alliance.used_seasons = 2

        # RPC now returns (new_purchased, used_seasons) tuple
        service._alliance_repo.increment_purchased_seasons = AsyncMock(return_value=(8, 2))

        result = await service.add_purchased_seasons(mock_alliance.id, 3)

        assert result == 6  # 8 purchased - 2 used
        service._alliance_repo.increment_purchased_seasons.assert_called_once_with(
            mock_alliance.id, 3
        )
