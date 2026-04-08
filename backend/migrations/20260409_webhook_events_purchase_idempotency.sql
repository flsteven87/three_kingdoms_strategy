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
