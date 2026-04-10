# Recur Payment Production Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden the Recur payment webhook flow to production-grade: server-authoritative amount/product validation, atomic idempotent grant, correct retry semantics, and critical alerts — zero backward-compat.

**Architecture:**
- Backend trusts only server-side config for price/product (not the frontend or webhook body for business decisions).
- A single Postgres RPC `process_payment_webhook_event` performs **idempotency claim + audit write + season grant** in one transaction. No more three-step claim/grant/update dance.
- Webhook errors split into `WebhookPermanentError` (return 200 + CRITICAL alert, no retry) and `WebhookTransientError` (return 500, Recur retries).
- Frontend stops composing `user_id:quantity`; passes bare UUID. Quantity is fixed at 1 per event by the server (1 product = 1 season).

**Tech Stack:** FastAPI, Pydantic v2, Supabase (Postgres + PostgREST), `recur-tw` SDK (React), httpx, pytest + pytest-asyncio.

---

## File Structure

### Files to create
- `backend/src/core/webhook_errors.py` — `WebhookPermanentError`, `WebhookTransientError`
- `backend/src/core/alerts.py` — `alert_critical()` (log + optional Discord/Slack webhook)
- `backend/tests/unit/core/test_alerts.py`

### Files to modify (full replacements of affected functions)
- `backend/src/core/config.py` — add `recur_product_id`, `recur_expected_amount_twd`, `recur_expected_currency`, `alert_webhook_url`
- `backend/src/repositories/webhook_event_repository.py` — replace `try_claim_event` + `update_event_details` with single RPC wrapper `process_event`
- `backend/src/services/payment_service.py` — rewrite `handle_payment_success`; delete `_parse_external_customer_id` old format; add product/amount/currency validation; use new error classes
- `backend/src/api/v1/endpoints/webhooks.py` — rewrite error handling; call `alert_critical` on signature failure and permanent errors
- `frontend/src/pages/PurchaseSeason.tsx` — `externalCustomerId = user.id` (no `:1` suffix)
- `backend/.env.example` — new env vars
- `frontend/.env.example` — documentation comment only

### Tests to rewrite (existing tests depend on deleted behavior)
- `backend/tests/unit/services/test_payment_service.py` — full rewrite
- `backend/tests/unit/endpoints/test_webhooks.py` — add permanent/transient tests
- `backend/tests/unit/services/test_webhook_idempotency.py` — rewrite for RPC
- `backend/tests/integration/test_payment_to_season_flow.py` — rewrite to mock RPC call
- `backend/tests/integration/test_webhook_endpoint_flow.py` — update for new error codes

### Supabase (via `mcp__supabase__apply_migration`)
- Migration `create_process_payment_webhook_event_rpc`

---

## Task 1 — Create atomic RPC `process_payment_webhook_event`

**Files:**
- Apply via `mcp__supabase__apply_migration` (project `kseaylvmxjpbqahtlypb`)

- [ ] **Step 1: Verify current webhook_events schema is as expected**

Run the following via `mcp__supabase__execute_sql`:

```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_schema='public' AND table_name='webhook_events'
ORDER BY ordinal_position;
```

Expected columns: `id, event_id, event_type, alliance_id, user_id, seasons_added, payload, processed_at`.

- [ ] **Step 2: Apply the RPC migration**

Use `mcp__supabase__apply_migration` with `name="create_process_payment_webhook_event_rpc"` and the SQL below:

```sql
CREATE OR REPLACE FUNCTION public.process_payment_webhook_event(
    p_event_id    text,
    p_event_type  text,
    p_alliance_id uuid,
    p_user_id     uuid,
    p_seasons     integer,
    p_payload     jsonb
)
RETURNS TABLE(status text, available_seasons integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
    v_inserted_rows int;
    v_new_purchased int;
    v_used          int;
BEGIN
    IF p_seasons <= 0 THEN
        RAISE EXCEPTION 'p_seasons must be positive, got %', p_seasons;
    END IF;

    INSERT INTO public.webhook_events (
        event_id, event_type, alliance_id, user_id, seasons_added, payload
    ) VALUES (
        p_event_id, p_event_type, p_alliance_id, p_user_id, p_seasons, p_payload
    )
    ON CONFLICT (event_id) DO NOTHING;

    GET DIAGNOSTICS v_inserted_rows = ROW_COUNT;

    IF v_inserted_rows = 0 THEN
        SELECT a.purchased_seasons, a.used_seasons
          INTO v_new_purchased, v_used
          FROM public.alliances a
         WHERE a.id = p_alliance_id;

        RETURN QUERY SELECT
            'duplicate'::text,
            GREATEST(0, COALESCE(v_new_purchased, 0) - COALESCE(v_used, 0));
        RETURN;
    END IF;

    UPDATE public.alliances
       SET purchased_seasons = purchased_seasons + p_seasons
     WHERE id = p_alliance_id
    RETURNING purchased_seasons, used_seasons
      INTO v_new_purchased, v_used;

    IF v_new_purchased IS NULL THEN
        RAISE EXCEPTION 'Alliance not found: %', p_alliance_id;
    END IF;

    RETURN QUERY SELECT
        'granted'::text,
        GREATEST(0, v_new_purchased - v_used);
END;
$$;

REVOKE ALL ON FUNCTION public.process_payment_webhook_event(text, text, uuid, uuid, integer, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.process_payment_webhook_event(text, text, uuid, uuid, integer, jsonb) TO service_role;
```

- [ ] **Step 3: Smoke-test the RPC with a dry-run event_id**

Via `mcp__supabase__execute_sql`:

```sql
-- First call: should INSERT and grant
SELECT * FROM public.process_payment_webhook_event(
    'plan-task1-smoke-0001',
    'checkout.completed',
    (SELECT id FROM public.alliances LIMIT 1),
    NULL,
    1,
    '{"smoke": true}'::jsonb
);
-- Second call (same event_id): should return 'duplicate'
SELECT * FROM public.process_payment_webhook_event(
    'plan-task1-smoke-0001',
    'checkout.completed',
    (SELECT id FROM public.alliances LIMIT 1),
    NULL,
    1,
    '{"smoke": true}'::jsonb
);
```

Expected: first row `status='granted'`, second row `status='duplicate'`.

- [ ] **Step 4: Clean up smoke-test data + roll back the granted season**

```sql
DELETE FROM public.webhook_events WHERE event_id = 'plan-task1-smoke-0001';
UPDATE public.alliances
   SET purchased_seasons = purchased_seasons - 1
 WHERE id = (SELECT id FROM public.alliances ORDER BY id LIMIT 1)
   AND purchased_seasons > 0;
```

- [ ] **Step 5: Commit migration tracking note**

Nothing to commit in the repo (migration lives in Supabase). Move to Task 2.

---

## Task 2 — Exception hierarchy: `webhook_errors.py`

**Files:**
- Create: `backend/src/core/webhook_errors.py`
- Test: `backend/tests/unit/core/test_webhook_errors.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/unit/core/test_webhook_errors.py`:

```python
"""Tests for webhook error classes."""
import pytest

from src.core.webhook_errors import WebhookPermanentError, WebhookTransientError


class TestWebhookErrors:
    def test_permanent_error_stores_code_and_context(self):
        err = WebhookPermanentError("product_mismatch", event_id="evt_1", product_id="prod_x")
        assert err.code == "product_mismatch"
        assert err.context == {"event_id": "evt_1", "product_id": "prod_x"}
        assert "product_mismatch" in str(err)

    def test_transient_error_stores_code_and_context(self):
        err = WebhookTransientError("db_unreachable", event_id="evt_2")
        assert err.code == "db_unreachable"
        assert err.context == {"event_id": "evt_2"}

    def test_permanent_error_is_not_transient(self):
        assert not issubclass(WebhookPermanentError, WebhookTransientError)
        assert not issubclass(WebhookTransientError, WebhookPermanentError)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/unit/core/test_webhook_errors.py -v`
Expected: ImportError / ModuleNotFoundError on `src.core.webhook_errors`.

- [ ] **Step 3: Implement `webhook_errors.py`**

Create `backend/src/core/webhook_errors.py`:

```python
"""
Webhook processing error classes.

These split webhook failures into two retry buckets:
- PermanentError: return 200 to the gateway (retry is futile) but alert loudly.
- TransientError: return 500 so the gateway retries.

符合 CLAUDE.md 🟡: Domain exceptions — API layer converts to HTTP responses.
"""

from typing import Any


class WebhookProcessingError(Exception):
    """Base class for webhook processing errors."""

    def __init__(self, code: str, **context: Any) -> None:
        self.code = code
        self.context = context
        detail = ", ".join(f"{k}={v}" for k, v in context.items())
        super().__init__(f"{code}({detail})" if detail else code)


class WebhookPermanentError(WebhookProcessingError):
    """
    The event is parsed and signed correctly, but processing cannot succeed
    and retrying will not help. Return 200 to the gateway and alert on-call.

    Examples: unknown product, amount mismatch, user has no alliance.
    """


class WebhookTransientError(WebhookProcessingError):
    """
    Processing failed due to a transient condition. Return 500 to the gateway
    so it retries (idempotency protects us from duplicate grants).

    Examples: database unreachable, PostgREST 5xx.
    """
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/unit/core/test_webhook_errors.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/core/webhook_errors.py backend/tests/unit/core/test_webhook_errors.py
git commit -m "feat(payment): add WebhookPermanentError/TransientError classes"
```

---

## Task 3 — Alerting utility: `alerts.py`

**Files:**
- Create: `backend/src/core/alerts.py`
- Test: `backend/tests/unit/core/test_alerts.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/unit/core/test_alerts.py`:

```python
"""Tests for alert_critical."""
from unittest.mock import AsyncMock, patch

import pytest

from src.core.alerts import alert_critical


@pytest.mark.asyncio
async def test_alert_critical_logs_without_webhook(caplog):
    with patch("src.core.alerts.settings") as mock_settings:
        mock_settings.alert_webhook_url = None
        with caplog.at_level("CRITICAL"):
            await alert_critical("recur.signature_failed", event_id="evt_x")
    assert any("recur.signature_failed" in r.message for r in caplog.records)


@pytest.mark.asyncio
async def test_alert_critical_posts_to_webhook_when_configured():
    mock_client = AsyncMock()
    mock_client.post = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)

    with patch("src.core.alerts.settings") as mock_settings, \
         patch("src.core.alerts.httpx.AsyncClient", return_value=mock_client):
        mock_settings.alert_webhook_url = "https://discord.test/webhook"
        await alert_critical("recur.permanent", event_id="evt_y", reason="amount_mismatch")

    mock_client.post.assert_awaited_once()
    call = mock_client.post.await_args
    assert call.args[0] == "https://discord.test/webhook"
    payload = call.kwargs["json"]
    assert "recur.permanent" in payload["content"]
    assert payload["context"] == {"event_id": "evt_y", "reason": "amount_mismatch"}


@pytest.mark.asyncio
async def test_alert_critical_swallows_webhook_exceptions(caplog):
    mock_client = AsyncMock()
    mock_client.post = AsyncMock(side_effect=RuntimeError("network down"))
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)

    with patch("src.core.alerts.settings") as mock_settings, \
         patch("src.core.alerts.httpx.AsyncClient", return_value=mock_client), \
         caplog.at_level("ERROR"):
        mock_settings.alert_webhook_url = "https://discord.test/webhook"
        # must not raise
        await alert_critical("recur.permanent", event_id="evt_z")

    assert any("alert_webhook_url delivery failed" in r.message for r in caplog.records)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/unit/core/test_alerts.py -v`
Expected: ImportError on `src.core.alerts`.

- [ ] **Step 3: Implement `alerts.py`**

Create `backend/src/core/alerts.py`:

```python
"""
Critical alert delivery.

Logs at CRITICAL and optionally fans out to a webhook (Discord/Slack-compatible
`{content, context}` JSON body). Delivery failure must NEVER propagate — alerts
are best-effort.
"""

import logging
from typing import Any

import httpx

from src.core.config import settings

logger = logging.getLogger(__name__)

_TIMEOUT = httpx.Timeout(3.0)


async def alert_critical(code: str, **context: Any) -> None:
    """
    Emit a critical alert.

    Always logs at CRITICAL. If ``settings.alert_webhook_url`` is set, also
    POSTs ``{"content": "🚨 {code}", "context": {...}}`` to that URL.
    Exceptions from the webhook call are logged but never raised.
    """
    logger.critical("ALERT %s %s", code, context)

    url = getattr(settings, "alert_webhook_url", None)
    if not url:
        return

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            await client.post(
                url,
                json={"content": f"🚨 {code}", "context": context},
            )
    except Exception:
        logger.exception("alert_webhook_url delivery failed code=%s", code)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/unit/core/test_alerts.py -v`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/core/alerts.py backend/tests/unit/core/test_alerts.py
git commit -m "feat(alerts): add alert_critical utility with optional webhook fanout"
```

---

## Task 4 — Config: add Recur product/amount/currency + alert webhook

**Files:**
- Modify: `backend/src/core/config.py`
- Modify: `backend/.env.example`
- Modify: `frontend/.env.example`

- [ ] **Step 1: Add the fields in `config.py`**

In `backend/src/core/config.py`, after the existing `recur_webhook_secret` line, add:

```python
    # Recur product catalog — server is the source of truth for price/product.
    recur_product_id: str | None = None              # Recur product id (prod_*)
    recur_expected_amount_twd: int = 999             # Expected charge in TWD (integer dollars)
    recur_expected_currency: str = "TWD"             # Expected currency code

    # Critical alert webhook (Discord/Slack-compatible). Optional.
    alert_webhook_url: str | None = None
```

- [ ] **Step 2: Update `backend/.env.example`**

Find the Recur section and replace it with:

```
# Recur Payment Gateway
RECUR_SECRET_KEY=sk_live_xxxxxxxxxxxxxxxx
RECUR_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxx
RECUR_PRODUCT_ID=prod_xxxxxxxxxxxxxxxx
RECUR_EXPECTED_AMOUNT_TWD=999
RECUR_EXPECTED_CURRENCY=TWD

# Critical alert webhook (Discord/Slack-compatible). Leave empty to log-only.
ALERT_WEBHOOK_URL=
```

- [ ] **Step 3: Update `frontend/.env.example`**

Ensure the following lines exist (add/replace):

```
# Recur SDK — use pk_live_* in production
VITE_RECUR_PUBLISHABLE_KEY=pk_live_xxxxxxxxxxxxxxxx
VITE_RECUR_PRODUCT_ID=prod_xxxxxxxxxxxxxxxx
```

- [ ] **Step 4: Sanity-run existing config import**

Run: `cd backend && uv run python -c "from src.core.config import settings; print(settings.recur_expected_amount_twd, settings.recur_expected_currency)"`
Expected: `999 TWD` (or the values in your local `.env`).

- [ ] **Step 5: Commit**

```bash
git add backend/src/core/config.py backend/.env.example frontend/.env.example
git commit -m "feat(config): add RECUR_PRODUCT_ID / amount / currency / ALERT_WEBHOOK_URL"
```

---

## Task 5 — `WebhookEventRepository.process_event` via RPC

**Files:**
- Modify: `backend/src/repositories/webhook_event_repository.py` (full rewrite)
- Test: `backend/tests/unit/services/test_webhook_idempotency.py` (rewrite)

- [ ] **Step 1: Write the failing test**

Replace the entire content of `backend/tests/unit/services/test_webhook_idempotency.py` with:

```python
"""Tests for WebhookEventRepository.process_event (RPC wrapper)."""
from unittest.mock import MagicMock, patch
from uuid import UUID

import pytest
from postgrest.exceptions import APIError

from src.repositories.webhook_event_repository import (
    WebhookEventRepository,
    WebhookProcessingResult,
)


ALLIANCE_ID = UUID("22222222-2222-2222-2222-222222222222")
USER_ID = UUID("11111111-1111-1111-1111-111111111111")


def _make_repo() -> WebhookEventRepository:
    with patch("src.repositories.base.get_supabase_client"):
        return WebhookEventRepository()


@pytest.mark.asyncio
async def test_process_event_returns_granted_result():
    repo = _make_repo()
    rpc_result = MagicMock()
    rpc_result.data = [{"status": "granted", "available_seasons": 5}]
    repo.client.rpc = MagicMock(return_value=MagicMock(execute=MagicMock(return_value=rpc_result)))

    result = await repo.process_event(
        event_id="evt_1",
        event_type="checkout.completed",
        alliance_id=ALLIANCE_ID,
        user_id=USER_ID,
        seasons=1,
        payload={"amount": 999},
    )

    assert result == WebhookProcessingResult(status="granted", available_seasons=5)
    repo.client.rpc.assert_called_once_with(
        "process_payment_webhook_event",
        {
            "p_event_id": "evt_1",
            "p_event_type": "checkout.completed",
            "p_alliance_id": str(ALLIANCE_ID),
            "p_user_id": str(USER_ID),
            "p_seasons": 1,
            "p_payload": {"amount": 999},
        },
    )


@pytest.mark.asyncio
async def test_process_event_returns_duplicate_result():
    repo = _make_repo()
    rpc_result = MagicMock()
    rpc_result.data = [{"status": "duplicate", "available_seasons": 3}]
    repo.client.rpc = MagicMock(return_value=MagicMock(execute=MagicMock(return_value=rpc_result)))

    result = await repo.process_event(
        event_id="evt_dup",
        event_type="checkout.completed",
        alliance_id=ALLIANCE_ID,
        user_id=USER_ID,
        seasons=1,
        payload={},
    )
    assert result == WebhookProcessingResult(status="duplicate", available_seasons=3)


@pytest.mark.asyncio
async def test_process_event_raises_on_empty_rpc_response():
    repo = _make_repo()
    rpc_result = MagicMock()
    rpc_result.data = []
    repo.client.rpc = MagicMock(return_value=MagicMock(execute=MagicMock(return_value=rpc_result)))

    with pytest.raises(RuntimeError, match="RPC returned no rows"):
        await repo.process_event(
            event_id="evt_2",
            event_type="checkout.completed",
            alliance_id=ALLIANCE_ID,
            user_id=USER_ID,
            seasons=1,
            payload={},
        )


@pytest.mark.asyncio
async def test_process_event_propagates_api_error():
    repo = _make_repo()
    api_err = APIError({"message": "boom", "code": "XX000"})
    repo.client.rpc = MagicMock(return_value=MagicMock(execute=MagicMock(side_effect=api_err)))

    with pytest.raises(APIError):
        await repo.process_event(
            event_id="evt_3",
            event_type="checkout.completed",
            alliance_id=ALLIANCE_ID,
            user_id=USER_ID,
            seasons=1,
            payload={},
        )
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/unit/services/test_webhook_idempotency.py -v`
Expected: ImportError on `WebhookProcessingResult` / `process_event`.

- [ ] **Step 3: Rewrite `webhook_event_repository.py`**

Replace the entire file with:

```python
"""
Webhook Event Repository

Thin wrapper around the atomic Postgres RPC ``process_payment_webhook_event``
which performs idempotency claim + audit write + season grant in one
transaction.

符合 CLAUDE.md 🔴: Inherits SupabaseRepository; no direct table mutation for
payment-grant logic — all behavior goes through the RPC.
"""

import logging
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from src.repositories.base import SupabaseRepository

logger = logging.getLogger(__name__)

RPC_NAME = "process_payment_webhook_event"


class WebhookEvent(BaseModel):
    """Audit row in ``webhook_events``. Read-only from the app layer."""

    model_config = ConfigDict(from_attributes=True)

    id: str | None = None
    event_id: str
    event_type: str
    alliance_id: str | None = None
    user_id: str | None = None
    seasons_added: int = 0
    payload: dict[str, object] | None = None


class WebhookProcessingResult(BaseModel):
    """Result returned by the atomic RPC."""

    status: Literal["granted", "duplicate"]
    available_seasons: int


class WebhookEventRepository(SupabaseRepository[WebhookEvent]):
    """Repository wrapping the atomic payment-webhook RPC."""

    def __init__(self) -> None:
        super().__init__(table_name="webhook_events", model_class=WebhookEvent)

    async def process_event(
        self,
        *,
        event_id: str,
        event_type: str,
        alliance_id: UUID,
        user_id: UUID,
        seasons: int,
        payload: dict,
    ) -> WebhookProcessingResult:
        """
        Atomically claim + audit + grant via ``process_payment_webhook_event``.

        Returns ``WebhookProcessingResult(status="granted"|"duplicate", available_seasons=int)``.

        Raises:
            postgrest.exceptions.APIError: transient DB/RPC failures.
            RuntimeError: RPC returned an empty result (should not happen).
        """
        params = {
            "p_event_id": event_id,
            "p_event_type": event_type,
            "p_alliance_id": str(alliance_id),
            "p_user_id": str(user_id),
            "p_seasons": seasons,
            "p_payload": payload,
        }

        result = await self._execute_async(
            lambda: self.client.rpc(RPC_NAME, params).execute()
        )

        rows = result.data or []
        if not rows:
            raise RuntimeError(f"{RPC_NAME} RPC returned no rows for event_id={event_id}")

        row = rows[0]
        return WebhookProcessingResult(
            status=row["status"],
            available_seasons=int(row["available_seasons"]),
        )
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/unit/services/test_webhook_idempotency.py -v`
Expected: 4 PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/repositories/webhook_event_repository.py backend/tests/unit/services/test_webhook_idempotency.py
git commit -m "refactor(payment): replace claim/update two-phase with atomic RPC wrapper"
```

---

## Task 6 — Rewrite `PaymentService.handle_payment_success`

**Files:**
- Modify: `backend/src/services/payment_service.py` (full rewrite)
- Test: `backend/tests/unit/services/test_payment_service.py` (full rewrite)

- [ ] **Step 1: Write the failing test (full file replacement)**

Replace `backend/tests/unit/services/test_payment_service.py` with:

```python
"""
Unit Tests for PaymentService (server-authoritative validation + atomic RPC).
"""
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID

import pytest

from src.core.webhook_errors import WebhookPermanentError, WebhookTransientError
from src.repositories.webhook_event_repository import WebhookProcessingResult
from src.services.payment_service import PaymentService


USER_ID = UUID("11111111-1111-1111-1111-111111111111")
ALLIANCE_ID = UUID("22222222-2222-2222-2222-222222222222")
PRODUCT_ID = "prod_test_999"


@pytest.fixture
def fake_settings():
    with patch("src.services.payment_service.settings") as s:
        s.recur_product_id = PRODUCT_ID
        s.recur_expected_amount_twd = 999
        s.recur_expected_currency = "TWD"
        yield s


@pytest.fixture
def mock_alliance():
    a = MagicMock()
    a.id = ALLIANCE_ID
    return a


@pytest.fixture
def service(fake_settings, mock_alliance):
    svc = PaymentService()
    svc._quota_service = MagicMock()
    svc._quota_service.get_alliance_by_user = AsyncMock(return_value=mock_alliance)
    svc._webhook_repo = MagicMock()
    svc._webhook_repo.process_event = AsyncMock(
        return_value=WebhookProcessingResult(status="granted", available_seasons=5)
    )
    return svc


def _valid_event_data() -> dict:
    return {
        "externalCustomerId": str(USER_ID),
        "productId": PRODUCT_ID,
        "amount": 999,
        "currency": "TWD",
    }


class TestHandlePaymentSuccess:
    @pytest.mark.asyncio
    async def test_happy_path_grants_one_season(self, service):
        result = await service.handle_payment_success(
            _valid_event_data(), event_id="evt_1", event_type="checkout.completed"
        )
        assert result == {
            "status": "granted",
            "alliance_id": str(ALLIANCE_ID),
            "user_id": str(USER_ID),
            "seasons_added": 1,
            "available_seasons": 5,
        }
        service._webhook_repo.process_event.assert_awaited_once()
        call_kwargs = service._webhook_repo.process_event.await_args.kwargs
        assert call_kwargs["seasons"] == 1
        assert call_kwargs["alliance_id"] == ALLIANCE_ID
        assert call_kwargs["user_id"] == USER_ID

    @pytest.mark.asyncio
    async def test_duplicate_event_returns_duplicate_status(self, service):
        service._webhook_repo.process_event = AsyncMock(
            return_value=WebhookProcessingResult(status="duplicate", available_seasons=5)
        )
        result = await service.handle_payment_success(
            _valid_event_data(), event_id="evt_dup", event_type="checkout.completed"
        )
        assert result["status"] == "duplicate"
        assert result["seasons_added"] == 0

    @pytest.mark.asyncio
    async def test_missing_event_id_is_permanent(self, service):
        with pytest.raises(WebhookPermanentError) as ei:
            await service.handle_payment_success(_valid_event_data(), event_id=None)
        assert ei.value.code == "missing_event_id"

    @pytest.mark.asyncio
    async def test_missing_external_customer_id_is_permanent(self, service):
        data = _valid_event_data()
        data.pop("externalCustomerId")
        with pytest.raises(WebhookPermanentError) as ei:
            await service.handle_payment_success(data, event_id="evt_1")
        assert ei.value.code == "missing_external_customer_id"

    @pytest.mark.asyncio
    async def test_invalid_uuid_is_permanent(self, service):
        data = _valid_event_data()
        data["externalCustomerId"] = "not-a-uuid"
        with pytest.raises(WebhookPermanentError) as ei:
            await service.handle_payment_success(data, event_id="evt_1")
        assert ei.value.code == "invalid_external_customer_id"

    @pytest.mark.asyncio
    async def test_legacy_quantity_format_rejected(self, service):
        """The old `user_id:quantity` format must be rejected — no back-compat."""
        data = _valid_event_data()
        data["externalCustomerId"] = f"{USER_ID}:1"
        with pytest.raises(WebhookPermanentError) as ei:
            await service.handle_payment_success(data, event_id="evt_1")
        assert ei.value.code == "invalid_external_customer_id"

    @pytest.mark.asyncio
    async def test_product_mismatch_is_permanent(self, service):
        data = _valid_event_data()
        data["productId"] = "prod_other"
        with pytest.raises(WebhookPermanentError) as ei:
            await service.handle_payment_success(data, event_id="evt_1")
        assert ei.value.code == "product_mismatch"

    @pytest.mark.asyncio
    async def test_missing_product_is_permanent(self, service):
        data = _valid_event_data()
        data.pop("productId")
        with pytest.raises(WebhookPermanentError) as ei:
            await service.handle_payment_success(data, event_id="evt_1")
        assert ei.value.code == "product_mismatch"

    @pytest.mark.asyncio
    async def test_amount_mismatch_is_permanent(self, service):
        data = _valid_event_data()
        data["amount"] = 1
        with pytest.raises(WebhookPermanentError) as ei:
            await service.handle_payment_success(data, event_id="evt_1")
        assert ei.value.code == "amount_mismatch"

    @pytest.mark.asyncio
    async def test_currency_mismatch_is_permanent(self, service):
        data = _valid_event_data()
        data["currency"] = "USD"
        with pytest.raises(WebhookPermanentError) as ei:
            await service.handle_payment_success(data, event_id="evt_1")
        assert ei.value.code == "currency_mismatch"

    @pytest.mark.asyncio
    async def test_user_without_alliance_is_permanent(self, service):
        service._quota_service.get_alliance_by_user = AsyncMock(return_value=None)
        with pytest.raises(WebhookPermanentError) as ei:
            await service.handle_payment_success(_valid_event_data(), event_id="evt_1")
        assert ei.value.code == "alliance_not_found"

    @pytest.mark.asyncio
    async def test_rpc_api_error_is_transient(self, service):
        from postgrest.exceptions import APIError
        service._webhook_repo.process_event = AsyncMock(
            side_effect=APIError({"message": "boom", "code": "53300"})
        )
        with pytest.raises(WebhookTransientError) as ei:
            await service.handle_payment_success(_valid_event_data(), event_id="evt_1")
        assert ei.value.code == "rpc_api_error"

    @pytest.mark.asyncio
    async def test_alliance_lookup_os_error_is_transient(self, service):
        service._quota_service.get_alliance_by_user = AsyncMock(side_effect=OSError("db down"))
        with pytest.raises(WebhookTransientError) as ei:
            await service.handle_payment_success(_valid_event_data(), event_id="evt_1")
        assert ei.value.code == "alliance_lookup_failed"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/unit/services/test_payment_service.py -v`
Expected: tests fail (old `PaymentService.handle_payment_success` still uses `:quantity`, no product validation).

- [ ] **Step 3: Rewrite `payment_service.py`**

Replace `backend/src/services/payment_service.py` with:

```python
"""
Payment Service — Recur webhook processing.

Responsibilities:
    1. Validate that the event's product/amount/currency match server config.
    2. Resolve the buyer's alliance.
    3. Call the atomic ``process_payment_webhook_event`` RPC to claim + grant.

Errors are raised as ``WebhookPermanentError`` or ``WebhookTransientError``
so the API layer can translate to the correct HTTP status.
"""

import logging
from uuid import UUID

from postgrest.exceptions import APIError

from src.core.config import settings
from src.core.webhook_errors import WebhookPermanentError, WebhookTransientError
from src.repositories.webhook_event_repository import (
    WebhookEventRepository,
    WebhookProcessingResult,
)
from src.services.season_quota_service import SeasonQuotaService

logger = logging.getLogger(__name__)

# One product = one season. Quantity is NEVER taken from the event.
SEASONS_PER_PURCHASE = 1


class PaymentService:
    def __init__(self) -> None:
        self._quota_service = SeasonQuotaService()
        self._webhook_repo = WebhookEventRepository()

    async def handle_payment_success(
        self,
        event_data: dict,
        *,
        event_id: str | None = None,
        event_type: str = "checkout.completed",
    ) -> dict:
        """
        Validate + grant for a ``checkout.completed`` / ``order.paid`` event.

        Returns a dict describing the outcome. Raises ``WebhookPermanentError``
        for unretryable problems and ``WebhookTransientError`` for retryable
        problems.
        """
        if not event_id:
            raise WebhookPermanentError("missing_event_id")

        user_id = self._extract_user_id(event_data, event_id=event_id)
        self._validate_product(event_data, event_id=event_id)
        self._validate_amount(event_data, event_id=event_id)
        self._validate_currency(event_data, event_id=event_id)

        try:
            alliance = await self._quota_service.get_alliance_by_user(user_id)
        except (APIError, OSError) as e:
            raise WebhookTransientError(
                "alliance_lookup_failed", event_id=event_id, user_id=str(user_id)
            ) from e

        if alliance is None:
            raise WebhookPermanentError(
                "alliance_not_found", event_id=event_id, user_id=str(user_id)
            )

        try:
            result: WebhookProcessingResult = await self._webhook_repo.process_event(
                event_id=event_id,
                event_type=event_type,
                alliance_id=alliance.id,
                user_id=user_id,
                seasons=SEASONS_PER_PURCHASE,
                payload=event_data,
            )
        except APIError as e:
            raise WebhookTransientError("rpc_api_error", event_id=event_id) from e
        except OSError as e:
            raise WebhookTransientError("rpc_os_error", event_id=event_id) from e

        if result.status == "duplicate":
            logger.info("Duplicate webhook skipped event_id=%s", event_id)
            return {
                "status": "duplicate",
                "alliance_id": str(alliance.id),
                "user_id": str(user_id),
                "seasons_added": 0,
                "available_seasons": result.available_seasons,
            }

        logger.info(
            "Season granted event_id=%s alliance_id=%s user_id=%s available=%s",
            event_id, alliance.id, user_id, result.available_seasons,
        )
        return {
            "status": "granted",
            "alliance_id": str(alliance.id),
            "user_id": str(user_id),
            "seasons_added": SEASONS_PER_PURCHASE,
            "available_seasons": result.available_seasons,
        }

    # ------------------------------------------------------------------
    # Validation helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _extract_user_id(event_data: dict, *, event_id: str) -> UUID:
        raw = event_data.get("externalCustomerId") or event_data.get("external_customer_id")
        if not raw:
            raise WebhookPermanentError("missing_external_customer_id", event_id=event_id)
        try:
            return UUID(str(raw))
        except (ValueError, TypeError) as e:
            raise WebhookPermanentError(
                "invalid_external_customer_id", event_id=event_id, raw=str(raw)
            ) from e

    @staticmethod
    def _validate_product(event_data: dict, *, event_id: str) -> None:
        expected = settings.recur_product_id
        actual = event_data.get("productId") or event_data.get("product_id")
        if not expected or actual != expected:
            raise WebhookPermanentError(
                "product_mismatch", event_id=event_id, expected=expected, actual=actual
            )

    @staticmethod
    def _validate_amount(event_data: dict, *, event_id: str) -> None:
        expected = settings.recur_expected_amount_twd
        raw = event_data.get("amount")
        try:
            actual = int(raw) if raw is not None else None
        except (TypeError, ValueError) as e:
            raise WebhookPermanentError(
                "amount_mismatch", event_id=event_id, expected=expected, actual=raw
            ) from e
        if actual != expected:
            raise WebhookPermanentError(
                "amount_mismatch", event_id=event_id, expected=expected, actual=actual
            )

    @staticmethod
    def _validate_currency(event_data: dict, *, event_id: str) -> None:
        expected = (settings.recur_expected_currency or "TWD").upper()
        actual = (event_data.get("currency") or expected).upper()
        if actual != expected:
            raise WebhookPermanentError(
                "currency_mismatch", event_id=event_id, expected=expected, actual=actual
            )
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/unit/services/test_payment_service.py -v`
Expected: all tests PASS (13 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/payment_service.py backend/tests/unit/services/test_payment_service.py
git commit -m "refactor(payment): server-authoritative product/amount validation + atomic RPC"
```

---

## Task 7 — Rewrite `webhooks.py` error handling

**Files:**
- Modify: `backend/src/api/v1/endpoints/webhooks.py`
- Modify: `backend/tests/unit/endpoints/test_webhooks.py`

- [ ] **Step 1: Write the failing test — add cases**

Append to `backend/tests/unit/endpoints/test_webhooks.py` (keep existing signature tests):

```python
# =============================================================================
# Error classification tests
# =============================================================================
import base64
import hashlib
import hmac
import json
from unittest.mock import AsyncMock, patch

import pytest


def _sign(body: bytes, secret: str) -> str:
    return base64.b64encode(
        hmac.new(secret.encode(), body, hashlib.sha256).digest()
    ).decode()


@pytest.mark.asyncio
async def test_permanent_error_returns_200_and_alerts(async_client):
    from src.core.webhook_errors import WebhookPermanentError

    secret = "test_secret_permanent"
    body = json.dumps({
        "id": "evt_perm_1",
        "type": "checkout.completed",
        "data": {},
    }).encode()
    sig = _sign(body, secret)

    with patch("src.api.v1.endpoints.webhooks.settings") as s, \
         patch("src.api.v1.endpoints.webhooks.PaymentService") as PS, \
         patch("src.api.v1.endpoints.webhooks.alert_critical", new=AsyncMock()) as alert:
        s.recur_webhook_secret = secret
        PS.return_value.handle_payment_success = AsyncMock(
            side_effect=WebhookPermanentError("product_mismatch", event_id="evt_perm_1")
        )
        resp = await async_client.post(
            "/api/v1/webhooks/recur", content=body,
            headers={"x-recur-signature": sig, "content-type": "application/json"},
        )

    assert resp.status_code == 200
    assert resp.json()["status"] == "permanent_failure"
    alert.assert_awaited_once()
    assert alert.await_args.args[0] == "recur.webhook.permanent"


@pytest.mark.asyncio
async def test_transient_error_returns_500(async_client):
    from src.core.webhook_errors import WebhookTransientError

    secret = "test_secret_transient"
    body = json.dumps({
        "id": "evt_trans_1",
        "type": "checkout.completed",
        "data": {},
    }).encode()
    sig = _sign(body, secret)

    with patch("src.api.v1.endpoints.webhooks.settings") as s, \
         patch("src.api.v1.endpoints.webhooks.PaymentService") as PS:
        s.recur_webhook_secret = secret
        PS.return_value.handle_payment_success = AsyncMock(
            side_effect=WebhookTransientError("rpc_api_error", event_id="evt_trans_1")
        )
        resp = await async_client.post(
            "/api/v1/webhooks/recur", content=body,
            headers={"x-recur-signature": sig, "content-type": "application/json"},
        )

    assert resp.status_code == 500


@pytest.mark.asyncio
async def test_signature_failure_alerts(async_client):
    secret = "test_secret_sig"
    body = b'{"id":"evt_sig","type":"checkout.completed","data":{}}'
    bad_sig = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="

    with patch("src.api.v1.endpoints.webhooks.settings") as s, \
         patch("src.api.v1.endpoints.webhooks.alert_critical", new=AsyncMock()) as alert:
        s.recur_webhook_secret = secret
        resp = await async_client.post(
            "/api/v1/webhooks/recur", content=body,
            headers={"x-recur-signature": bad_sig, "content-type": "application/json"},
        )

    assert resp.status_code == 401
    alert.assert_awaited_once()
    assert alert.await_args.args[0] == "recur.webhook.signature_failed"
```

(If `async_client` fixture does not yet exist, reuse whatever client fixture the existing `test_webhooks.py` already uses; do not invent a new one.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && uv run pytest tests/unit/endpoints/test_webhooks.py -v`
Expected: the new tests fail (endpoint still returns 200 with `{"error": ...}` on permanent, no `alert_critical` call).

- [ ] **Step 3: Rewrite `webhooks.py`**

Replace the function body of `recur_webhook` and the imports. Full file:

```python
"""
Webhook Endpoints - External Service Integrations.

Recur gateway only. Error classification:
    - Invalid signature           → 401 + alert
    - Invalid JSON                → 400
    - Duplicate event             → 200 (idempotent)
    - WebhookPermanentError       → 200 + alert (don't retry)
    - WebhookTransientError       → 500 (Recur retries)
    - Unknown exception           → 500 + log

符合 CLAUDE.md 🟡: API layer = HTTP translation; business logic lives in PaymentService.
"""

import base64
import hashlib
import hmac
import logging

from fastapi import APIRouter, Header, HTTPException, Request, status

from src.core.alerts import alert_critical
from src.core.config import settings
from src.core.rate_limit import WEBHOOK_RATE, limiter
from src.core.webhook_errors import WebhookPermanentError, WebhookTransientError
from src.services.payment_service import PaymentService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/webhooks", tags=["webhooks"])


def verify_recur_signature(payload: bytes, signature: str, secret: str) -> bool:
    """HMAC-SHA256 + Base64, constant-time compare."""
    if not signature or not secret:
        return False

    computed = hmac.new(secret.encode("utf-8"), payload, hashlib.sha256).digest()
    expected = base64.b64encode(computed).decode("utf-8")
    try:
        return hmac.compare_digest(signature.strip(), expected)
    except (TypeError, ValueError):
        return False


@router.post("/recur")
@limiter.limit(WEBHOOK_RATE)
async def recur_webhook(
    request: Request,
    x_recur_signature: str | None = Header(None, alias="x-recur-signature"),
):
    payload = await request.body()

    if not settings.recur_webhook_secret:
        logger.warning("RECUR_WEBHOOK_SECRET not configured; rejecting webhook")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Webhook signature verification is not configured",
        )

    if not verify_recur_signature(
        payload=payload,
        signature=x_recur_signature or "",
        secret=settings.recur_webhook_secret,
    ):
        await alert_critical(
            "recur.webhook.signature_failed",
            source_ip=getattr(request.client, "host", None),
            bytes=len(payload),
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid signature",
        )

    try:
        event = await request.json()
    except Exception as e:
        logger.error("Failed to parse webhook payload: %s", e)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid JSON payload",
        ) from e

    event_type = event.get("type")
    event_id = event.get("id")
    event_data = event.get("data", {}) or {}

    logger.info("Recur webhook received type=%s id=%s", event_type, event_id)

    payment_service = PaymentService()

    try:
        if event_type in ("checkout.completed", "order.paid"):
            result = await payment_service.handle_payment_success(
                event_data, event_id=event_id, event_type=event_type,
            )
            return {"received": True, **result}

        if event_type == "order.payment_failed":
            logger.warning(
                "Payment failed event_id=%s customer=%s amount=%s reason=%s",
                event_id,
                event_data.get("externalCustomerId"),
                event_data.get("amount"),
                event_data.get("failureReason"),
            )
            return {"received": True, "status": "payment_failed_logged"}

        logger.info("Unhandled Recur event type: %s", event_type)
        return {"received": True, "status": "ignored"}

    except WebhookPermanentError as e:
        await alert_critical("recur.webhook.permanent", code=e.code, **e.context)
        return {"received": True, "status": "permanent_failure", "code": e.code}

    except WebhookTransientError as e:
        logger.error("Transient webhook error code=%s context=%s", e.code, e.context)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"transient:{e.code}",
        ) from e

    except Exception as e:
        logger.exception("Unexpected error processing webhook type=%s", event_type)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal error processing webhook",
        ) from e
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && uv run pytest tests/unit/endpoints/test_webhooks.py -v`
Expected: all tests PASS (existing + 3 new).

- [ ] **Step 5: Commit**

```bash
git add backend/src/api/v1/endpoints/webhooks.py backend/tests/unit/endpoints/test_webhooks.py
git commit -m "refactor(webhook): permanent vs transient error classification + critical alerts"
```

---

## Task 8 — Update integration tests for new RPC flow

**Files:**
- Modify: `backend/tests/integration/test_payment_to_season_flow.py`
- Modify: `backend/tests/integration/test_webhook_endpoint_flow.py`

- [ ] **Step 1: Inspect what the integration tests currently assert**

Run: `cd backend && uv run pytest tests/integration -v --no-header 2>&1 | head -80`
Expected: several failures referencing `try_claim_event`, `:quantity`, `increment_purchased_seasons`.

- [ ] **Step 2: Rewrite `test_payment_to_season_flow.py`**

Replace any use of `mock_alliance_repo.increment_purchased_seasons` and `mock_webhook_repo.try_claim_event` with mocking `WebhookEventRepository.process_event`. Every event payload must include `productId=PRODUCT_ID`, `amount=999`, `currency="TWD"`, and `externalCustomerId=str(USER_ID)` (no `:n` suffix).

Replace the `mock_webhook_repo` fixture:

```python
from src.repositories.webhook_event_repository import WebhookProcessingResult


@pytest.fixture
def mock_webhook_repo():
    repo = MagicMock()
    repo.process_event = AsyncMock(
        return_value=WebhookProcessingResult(status="granted", available_seasons=1)
    )
    return repo
```

Remove any assertions that touch `increment_purchased_seasons` — the RPC now owns that. Replace with:

```python
mock_webhook_repo.process_event.assert_awaited_once()
kwargs = mock_webhook_repo.process_event.await_args.kwargs
assert kwargs["seasons"] == 1
assert kwargs["alliance_id"] == ALLIANCE_ID
```

For "duplicate event" cases, configure:

```python
mock_webhook_repo.process_event = AsyncMock(
    return_value=WebhookProcessingResult(status="duplicate", available_seasons=1)
)
```

Every test's `event_data` must be:

```python
event_data = {
    "externalCustomerId": str(USER_ID),
    "productId": PRODUCT_ID,
    "amount": 999,
    "currency": "TWD",
}
```

Add a module-level `PRODUCT_ID = "prod_test_999"` and `@pytest.fixture(autouse=True)` to patch `src.services.payment_service.settings` with the same product/amount/currency (see Task 6 `fake_settings` fixture — reuse the pattern).

- [ ] **Step 3: Rewrite `test_webhook_endpoint_flow.py`**

Same treatment: event bodies get `productId`/`amount`/`currency`; legacy assertions on `ValueError → 200 with {"error": ...}` become `WebhookPermanentError → 200 with {"status": "permanent_failure"}`. Patch `settings` and `PaymentService._webhook_repo.process_event` as above.

- [ ] **Step 4: Run the integration tests**

Run: `cd backend && uv run pytest tests/integration -v`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add backend/tests/integration/test_payment_to_season_flow.py backend/tests/integration/test_webhook_endpoint_flow.py
git commit -m "test(payment): update integration tests for RPC-based atomic webhook flow"
```

---

## Task 9 — Frontend: bare-UUID `externalCustomerId`

**Files:**
- Modify: `frontend/src/pages/PurchaseSeason.tsx`

- [ ] **Step 1: Replace the `externalCustomerId` line**

In `frontend/src/pages/PurchaseSeason.tsx`, find:

```tsx
      // Format: user_id:quantity - used by webhook to grant seasons
      // Fixed to 1 season per purchase (Recur ONE_TIME products don't support quantity)
      const externalCustomerId = `${user.id}:1`
```

Replace with:

```tsx
      // externalCustomerId = user UUID ONLY. The server treats every successful
      // checkout as exactly 1 season for the configured product. Do NOT encode
      // quantity client-side — the webhook would trust it.
      const externalCustomerId = user.id
```

- [ ] **Step 2: Run frontend typecheck**

Run: `cd frontend && npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Run frontend tests**

Run: `cd frontend && npm test -- --run`
Expected: all existing tests green (no test currently pins the `:1` format).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/PurchaseSeason.tsx
git commit -m "fix(payment): stop sending quantity in externalCustomerId; server is source of truth"
```

---

## Task 10 — Final verification: full backend suite + lint

**Files:** none

- [ ] **Step 1: Run the full backend test suite**

Run: `cd backend && uv run pytest -q`
Expected: all tests pass (unit + integration).

- [ ] **Step 2: Run ruff / linters if configured**

Run: `cd backend && uv run ruff check src tests`
Expected: no new lint errors. Fix any you caused.

- [ ] **Step 3: Frontend build sanity**

Run: `cd frontend && npm run build`
Expected: build succeeds.

- [ ] **Step 4: Grep for dead references to removed APIs**

Use the Grep tool:
- Pattern `try_claim_event` — expected zero hits.
- Pattern `update_event_details` — expected zero hits.
- Pattern `_parse_external_customer_id` — expected zero hits.
- Pattern `:quantity` in payment-related code — expected zero hits.
- Pattern `"${user.id}:` in frontend — expected zero hits.

If any hit exists, go back and remove it.

- [ ] **Step 5: Commit any lint / cleanup fixes**

```bash
git add -A
git status   # confirm only intended files
git commit -m "chore(payment): final cleanup after webhook hardening"  # if needed
```

---

## Task 11 — Production deployment checklist (manual, not auto-executable)

These steps are performed by the operator, not the plan executor. List them here so nothing is missed.

- [ ] Set Zeabur env vars on the production backend:
  - `RECUR_SECRET_KEY=sk_live_…`
  - `RECUR_WEBHOOK_SECRET=whsec_…` (the PRODUCTION one, not sandbox)
  - `RECUR_PRODUCT_ID=prod_…`
  - `RECUR_EXPECTED_AMOUNT_TWD=999`
  - `RECUR_EXPECTED_CURRENCY=TWD`
  - `ALERT_WEBHOOK_URL=…` (Discord channel webhook recommended)
- [ ] Set Zeabur env vars on the production frontend:
  - `VITE_RECUR_PUBLISHABLE_KEY=pk_live_…`
  - `VITE_RECUR_PRODUCT_ID=prod_…`
- [ ] In the Recur dashboard, register the production webhook URL:
  `https://api.tktmanager.com/api/v1/webhooks/recur`
- [ ] Trigger one real NT$999 purchase end-to-end; verify:
  - UI shows success banner
  - `webhook_events` has a row with correct `alliance_id`, `user_id`, `seasons_added=1`, full `payload`
  - `alliances.purchased_seasons` incremented by 1
  - Alert webhook did NOT fire (no `recur.webhook.permanent` / `recur.webhook.signature_failed`)
- [ ] Issue a refund through Recur for the test purchase (seasons will NOT be auto-decremented — this is an accepted business rule for v1; add a future ticket if that changes).

---

## Self-Review Notes

- **Spec coverage:** product/amount/currency validation (Task 6); atomic claim+grant (Tasks 1 + 5); error classification (Tasks 2 + 6 + 7); alerting (Task 3 + signature failure in Task 7); frontend hardening (Task 9); env config (Task 4); tests rewritten (Tasks 5, 6, 7, 8); manual go-live checklist (Task 11). ✔
- **No placeholders:** every code step contains full code; every command has an expected result.
- **Type consistency:** `WebhookProcessingResult(status, available_seasons)` used identically across repo / service / tests. `process_event(event_id, event_type, alliance_id, user_id, seasons, payload)` signature matches in Task 5 (impl) and Task 6 (test call site).
- **Out of scope (intentionally):** multi-product / multi-quantity support, automatic refund → decrement. Both are new business features and should be separate plans.
