# Payment → Quota → Season Activation Integration Tests

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Write integration tests that verify the full payment-to-season-activation flow works correctly across service boundaries.

**Architecture:** Service-level integration tests using mocked repositories. Each test exercises the real service orchestration (PaymentService → SeasonQuotaService → SeasonService) with controlled mock data, verifying cross-service interactions produce correct state transitions.

**Tech Stack:** pytest, pytest-asyncio, unittest.mock (AsyncMock/MagicMock)

---

### Task 1: Create Integration Test File with Shared Fixtures

**Files:**
- Create: `backend/tests/integration/__init__.py`
- Create: `backend/tests/integration/test_payment_to_season_flow.py`

**Step 1: Create directory and init file**

```bash
mkdir -p backend/tests/integration
touch backend/tests/integration/__init__.py
```

**Step 2: Write shared fixtures and factory helpers**

```python
"""
Integration tests: Payment → Quota → Season Activation flow.

Tests the full cross-service orchestration with mocked repositories
to verify state transitions are correct end-to-end.
"""

from datetime import UTC, date, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock
from uuid import UUID

import pytest

from src.models.alliance import Alliance
from src.models.season import Season
from src.services.payment_service import PaymentService
from src.services.season_quota_service import SeasonQuotaService
from src.services.season_service import SeasonService


# --- Factory Helpers ---

def make_alliance(
    alliance_id: UUID,
    purchased_seasons: int = 0,
    used_seasons: int = 0,
) -> Alliance:
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


def make_season(
    season_id: UUID,
    alliance_id: UUID,
    *,
    activation_status: str = "draft",
    is_trial: bool = False,
    activated_at: datetime | None = None,
) -> Season:
    now = datetime.now(UTC)
    return Season(
        id=season_id,
        alliance_id=alliance_id,
        name="S1",
        start_date=date.today(),
        end_date=None,
        is_current=False,
        activation_status=activation_status,
        is_trial=is_trial,
        activated_at=activated_at,
        description=None,
        created_at=now,
        updated_at=now,
    )


# --- Shared IDs ---

USER_ID = UUID("11111111-1111-1111-1111-111111111111")
ALLIANCE_ID = UUID("22222222-2222-2222-2222-222222222222")
SEASON_ID = UUID("33333333-3333-3333-3333-333333333333")
SEASON_ID_2 = UUID("33333333-3333-3333-3333-333333333334")


# --- Fixtures ---

@pytest.fixture
def mock_alliance_repo() -> MagicMock:
    repo = MagicMock()
    repo.get_by_collaborator = AsyncMock(return_value=None)
    repo.get_by_id = AsyncMock(return_value=None)
    repo.increment_purchased_seasons = AsyncMock(return_value=(0, 0))
    repo.increment_used_seasons = AsyncMock(return_value=(0, 0))
    return repo


@pytest.fixture
def mock_season_repo() -> MagicMock:
    repo = MagicMock()
    repo.get_by_id = AsyncMock(return_value=None)
    repo.get_current_season = AsyncMock(return_value=None)
    repo.get_activated_seasons_count = AsyncMock(return_value=0)
    repo.update = AsyncMock(return_value=None)
    return repo


@pytest.fixture
def mock_webhook_repo() -> MagicMock:
    repo = MagicMock()
    repo.try_claim_event = AsyncMock(return_value=True)
    repo.update_event_details = AsyncMock(return_value=None)
    return repo


@pytest.fixture
def mock_permission_service() -> MagicMock:
    svc = MagicMock()
    svc.verify_user_season_access = AsyncMock(return_value=ALLIANCE_ID)
    return svc


@pytest.fixture
def quota_service(
    mock_alliance_repo: MagicMock,
    mock_season_repo: MagicMock,
) -> SeasonQuotaService:
    svc = SeasonQuotaService()
    svc._alliance_repo = mock_alliance_repo
    svc._season_repo = mock_season_repo
    return svc


@pytest.fixture
def payment_service(
    mock_webhook_repo: MagicMock,
    quota_service: SeasonQuotaService,
) -> PaymentService:
    svc = PaymentService()
    svc._webhook_repo = mock_webhook_repo
    svc._quota_service = quota_service
    return svc


@pytest.fixture
def season_service(
    mock_season_repo: MagicMock,
    quota_service: SeasonQuotaService,
    mock_permission_service: MagicMock,
    mock_alliance_repo: MagicMock,
) -> SeasonService:
    svc = SeasonService()
    svc._season_repo = mock_season_repo
    svc._quota_service = quota_service
    svc._permission_service = mock_permission_service
    svc._alliance_repo = mock_alliance_repo
    return svc
```

**Step 3: Commit**

```bash
git add backend/tests/integration/
git commit -m "test: scaffold integration test file for payment flow"
```

---

### Task 2: Test Payment Webhook Increases Quota

**Files:**
- Modify: `backend/tests/integration/test_payment_to_season_flow.py`

**Step 1: Write the test**

Append to the file:

```python
class TestPaymentIncreasesQuota:
    """Webhook checkout.completed → purchased_seasons increases."""

    async def test_payment_success_adds_seasons_to_alliance(
        self,
        payment_service: PaymentService,
        mock_alliance_repo: MagicMock,
        mock_webhook_repo: MagicMock,
    ):
        # Arrange: alliance exists with 0 purchased seasons
        alliance = make_alliance(ALLIANCE_ID, purchased_seasons=0, used_seasons=0)
        mock_alliance_repo.get_by_collaborator = AsyncMock(return_value=alliance)
        mock_alliance_repo.increment_purchased_seasons = AsyncMock(return_value=(1, 0))

        event_data = {"externalCustomerId": f"{USER_ID}:1"}

        # Act: simulate webhook
        result = await payment_service.handle_payment_success(
            event_data, event_id="evt_001", event_type="checkout.completed",
        )

        # Assert: seasons added, quota updated
        assert result["success"] is True
        assert result["seasons_added"] == 1
        assert result["available_seasons"] == 1
        mock_alliance_repo.increment_purchased_seasons.assert_awaited_once_with(ALLIANCE_ID, 1)
        mock_webhook_repo.try_claim_event.assert_awaited_once_with("evt_001", "checkout.completed")

    async def test_payment_adds_multiple_seasons(
        self,
        payment_service: PaymentService,
        mock_alliance_repo: MagicMock,
    ):
        # Arrange: buy 3 seasons at once
        alliance = make_alliance(ALLIANCE_ID, purchased_seasons=0, used_seasons=0)
        mock_alliance_repo.get_by_collaborator = AsyncMock(return_value=alliance)
        mock_alliance_repo.increment_purchased_seasons = AsyncMock(return_value=(3, 0))

        event_data = {"externalCustomerId": f"{USER_ID}:3"}

        # Act
        result = await payment_service.handle_payment_success(
            event_data, event_id="evt_002", event_type="checkout.completed",
        )

        # Assert
        assert result["seasons_added"] == 3
        assert result["available_seasons"] == 3
        mock_alliance_repo.increment_purchased_seasons.assert_awaited_once_with(ALLIANCE_ID, 3)
```

**Step 2: Run tests**

```bash
cd backend && uv run pytest tests/integration/test_payment_to_season_flow.py::TestPaymentIncreasesQuota -v
```

Expected: 2 PASSED

**Step 3: Commit**

```bash
git add backend/tests/integration/test_payment_to_season_flow.py
git commit -m "test: payment webhook increases quota"
```

---

### Task 3: Test Idempotency — Duplicate Webhook Does Not Double-Credit

**Files:**
- Modify: `backend/tests/integration/test_payment_to_season_flow.py`

**Step 1: Write the test**

```python
class TestWebhookIdempotency:
    """Duplicate webhook events must not double-credit seasons."""

    async def test_duplicate_event_returns_success_without_adding_seasons(
        self,
        payment_service: PaymentService,
        mock_alliance_repo: MagicMock,
        mock_webhook_repo: MagicMock,
    ):
        # Arrange: event already claimed (duplicate)
        mock_webhook_repo.try_claim_event = AsyncMock(return_value=False)

        event_data = {"externalCustomerId": f"{USER_ID}:1"}

        # Act: send same event again
        result = await payment_service.handle_payment_success(
            event_data, event_id="evt_001", event_type="checkout.completed",
        )

        # Assert: returned success but did NOT touch quota
        assert result["success"] is True
        assert result["duplicate"] is True
        mock_alliance_repo.increment_purchased_seasons.assert_not_awaited()

    async def test_first_then_duplicate_only_credits_once(
        self,
        payment_service: PaymentService,
        mock_alliance_repo: MagicMock,
        mock_webhook_repo: MagicMock,
    ):
        # Arrange
        alliance = make_alliance(ALLIANCE_ID, purchased_seasons=0, used_seasons=0)
        mock_alliance_repo.get_by_collaborator = AsyncMock(return_value=alliance)
        mock_alliance_repo.increment_purchased_seasons = AsyncMock(return_value=(1, 0))

        event_data = {"externalCustomerId": f"{USER_ID}:1"}

        # Act 1: first delivery — claim succeeds
        mock_webhook_repo.try_claim_event = AsyncMock(return_value=True)
        result1 = await payment_service.handle_payment_success(
            event_data, event_id="evt_003", event_type="checkout.completed",
        )

        # Act 2: redelivery — claim fails (duplicate)
        mock_webhook_repo.try_claim_event = AsyncMock(return_value=False)
        result2 = await payment_service.handle_payment_success(
            event_data, event_id="evt_003", event_type="checkout.completed",
        )

        # Assert: credited exactly once
        assert result1["success"] is True
        assert result1.get("duplicate") is not True
        assert result2["success"] is True
        assert result2["duplicate"] is True
        assert mock_alliance_repo.increment_purchased_seasons.await_count == 1
```

**Step 2: Run tests**

```bash
cd backend && uv run pytest tests/integration/test_payment_to_season_flow.py::TestWebhookIdempotency -v
```

Expected: 2 PASSED

**Step 3: Commit**

```bash
git add backend/tests/integration/test_payment_to_season_flow.py
git commit -m "test: webhook idempotency prevents double-credit"
```

---

### Task 4: Test Season Activation Consumes Quota

**Files:**
- Modify: `backend/tests/integration/test_payment_to_season_flow.py`

**Step 1: Write the test**

```python
class TestSeasonActivationConsumesQuota:
    """Activating a season must deduct from available quota."""

    async def test_activate_season_uses_purchased_quota(
        self,
        season_service: SeasonService,
        mock_season_repo: MagicMock,
        mock_alliance_repo: MagicMock,
    ):
        # Arrange: alliance has 1 purchased season, draft season ready
        alliance = make_alliance(ALLIANCE_ID, purchased_seasons=1, used_seasons=0)
        mock_alliance_repo.get_by_id = AsyncMock(return_value=alliance)
        mock_alliance_repo.increment_used_seasons = AsyncMock(return_value=(1, 1))

        draft_season = make_season(SEASON_ID, ALLIANCE_ID, activation_status="draft")
        mock_season_repo.get_by_id = AsyncMock(return_value=draft_season)
        mock_season_repo.get_by_alliance = AsyncMock(return_value=[])

        # Mock update to return activated season
        activated_season = make_season(
            SEASON_ID, ALLIANCE_ID,
            activation_status="activated",
            activated_at=datetime.now(UTC),
        )
        mock_season_repo.update = AsyncMock(return_value=activated_season)

        # Act
        result = await season_service.activate_season(USER_ID, SEASON_ID)

        # Assert: season activated, quota consumed
        assert result.success is True
        assert result.used_trial is False
        assert result.remaining_seasons == 0
        mock_alliance_repo.increment_used_seasons.assert_awaited_once_with(ALLIANCE_ID, 1)

    async def test_first_activation_uses_trial_when_no_purchased(
        self,
        season_service: SeasonService,
        mock_season_repo: MagicMock,
        mock_alliance_repo: MagicMock,
    ):
        # Arrange: no purchased seasons, no prior activations (trial available)
        alliance = make_alliance(ALLIANCE_ID, purchased_seasons=0, used_seasons=0)
        mock_alliance_repo.get_by_id = AsyncMock(return_value=alliance)
        mock_season_repo.get_activated_seasons_count = AsyncMock(return_value=0)

        draft_season = make_season(SEASON_ID, ALLIANCE_ID, activation_status="draft")
        mock_season_repo.get_by_id = AsyncMock(return_value=draft_season)
        mock_season_repo.get_by_alliance = AsyncMock(return_value=[])

        activated_season = make_season(
            SEASON_ID, ALLIANCE_ID,
            activation_status="activated",
            is_trial=True,
            activated_at=datetime.now(UTC),
        )
        mock_season_repo.update = AsyncMock(return_value=activated_season)

        # Act
        result = await season_service.activate_season(USER_ID, SEASON_ID)

        # Assert: trial used, no purchased quota consumed
        assert result.success is True
        assert result.used_trial is True
        assert result.trial_ends_at is not None
        mock_alliance_repo.increment_used_seasons.assert_not_awaited()
```

**Step 2: Run tests**

```bash
cd backend && uv run pytest tests/integration/test_payment_to_season_flow.py::TestSeasonActivationConsumesQuota -v
```

Expected: 2 PASSED

**Step 3: Commit**

```bash
git add backend/tests/integration/test_payment_to_season_flow.py
git commit -m "test: season activation consumes correct quota type"
```

---

### Task 5: Test Full Flow — Payment → Quota → Activation → Exhaustion

**Files:**
- Modify: `backend/tests/integration/test_payment_to_season_flow.py`

**Step 1: Write the test**

```python
class TestFullPaymentToActivationFlow:
    """End-to-end: payment adds quota, activation consumes it, exhaustion blocks."""

    async def test_pay_then_activate_then_exhaust(
        self,
        payment_service: PaymentService,
        season_service: SeasonService,
        mock_alliance_repo: MagicMock,
        mock_season_repo: MagicMock,
        mock_webhook_repo: MagicMock,
    ):
        # --- Phase 1: Payment adds 1 season ---
        alliance_before = make_alliance(ALLIANCE_ID, purchased_seasons=0, used_seasons=0)
        mock_alliance_repo.get_by_collaborator = AsyncMock(return_value=alliance_before)
        mock_alliance_repo.increment_purchased_seasons = AsyncMock(return_value=(1, 0))

        payment_result = await payment_service.handle_payment_success(
            {"externalCustomerId": f"{USER_ID}:1"},
            event_id="evt_100",
            event_type="checkout.completed",
        )
        assert payment_result["success"] is True
        assert payment_result["available_seasons"] == 1

        # --- Phase 2: Activate season (consumes the 1 purchased) ---
        alliance_after_pay = make_alliance(ALLIANCE_ID, purchased_seasons=1, used_seasons=0)
        mock_alliance_repo.get_by_id = AsyncMock(return_value=alliance_after_pay)
        mock_alliance_repo.increment_used_seasons = AsyncMock(return_value=(1, 1))
        mock_season_repo.get_activated_seasons_count = AsyncMock(return_value=1)

        draft = make_season(SEASON_ID, ALLIANCE_ID, activation_status="draft")
        mock_season_repo.get_by_id = AsyncMock(return_value=draft)
        mock_season_repo.get_by_alliance = AsyncMock(return_value=[])
        activated = make_season(
            SEASON_ID, ALLIANCE_ID,
            activation_status="activated",
            activated_at=datetime.now(UTC),
        )
        mock_season_repo.update = AsyncMock(return_value=activated)

        activate_result = await season_service.activate_season(USER_ID, SEASON_ID)
        assert activate_result.success is True
        assert activate_result.remaining_seasons == 0

        # --- Phase 3: Second activation should fail (quota exhausted) ---
        alliance_exhausted = make_alliance(ALLIANCE_ID, purchased_seasons=1, used_seasons=1)
        mock_alliance_repo.get_by_id = AsyncMock(return_value=alliance_exhausted)
        # Trial already used (1 activated season exists)
        mock_season_repo.get_activated_seasons_count = AsyncMock(return_value=1)

        draft2 = make_season(SEASON_ID_2, ALLIANCE_ID, activation_status="draft")
        mock_season_repo.get_by_id = AsyncMock(return_value=draft2)

        from src.core.exceptions import SeasonQuotaExhaustedError

        with pytest.raises(SeasonQuotaExhaustedError):
            await season_service.activate_season(USER_ID, SEASON_ID_2)

    async def test_trial_then_purchase_then_activate_second(
        self,
        payment_service: PaymentService,
        season_service: SeasonService,
        mock_alliance_repo: MagicMock,
        mock_season_repo: MagicMock,
        mock_webhook_repo: MagicMock,
    ):
        # --- Phase 1: First activation uses trial (no purchase) ---
        alliance_new = make_alliance(ALLIANCE_ID, purchased_seasons=0, used_seasons=0)
        mock_alliance_repo.get_by_id = AsyncMock(return_value=alliance_new)
        mock_season_repo.get_activated_seasons_count = AsyncMock(return_value=0)

        draft1 = make_season(SEASON_ID, ALLIANCE_ID, activation_status="draft")
        mock_season_repo.get_by_id = AsyncMock(return_value=draft1)
        mock_season_repo.get_by_alliance = AsyncMock(return_value=[])
        activated1 = make_season(
            SEASON_ID, ALLIANCE_ID,
            activation_status="activated",
            is_trial=True,
            activated_at=datetime.now(UTC),
        )
        mock_season_repo.update = AsyncMock(return_value=activated1)

        result1 = await season_service.activate_season(USER_ID, SEASON_ID)
        assert result1.used_trial is True

        # --- Phase 2: Purchase 1 season ---
        mock_alliance_repo.get_by_collaborator = AsyncMock(
            return_value=make_alliance(ALLIANCE_ID, purchased_seasons=0, used_seasons=0),
        )
        mock_alliance_repo.increment_purchased_seasons = AsyncMock(return_value=(1, 0))

        pay_result = await payment_service.handle_payment_success(
            {"externalCustomerId": f"{USER_ID}:1"},
            event_id="evt_200",
            event_type="order.paid",
        )
        assert pay_result["success"] is True

        # --- Phase 3: Second activation uses purchased quota ---
        alliance_paid = make_alliance(ALLIANCE_ID, purchased_seasons=1, used_seasons=0)
        mock_alliance_repo.get_by_id = AsyncMock(return_value=alliance_paid)
        mock_alliance_repo.increment_used_seasons = AsyncMock(return_value=(1, 1))
        mock_season_repo.get_activated_seasons_count = AsyncMock(return_value=1)

        draft2 = make_season(SEASON_ID_2, ALLIANCE_ID, activation_status="draft")
        mock_season_repo.get_by_id = AsyncMock(return_value=draft2)
        mock_season_repo.get_by_alliance = AsyncMock(return_value=[])
        activated2 = make_season(
            SEASON_ID_2, ALLIANCE_ID,
            activation_status="activated",
            activated_at=datetime.now(UTC),
        )
        mock_season_repo.update = AsyncMock(return_value=activated2)

        result2 = await season_service.activate_season(USER_ID, SEASON_ID_2)
        assert result2.success is True
        assert result2.used_trial is False
        assert result2.remaining_seasons == 0
```

**Step 2: Run tests**

```bash
cd backend && uv run pytest tests/integration/test_payment_to_season_flow.py::TestFullPaymentToActivationFlow -v
```

Expected: 2 PASSED

**Step 3: Commit**

```bash
git add backend/tests/integration/test_payment_to_season_flow.py
git commit -m "test: full payment → activation → exhaustion E2E flow"
```

---

### Task 6: Test Webhook Endpoint E2E (HTTP Layer)

**Files:**
- Create: `backend/tests/integration/test_webhook_endpoint_flow.py`

**Step 1: Write the test**

```python
"""
Integration tests: Webhook HTTP endpoint → PaymentService → Quota update.

Tests the full HTTP request path including signature verification.
"""

import base64
import hashlib
import hmac
import json
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from src.api.v1.endpoints.webhooks import router, verify_recur_signature
from src.models.alliance import Alliance

WEBHOOK_SECRET = "test_webhook_secret_key"
USER_ID = UUID("11111111-1111-1111-1111-111111111111")
ALLIANCE_ID = UUID("22222222-2222-2222-2222-222222222222")


def sign_payload(payload: bytes, secret: str = WEBHOOK_SECRET) -> str:
    computed = hmac.new(
        key=secret.encode("utf-8"),
        msg=payload,
        digestmod=hashlib.sha256,
    ).digest()
    return base64.b64encode(computed).decode("utf-8")


def make_checkout_event(user_id: UUID, quantity: int = 1) -> dict:
    return {
        "type": "checkout.completed",
        "id": "evt_test_001",
        "data": {
            "externalCustomerId": f"{user_id}:{quantity}",
            "amount": 999 * quantity,
            "currency": "TWD",
        },
    }


@pytest.fixture
def app() -> FastAPI:
    from slowapi import Limiter
    from slowapi.util import get_remote_address

    app = FastAPI()
    limiter = Limiter(key_func=get_remote_address)
    app.state.limiter = limiter
    app.include_router(router, prefix="/api/v1")
    return app


@pytest.fixture
async def client(app: FastAPI):
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test",
    ) as c:
        yield c


class TestWebhookEndpointIntegration:
    """Full HTTP webhook → service → quota update."""

    @patch("src.api.v1.endpoints.webhooks.settings")
    @patch("src.api.v1.endpoints.webhooks.PaymentService")
    async def test_valid_webhook_processes_payment_and_returns_200(
        self,
        mock_payment_cls: MagicMock,
        mock_settings: MagicMock,
        client: AsyncClient,
    ):
        # Arrange
        mock_settings.recur_webhook_secret = WEBHOOK_SECRET
        mock_service = MagicMock()
        mock_service.handle_payment_success = AsyncMock(return_value={
            "success": True,
            "alliance_id": str(ALLIANCE_ID),
            "user_id": str(USER_ID),
            "seasons_added": 1,
            "available_seasons": 1,
        })
        mock_payment_cls.return_value = mock_service

        event = make_checkout_event(USER_ID)
        payload = json.dumps(event).encode()
        signature = sign_payload(payload)

        # Act
        response = await client.post(
            "/api/v1/webhooks/recur",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "x-recur-signature": signature,
            },
        )

        # Assert
        assert response.status_code == 200
        assert response.json()["received"] is True
        mock_service.handle_payment_success.assert_awaited_once()

    @patch("src.api.v1.endpoints.webhooks.settings")
    async def test_invalid_signature_returns_401(
        self,
        mock_settings: MagicMock,
        client: AsyncClient,
    ):
        mock_settings.recur_webhook_secret = WEBHOOK_SECRET

        event = make_checkout_event(USER_ID)
        payload = json.dumps(event).encode()

        response = await client.post(
            "/api/v1/webhooks/recur",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "x-recur-signature": "invalid_signature",
            },
        )

        assert response.status_code == 401

    @patch("src.api.v1.endpoints.webhooks.settings")
    async def test_missing_webhook_secret_returns_503(
        self,
        mock_settings: MagicMock,
        client: AsyncClient,
    ):
        mock_settings.recur_webhook_secret = None

        event = make_checkout_event(USER_ID)
        payload = json.dumps(event).encode()
        signature = sign_payload(payload)

        response = await client.post(
            "/api/v1/webhooks/recur",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "x-recur-signature": signature,
            },
        )

        assert response.status_code == 503
```

**Step 2: Run tests**

```bash
cd backend && uv run pytest tests/integration/test_webhook_endpoint_flow.py -v
```

Expected: 3 PASSED

**Step 3: Commit**

```bash
git add backend/tests/integration/test_webhook_endpoint_flow.py
git commit -m "test: webhook endpoint HTTP integration tests"
```

---

### Task 7: Run Full Integration Suite and Verify

**Step 1: Run all integration tests**

```bash
cd backend && uv run pytest tests/integration/ -v
```

Expected: 9 PASSED (2 + 2 + 2 + 2 + 3 - adjusted for actual count)

**Step 2: Run full test suite to ensure no regressions**

```bash
cd backend && uv run pytest -v --tb=short
```

Expected: All existing tests + new integration tests PASS

**Step 3: Run linter**

```bash
cd backend && uv run ruff check .
```

Expected: No errors

**Step 4: Commit if any fixes needed**

---

### Task 8: Live Sandbox Verification (Manual)

After all automated tests pass, verify the live sandbox environment:

**Step 1: Use Recur MCP `test_webhook` to send test event to sandbox endpoint**

This sends a real HTTP request to `https://api.tktmanager.com/api/v1/webhooks/recur` with a test payload.

**Step 2: Check Supabase via MCP**

Query `webhook_events` table to confirm the event was recorded.
Query `alliances` table to confirm `purchased_seasons` incremented.

**Step 3: Document results**

Record pass/fail for each verification step.

---

## Test Coverage Summary

| Scenario | Test Class | Count |
|----------|-----------|-------|
| Payment → quota increase | `TestPaymentIncreasesQuota` | 2 |
| Webhook idempotency | `TestWebhookIdempotency` | 2 |
| Season activation → quota deduct | `TestSeasonActivationConsumesQuota` | 2 |
| Full E2E flow | `TestFullPaymentToActivationFlow` | 2 |
| HTTP webhook endpoint | `TestWebhookEndpointIntegration` | 3 |
| **Total** | | **11** |
