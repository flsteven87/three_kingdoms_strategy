# Real Recur Webhook Integration Test Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the misleading, over-mocked integration test with a real HTTP-level end-to-end test that drives the Recur webhook path using **real-shaped payloads** (`backend/tests/fixtures/recur_payloads.py`), exercising the actual `PaymentService` extraction/validation logic while mocking only the Supabase RPC boundary.

**Architecture:** Tests `POST /api/v1/webhooks/recur` with real Recur-shape payloads wrapped in the webhook envelope (`{type, id, data}`). Patches `SeasonQuotaService` and `WebhookEventRepository` at their import sites inside `src.services.payment_service` so a **real `PaymentService` instance** runs inside the request handler — meaning extraction, validation, and error classification are all under test. Asserts on HTTP status, response body, RPC 8-arg kwargs, and `alert_critical` invocations.

**Tech Stack:** pytest-asyncio, FastAPI TestClient via `httpx.AsyncClient + ASGITransport`, `unittest.mock.patch` at module paths, existing `recur_payloads.py` fixtures.

**Context reminders for the engineer:**
- Real Recur wire envelope: `{"type": "order.paid" | "checkout.completed", "id": "evt_xxx", "data": <real-shape-body>}`
- The inner `data` body shapes live in `backend/tests/fixtures/recur_payloads.py` — use `checkout_completed()` and `order_paid()` helpers, **never** write inline payload dicts
- `recur_payloads.TEST_CHECKOUT_ID = "chk_test_aaaaaaaaaaaaaaaaaaaaaaaa"`, `TEST_ORDER_ID = "ord_test_bbbbbbbbbbbbbbbbbbbbbbbb"`, `TEST_USER_ID = UUID("11111111-1111-1111-1111-111111111111")`
- The webhook handler at `backend/src/api/v1/endpoints/webhooks.py:85-98` extracts `event["type"]`, `event["id"]`, `event["data"]` and passes `event_data` to `PaymentService().handle_payment_success(event_data, event_id=..., event_type=...)`
- `PaymentService` imports `SeasonQuotaService` and `WebhookEventRepository` via `from src.repositories... import WebhookEventRepository` and `from src.services.season_quota_service import SeasonQuotaService` — patch at those import sites: `src.services.payment_service.WebhookEventRepository` and `src.services.payment_service.SeasonQuotaService`
- `WebhookEventRepository.process_event` returns `WebhookProcessingResult(status: Literal["granted","duplicate_event","duplicate_purchase","audit_only"], available_seasons: int)`
- Permanent errors → 200 + body `{"received": True, "status": "permanent_failure", "code": <error_code>}` + `alert_critical` called
- Transient errors → HTTP 500 with body `detail: "transient:<code>"`
- Rate limiter is module-level but the test app doesn't mount the `SlowAPIMiddleware`, so `@limiter.limit` is a no-op in tests (existing tests confirm this)
- The `alliance_not_found` path raises `WebhookPermanentError` which maps to 200 + permanent_failure (Recur should NOT retry)
- `alliance.id` should be a UUID. Use `Alliance` model or a `MagicMock()` with `.id` attribute set to a UUID

---

## File Structure

- **Create:** `backend/tests/integration/test_recur_webhook_e2e.py` — new e2e integration test driving real PaymentService
- **Delete from:** `backend/tests/integration/test_webhook_endpoint_flow.py` — remove `make_checkout_event`, `PRODUCT_ID`, `test_valid_webhook_processes_payment_and_returns_200` (the misleading parts). Keep `test_invalid_signature_returns_401` and `test_missing_webhook_secret_returns_503` (these exercise pure infra paths and don't need real payload shapes). Optionally move them into the new file and delete the old file entirely — do this in the final task
- **Verify unchanged:** `backend/tests/fixtures/recur_payloads.py`, `backend/src/api/v1/endpoints/webhooks.py`, `backend/src/services/payment_service.py`, `backend/src/repositories/webhook_event_repository.py`

**TDD note for this plan:** the code under test already exists and passes its unit tests. This plan is **coverage hardening**, not feature implementation. The "failing test first" discipline translates to: write the test against the current code, run it, **expect PASS**. If a test unexpectedly FAILS, you have found a real latent bug — stop, investigate, and report it before continuing (do NOT patch production code to make the test pass without confirming the bug with the user).

---

### Task 1: Scaffold the new e2e test file

**Files:**
- Create: `backend/tests/integration/test_recur_webhook_e2e.py`

- [ ] **Step 1: Write the scaffold with helpers, fixtures, and one smoke test**

```python
"""
End-to-end integration tests for POST /api/v1/webhooks/recur.

Unlike test_webhook_endpoint_flow.py (which mocks PaymentService entirely),
this file drives REAL PaymentService logic — extraction, validation, error
classification — using REAL-shaped Recur payloads from
``tests/fixtures/recur_payloads.py``. Only the Supabase RPC boundary
(WebhookEventRepository) and the alliance lookup (SeasonQuotaService) are
mocked, because those are covered by their own unit tests.

Any failure in this file indicates either:
  (a) a drift between the webhook handler and PaymentService contracts, or
  (b) a real bug in the extraction/validation/error-classification path.
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

from src.api.v1.endpoints.webhooks import router
from src.repositories.webhook_event_repository import WebhookProcessingResult
from tests.fixtures.recur_payloads import (
    TEST_CHECKOUT_ID,
    TEST_ORDER_ID,
    TEST_PRODUCT_ID,
    TEST_USER_ID,
    checkout_completed,
    order_paid,
)

WEBHOOK_SECRET = "test_webhook_secret_key"
EXPECTED_AMOUNT = 999
EXPECTED_CURRENCY = "TWD"
ALLIANCE_ID = UUID("22222222-2222-2222-2222-222222222222")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def sign(body: bytes, secret: str = WEBHOOK_SECRET) -> str:
    digest = hmac.new(secret.encode("utf-8"), body, hashlib.sha256).digest()
    return base64.b64encode(digest).decode("utf-8")


def envelope(event_type: str, event_id: str, data: dict) -> dict:
    """Wrap a real-shaped ``data`` body in the Recur wire envelope."""
    return {"type": event_type, "id": event_id, "data": data}


async def post_webhook(client: AsyncClient, body: dict, *, secret: str = WEBHOOK_SECRET):
    raw = json.dumps(body).encode()
    return await client.post(
        "/api/v1/webhooks/recur",
        content=raw,
        headers={
            "Content-Type": "application/json",
            "x-recur-signature": sign(raw, secret),
        },
    )


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def app() -> FastAPI:
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")
    return app


@pytest.fixture
async def client(app: FastAPI):
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as c:
        yield c


@pytest.fixture
def mock_settings():
    """Patch settings at the import site used by the webhook handler AND the service."""
    with patch("src.api.v1.endpoints.webhooks.settings") as ws, \
         patch("src.services.payment_service.settings") as ss:
        ws.recur_webhook_secret = WEBHOOK_SECRET
        ss.recur_product_id = TEST_PRODUCT_ID
        ss.recur_expected_amount_twd = EXPECTED_AMOUNT
        ss.recur_expected_currency = EXPECTED_CURRENCY
        yield ws, ss


@pytest.fixture
def mock_deps():
    """
    Patch SeasonQuotaService and WebhookEventRepository at their import sites
    inside payment_service. Yields (quota_instance, repo_instance) so tests
    can customise return values / side effects.
    """
    with patch("src.services.payment_service.SeasonQuotaService") as quota_cls, \
         patch("src.services.payment_service.WebhookEventRepository") as repo_cls:
        alliance = MagicMock()
        alliance.id = ALLIANCE_ID

        quota = MagicMock()
        quota.get_alliance_by_user = AsyncMock(return_value=alliance)
        quota_cls.return_value = quota

        repo = MagicMock()
        repo.process_event = AsyncMock(
            return_value=WebhookProcessingResult(status="granted", available_seasons=1),
        )
        repo_cls.return_value = repo

        yield quota, repo


@pytest.fixture
def mock_alert():
    """Patch alert_critical at the webhook endpoint import site."""
    with patch("src.api.v1.endpoints.webhooks.alert_critical", new=AsyncMock()) as m:
        yield m


# ---------------------------------------------------------------------------
# Smoke test (proves scaffolding works)
# ---------------------------------------------------------------------------


class TestScaffolding:
    async def test_fixtures_import_and_client_round_trips(
        self, client: AsyncClient, mock_settings, mock_deps, mock_alert
    ):
        body = envelope("order.paid", "evt_smoke_001", order_paid())
        response = await post_webhook(client, body)
        assert response.status_code == 200
```

- [ ] **Step 2: Run the smoke test to verify it passes**

Run: `cd backend && pytest tests/integration/test_recur_webhook_e2e.py::TestScaffolding -v`
Expected: `1 passed` — confirms fixture wiring, envelope helper, signature, patch points, and that `order.paid` happy path doesn't crash.

- [ ] **Step 3: Run the full suite to confirm nothing else broke**

Run: `cd backend && pytest -q`
Expected: `585 passed` (584 original + 1 new).

- [ ] **Step 4: Commit**

```bash
cd /Users/minweih/Desktop/three_kingdoms_strategy
git add backend/tests/integration/test_recur_webhook_e2e.py
git commit -m "test(payment): scaffold real-shape e2e integration test for Recur webhook"
```

---

### Task 2: order.paid happy path — grants one season + verifies real-shape extraction reached the RPC

**Files:**
- Modify: `backend/tests/integration/test_recur_webhook_e2e.py` (add new class `TestOrderPaidHappyPath`)

- [ ] **Step 1: Write the test**

Append to the file:

```python
class TestOrderPaidHappyPath:
    async def test_order_paid_grants_one_season_and_rpc_receives_extracted_values(
        self, client: AsyncClient, mock_settings, mock_deps, mock_alert
    ):
        _, repo = mock_deps
        repo.process_event = AsyncMock(
            return_value=WebhookProcessingResult(status="granted", available_seasons=3),
        )

        body = envelope("order.paid", "evt_happy_001", order_paid())
        response = await post_webhook(client, body)

        assert response.status_code == 200
        j = response.json()
        assert j["received"] is True
        assert j["status"] == "granted"
        assert j["seasons_added"] == 1
        assert j["available_seasons"] == 3
        assert j["user_id"] == str(TEST_USER_ID)
        assert j["alliance_id"] == str(ALLIANCE_ID)
        assert j["checkout_id"] == TEST_CHECKOUT_ID
        assert j["order_id"] == TEST_ORDER_ID

        # Verify PaymentService ran real extraction and called the RPC with
        # the 8-arg v2 signature using values derived from the real payload.
        repo.process_event.assert_awaited_once()
        kwargs = repo.process_event.call_args.kwargs
        assert kwargs["event_id"] == "evt_happy_001"
        assert kwargs["event_type"] == "order.paid"
        assert kwargs["checkout_id"] == TEST_CHECKOUT_ID
        assert kwargs["order_id"] == TEST_ORDER_ID
        assert kwargs["alliance_id"] == ALLIANCE_ID
        assert kwargs["user_id"] == TEST_USER_ID
        assert kwargs["seasons"] == 1
        assert kwargs["payload"]["customer"]["external_id"] == str(TEST_USER_ID)
        assert kwargs["payload"]["product_id"] == TEST_PRODUCT_ID

        mock_alert.assert_not_awaited()
```

- [ ] **Step 2: Run the test**

Run: `cd backend && pytest tests/integration/test_recur_webhook_e2e.py::TestOrderPaidHappyPath -v`
Expected: PASS. If it fails because the handler / service contract drifted, STOP and investigate — don't edit production code without confirming with the user.

- [ ] **Step 3: Commit**

```bash
git add backend/tests/integration/test_recur_webhook_e2e.py
git commit -m "test(payment): cover order.paid happy path with real-shape extraction assertions"
```

---

### Task 3: checkout.completed audit-only path

**Files:**
- Modify: `backend/tests/integration/test_recur_webhook_e2e.py` (add `TestCheckoutCompletedAuditOnly`)

- [ ] **Step 1: Write the test**

```python
class TestCheckoutCompletedAuditOnly:
    async def test_checkout_completed_writes_audit_row_and_grants_zero_seasons(
        self, client: AsyncClient, mock_settings, mock_deps, mock_alert
    ):
        _, repo = mock_deps
        repo.process_event = AsyncMock(
            return_value=WebhookProcessingResult(status="audit_only", available_seasons=0),
        )

        body = envelope("checkout.completed", "evt_audit_001", checkout_completed())
        response = await post_webhook(client, body)

        assert response.status_code == 200
        j = response.json()
        assert j["status"] == "audit_only"
        assert j["seasons_added"] == 0
        assert j["checkout_id"] == TEST_CHECKOUT_ID
        assert j["order_id"] is None  # order_id only exists on order.paid

        kwargs = repo.process_event.call_args.kwargs
        assert kwargs["event_type"] == "checkout.completed"
        assert kwargs["checkout_id"] == TEST_CHECKOUT_ID  # extracted from data.id
        assert kwargs["order_id"] is None
        assert kwargs["seasons"] == 0  # audit-only → grant count is zero

        mock_alert.assert_not_awaited()
```

- [ ] **Step 2: Run the test**

Run: `cd backend && pytest tests/integration/test_recur_webhook_e2e.py::TestCheckoutCompletedAuditOnly -v`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add backend/tests/integration/test_recur_webhook_e2e.py
git commit -m "test(payment): cover checkout.completed audit-only path"
```

---

### Task 4: Idempotency — duplicate_event and duplicate_purchase

**Files:**
- Modify: `backend/tests/integration/test_recur_webhook_e2e.py` (add `TestIdempotencyOutcomes`)

- [ ] **Step 1: Write the tests**

```python
class TestIdempotencyOutcomes:
    async def test_duplicate_event_returns_zero_seasons_added(
        self, client: AsyncClient, mock_settings, mock_deps, mock_alert
    ):
        _, repo = mock_deps
        repo.process_event = AsyncMock(
            return_value=WebhookProcessingResult(status="duplicate_event", available_seasons=1),
        )

        body = envelope("order.paid", "evt_dup_event_001", order_paid())
        response = await post_webhook(client, body)

        assert response.status_code == 200
        j = response.json()
        assert j["status"] == "duplicate_event"
        assert j["seasons_added"] == 0  # ONLY "granted" yields seasons_added=1
        assert j["available_seasons"] == 1
        mock_alert.assert_not_awaited()

    async def test_duplicate_purchase_returns_zero_seasons_added(
        self, client: AsyncClient, mock_settings, mock_deps, mock_alert
    ):
        _, repo = mock_deps
        repo.process_event = AsyncMock(
            return_value=WebhookProcessingResult(status="duplicate_purchase", available_seasons=1),
        )

        body = envelope("order.paid", "evt_dup_purchase_001", order_paid())
        response = await post_webhook(client, body)

        assert response.status_code == 200
        j = response.json()
        assert j["status"] == "duplicate_purchase"
        assert j["seasons_added"] == 0
        assert j["available_seasons"] == 1
        mock_alert.assert_not_awaited()
```

- [ ] **Step 2: Run the tests**

Run: `cd backend && pytest tests/integration/test_recur_webhook_e2e.py::TestIdempotencyOutcomes -v`
Expected: 2 passed.

- [ ] **Step 3: Commit**

```bash
git add backend/tests/integration/test_recur_webhook_e2e.py
git commit -m "test(payment): cover duplicate_event + duplicate_purchase idempotency outcomes"
```

---

### Task 5: Validation permanent failures — wrong product, currency, amount

**Files:**
- Modify: `backend/tests/integration/test_recur_webhook_e2e.py` (add `TestValidationPermanentFailures`)

- [ ] **Step 1: Write the tests**

```python
class TestValidationPermanentFailures:
    """
    All permanent errors should return 200 (so Recur does NOT retry), set
    body.status == "permanent_failure", and trigger alert_critical.
    """

    async def test_wrong_product_id_is_permanent(
        self, client: AsyncClient, mock_settings, mock_deps, mock_alert
    ):
        _, repo = mock_deps
        body = envelope("order.paid", "evt_prod_001", order_paid(product_id="prod_wrong"))
        response = await post_webhook(client, body)

        assert response.status_code == 200
        j = response.json()
        assert j["status"] == "permanent_failure"
        assert j["code"] == "product_mismatch"
        repo.process_event.assert_not_awaited()
        mock_alert.assert_awaited_once()
        assert mock_alert.await_args.args[0] == "recur.webhook.permanent"
        assert mock_alert.await_args.kwargs["error_code"] == "product_mismatch"

    async def test_wrong_currency_is_permanent(
        self, client: AsyncClient, mock_settings, mock_deps, mock_alert
    ):
        _, repo = mock_deps
        body = envelope("order.paid", "evt_cur_001", order_paid(currency="USD"))
        response = await post_webhook(client, body)

        assert response.status_code == 200
        j = response.json()
        assert j["status"] == "permanent_failure"
        assert j["code"] == "currency_mismatch"
        repo.process_event.assert_not_awaited()
        mock_alert.assert_awaited_once()

    async def test_wrong_amount_is_permanent(
        self, client: AsyncClient, mock_settings, mock_deps, mock_alert
    ):
        _, repo = mock_deps
        body = envelope("order.paid", "evt_amt_001", order_paid(amount=1))
        response = await post_webhook(client, body)

        assert response.status_code == 200
        j = response.json()
        assert j["status"] == "permanent_failure"
        assert j["code"] == "amount_mismatch"
        repo.process_event.assert_not_awaited()
        mock_alert.assert_awaited_once()
```

- [ ] **Step 2: Run the tests**

Run: `cd backend && pytest tests/integration/test_recur_webhook_e2e.py::TestValidationPermanentFailures -v`
Expected: 3 passed.

- [ ] **Step 3: Commit**

```bash
git add backend/tests/integration/test_recur_webhook_e2e.py
git commit -m "test(payment): cover product/currency/amount validation permanent failures + alerts"
```

---

### Task 6: Extraction permanent failures — missing external_id and missing checkout_id

**Files:**
- Modify: `backend/tests/integration/test_recur_webhook_e2e.py` (add `TestExtractionPermanentFailures`)

- [ ] **Step 1: Write the tests**

```python
class TestExtractionPermanentFailures:
    async def test_missing_external_customer_id_is_permanent(
        self, client: AsyncClient, mock_settings, mock_deps, mock_alert
    ):
        _, repo = mock_deps
        data = order_paid()
        data["customer"]["external_id"] = None  # simulate Recur bug / config error

        body = envelope("order.paid", "evt_miss_ext_001", data)
        response = await post_webhook(client, body)

        assert response.status_code == 200
        j = response.json()
        assert j["status"] == "permanent_failure"
        assert j["code"] == "missing_external_customer_id"
        repo.process_event.assert_not_awaited()
        mock_alert.assert_awaited_once()

    async def test_missing_checkout_id_on_order_paid_is_permanent(
        self, client: AsyncClient, mock_settings, mock_deps, mock_alert
    ):
        _, repo = mock_deps
        data = order_paid()
        del data["checkout_id"]  # purchase-level idempotency key missing

        body = envelope("order.paid", "evt_miss_chk_001", data)
        response = await post_webhook(client, body)

        assert response.status_code == 200
        j = response.json()
        assert j["status"] == "permanent_failure"
        assert j["code"] == "missing_checkout_id"
        repo.process_event.assert_not_awaited()
        mock_alert.assert_awaited_once()
```

- [ ] **Step 2: Run the tests**

Run: `cd backend && pytest tests/integration/test_recur_webhook_e2e.py::TestExtractionPermanentFailures -v`
Expected: 2 passed.

- [ ] **Step 3: Commit**

```bash
git add backend/tests/integration/test_recur_webhook_e2e.py
git commit -m "test(payment): cover missing external_id / checkout_id extraction failures"
```

---

### Task 7: Alliance lookup errors — not_found (permanent) and transient

**Files:**
- Modify: `backend/tests/integration/test_recur_webhook_e2e.py` (add `TestAllianceLookupErrors`)

- [ ] **Step 1: Write the tests**

```python
from postgrest.exceptions import APIError  # add to imports at top of file


class TestAllianceLookupErrors:
    async def test_alliance_not_found_is_permanent(
        self, client: AsyncClient, mock_settings, mock_deps, mock_alert
    ):
        quota, repo = mock_deps
        quota.get_alliance_by_user = AsyncMock(return_value=None)

        body = envelope("order.paid", "evt_no_alliance_001", order_paid())
        response = await post_webhook(client, body)

        assert response.status_code == 200
        j = response.json()
        assert j["status"] == "permanent_failure"
        assert j["code"] == "alliance_not_found"
        repo.process_event.assert_not_awaited()
        mock_alert.assert_awaited_once()

    async def test_alliance_lookup_api_error_is_transient(
        self, client: AsyncClient, mock_settings, mock_deps, mock_alert
    ):
        quota, repo = mock_deps
        quota.get_alliance_by_user = AsyncMock(
            side_effect=APIError({"message": "boom", "code": "PG500"})
        )

        body = envelope("order.paid", "evt_transient_001", order_paid())
        response = await post_webhook(client, body)

        assert response.status_code == 500
        assert "transient:alliance_lookup_failed" in response.json()["detail"]
        repo.process_event.assert_not_awaited()
        # Transient errors should NOT alert_critical (Recur will retry)
        mock_alert.assert_not_awaited()
```

- [ ] **Step 2: Run the tests**

Run: `cd backend && pytest tests/integration/test_recur_webhook_e2e.py::TestAllianceLookupErrors -v`
Expected: 2 passed. If `test_alliance_lookup_api_error_is_transient` fails because `alert_critical` was awaited, that is a real finding — the current code does NOT alert on transient errors (intentional, so Recur retries silently), and this assertion documents that contract.

- [ ] **Step 3: Commit**

```bash
git add backend/tests/integration/test_recur_webhook_e2e.py
git commit -m "test(payment): cover alliance lookup not-found (permanent) vs API error (transient)"
```

---

### Task 8: RPC errors — transient APIError → 500

**Files:**
- Modify: `backend/tests/integration/test_recur_webhook_e2e.py` (add `TestRpcErrors`)

- [ ] **Step 1: Write the test**

```python
class TestRpcErrors:
    async def test_rpc_api_error_is_transient_500(
        self, client: AsyncClient, mock_settings, mock_deps, mock_alert
    ):
        _, repo = mock_deps
        repo.process_event = AsyncMock(
            side_effect=APIError({"message": "rpc down", "code": "PG500"})
        )

        body = envelope("order.paid", "evt_rpc_err_001", order_paid())
        response = await post_webhook(client, body)

        assert response.status_code == 500
        assert "transient:rpc_api_error" in response.json()["detail"]
        mock_alert.assert_not_awaited()
```

- [ ] **Step 2: Run the test**

Run: `cd backend && pytest tests/integration/test_recur_webhook_e2e.py::TestRpcErrors -v`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add backend/tests/integration/test_recur_webhook_e2e.py
git commit -m "test(payment): cover RPC APIError → 500 transient classification"
```

---

### Task 9: Event-type routing — unsupported type and payment_failed ignore path

**Files:**
- Modify: `backend/tests/integration/test_recur_webhook_e2e.py` (add `TestEventTypeRouting`)

- [ ] **Step 1: Write the tests**

```python
class TestEventTypeRouting:
    async def test_unsupported_event_type_is_permanent(
        self, client: AsyncClient, mock_settings, mock_deps, mock_alert
    ):
        _, repo = mock_deps
        # "customer.created" is neither granting nor audit-only — whitelist rejects it
        body = envelope("customer.created", "evt_unsup_001", order_paid())
        response = await post_webhook(client, body)

        # The handler's `if event_type in ("checkout.completed", "order.paid")`
        # short-circuits to the "ignored" branch for unknown types — so this
        # returns 200 + status=ignored WITHOUT calling PaymentService.
        assert response.status_code == 200
        assert response.json() == {"received": True, "status": "ignored"}
        repo.process_event.assert_not_awaited()
        mock_alert.assert_not_awaited()

    async def test_order_payment_failed_is_logged_and_ignored(
        self, client: AsyncClient, mock_settings, mock_deps, mock_alert
    ):
        _, repo = mock_deps
        body = envelope("order.payment_failed", "evt_fail_001", order_paid())
        response = await post_webhook(client, body)

        assert response.status_code == 200
        assert response.json() == {"received": True, "status": "payment_failed_logged"}
        repo.process_event.assert_not_awaited()
        mock_alert.assert_not_awaited()
```

- [ ] **Step 2: Run the tests**

Run: `cd backend && pytest tests/integration/test_recur_webhook_e2e.py::TestEventTypeRouting -v`
Expected: 2 passed.

> **Plan-author note**: `PaymentService.handle_payment_success` also raises `unsupported_event_type` for event types it doesn't recognise, but the webhook handler's whitelist at `webhooks.py:94` short-circuits first — so PaymentService's whitelist is only reachable if the handler list and PaymentService's `KNOWN_EVENT_TYPES` drift apart. If you want belt-and-suspenders coverage of the service-level whitelist, that's a unit-test concern (already covered by `test_unknown_event_type_is_permanent` in `test_payment_service.py`), so don't duplicate it here.

- [ ] **Step 3: Commit**

```bash
git add backend/tests/integration/test_recur_webhook_e2e.py
git commit -m "test(payment): cover unsupported event type (ignored) and payment_failed logged path"
```

---

### Task 10: Infra paths — invalid signature + missing webhook secret, and retire the old test file

**Files:**
- Modify: `backend/tests/integration/test_recur_webhook_e2e.py` (add `TestInfraPaths`)
- Delete: `backend/tests/integration/test_webhook_endpoint_flow.py` (entire file — its surviving 401/503 tests are being reimplemented here against the new, non-misleading baseline)

- [ ] **Step 1: Add the infra tests to the new file**

```python
class TestInfraPaths:
    async def test_invalid_signature_returns_401(
        self, client: AsyncClient, mock_settings, mock_deps, mock_alert
    ):
        _, repo = mock_deps
        body = envelope("order.paid", "evt_bad_sig_001", order_paid())
        raw = json.dumps(body).encode()

        response = await client.post(
            "/api/v1/webhooks/recur",
            content=raw,
            headers={
                "Content-Type": "application/json",
                "x-recur-signature": "deadbeef",  # wrong signature
            },
        )

        assert response.status_code == 401
        repo.process_event.assert_not_awaited()
        mock_alert.assert_awaited_once()
        assert mock_alert.await_args.args[0] == "recur.webhook.signature_failed"

    async def test_missing_webhook_secret_returns_503(
        self, client: AsyncClient, mock_deps, mock_alert
    ):
        # Override the webhook_secret in a fresh patch since the fixture
        # already set it — we want the None-secret branch.
        with patch("src.api.v1.endpoints.webhooks.settings") as ws, \
             patch("src.services.payment_service.settings") as ss:
            ws.recur_webhook_secret = None
            ss.recur_product_id = TEST_PRODUCT_ID
            ss.recur_expected_amount_twd = EXPECTED_AMOUNT
            ss.recur_expected_currency = EXPECTED_CURRENCY

            body = envelope("order.paid", "evt_no_secret_001", order_paid())
            raw = json.dumps(body).encode()
            response = await client.post(
                "/api/v1/webhooks/recur",
                content=raw,
                headers={
                    "Content-Type": "application/json",
                    "x-recur-signature": sign(raw),
                },
            )

        assert response.status_code == 503
```

- [ ] **Step 2: Delete the old misleading test file**

```bash
cd /Users/minweih/Desktop/three_kingdoms_strategy
git rm backend/tests/integration/test_webhook_endpoint_flow.py
```

- [ ] **Step 3: Run the full suite to confirm no regression**

Run: `cd backend && pytest -q`
Expected: all green. New test count ≈ 584 − 3 (deleted file) + 15 (new file: 1 scaffold + 1 + 1 + 2 + 3 + 2 + 2 + 1 + 2 + 2) = **596 passed**. Exact count is secondary — the requirement is **zero failures** and the new integration file runs ≥ 14 tests.

- [ ] **Step 4: Commit**

```bash
git add backend/tests/integration/test_recur_webhook_e2e.py backend/tests/integration/test_webhook_endpoint_flow.py
git commit -m "test(payment): retire misleading test_webhook_endpoint_flow, infra paths moved to e2e file"
```

---

### Task 11: Final verification + push

**Files:** none modified.

- [ ] **Step 1: Run full backend suite**

Run: `cd backend && pytest -q`
Expected: all green, no skipped/xfailed new tests.

- [ ] **Step 2: Run only the new integration file verbosely and eyeball coverage**

Run: `cd backend && pytest tests/integration/test_recur_webhook_e2e.py -v`
Expected: every test class present (Scaffolding, OrderPaidHappyPath, CheckoutCompletedAuditOnly, IdempotencyOutcomes, ValidationPermanentFailures, ExtractionPermanentFailures, AllianceLookupErrors, RpcErrors, EventTypeRouting, InfraPaths), zero failures.

- [ ] **Step 3: Sanity-grep for leftover references to the deleted file**

Run: `grep -rn "test_webhook_endpoint_flow" backend/`
Expected: zero matches.

- [ ] **Step 4: Push to main**

```bash
cd /Users/minweih/Desktop/three_kingdoms_strategy
git push origin main
```

Expected: push succeeds, CI goes green on remote.

---

## Self-Review Checklist (for the plan author — already run)

**Spec coverage:** Every bullet from the user's "A" scope is covered:
- ✅ Use real `recur_payloads.py` fixtures (Tasks 2–9)
- ✅ Mock Supabase client only, NOT PaymentService (Task 1 `mock_deps` fixture)
- ✅ `order.paid` grant (Task 2)
- ✅ `checkout.completed` audit-only (Task 3)
- ✅ `duplicate_purchase` (Task 4)
- ✅ `duplicate_event` (Task 4)
- ✅ Invalid signature (Task 10)
- ✅ Wrong currency (Task 5)
- ✅ Wrong product_id (Task 5)
- ✅ Missing user / alliance (Task 6, Task 7)
- ✅ Unsupported event type (Task 9)
- ✅ Plus bonus coverage: wrong amount, missing checkout_id, RPC transient, missing secret (503), payment_failed ignore

**Placeholder scan:** Clean — every test step contains runnable code and exact commands.

**Type consistency:** `WebhookProcessingResult` signature matches `backend/src/repositories/webhook_event_repository.py:44-53` (verified during analysis). Patch targets verified against actual import statements in `payment_service.py` (`src.services.payment_service.WebhookEventRepository`, `src.services.payment_service.SeasonQuotaService`). Envelope shape (`{type, id, data}`) matches handler at `webhooks.py:85-87`. Fixture field names (`customer.external_id`, `product_id`, `checkout_id`, `order_id`, `amount`, `currency`) all match `recur_payloads.py` and what `PaymentService` extracts at `payment_service.py:135-183`.

**Risk of false positives:** Tests that assert `mock_alert.assert_not_awaited()` on transient paths (Task 7, Task 8) document an intentional behavior — if someone later decides to alert on transient errors too, these assertions will flag the contract change, which is what we want.
