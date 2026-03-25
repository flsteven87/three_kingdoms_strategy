"""
Tests for CopperMineRuleService

Covers:
- CRUD operations
- Tier sequencing validation
- Merit constraint validation (between adjacent tiers)
- Deletion restricted to highest tier
- Alliance ownership checks
"""

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock
from uuid import UUID

import pytest
from fastapi import HTTPException

from src.models.copper_mine import CopperMineRule
from src.services.copper_mine_rule_service import CopperMineRuleService

# =============================================================================
# Constants
# =============================================================================

ALLIANCE_ID = UUID("22222222-2222-2222-2222-222222222222")
OTHER_ALLIANCE_ID = UUID("99999999-9999-9999-9999-999999999999")
RULE_ID_1 = UUID("aaaa0001-0000-0000-0000-000000000000")
RULE_ID_2 = UUID("aaaa0002-0000-0000-0000-000000000000")
RULE_ID_3 = UUID("aaaa0003-0000-0000-0000-000000000000")
NOW = datetime(2025, 1, 1, tzinfo=UTC)


# =============================================================================
# Helpers
# =============================================================================


def make_rule(
    rule_id: UUID = RULE_ID_1,
    tier: int = 1,
    required_merit: int = 1000,
    allowed_level: str = "both",
) -> CopperMineRule:
    return CopperMineRule(
        id=rule_id,
        alliance_id=ALLIANCE_ID,
        tier=tier,
        required_merit=required_merit,
        allowed_level=allowed_level,
        created_at=NOW,
        updated_at=NOW,
    )


# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def mock_repo():
    repo = MagicMock()
    repo.get_rules_by_alliance = AsyncMock(return_value=[])
    repo.get_by_id = AsyncMock(return_value=None)
    repo.create_rule = AsyncMock()
    repo.update_rule = AsyncMock()
    repo.delete_rule = AsyncMock(return_value=True)
    return repo


@pytest.fixture
def service(mock_repo):
    return CopperMineRuleService(repository=mock_repo)


# =============================================================================
# get_rules
# =============================================================================


class TestGetRules:
    async def test_returns_empty_list(self, service, mock_repo):
        result = await service.get_rules(ALLIANCE_ID)
        assert result == []
        mock_repo.get_rules_by_alliance.assert_called_once_with(ALLIANCE_ID)

    async def test_returns_converted_rules(self, service, mock_repo):
        mock_repo.get_rules_by_alliance.return_value = [
            make_rule(tier=1, required_merit=1000),
            make_rule(rule_id=RULE_ID_2, tier=2, required_merit=5000),
        ]
        result = await service.get_rules(ALLIANCE_ID)
        assert len(result) == 2
        assert result[0].tier == 1
        assert result[1].tier == 2


# =============================================================================
# create_rule
# =============================================================================


class TestCreateRule:
    async def test_creates_first_rule(self, service, mock_repo):
        created = make_rule(tier=1, required_merit=1000)
        mock_repo.create_rule.return_value = created

        result = await service.create_rule(ALLIANCE_ID, tier=1, required_merit=1000)
        assert result.tier == 1
        assert result.required_merit == 1000

    async def test_rejects_non_sequential_tier(self, service, mock_repo):
        mock_repo.get_rules_by_alliance.return_value = [make_rule(tier=1)]

        with pytest.raises(HTTPException) as exc_info:
            await service.create_rule(ALLIANCE_ID, tier=3, required_merit=5000)
        assert exc_info.value.status_code == 400
        assert "sequential" in exc_info.value.detail

    async def test_rejects_merit_not_greater_than_previous(self, service, mock_repo):
        mock_repo.get_rules_by_alliance.return_value = [make_rule(tier=1, required_merit=5000)]

        with pytest.raises(HTTPException) as exc_info:
            await service.create_rule(ALLIANCE_ID, tier=2, required_merit=3000)
        assert exc_info.value.status_code == 400
        assert "greater" in exc_info.value.detail

    async def test_accepts_valid_sequential_rule(self, service, mock_repo):
        mock_repo.get_rules_by_alliance.return_value = [make_rule(tier=1, required_merit=1000)]
        created = make_rule(rule_id=RULE_ID_2, tier=2, required_merit=5000)
        mock_repo.create_rule.return_value = created

        result = await service.create_rule(ALLIANCE_ID, tier=2, required_merit=5000)
        assert result.tier == 2

    async def test_passes_allowed_level_to_repository(self, service, mock_repo):
        created = make_rule(tier=1, required_merit=1000, allowed_level="nine")
        mock_repo.create_rule.return_value = created

        await service.create_rule(ALLIANCE_ID, tier=1, required_merit=1000, allowed_level="nine")
        mock_repo.create_rule.assert_called_once_with(
            alliance_id=ALLIANCE_ID,
            tier=1,
            required_merit=1000,
            allowed_level="nine",
        )


# =============================================================================
# update_rule
# =============================================================================


class TestUpdateRule:
    async def test_updates_allowed_level(self, service, mock_repo):
        existing = make_rule(tier=1, required_merit=1000)
        mock_repo.get_by_id.return_value = existing
        updated = make_rule(tier=1, required_merit=1000, allowed_level="nine")
        mock_repo.update_rule.return_value = updated

        result = await service.update_rule(RULE_ID_1, ALLIANCE_ID, allowed_level="nine")
        assert result.allowed_level == "nine"

    async def test_rejects_rule_not_found(self, service, mock_repo):
        with pytest.raises(HTTPException) as exc_info:
            await service.update_rule(RULE_ID_1, ALLIANCE_ID, required_merit=2000)
        assert exc_info.value.status_code == 404

    async def test_rejects_wrong_alliance(self, service, mock_repo):
        mock_repo.get_by_id.return_value = make_rule()

        with pytest.raises(HTTPException) as exc_info:
            await service.update_rule(RULE_ID_1, OTHER_ALLIANCE_ID, required_merit=2000)
        assert exc_info.value.status_code == 403

    async def test_rejects_merit_below_min(self, service, mock_repo):
        """Tier 2 merit must be > tier 1 merit."""
        tier1 = make_rule(RULE_ID_1, tier=1, required_merit=1000)
        tier2 = make_rule(RULE_ID_2, tier=2, required_merit=5000)
        mock_repo.get_by_id.return_value = tier2
        mock_repo.get_rules_by_alliance.return_value = [tier1, tier2]

        with pytest.raises(HTTPException) as exc_info:
            await service.update_rule(RULE_ID_2, ALLIANCE_ID, required_merit=500)
        assert exc_info.value.status_code == 400
        assert "at least" in exc_info.value.detail

    async def test_rejects_merit_above_max(self, service, mock_repo):
        """Tier 2 merit must be < tier 3 merit."""
        tier2 = make_rule(RULE_ID_2, tier=2, required_merit=5000)
        tier3 = make_rule(RULE_ID_3, tier=3, required_merit=10000)
        mock_repo.get_by_id.return_value = tier2
        mock_repo.get_rules_by_alliance.return_value = [
            make_rule(RULE_ID_1, tier=1, required_merit=1000),
            tier2,
            tier3,
        ]

        with pytest.raises(HTTPException) as exc_info:
            await service.update_rule(RULE_ID_2, ALLIANCE_ID, required_merit=15000)
        assert exc_info.value.status_code == 400
        assert "at most" in exc_info.value.detail

    async def test_rejects_failed_update(self, service, mock_repo):
        mock_repo.get_by_id.return_value = make_rule()
        mock_repo.update_rule.return_value = None

        with pytest.raises(HTTPException) as exc_info:
            await service.update_rule(RULE_ID_1, ALLIANCE_ID, allowed_level="ten")
        assert exc_info.value.status_code == 500


# =============================================================================
# delete_rule
# =============================================================================


class TestDeleteRule:
    async def test_deletes_highest_tier(self, service, mock_repo):
        rule = make_rule(RULE_ID_2, tier=2, required_merit=5000)
        mock_repo.get_by_id.return_value = rule
        mock_repo.get_rules_by_alliance.return_value = [
            make_rule(tier=1, required_merit=1000),
            rule,
        ]

        result = await service.delete_rule(RULE_ID_2, ALLIANCE_ID)
        assert result is True

    async def test_rejects_deleting_non_highest_tier(self, service, mock_repo):
        rule = make_rule(tier=1, required_merit=1000)
        mock_repo.get_by_id.return_value = rule
        mock_repo.get_rules_by_alliance.return_value = [
            rule,
            make_rule(RULE_ID_2, tier=2, required_merit=5000),
        ]

        with pytest.raises(HTTPException) as exc_info:
            await service.delete_rule(RULE_ID_1, ALLIANCE_ID)
        assert exc_info.value.status_code == 400
        assert "highest" in exc_info.value.detail

    async def test_rejects_rule_not_found(self, service, mock_repo):
        with pytest.raises(HTTPException) as exc_info:
            await service.delete_rule(RULE_ID_1, ALLIANCE_ID)
        assert exc_info.value.status_code == 404

    async def test_rejects_wrong_alliance(self, service, mock_repo):
        mock_repo.get_by_id.return_value = make_rule()

        with pytest.raises(HTTPException) as exc_info:
            await service.delete_rule(RULE_ID_1, OTHER_ALLIANCE_ID)
        assert exc_info.value.status_code == 403
