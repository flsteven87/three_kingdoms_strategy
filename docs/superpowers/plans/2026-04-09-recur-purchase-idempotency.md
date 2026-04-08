# Recur Purchase-Level Idempotency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the Recur same-order double-grant bug by making `checkout_id` the purchase-level idempotency key, restricting grants to `order.paid` only, and adding a DB-level partial unique index as a third safety net.

**Architecture:** Three layers of defense around a single business invariant — "one Recur purchase = one season grant":
1. **Policy layer (service)**: Only `order.paid` triggers a grant. `checkout.completed` writes an audit row with `seasons_added=0`.
2. **Serialization layer (RPC)**: Advisory lock on `hashtext(checkout_id)` + existence check on sibling grants inside a SECURITY DEFINER plpgsql function.
3. **Storage layer (DB)**: Partial unique index `(checkout_id) WHERE seasons_added > 0` — atomic last line of defense against any policy regression or race.

The RPC signature gains `p_checkout_id` and `p_order_id`. The Python service extracts these from the real Recur payload shape (verified via Supabase MCP inspection of row `bw640ymshi74ogw4u5g2xgzr`). Currency validation is tightened from lenient-default to strict (verified `currency` is always present in real payloads). Before the partial unique index is created, the existing `乃罷` alliance double-grant is reconciled (demote one row + decrement `purchased_seasons` by 1).

**Tech Stack:** PostgreSQL 17 (Supabase), plpgsql, FastAPI, Pydantic V2, pytest, Supabase MCP for DDL application.

---

## Key Facts (verified via Supabase MCP on 2026-04-09)

**Real `order.paid` payload shape:**
```json
{
  "id": "nfegpk8ok8gp12h7xhi0q49w",
  "order_id": "nfegpk8ok8gp12h7xhi0q49w",
  "checkout_id": "bw640ymshi74ogw4u5g2xgzr",
  "amount": 999,
  "currency": "TWD",
  "status": "PAID",
  "product_id": "bmbzr9p44vj8fx5pkp3iquo2",
  "customer": {
    "id": "qo9zlcbbgpmxmz5bg2rq6qz0",
    "external_id": "05a30b5f-95f1-4953-8355-5fd187751952",
    "email": "flsteven87@gmail.com",
    "name": "Steven Wu"
  },
  "billing_reason": "purchase",
  "payment_method": "card"
}
```

**Real `checkout.completed` payload shape:**
```json
{
  "id": "bw640ymshi74ogw4u5g2xgzr",
  "amount": 999,
  "currency": "TWD",
  "status": "COMPLETED",
  "product_id": "bmbzr9p44vj8fx5pkp3iquo2",
  "customer": {
    "id": "qo9zlcbbgpmxmz5bg2rq6qz0",
    "external_id": "05a30b5f-95f1-4953-8355-5fd187751952"
  }
}
```

**Key observations:**
- `checkout_id` is the purchase-level idempotency key. It equals `checkout.completed.payload.id` AND `order.paid.payload.checkout_id`.
- `order_id` only exists on `order.paid`. (Cannot be used as universal key.)
- `customer.external_id` uses **snake_case only** in real payloads. `externalId` camelCase fallback has never fired in production but is kept for defense in tests.
- `currency` is ALWAYS present with value `"TWD"`. Lenient default is dead code — strict is safe.
- `乃罷` alliance (`5bcff59d-f79a-400a-82dc-06fce368e501`) currently has `purchased_seasons=12, used_seasons=5`. Only one real NT$999 was paid; correct value is 11. Reconciliation = `-1`.
- Current DB has: `webhook_events` table, UNIQUE KEY on `event_id`, redundant btree `idx_webhook_events_event_id`, and `process_payment_webhook_event(p_event_id, p_event_type, p_alliance_id, p_user_id, p_seasons, p_payload)` RPC with `ON CONFLICT (event_id) DO NOTHING`.

**Supabase project id:** `kseaylvmxjpbqahtlypb`

---

## File Structure

**Create:**
- `backend/migrations/20260409_webhook_events_purchase_idempotency.sql` — schema migration (add columns, backfill, reconcile, partial unique index, check constraint, drop redundant index)
- `backend/migrations/20260409_process_payment_webhook_event_v2.sql` — new RPC body (source of truth, applied via `apply_migration`)
- `backend/tests/fixtures/recur_payloads.py` — real captured Recur webhook payloads as reusable test fixtures

**Modify:**
- `backend/src/repositories/webhook_event_repository.py` — add `p_checkout_id` / `p_order_id` params, widen `WebhookProcessingResult.status` literal
- `backend/src/services/payment_service.py` — event-type whitelist, `seasons=0` for `checkout.completed`, extract `checkout_id` / `order_id`, strict currency, legacy-suffix warning log, known-event-type guard
- `backend/tests/unit/services/test_payment_service.py` — use real payload fixtures, add event-type routing tests, tighten currency expectations
- `backend/tests/unit/services/test_webhook_idempotency.py` — update RPC call signature, add purchase-level idempotency path tests

**Do NOT touch in this plan (tracked as follow-ups):**
- Frontend banner `已新增 1 季額度` hardcode — separate plan
- `ALERT_WEBHOOK_URL` Zeabur env var — operator task
- Idempotency-check-before-validation reorder — separate optimization
- Fold alliance lookup into RPC — hardening doc §3, separate plan

---

## Task 1: Baseline — snapshot current RPC into repo for version control

**Why:** The current `process_payment_webhook_event` RPC exists only in Supabase cloud with no migration file. Before rewriting it, commit the current body so we have a source-of-truth baseline and git blame will show the evolution.

**Files:**
- Create: `backend/migrations/20260408_baseline_process_payment_webhook_event.sql`

- [ ] **Step 1: Write the baseline migration file**

Create `backend/migrations/20260408_baseline_process_payment_webhook_event.sql`:

```sql
-- Baseline snapshot of process_payment_webhook_event RPC as it exists in
-- production on 2026-04-08, captured via `pg_get_functiondef` before the
-- 2026-04-09 purchase-level idempotency rewrite. This file is an archival
-- record — do NOT re-apply; the active definition lives in
-- 20260409_process_payment_webhook_event_v2.sql.

CREATE OR REPLACE FUNCTION public.process_payment_webhook_event(
    p_event_id text,
    p_event_type text,
    p_alliance_id uuid,
    p_user_id uuid,
    p_seasons integer,
    p_payload jsonb
)
RETURNS TABLE(status text, available_seasons integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
$function$;
```

- [ ] **Step 2: Commit the baseline**

```bash
git add backend/migrations/20260408_baseline_process_payment_webhook_event.sql
git commit -m "chore(migrations): snapshot current process_payment_webhook_event RPC as baseline

Captured via pg_get_functiondef on 2026-04-09 before the purchase-level
idempotency rewrite. Archival record only — not meant to be re-applied."
```

---

## Task 2: Schema migration — add `checkout_id` + `order_id` + reconcile + partial unique index

**Why:** Introduce the purchase-level idempotency key in the table. Backfill from existing payloads. Reconcile the `乃罷` double-grant BEFORE the partial unique index is created (otherwise index creation fails on the duplicate). Drop the redundant non-unique btree on `event_id`.

**Files:**
- Create: `backend/migrations/20260409_webhook_events_purchase_idempotency.sql`
- Apply to: Supabase project `kseaylvmxjpbqahtlypb` via `mcp__supabase__apply_migration`

- [ ] **Step 1: Write the migration file**

Create `backend/migrations/20260409_webhook_events_purchase_idempotency.sql`:

```sql
-- 2026-04-09: Purchase-level idempotency for Recur webhooks.
--
-- Before this migration, webhook_events used `event_id` as its only
-- idempotency key. Recur emits TWO events per purchase (checkout.completed
-- and order.paid), each with distinct event_id, so the old key would let
-- both grant a season. This migration adds `checkout_id` as the
-- purchase-level key, reconciles the one known historical double-grant,
-- and installs a partial unique index as a third line of defense against
-- regressions.
--
-- Run order MATTERS:
--   1. Add columns (nullable, no default)
--   2. Backfill from existing payloads
--   3. Reconcile 乃罷 historical double-grant (demote + decrement)
--   4. Create partial UNIQUE index (fails if step 3 skipped)
--   5. Add CHECK constraint
--   6. Drop redundant btree

BEGIN;

-- Step 1: Add purchase-level and order-level identifiers
ALTER TABLE public.webhook_events
    ADD COLUMN IF NOT EXISTS checkout_id TEXT,
    ADD COLUMN IF NOT EXISTS order_id    TEXT;

COMMENT ON COLUMN public.webhook_events.checkout_id IS
    'Recur checkout id. Purchase-level idempotency key; equals '
    'checkout.completed.payload.id AND order.paid.payload.checkout_id. '
    'Nullable only for rows predating 2026-04-09.';
COMMENT ON COLUMN public.webhook_events.order_id IS
    'Recur order id. Only populated for order.paid events.';

-- Step 2: Backfill existing rows from stored payloads
--   - checkout.completed → payload.id is the checkout_id
--   - order.paid        → payload.checkout_id + payload.order_id (or payload.id)
UPDATE public.webhook_events
   SET checkout_id = payload ->> 'id'
 WHERE event_type = 'checkout.completed'
   AND payload IS NOT NULL
   AND checkout_id IS NULL;

UPDATE public.webhook_events
   SET checkout_id = payload ->> 'checkout_id',
       order_id    = COALESCE(payload ->> 'order_id', payload ->> 'id')
 WHERE event_type = 'order.paid'
   AND payload IS NOT NULL
   AND checkout_id IS NULL;

-- Step 3: Reconcile the known 2026-04-08 double-grant for alliance 乃罷.
--   purchased_seasons went 10 -> 12 on a single NT$999 purchase.
--   Demote the checkout.completed row to audit-only (seasons_added = 0) and
--   subtract 1 from the alliance. This MUST run before the partial unique
--   index is created; otherwise index creation fails with a unique
--   violation on checkout_id = 'bw640ymshi74ogw4u5g2xgzr'.
UPDATE public.webhook_events
   SET seasons_added = 0
 WHERE event_id = 'evt_bc4114517b94e6aa2a4f2693a6ac3df7'
   AND event_type = 'checkout.completed'
   AND seasons_added = 1;  -- idempotency guard: only flip if still 1

UPDATE public.alliances
   SET purchased_seasons = purchased_seasons - 1
 WHERE id = '5bcff59d-f79a-400a-82dc-06fce368e501'
   AND purchased_seasons = 12;  -- idempotency guard: only fix if still 12

-- Step 4: Partial unique index — at most one GRANTING row per checkout
CREATE UNIQUE INDEX IF NOT EXISTS webhook_events_checkout_grant_uniq
    ON public.webhook_events (checkout_id)
 WHERE seasons_added > 0 AND checkout_id IS NOT NULL;

-- Step 5: Integrity constraint
ALTER TABLE public.webhook_events
    DROP CONSTRAINT IF EXISTS webhook_events_seasons_added_nonneg,
    ADD  CONSTRAINT           webhook_events_seasons_added_nonneg
         CHECK (seasons_added >= 0);

-- Step 6: Drop redundant non-unique btree (unique key already provides one)
DROP INDEX IF EXISTS public.idx_webhook_events_event_id;

COMMIT;
```

- [ ] **Step 2: Dry-run verification queries via execute_sql**

Before applying, sanity check row counts and values. Use `mcp__supabase__execute_sql` with `project_id=kseaylvmxjpbqahtlypb`:

```sql
-- Expect: alliance 乃罷 at purchased_seasons=12, used_seasons=5
SELECT id, name, purchased_seasons, used_seasons
  FROM alliances
 WHERE id = '5bcff59d-f79a-400a-82dc-06fce368e501';

-- Expect: exactly two rows, both seasons_added=1, for the 乃罷 double-grant
SELECT event_id, event_type, seasons_added,
       payload ->> 'id'          AS payload_id,
       payload ->> 'checkout_id' AS payload_checkout_id,
       payload ->> 'order_id'    AS payload_order_id
  FROM webhook_events
 WHERE alliance_id = '5bcff59d-f79a-400a-82dc-06fce368e501'
 ORDER BY processed_at;
```

Expected output:
- Alliance row: `purchased_seasons=12, used_seasons=5`
- Two webhook rows with `checkout.completed` payload_id = `bw640ymshi74ogw4u5g2xgzr` and `order.paid` payload_checkout_id = `bw640ymshi74ogw4u5g2xgzr` + payload_order_id = `nfegpk8ok8gp12h7xhi0q49w`

**If any expected value differs, STOP and re-read state. Do not proceed to apply.**

- [ ] **Step 3: Apply the migration via Supabase MCP**

Use `mcp__supabase__apply_migration`:
- `project_id`: `kseaylvmxjpbqahtlypb`
- `name`: `20260409_webhook_events_purchase_idempotency`
- `query`: the full SQL body from Step 1 (the file content)

- [ ] **Step 4: Post-apply verification**

Run these queries with `mcp__supabase__execute_sql`:

```sql
-- 1. Alliance reconciled to 11
SELECT purchased_seasons FROM alliances
 WHERE id = '5bcff59d-f79a-400a-82dc-06fce368e501';
-- Expected: 11

-- 2. One row demoted to seasons_added=0, other still 1
SELECT event_id, event_type, seasons_added, checkout_id, order_id
  FROM webhook_events
 WHERE alliance_id = '5bcff59d-f79a-400a-82dc-06fce368e501'
 ORDER BY processed_at;
-- Expected: checkout.completed row → seasons_added=0, checkout_id='bw640ymshi74ogw4u5g2xgzr', order_id=NULL
-- Expected: order.paid row          → seasons_added=1, checkout_id='bw640ymshi74ogw4u5g2xgzr', order_id='nfegpk8ok8gp12h7xhi0q49w'

-- 3. Partial unique index exists
SELECT indexdef FROM pg_indexes
 WHERE schemaname='public' AND indexname='webhook_events_checkout_grant_uniq';
-- Expected: CREATE UNIQUE INDEX ... WHERE ((seasons_added > 0) AND (checkout_id IS NOT NULL))

-- 4. Check constraint active
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
 WHERE conrelid='public.webhook_events'::regclass
   AND conname='webhook_events_seasons_added_nonneg';
-- Expected: CHECK (seasons_added >= 0)

-- 5. Redundant index gone
SELECT indexname FROM pg_indexes
 WHERE schemaname='public'
   AND tablename='webhook_events'
   AND indexname='idx_webhook_events_event_id';
-- Expected: 0 rows
```

- [ ] **Step 5: Commit the migration file**

```bash
git add backend/migrations/20260409_webhook_events_purchase_idempotency.sql
git commit -m "feat(db): add checkout_id purchase-level idempotency to webhook_events

Introduces checkout_id + order_id columns, backfills from existing payloads,
reconciles the 2026-04-08 乃罷 double-grant (purchased_seasons 12 → 11),
creates a partial unique index on checkout_id WHERE seasons_added > 0 as
the DB-level third line of defense against cross-event double-grants, adds
a non-negative check constraint on seasons_added, and drops the redundant
non-unique btree on event_id.

Applied to Supabase project kseaylvmxjpbqahtlypb on 2026-04-09."
```

---

## Task 3: New RPC `process_payment_webhook_event` (v2)

**Why:** Replace the event-id-only idempotency with a purchase-level model. Add `p_checkout_id` and `p_order_id` params. Use a transaction-scoped advisory lock keyed on `hashtext(checkout_id)` to serialize concurrent siblings. Support `p_seasons=0` for audit-only rows. Return richer status values: `granted` | `duplicate_event` | `audit_only` | `duplicate_purchase` | `alliance_not_found`.

**Files:**
- Create: `backend/migrations/20260409_process_payment_webhook_event_v2.sql`
- Apply to: Supabase project `kseaylvmxjpbqahtlypb`

- [ ] **Step 1: Write the new RPC migration file**

Create `backend/migrations/20260409_process_payment_webhook_event_v2.sql`:

```sql
-- 2026-04-09: Purchase-level idempotent Recur webhook processing.
--
-- Responsibilities (single atomic transaction):
--   1. Claim the event_id row (retry protection for same Recur delivery).
--   2. If p_seasons = 0 → record audit-only row and return 'audit_only'.
--   3. Take pg_advisory_xact_lock(hashtext(checkout_id)) to serialize any
--      concurrent sibling events for the same purchase.
--   4. If a sibling row already has seasons_added > 0 for the same
--      checkout_id, return 'duplicate_purchase' (this is the cross-event
--      case: checkout.completed already granted, or this is the second
--      order.paid delivery).
--   5. Otherwise promote our row to seasons_added = p_seasons, bump
--      alliances.purchased_seasons, and return 'granted'.
--
-- Status contract:
--   granted            — this event caused the grant
--   duplicate_event    — same event_id delivered twice (Recur retry)
--   duplicate_purchase — sibling event already granted for this checkout_id
--   audit_only         — p_seasons=0, row recorded, no grant
--   alliance_not_found — p_alliance_id does not exist (transactional error)

CREATE OR REPLACE FUNCTION public.process_payment_webhook_event(
    p_event_id    text,
    p_event_type  text,
    p_checkout_id text,
    p_order_id    text,
    p_alliance_id uuid,
    p_user_id     uuid,
    p_seasons     integer,
    p_payload     jsonb
)
RETURNS TABLE(status text, available_seasons integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_inserted_rows int;
    v_new_purchased int;
    v_used          int;
BEGIN
    IF p_seasons < 0 THEN
        RAISE EXCEPTION 'p_seasons must be >= 0, got %', p_seasons;
    END IF;
    IF p_checkout_id IS NULL OR p_checkout_id = '' THEN
        RAISE EXCEPTION 'p_checkout_id is required';
    END IF;

    -- Step 1: Claim the event_id slot (retry protection). Always start at
    -- seasons_added = 0; we promote below if this is a granting event.
    INSERT INTO public.webhook_events (
        event_id, event_type, alliance_id, user_id,
        seasons_added, payload, checkout_id, order_id
    ) VALUES (
        p_event_id, p_event_type, p_alliance_id, p_user_id,
        0, p_payload, p_checkout_id, p_order_id
    )
    ON CONFLICT (event_id) DO NOTHING;

    GET DIAGNOSTICS v_inserted_rows = ROW_COUNT;

    IF v_inserted_rows = 0 THEN
        -- Same event redelivered. Return current alliance balance so the
        -- caller can respond coherently without looking it up separately.
        SELECT a.purchased_seasons, a.used_seasons
          INTO v_new_purchased, v_used
          FROM public.alliances a
         WHERE a.id = p_alliance_id;

        RETURN QUERY SELECT
            'duplicate_event'::text,
            GREATEST(0, COALESCE(v_new_purchased, 0) - COALESCE(v_used, 0));
        RETURN;
    END IF;

    -- Step 2: Audit-only path (checkout.completed). Row is recorded; no grant.
    IF p_seasons = 0 THEN
        SELECT a.purchased_seasons, a.used_seasons
          INTO v_new_purchased, v_used
          FROM public.alliances a
         WHERE a.id = p_alliance_id;

        IF v_new_purchased IS NULL THEN
            RAISE EXCEPTION 'Alliance not found: %', p_alliance_id
                USING ERRCODE = 'P0002';
        END IF;

        RETURN QUERY SELECT
            'audit_only'::text,
            GREATEST(0, v_new_purchased - v_used);
        RETURN;
    END IF;

    -- Step 3: Serialize concurrent siblings for this purchase.
    PERFORM pg_advisory_xact_lock(hashtext(p_checkout_id));

    -- Step 4: Has a sibling already granted for this checkout?
    IF EXISTS (
        SELECT 1
          FROM public.webhook_events
         WHERE checkout_id = p_checkout_id
           AND seasons_added > 0
           AND event_id <> p_event_id
    ) THEN
        SELECT a.purchased_seasons, a.used_seasons
          INTO v_new_purchased, v_used
          FROM public.alliances a
         WHERE a.id = p_alliance_id;

        RETURN QUERY SELECT
            'duplicate_purchase'::text,
            GREATEST(0, COALESCE(v_new_purchased, 0) - COALESCE(v_used, 0));
        RETURN;
    END IF;

    -- Step 5: Promote our row + grant. The partial unique index on
    -- (checkout_id) WHERE seasons_added > 0 is the third line of defense —
    -- if we somehow raced past the advisory lock, this UPDATE fails.
    UPDATE public.webhook_events
       SET seasons_added = p_seasons
     WHERE event_id = p_event_id;

    UPDATE public.alliances
       SET purchased_seasons = purchased_seasons + p_seasons
     WHERE id = p_alliance_id
    RETURNING purchased_seasons, used_seasons
      INTO v_new_purchased, v_used;

    IF v_new_purchased IS NULL THEN
        RAISE EXCEPTION 'Alliance not found: %', p_alliance_id
            USING ERRCODE = 'P0002';
    END IF;

    RETURN QUERY SELECT
        'granted'::text,
        GREATEST(0, v_new_purchased - v_used);
END;
$function$;

-- Drop the old 6-arg signature explicitly. Postgres treats different argument
-- lists as different functions; CREATE OR REPLACE above installed a new
-- overload but left the old one live. We must remove the old one to force
-- all callers onto the new signature.
DROP FUNCTION IF EXISTS public.process_payment_webhook_event(
    text, text, uuid, uuid, integer, jsonb
);
```

- [ ] **Step 2: Apply the RPC migration via Supabase MCP**

Use `mcp__supabase__apply_migration`:
- `project_id`: `kseaylvmxjpbqahtlypb`
- `name`: `20260409_process_payment_webhook_event_v2`
- `query`: the full SQL body from Step 1

- [ ] **Step 3: Verify the new RPC exists and the old one is dropped**

Run via `mcp__supabase__execute_sql`:

```sql
SELECT oid::regprocedure AS signature
  FROM pg_proc
 WHERE proname = 'process_payment_webhook_event';
```

Expected: exactly one row, signature
`process_payment_webhook_event(text,text,text,text,uuid,uuid,integer,jsonb)`

If two rows appear (old + new coexist), re-run the `DROP FUNCTION` statement.

- [ ] **Step 4: Commit the RPC migration**

```bash
git add backend/migrations/20260409_process_payment_webhook_event_v2.sql
git commit -m "feat(db): rewrite process_payment_webhook_event with purchase-level idempotency

New signature: (event_id, event_type, checkout_id, order_id, alliance_id,
user_id, seasons, payload). Uses pg_advisory_xact_lock(hashtext(checkout_id))
to serialize concurrent sibling events and supports p_seasons=0 for
audit-only rows. Returns richer status values: granted, duplicate_event,
duplicate_purchase, audit_only, alliance_not_found.

Also drops the old 6-arg overload so all callers must adopt the new shape.
Applied to kseaylvmxjpbqahtlypb on 2026-04-09."
```

---

## Task 4: Test fixtures — real Recur payloads

**Why:** Current tests use synthetic dicts that don't match the real Recur schema (e.g., they use `externalCustomerId` top-level, which never appears in real payloads — real ones nest under `customer.external_id`). Centralize the real shapes as fixtures so new tests can reference a single source of truth.

**Files:**
- Create: `backend/tests/fixtures/recur_payloads.py`

- [ ] **Step 1: Write the fixtures file**

Create `backend/tests/fixtures/recur_payloads.py`:

```python
"""
Real Recur webhook payloads captured from sandbox on 2026-04-08.

These are the canonical shapes the production code MUST handle. Any new test
for payment-webhook logic should build its input by copying one of these
and overriding only the fields under test.
"""

from __future__ import annotations

from copy import deepcopy
from uuid import UUID

# UUIDs for synthetic tests — matches the style used in existing tests.
TEST_USER_ID = UUID("11111111-1111-1111-1111-111111111111")
TEST_PRODUCT_ID = "prod_test_999"
TEST_CHECKOUT_ID = "chk_test_aaaaaaaaaaaaaaaaaaaaaaaa"
TEST_ORDER_ID = "ord_test_bbbbbbbbbbbbbbbbbbbbbbbb"


def checkout_completed(
    *,
    user_id: UUID = TEST_USER_ID,
    product_id: str = TEST_PRODUCT_ID,
    checkout_id: str = TEST_CHECKOUT_ID,
    amount: int = 999,
    currency: str = "TWD",
) -> dict:
    """Return a real-shaped ``checkout.completed`` webhook payload."""
    return {
        "id": checkout_id,
        "amount": amount,
        "status": "COMPLETED",
        "currency": currency,
        "customer": {
            "id": "recur_cust_test",
            "name": "Test User",
            "email": "test@example.com",
            "external_id": str(user_id),
        },
        "discount": None,
        "metadata": None,
        "subtotal": amount,
        "created_at": "2026-04-08T16:21:09.644Z",
        "product_id": product_id,
        "completed_at": "2026-04-08T16:21:31.958Z",
        "customer_email": None,
    }


def order_paid(
    *,
    user_id: UUID = TEST_USER_ID,
    product_id: str = TEST_PRODUCT_ID,
    checkout_id: str = TEST_CHECKOUT_ID,
    order_id: str = TEST_ORDER_ID,
    amount: int = 999,
    currency: str = "TWD",
) -> dict:
    """Return a real-shaped ``order.paid`` webhook payload."""
    return {
        "id": order_id,
        "amount": amount,
        "status": "PAID",
        "paid_at": "2026-04-08T16:21:31.958Z",
        "currency": currency,
        "customer": {
            "id": "recur_cust_test",
            "name": "Test User",
            "email": "test@example.com",
            "external_id": str(user_id),
        },
        "discount": None,
        "metadata": {},
        "order_id": order_id,
        "subtotal": None,
        "created_at": "2026-04-08T16:21:09.621Z",
        "product_id": product_id,
        "checkout_id": checkout_id,
        "billing_reason": "purchase",
        "payment_method": "card",
        "subscription_id": None,
    }


def clone(payload: dict) -> dict:
    """Deep-copy a payload so tests can mutate freely without cross-test leakage."""
    return deepcopy(payload)
```

- [ ] **Step 2: Commit the fixtures**

```bash
git add backend/tests/fixtures/recur_payloads.py
git commit -m "test: add real Recur webhook payload fixtures captured from sandbox

Fixtures mirror the actual shapes returned by Recur on 2026-04-08,
including snake_case customer.external_id nesting, checkout_id on
order.paid, and the full set of nullable fields. Synthetic test dicts
will be migrated to these helpers in subsequent tasks."
```

---

## Task 5: Update `WebhookEventRepository` to the v2 RPC signature

**Files:**
- Modify: `backend/src/repositories/webhook_event_repository.py`
- Modify: `backend/tests/unit/services/test_webhook_idempotency.py`

- [ ] **Step 1: Write failing test for new RPC call signature**

Replace the body of `backend/tests/unit/services/test_webhook_idempotency.py` (keep the file path, rewrite contents):

```python
"""Tests for WebhookEventRepository.process_event (v2 RPC wrapper)."""

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
CHECKOUT_ID = "chk_test_aaaaaaaaaaaaaaaaaaaaaaaa"
ORDER_ID = "ord_test_bbbbbbbbbbbbbbbbbbbbbbbb"


def _make_repo() -> WebhookEventRepository:
    with patch("src.repositories.base.get_supabase_client"):
        return WebhookEventRepository()


def _mock_rpc(repo: WebhookEventRepository, rows: list[dict]) -> MagicMock:
    rpc_result = MagicMock()
    rpc_result.data = rows
    mock_rpc = MagicMock(return_value=MagicMock(execute=MagicMock(return_value=rpc_result)))
    repo.client.rpc = mock_rpc
    return mock_rpc


@pytest.mark.asyncio
async def test_process_event_passes_new_rpc_params():
    repo = _make_repo()
    mock_rpc = _mock_rpc(repo, [{"status": "granted", "available_seasons": 5}])

    result = await repo.process_event(
        event_id="evt_1",
        event_type="order.paid",
        checkout_id=CHECKOUT_ID,
        order_id=ORDER_ID,
        alliance_id=ALLIANCE_ID,
        user_id=USER_ID,
        seasons=1,
        payload={"amount": 999},
    )

    assert result == WebhookProcessingResult(status="granted", available_seasons=5)
    mock_rpc.assert_called_once_with(
        "process_payment_webhook_event",
        {
            "p_event_id": "evt_1",
            "p_event_type": "order.paid",
            "p_checkout_id": CHECKOUT_ID,
            "p_order_id": ORDER_ID,
            "p_alliance_id": str(ALLIANCE_ID),
            "p_user_id": str(USER_ID),
            "p_seasons": 1,
            "p_payload": {"amount": 999},
        },
    )


@pytest.mark.asyncio
async def test_process_event_accepts_null_order_id_for_checkout_completed():
    repo = _make_repo()
    mock_rpc = _mock_rpc(repo, [{"status": "audit_only", "available_seasons": 4}])

    result = await repo.process_event(
        event_id="evt_chk",
        event_type="checkout.completed",
        checkout_id=CHECKOUT_ID,
        order_id=None,
        alliance_id=ALLIANCE_ID,
        user_id=USER_ID,
        seasons=0,
        payload={},
    )

    assert result == WebhookProcessingResult(status="audit_only", available_seasons=4)
    call_kwargs = mock_rpc.call_args[0][1]
    assert call_kwargs["p_order_id"] is None
    assert call_kwargs["p_seasons"] == 0


@pytest.mark.asyncio
async def test_process_event_duplicate_event_status():
    repo = _make_repo()
    _mock_rpc(repo, [{"status": "duplicate_event", "available_seasons": 3}])

    result = await repo.process_event(
        event_id="evt_dup",
        event_type="order.paid",
        checkout_id=CHECKOUT_ID,
        order_id=ORDER_ID,
        alliance_id=ALLIANCE_ID,
        user_id=USER_ID,
        seasons=1,
        payload={},
    )
    assert result.status == "duplicate_event"


@pytest.mark.asyncio
async def test_process_event_duplicate_purchase_status():
    repo = _make_repo()
    _mock_rpc(repo, [{"status": "duplicate_purchase", "available_seasons": 6}])

    result = await repo.process_event(
        event_id="evt_sibling",
        event_type="order.paid",
        checkout_id=CHECKOUT_ID,
        order_id=ORDER_ID,
        alliance_id=ALLIANCE_ID,
        user_id=USER_ID,
        seasons=1,
        payload={},
    )
    assert result.status == "duplicate_purchase"


@pytest.mark.asyncio
async def test_process_event_raises_on_empty_rpc_response():
    repo = _make_repo()
    _mock_rpc(repo, [])

    with pytest.raises(RuntimeError, match="RPC returned no rows"):
        await repo.process_event(
            event_id="evt_2",
            event_type="order.paid",
            checkout_id=CHECKOUT_ID,
            order_id=ORDER_ID,
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
            event_type="order.paid",
            checkout_id=CHECKOUT_ID,
            order_id=ORDER_ID,
            alliance_id=ALLIANCE_ID,
            user_id=USER_ID,
            seasons=1,
            payload={},
        )
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && uv run pytest tests/unit/services/test_webhook_idempotency.py -v
```
Expected: FAIL — `process_event()` does not accept `checkout_id` / `order_id` kwargs, and `WebhookProcessingResult.status` Literal does not include the new values.

- [ ] **Step 3: Update the repository implementation**

Edit `backend/src/repositories/webhook_event_repository.py`. Replace the `WebhookProcessingResult` and `WebhookEventRepository.process_event` definitions with:

```python
class WebhookProcessingResult(BaseModel):
    """Result returned by the atomic RPC."""

    status: Literal[
        "granted",
        "duplicate_event",
        "duplicate_purchase",
        "audit_only",
    ]
    available_seasons: int


class WebhookEventRepository(SupabaseRepository[WebhookEvent]):
    """Repository wrapping the atomic payment-webhook RPC.

    The ``WebhookEvent`` generic type parameter is kept only to satisfy
    ``SupabaseRepository[T]``; no CRUD methods are used here — all behavior
    flows through ``process_payment_webhook_event``. Do not "clean up" the
    dead model without rewriting the base class first.
    """

    def __init__(self) -> None:
        super().__init__(table_name="webhook_events", model_class=WebhookEvent)

    async def process_event(
        self,
        *,
        event_id: str,
        event_type: str,
        checkout_id: str,
        order_id: str | None,
        alliance_id: UUID,
        user_id: UUID,
        seasons: int,
        payload: dict,
    ) -> WebhookProcessingResult:
        """
        Atomically claim + audit + (optionally) grant via the v2 RPC.

        ``seasons=0`` yields an audit-only row (``checkout.completed`` path).
        Purchase-level idempotency is enforced by the RPC using
        ``checkout_id`` and a transaction-scoped advisory lock.

        Returns ``WebhookProcessingResult(status=..., available_seasons=int)``
        where status is one of ``granted``, ``duplicate_event``,
        ``duplicate_purchase``, or ``audit_only``.

        Raises:
            postgrest.exceptions.APIError: transient DB/RPC failures.
            RuntimeError: RPC returned an empty result (should not happen).
        """
        params = {
            "p_event_id": event_id,
            "p_event_type": event_type,
            "p_checkout_id": checkout_id,
            "p_order_id": order_id,
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
        if len(rows) != 1:
            raise RuntimeError(
                f"{RPC_NAME} RPC returned {len(rows)} rows; expected exactly 1"
            )

        row = rows[0]
        return WebhookProcessingResult(
            status=row["status"],
            available_seasons=int(row["available_seasons"]),
        )
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && uv run pytest tests/unit/services/test_webhook_idempotency.py -v
```
Expected: all 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/repositories/webhook_event_repository.py backend/tests/unit/services/test_webhook_idempotency.py
git commit -m "feat(payment): adopt v2 RPC signature in WebhookEventRepository

process_event now takes checkout_id (required) and order_id (nullable) as
first-class params, passes them to the v2 RPC, and maps the richer status
values (granted / duplicate_event / duplicate_purchase / audit_only) onto
WebhookProcessingResult. Single-row assertion added to guard against
future RPC multi-row bugs."
```

---

## Task 6: Rewrite `PaymentService.handle_payment_success` — event-type whitelist + extractors

**Why:** The service is the policy layer. It decides which events grant and which are audit-only, extracts `checkout_id`/`order_id` from the payload, and enforces strict currency. It is also the place where unknown event types become permanent errors instead of silently granting.

**Files:**
- Modify: `backend/src/services/payment_service.py`
- Modify: `backend/tests/unit/services/test_payment_service.py`

- [ ] **Step 1: Write failing tests for the new behavior**

Replace the entire body of `backend/tests/unit/services/test_payment_service.py` with:

```python
"""
Unit Tests for PaymentService — purchase-level idempotency edition.

All tests build input via ``tests.fixtures.recur_payloads`` so the synthetic
shapes stay in lockstep with real Recur payloads.
"""

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID

import pytest
from postgrest.exceptions import APIError

from src.core.webhook_errors import WebhookPermanentError, WebhookTransientError
from src.repositories.webhook_event_repository import WebhookProcessingResult
from src.services.payment_service import PaymentService
from tests.fixtures.recur_payloads import (
    TEST_CHECKOUT_ID,
    TEST_ORDER_ID,
    TEST_PRODUCT_ID,
    TEST_USER_ID,
    checkout_completed,
    clone,
    order_paid,
)

ALLIANCE_ID = UUID("22222222-2222-2222-2222-222222222222")


@pytest.fixture
def fake_settings():
    with patch("src.services.payment_service.settings") as s:
        s.recur_product_id = TEST_PRODUCT_ID
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


class TestEventTypeRouting:
    @pytest.mark.asyncio
    async def test_order_paid_grants_one_season(self, service):
        result = await service.handle_payment_success(
            order_paid(), event_id="evt_order_1", event_type="order.paid"
        )
        assert result["status"] == "granted"
        assert result["seasons_added"] == 1
        kwargs = service._webhook_repo.process_event.await_args.kwargs
        assert kwargs["seasons"] == 1
        assert kwargs["checkout_id"] == TEST_CHECKOUT_ID
        assert kwargs["order_id"] == TEST_ORDER_ID

    @pytest.mark.asyncio
    async def test_checkout_completed_is_audit_only(self, service):
        service._webhook_repo.process_event = AsyncMock(
            return_value=WebhookProcessingResult(status="audit_only", available_seasons=5)
        )
        result = await service.handle_payment_success(
            checkout_completed(), event_id="evt_chk_1", event_type="checkout.completed"
        )
        assert result["status"] == "audit_only"
        assert result["seasons_added"] == 0
        kwargs = service._webhook_repo.process_event.await_args.kwargs
        assert kwargs["seasons"] == 0
        assert kwargs["checkout_id"] == TEST_CHECKOUT_ID
        assert kwargs["order_id"] is None  # checkout.completed has no order_id

    @pytest.mark.asyncio
    async def test_unknown_event_type_is_permanent(self, service):
        with pytest.raises(WebhookPermanentError) as ei:
            await service.handle_payment_success(
                order_paid(), event_id="evt_wat", event_type="subscription.renewed"
            )
        assert ei.value.code == "unsupported_event_type"

    @pytest.mark.asyncio
    async def test_duplicate_purchase_status_propagated(self, service):
        service._webhook_repo.process_event = AsyncMock(
            return_value=WebhookProcessingResult(
                status="duplicate_purchase", available_seasons=6
            )
        )
        result = await service.handle_payment_success(
            order_paid(), event_id="evt_sibling", event_type="order.paid"
        )
        assert result["status"] == "duplicate_purchase"
        assert result["seasons_added"] == 0


class TestCheckoutIdExtraction:
    @pytest.mark.asyncio
    async def test_checkout_completed_reads_top_level_id(self, service):
        payload = clone(checkout_completed(checkout_id="chk_explicit"))
        await service.handle_payment_success(
            payload, event_id="evt_1", event_type="checkout.completed"
        )
        kwargs = service._webhook_repo.process_event.await_args.kwargs
        assert kwargs["checkout_id"] == "chk_explicit"

    @pytest.mark.asyncio
    async def test_order_paid_reads_checkout_id_field(self, service):
        payload = clone(order_paid(checkout_id="chk_from_order_paid"))
        await service.handle_payment_success(
            payload, event_id="evt_2", event_type="order.paid"
        )
        kwargs = service._webhook_repo.process_event.await_args.kwargs
        assert kwargs["checkout_id"] == "chk_from_order_paid"
        assert kwargs["order_id"] == TEST_ORDER_ID

    @pytest.mark.asyncio
    async def test_missing_checkout_id_is_permanent(self, service):
        payload = clone(order_paid())
        payload.pop("checkout_id")
        with pytest.raises(WebhookPermanentError) as ei:
            await service.handle_payment_success(
                payload, event_id="evt_3", event_type="order.paid"
            )
        assert ei.value.code == "missing_checkout_id"


class TestUserIdExtraction:
    @pytest.mark.asyncio
    async def test_snake_case_external_id_under_customer(self, service):
        # This is the real production shape — customer.external_id
        await service.handle_payment_success(
            order_paid(), event_id="evt_snake", event_type="order.paid"
        )
        kwargs = service._webhook_repo.process_event.await_args.kwargs
        assert kwargs["user_id"] == TEST_USER_ID

    @pytest.mark.asyncio
    async def test_missing_external_id_is_permanent(self, service):
        payload = clone(order_paid())
        payload["customer"].pop("external_id")
        with pytest.raises(WebhookPermanentError) as ei:
            await service.handle_payment_success(
                payload, event_id="evt_1", event_type="order.paid"
            )
        assert ei.value.code == "missing_external_customer_id"

    @pytest.mark.asyncio
    async def test_invalid_uuid_is_permanent(self, service):
        payload = clone(order_paid())
        payload["customer"]["external_id"] = "not-a-uuid"
        with pytest.raises(WebhookPermanentError) as ei:
            await service.handle_payment_success(
                payload, event_id="evt_1", event_type="order.paid"
            )
        assert ei.value.code == "invalid_external_customer_id"

    @pytest.mark.asyncio
    async def test_legacy_quantity_suffix_tolerated(self, service, caplog):
        payload = clone(order_paid())
        payload["customer"]["external_id"] = f"{TEST_USER_ID}:999"
        import logging
        with caplog.at_level(logging.WARNING):
            result = await service.handle_payment_success(
                payload, event_id="evt_legacy", event_type="order.paid"
            )
        assert result["status"] == "granted"
        assert result["seasons_added"] == 1  # suffix can never inflate
        assert any("legacy_external_id_suffix" in rec.message for rec in caplog.records), \
            "legacy suffix usage must be logged at WARNING"


class TestValidation:
    @pytest.mark.asyncio
    async def test_product_mismatch_is_permanent(self, service):
        payload = clone(order_paid(product_id="prod_other"))
        with pytest.raises(WebhookPermanentError) as ei:
            await service.handle_payment_success(
                payload, event_id="evt_1", event_type="order.paid"
            )
        assert ei.value.code == "product_mismatch"

    @pytest.mark.asyncio
    async def test_amount_mismatch_is_permanent(self, service):
        payload = clone(order_paid(amount=1))
        with pytest.raises(WebhookPermanentError) as ei:
            await service.handle_payment_success(
                payload, event_id="evt_1", event_type="order.paid"
            )
        assert ei.value.code == "amount_mismatch"

    @pytest.mark.asyncio
    async def test_amount_unparseable_has_distinct_code(self, service):
        payload = clone(order_paid())
        payload["amount"] = "not-a-number"
        with pytest.raises(WebhookPermanentError) as ei:
            await service.handle_payment_success(
                payload, event_id="evt_1", event_type="order.paid"
            )
        assert ei.value.code == "amount_unparseable"

    @pytest.mark.asyncio
    async def test_currency_mismatch_is_permanent(self, service):
        payload = clone(order_paid(currency="USD"))
        with pytest.raises(WebhookPermanentError) as ei:
            await service.handle_payment_success(
                payload, event_id="evt_1", event_type="order.paid"
            )
        assert ei.value.code == "currency_mismatch"

    @pytest.mark.asyncio
    async def test_currency_missing_is_permanent_strict(self, service):
        """Lenient fallback was removed 2026-04-09 — real Recur payloads
        always include currency, so missing = schema drift = halt loudly."""
        payload = clone(order_paid())
        payload.pop("currency")
        with pytest.raises(WebhookPermanentError) as ei:
            await service.handle_payment_success(
                payload, event_id="evt_1", event_type="order.paid"
            )
        assert ei.value.code == "currency_missing"


class TestPlumbing:
    @pytest.mark.asyncio
    async def test_missing_event_id_is_permanent(self, service):
        with pytest.raises(WebhookPermanentError) as ei:
            await service.handle_payment_success(
                order_paid(), event_id=None, event_type="order.paid"
            )
        assert ei.value.code == "missing_event_id"

    @pytest.mark.asyncio
    async def test_user_without_alliance_is_permanent(self, service):
        service._quota_service.get_alliance_by_user = AsyncMock(return_value=None)
        with pytest.raises(WebhookPermanentError) as ei:
            await service.handle_payment_success(
                order_paid(), event_id="evt_1", event_type="order.paid"
            )
        assert ei.value.code == "alliance_not_found"

    @pytest.mark.asyncio
    async def test_rpc_api_error_is_transient(self, service):
        service._webhook_repo.process_event = AsyncMock(
            side_effect=APIError({"message": "boom", "code": "53300"})
        )
        with pytest.raises(WebhookTransientError) as ei:
            await service.handle_payment_success(
                order_paid(), event_id="evt_1", event_type="order.paid"
            )
        assert ei.value.code == "rpc_api_error"

    @pytest.mark.asyncio
    async def test_alliance_lookup_os_error_is_transient(self, service):
        service._quota_service.get_alliance_by_user = AsyncMock(side_effect=OSError("db down"))
        with pytest.raises(WebhookTransientError) as ei:
            await service.handle_payment_success(
                order_paid(), event_id="evt_1", event_type="order.paid"
            )
        assert ei.value.code == "alliance_lookup_failed"
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && uv run pytest tests/unit/services/test_payment_service.py -v
```
Expected: most tests FAIL because the service still uses the old signature / event-type routing / currency lenient fallback.

- [ ] **Step 3: Rewrite `payment_service.py`**

Replace the full body of `backend/src/services/payment_service.py` with:

```python
"""
Payment Service — Recur webhook processing (purchase-level idempotency).

Responsibilities:
    1. Route by event type: only ``order.paid`` grants; ``checkout.completed``
       is audit-only. Unknown types become permanent errors.
    2. Extract purchase-level identifiers (``checkout_id``, ``order_id``)
       from the real Recur payload shapes.
    3. Validate server-authoritative product/amount/currency (strict).
    4. Resolve the buyer's alliance.
    5. Call the atomic ``process_payment_webhook_event`` v2 RPC.

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

# Only ``order.paid`` actually grants a season; ``checkout.completed`` is
# audit-only. Any other event type is a hard stop — we would rather 4xx and
# alert than silently grant on an unknown event.
GRANTING_EVENT_TYPE = "order.paid"
AUDIT_ONLY_EVENT_TYPES = frozenset({"checkout.completed"})
KNOWN_EVENT_TYPES = frozenset({GRANTING_EVENT_TYPE}) | AUDIT_ONLY_EVENT_TYPES


class PaymentService:
    def __init__(self) -> None:
        self._quota_service = SeasonQuotaService()
        self._webhook_repo = WebhookEventRepository()

    async def handle_payment_success(
        self,
        event_data: dict,
        *,
        event_id: str | None = None,
        event_type: str = GRANTING_EVENT_TYPE,
    ) -> dict:
        """Validate + (optionally) grant for a Recur webhook event.

        Returns a dict describing the outcome. Raises ``WebhookPermanentError``
        for unretryable problems and ``WebhookTransientError`` for retryable
        problems.
        """
        if not event_id:
            raise WebhookPermanentError("missing_event_id")
        if event_type not in KNOWN_EVENT_TYPES:
            raise WebhookPermanentError(
                "unsupported_event_type", event_id=event_id, event_type=event_type
            )

        user_id = self._extract_user_id(event_data, event_id=event_id)
        checkout_id = self._extract_checkout_id(
            event_data, event_id=event_id, event_type=event_type
        )
        order_id = self._extract_order_id(event_data, event_type=event_type)

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

        seasons = SEASONS_PER_PURCHASE if event_type == GRANTING_EVENT_TYPE else 0

        try:
            result: WebhookProcessingResult = await self._webhook_repo.process_event(
                event_id=event_id,
                event_type=event_type,
                checkout_id=checkout_id,
                order_id=order_id,
                alliance_id=alliance.id,
                user_id=user_id,
                seasons=seasons,
                payload=event_data,
            )
        except APIError as e:
            raise WebhookTransientError("rpc_api_error", event_id=event_id) from e
        except OSError as e:
            raise WebhookTransientError("rpc_os_error", event_id=event_id) from e

        seasons_added = SEASONS_PER_PURCHASE if result.status == "granted" else 0
        logger.info(
            "Webhook processed status=%s event_id=%s event_type=%s "
            "checkout_id=%s alliance_id=%s user_id=%s available=%s",
            result.status,
            event_id,
            event_type,
            checkout_id,
            alliance.id,
            user_id,
            result.available_seasons,
        )
        return {
            "status": result.status,
            "alliance_id": str(alliance.id),
            "user_id": str(user_id),
            "checkout_id": checkout_id,
            "order_id": order_id,
            "seasons_added": seasons_added,
            "available_seasons": result.available_seasons,
        }

    # ------------------------------------------------------------------
    # Extraction helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _extract_user_id(event_data: dict, *, event_id: str) -> UUID:
        """Pull the buyer's user UUID from the webhook payload.

        Real Recur payloads put it at ``data.customer.external_id`` (snake_case).
        Camel-case and ``data.order.customer.externalId`` fallbacks exist for
        defensive coverage but are never observed in production and should
        eventually be pruned.
        """
        raw = PaymentService._find_external_customer_id(event_data)
        if not raw:
            logger.warning(
                "Webhook missing externalCustomerId event_id=%s top_keys=%s customer_keys=%s",
                event_id,
                sorted(event_data.keys()),
                sorted((event_data.get("customer") or {}).keys())
                if isinstance(event_data.get("customer"), dict)
                else None,
            )
            raise WebhookPermanentError("missing_external_customer_id", event_id=event_id)

        if ":" in str(raw):
            # Legacy sticky-per-email customers created before the 2026-04-08
            # rewrite still send ``uuid:qty``. Suffix is ignored; quantity is
            # hardcoded by SEASONS_PER_PURCHASE. Log so we can detect when
            # the last legacy customer stops firing and delete this path.
            logger.warning(
                "legacy_external_id_suffix event_id=%s raw=%s", event_id, raw
            )

        uuid_part = str(raw).split(":", 1)[0]
        try:
            return UUID(uuid_part)
        except (ValueError, TypeError) as e:
            raise WebhookPermanentError(
                "invalid_external_customer_id", event_id=event_id, raw=str(raw)
            ) from e

    @staticmethod
    def _find_external_customer_id(event_data: dict) -> str | None:
        """Walk the known Recur payload shapes looking for the external customer id."""
        def _first_str(*candidates: object) -> str | None:
            for c in candidates:
                if isinstance(c, str) and c:
                    return c
            return None

        top = _first_str(
            event_data.get("externalCustomerId"),
            event_data.get("external_customer_id"),
        )
        if top:
            return top

        customer = event_data.get("customer")
        if isinstance(customer, dict):
            nested = _first_str(
                customer.get("external_id"),
                customer.get("externalId"),
                customer.get("externalCustomerId"),
                customer.get("external_customer_id"),
            )
            if nested:
                return nested

        order = event_data.get("order")
        if isinstance(order, dict):
            order_customer = order.get("customer")
            if isinstance(order_customer, dict):
                nested = _first_str(
                    order_customer.get("external_id"),
                    order_customer.get("externalId"),
                )
                if nested:
                    return nested

        return None

    @staticmethod
    def _extract_checkout_id(
        event_data: dict, *, event_id: str, event_type: str
    ) -> str:
        """Checkout id = purchase-level idempotency key. Mandatory.

        ``checkout.completed.payload.id``    → the checkout id itself
        ``order.paid.payload.checkout_id``   → explicit field
        """
        if event_type == "checkout.completed":
            raw = event_data.get("id")
        else:  # order.paid
            raw = event_data.get("checkout_id") or event_data.get("checkoutId")

        if not isinstance(raw, str) or not raw:
            raise WebhookPermanentError(
                "missing_checkout_id",
                event_id=event_id,
                event_type=event_type,
            )
        return raw

    @staticmethod
    def _extract_order_id(event_data: dict, *, event_type: str) -> str | None:
        """Order id only exists on ``order.paid``. Return None otherwise."""
        if event_type != "order.paid":
            return None
        raw = (
            event_data.get("order_id")
            or event_data.get("orderId")
            or event_data.get("id")  # order.paid.payload.id is also the order id
        )
        return raw if isinstance(raw, str) and raw else None

    # ------------------------------------------------------------------
    # Validation helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _validate_product(event_data: dict, *, event_id: str) -> None:
        expected = settings.recur_product_id
        actual = event_data.get("product_id") or event_data.get("productId")
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
                "amount_unparseable", event_id=event_id, expected=expected, actual=raw
            ) from e
        if actual != expected:
            raise WebhookPermanentError(
                "amount_mismatch", event_id=event_id, expected=expected, actual=actual
            )

    @staticmethod
    def _validate_currency(event_data: dict, *, event_id: str) -> None:
        """Strict currency check — real Recur payloads always include it."""
        expected = (settings.recur_expected_currency or "TWD").upper()
        raw = event_data.get("currency")
        if raw is None:
            raise WebhookPermanentError(
                "currency_missing", event_id=event_id, expected=expected
            )
        actual = str(raw).upper()
        if actual != expected:
            raise WebhookPermanentError(
                "currency_mismatch", event_id=event_id, expected=expected, actual=actual
            )
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && uv run pytest tests/unit/services/test_payment_service.py tests/unit/services/test_webhook_idempotency.py -v
```
Expected: all tests PASS.

- [ ] **Step 5: Run full backend test suite to catch regressions**

```bash
cd backend && uv run pytest -q
```
Expected: all previously passing tests still PASS. Any failure outside the payment suite likely indicates a caller of `handle_payment_success` or `process_event` that must be updated (webhook API route in particular).

- [ ] **Step 6: Update any direct callers flagged by Step 5**

If `backend/src/api/` (or equivalent) has an endpoint that calls `handle_payment_success` with `event_type` derived from the Recur payload envelope, that code already passes `event_type`. If it hardcoded `"checkout.completed"` previously, change it to read the real `type` field from the verified signature envelope. Run `grep -rn handle_payment_success backend/src` to identify.

- [ ] **Step 7: Commit**

```bash
git add backend/src/services/payment_service.py backend/tests/unit/services/test_payment_service.py
git commit -m "feat(payment): event-type whitelist + purchase-level extraction + strict currency

handle_payment_success now routes by event_type: order.paid grants one
season, checkout.completed is audit-only (seasons=0), and any other type
is a permanent error. checkout_id and order_id are extracted directly
from the real Recur payload shapes (snake_case customer.external_id,
order.paid.checkout_id). Currency validation is tightened from lenient
default to strict — verified via Supabase MCP that all real payloads
carry 'currency': 'TWD'. Legacy ':suffix' external ids now emit a
WARNING log so we can detect when the last sticky customer stops firing
and remove that defensive branch."
```

---

## Task 7: End-to-end verification against real Supabase

**Why:** Unit tests mock the RPC. We need to prove the real v2 RPC on the real DB behaves correctly before declaring victory.

**Files:** none (queries only)

- [ ] **Step 1: Simulate a fresh `order.paid` call against a throwaway test alliance**

First, find a safe test alliance (NOT `乃罷`). Use `mcp__supabase__execute_sql`:

```sql
-- Find an alliance we can safely bump +1 and then roll back
SELECT id, name, purchased_seasons, used_seasons
  FROM alliances
 ORDER BY purchased_seasons ASC
 LIMIT 5;
```

Pick one with a small `purchased_seasons` value for easy rollback. Record `ALLIANCE_ID_TEST` and `INITIAL_SEASONS`.

- [ ] **Step 2: Call the RPC with a synthetic checkout + order_id pair**

Use `mcp__supabase__execute_sql`. Replace `<ALLIANCE_ID_TEST>` and `<USER_ID_TEST>` (any real user in that alliance):

```sql
-- First event: checkout.completed → audit_only
SELECT * FROM process_payment_webhook_event(
    p_event_id    := 'evt_plan_verify_chk_001',
    p_event_type  := 'checkout.completed',
    p_checkout_id := 'chk_plan_verify_001',
    p_order_id    := NULL,
    p_alliance_id := '<ALLIANCE_ID_TEST>'::uuid,
    p_user_id     := '<USER_ID_TEST>'::uuid,
    p_seasons     := 0,
    p_payload     := '{"id": "chk_plan_verify_001"}'::jsonb
);
-- Expected: ('audit_only', <initial_seasons - used>)

-- Second event: order.paid → granted
SELECT * FROM process_payment_webhook_event(
    p_event_id    := 'evt_plan_verify_ord_001',
    p_event_type  := 'order.paid',
    p_checkout_id := 'chk_plan_verify_001',
    p_order_id    := 'ord_plan_verify_001',
    p_alliance_id := '<ALLIANCE_ID_TEST>'::uuid,
    p_user_id     := '<USER_ID_TEST>'::uuid,
    p_seasons     := 1,
    p_payload     := '{"order_id": "ord_plan_verify_001", "checkout_id": "chk_plan_verify_001"}'::jsonb
);
-- Expected: ('granted', <initial_seasons + 1 - used>)

-- Third event: order.paid redelivered with same event_id → duplicate_event
SELECT * FROM process_payment_webhook_event(
    p_event_id    := 'evt_plan_verify_ord_001',  -- same as before
    p_event_type  := 'order.paid',
    p_checkout_id := 'chk_plan_verify_001',
    p_order_id    := 'ord_plan_verify_001',
    p_alliance_id := '<ALLIANCE_ID_TEST>'::uuid,
    p_user_id     := '<USER_ID_TEST>'::uuid,
    p_seasons     := 1,
    p_payload     := '{}'::jsonb
);
-- Expected: ('duplicate_event', <initial_seasons + 1 - used>)

-- Fourth event: DIFFERENT event_id, SAME checkout_id (simulates a weird
-- Recur double-send) → duplicate_purchase
SELECT * FROM process_payment_webhook_event(
    p_event_id    := 'evt_plan_verify_ord_002',
    p_event_type  := 'order.paid',
    p_checkout_id := 'chk_plan_verify_001',
    p_order_id    := 'ord_plan_verify_001',
    p_alliance_id := '<ALLIANCE_ID_TEST>'::uuid,
    p_user_id     := '<USER_ID_TEST>'::uuid,
    p_seasons     := 1,
    p_payload     := '{}'::jsonb
);
-- Expected: ('duplicate_purchase', <initial_seasons + 1 - used>)
```

- [ ] **Step 3: Verify DB state**

```sql
-- Alliance should be exactly +1 from initial
SELECT purchased_seasons FROM alliances WHERE id = '<ALLIANCE_ID_TEST>';
-- Expected: <initial_seasons + 1>

-- Three rows written, only one with seasons_added > 0
SELECT event_id, event_type, seasons_added, checkout_id, order_id
  FROM webhook_events
 WHERE checkout_id = 'chk_plan_verify_001'
 ORDER BY processed_at;
-- Expected: 3 rows
-- Row 1: evt_plan_verify_chk_001 / checkout.completed / seasons_added=0
-- Row 2: evt_plan_verify_ord_001 / order.paid         / seasons_added=1
-- Row 3: evt_plan_verify_ord_002 / order.paid         / seasons_added=0
```

- [ ] **Step 4: Rollback the test data**

```sql
BEGIN;
UPDATE alliances SET purchased_seasons = purchased_seasons - 1
 WHERE id = '<ALLIANCE_ID_TEST>' AND purchased_seasons = <initial_seasons + 1>;
DELETE FROM webhook_events WHERE checkout_id = 'chk_plan_verify_001';
COMMIT;
```

Then re-verify the alliance is back to `<initial_seasons>`.

- [ ] **Step 5: Exercise the out-of-order case (order.paid arrives first)**

This is the realistic alternative delivery order: Recur retries the `order.paid` event and it hits the backend before `checkout.completed`. Pick a new checkout id:

```sql
-- order.paid arrives first → granted
SELECT * FROM process_payment_webhook_event(
    p_event_id    := 'evt_plan_order_first_001',
    p_event_type  := 'order.paid',
    p_checkout_id := 'chk_plan_order_first',
    p_order_id    := 'ord_plan_order_first',
    p_alliance_id := '<ALLIANCE_ID_TEST>'::uuid,
    p_user_id     := '<USER_ID_TEST>'::uuid,
    p_seasons     := 1,
    p_payload     := '{}'::jsonb
);
-- Expected: ('granted', ...)

-- checkout.completed arrives AFTER → audit_only (sibling already granted)
SELECT * FROM process_payment_webhook_event(
    p_event_id    := 'evt_plan_order_first_chk_001',
    p_event_type  := 'checkout.completed',
    p_checkout_id := 'chk_plan_order_first',
    p_order_id    := NULL,
    p_alliance_id := '<ALLIANCE_ID_TEST>'::uuid,
    p_user_id     := '<USER_ID_TEST>'::uuid,
    p_seasons     := 0,
    p_payload     := '{}'::jsonb
);
-- Expected: ('audit_only', ...) — p_seasons=0 never tries to grant,
-- so it takes the audit-only fast path without hitting duplicate_purchase.
```

- [ ] **Step 6: Rollback the second test data set**

```sql
BEGIN;
UPDATE alliances SET purchased_seasons = purchased_seasons - 1
 WHERE id = '<ALLIANCE_ID_TEST>';
DELETE FROM webhook_events WHERE checkout_id = 'chk_plan_order_first';
COMMIT;
```

Verify alliance is back to `<initial_seasons>`.

---

## Task 8: Update MEMORY.md

**Why:** MEMORY.md Active Work is stale (describes the double-grant bug as open) and bloated (carries 50 lines of session log). Compress and update.

**Files:**
- Modify: `/Users/minweih/.claude/projects/-Users-minweih-Desktop-three-kingdoms-strategy/memory/MEMORY.md`
- Modify: `/Users/minweih/.claude/projects/-Users-minweih-Desktop-three-kingdoms-strategy/memory/project_recur_payment_hardening.md`

- [ ] **Step 1: Append a new section to `project_recur_payment_hardening.md`**

Add at the bottom of the file:

```markdown
## 6. Purchase-level idempotency (shipped 2026-04-09)

Same-order double-grant bug fixed by switching idempotency from
event-level (`event_id`) to purchase-level (`checkout_id`):

- **Policy**: only `order.paid` grants; `checkout.completed` is audit-only.
- **DB schema**: `webhook_events` gains `checkout_id` + `order_id`; partial
  unique index on `(checkout_id) WHERE seasons_added > 0`.
- **RPC**: new 8-arg signature with `pg_advisory_xact_lock(hashtext(checkout_id))`
  + sibling-grant existence check. Status values: `granted` | `duplicate_event` |
  `duplicate_purchase` | `audit_only`.
- **Reconcile**: `乃罷` demoted one row + decremented `purchased_seasons` 12→11.

Still deferred (not in 2026-04-09 plan):
- Fold alliance lookup into RPC (§3 above)
- Idempotency-check-before-validation reorder
- Frontend banner hardcoded success string
- `ALERT_WEBHOOK_URL` env var on Zeabur
```

- [ ] **Step 2: Rewrite MEMORY.md Active Work section**

Replace the entire `## Active Work` block (lines 1–46 approximately, up to the first `---`) with:

```markdown
## Active Work
Last: 2026-04-09 — Recur purchase-level idempotency shipped. `checkout_id` is now the purchase-level key; `order.paid` is the only granting event; `checkout.completed` writes audit-only rows. `乃罷` reconciled 12→11.

Next:
- 🔴 Frontend banner `已新增 1 季額度` is hardcoded — wire it to backend `available_seasons` or show "處理中" on pending. Currently lies on grant failure.
- 🔴 Set `ALERT_WEBHOOK_URL` on Zeabur before any go-live (Discord webhook). Without it, permanent errors are fully silent.
- 🔴 Go-live env swap: `sk_live_*` / `whsec_*` / prod `prod_*` product id on backend; `pk_live_*` / prod product id on frontend; register prod webhook URL in Recur dashboard.
- 🟡 Real NT$999 smoke test on prod — only after the three items above.
- 🟡 Fold alliance lookup into RPC (hardening doc §3) + reorder idempotency-before-validation — separate optimization pass.
- 🟢 Pre-existing dirty state (migration file, package-lock.json, `.playwright-mcp/`) — tracked outside Active Work.

See `project_recur_payment_hardening.md` §6 for the shipped design.
```

- [ ] **Step 3: Commit the memory updates**

```bash
git add /Users/minweih/.claude/projects/-Users-minweih-Desktop-three-kingdoms-strategy/memory/MEMORY.md /Users/minweih/.claude/projects/-Users-minweih-Desktop-three-kingdoms-strategy/memory/project_recur_payment_hardening.md
git commit -m "docs(memory): record 2026-04-09 purchase-level idempotency ship + compact Active Work"
```

(If the memory directory is not under git, skip the git add/commit — just save the files.)

---

## Self-Review Checklist (ran by plan author)

**Spec coverage:**
- [x] Double-grant root cause addressed — Task 2 (schema) + Task 3 (RPC) + Task 6 (service policy)
- [x] `checkout_id` as purchase-level key extracted from real payload — Task 6
- [x] Strict currency validation — Task 6 (with test in Task 6 Step 1)
- [x] Reconciliation of `乃罷` historical double-grant — Task 2 Step 1 (reconcile block runs before index creation)
- [x] Redundant btree index cleanup — Task 2 Step 1
- [x] Source-of-truth SQL committed for both old baseline and new RPC — Tasks 1 & 3
- [x] Real payload fixtures replacing synthetic dicts — Task 4
- [x] Repository + tests updated to v2 signature — Task 5
- [x] Service + tests updated to event-type routing — Task 6
- [x] E2E verification against real DB with rollback — Task 7
- [x] Memory hygiene — Task 8

**Placeholder scan:** No TBDs, no "handle edge cases", no "similar to Task N", no bare "write tests" without code.

**Type consistency:**
- RPC signature `(event_id, event_type, checkout_id, order_id, alliance_id, user_id, seasons, payload)` is used consistently in Tasks 3, 5, 6, 7.
- `WebhookProcessingResult.status` Literal = `granted | duplicate_event | duplicate_purchase | audit_only` — consistent across Tasks 3, 5, 6.
- `process_event` kwargs match across repository (Task 5) and service (Task 6): `checkout_id`, `order_id`, `seasons`, `payload`.
- `handle_payment_success` return dict keys — `status`, `alliance_id`, `user_id`, `checkout_id`, `order_id`, `seasons_added`, `available_seasons` — consistent with test assertions in Task 6.

No inconsistencies found.
