# Trial Auto-Convert on Purchase — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** When a user purchases season quota, automatically convert their trial season to a paid season (consuming 1 quota), so buying N seasons = N usable seasons total (not N + free trial).

**Architecture:** The conversion happens atomically inside the `process_payment_webhook_event` RPC (Step 6, after the existing grant logic). Frontend polling is changed from `available_seasons` to `purchased_seasons` to detect the grant even when trial conversion zeroes out the available count. A new `trial_converted` field in `SeasonQuotaStatus` tells the UI which success message to show.

**Tech Stack:** PostgreSQL RPC (plpgsql), Python FastAPI, React + TanStack Query

---

## Context & Problem

Current behavior:
- Trial activation does NOT increment `used_seasons` (trial is tracked via `season.is_trial` + 14-day window)
- Buying 1 season → `purchased=1, used=0, available=1` → trial season auto-revives via `can_write = purchased_seasons > 0`
- Net result: user gets trial season (free) + 1 new activation = **2 seasons for 1 purchase**

Desired behavior:
- Buying 1 season → trial season converts to paid (`is_trial=false`, `used_seasons += 1`) → `purchased=1, used=1, available=0`
- Net result: **1 season for 1 purchase** (the existing trial season, now permanent)

### Critical Gotcha: Polling Breakage

Current polling: `available_seasons > baseline` (baseline captured pre-checkout).
After trial convert: `purchased=1, used=1, available=0`. Baseline was 0 → still 0 → **poll never detects grant → timeout!**
Fix: poll on `purchased_seasons` instead.

---

## Task 1: SQL — Add Trial Conversion to Webhook RPC

**Files:**
- Create: `backend/migrations/20260410_process_payment_webhook_event_v3.sql`

**Step 1: Write the new RPC SQL**

Add Step 6 after the existing Step 5 (grant). The conversion finds any `is_trial=true` season for the alliance and flips it to paid, incrementing `used_seasons`. The returned `available_seasons` reflects the post-conversion state.

Also add a `trial_converted` boolean column to the return type.

```sql
-- 2026-04-10: Trial auto-convert on purchase.
--
-- Extends v2 with Step 6: after granting purchased seasons, auto-convert
-- any trial season to paid (is_trial=false, used_seasons += 1).
-- This ensures buying N seasons = N usable seasons (trial is not free).
--
-- New return column: trial_converted (boolean)
--
-- Status contract (unchanged):
--   granted            — this event caused the grant (+ possible trial convert)
--   duplicate_event    — same event_id delivered twice
--   duplicate_purchase — sibling event already granted for this checkout_id
--   audit_only         — p_seasons=0, row recorded, no grant

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
RETURNS TABLE(status text, available_seasons integer, trial_converted boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_inserted_rows  int;
    v_new_purchased  int;
    v_used           int;
    v_trial_converted boolean := false;
BEGIN
    IF p_seasons < 0 THEN
        RAISE EXCEPTION 'p_seasons must be >= 0, got %', p_seasons;
    END IF;
    IF p_checkout_id IS NULL OR p_checkout_id = '' THEN
        RAISE EXCEPTION 'p_checkout_id is required';
    END IF;

    -- Step 1: Claim the event_id slot (retry protection).
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
        SELECT a.purchased_seasons, a.used_seasons
          INTO v_new_purchased, v_used
          FROM public.alliances a
         WHERE a.id = p_alliance_id;

        RETURN QUERY SELECT
            'duplicate_event'::text,
            GREATEST(0, COALESCE(v_new_purchased, 0) - COALESCE(v_used, 0)),
            false;
        RETURN;
    END IF;

    -- Step 2: Audit-only path (checkout.completed).
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
            GREATEST(0, v_new_purchased - v_used),
            false;
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
            GREATEST(0, COALESCE(v_new_purchased, 0) - COALESCE(v_used, 0)),
            false;
        RETURN;
    END IF;

    -- Step 5: Promote our row + grant.
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

    -- Step 6: Auto-convert trial season to paid.
    -- If a trial season exists (activated or completed), convert it:
    --   - Set is_trial = false (permanent access)
    --   - Increment used_seasons (trial now counts against quota)
    -- At most one trial season can exist per alliance (first activation only).
    UPDATE public.seasons
       SET is_trial = false
     WHERE alliance_id = p_alliance_id
       AND is_trial = true
       AND activation_status IN ('activated', 'completed');

    IF FOUND THEN
        v_trial_converted := true;

        UPDATE public.alliances
           SET used_seasons = used_seasons + 1
         WHERE id = p_alliance_id
        RETURNING purchased_seasons, used_seasons
          INTO v_new_purchased, v_used;
    END IF;

    RETURN QUERY SELECT
        'granted'::text,
        GREATEST(0, v_new_purchased - v_used),
        v_trial_converted;
END;
$function$;
```

**Step 2: Deploy the RPC to Supabase**

Run this SQL via Supabase MCP (per project rules: no migration files in Supabase, direct SQL execution). The file in `backend/migrations/` is for version control only.

**Step 3: Commit**

```bash
git add backend/migrations/20260410_process_payment_webhook_event_v3.sql
git commit -m "feat(sql): add trial auto-convert to payment webhook RPC v3"
```

---

## Task 2: Backend — Update WebhookProcessingResult to Include trial_converted

**Files:**
- Modify: `backend/src/repositories/webhook_event_repository.py:44-53` (WebhookProcessingResult model)

**Step 1: Add `trial_converted` field to the result model**

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
    trial_converted: bool = False
```

**Step 2: Update the row-to-model mapping** (same file, line ~109)

```python
        return WebhookProcessingResult(
            status=row["status"],
            available_seasons=int(row["available_seasons"]),
            trial_converted=bool(row.get("trial_converted", False)),
        )
```

**Step 3: Propagate to PaymentService response**

Modify `backend/src/services/payment_service.py:120-128` to include `trial_converted`:

```python
        return {
            "status": result.status,
            "alliance_id": str(alliance.id),
            "user_id": str(user_id),
            "checkout_id": checkout_id,
            "order_id": order_id,
            "seasons_added": seasons_added,
            "available_seasons": result.available_seasons,
            "trial_converted": result.trial_converted,
        }
```

**Step 4: Run linter**

```bash
cd backend && uv run ruff check .
```

**Step 5: Commit**

```bash
git add backend/src/repositories/webhook_event_repository.py backend/src/services/payment_service.py
git commit -m "feat(backend): propagate trial_converted from webhook RPC to API response"
```

---

## Task 3: Backend — Update SeasonQuotaStatus with trial_converted Field

The frontend needs to know if a trial was converted so it can show the right success message. We add a `trial_converted` field to `SeasonQuotaStatus` that checks: does this alliance have `used_seasons > 0` AND does the current season have `is_trial = false` AND was it formerly a trial?

Actually, simpler approach: the frontend already has `current_season_is_trial`. After conversion, this flips from `true` to `false` naturally. The polling hook can detect this transition. **No new field needed on SeasonQuotaStatus** — the existing `current_season_is_trial` + `purchased_seasons` fields are sufficient.

**No changes needed in this task.** The RPC conversion updates `seasons.is_trial = false`, so `SeasonQuotaService._calculate_quota_status()` will naturally return `current_season_is_trial: false` after conversion.

---

## Task 4: Frontend — Fix Polling to Use purchased_seasons

**Files:**
- Modify: `frontend/src/hooks/use-purchase-flow.ts`

**Step 1: Change baseline capture and comparison to `purchased_seasons`**

The hook currently captures `available_seasons` as baseline and polls until it increases. After trial conversion, `available_seasons` may not increase (bought 1, used 1 = still 0). Change to `purchased_seasons` which always increases on purchase.

Replace the full hook:

```typescript
/**
 * Purchase Flow Hook — Baseline-aware polling for season-quota grant.
 *
 * Polls `/api/v1/season-quota` until `purchased_seasons` strictly increases
 * above the pre-checkout baseline, confirming the backend webhook granted
 * the purchase. Uses `purchased_seasons` (not `available_seasons`) because
 * trial auto-conversion may consume the newly granted season immediately,
 * leaving `available_seasons` unchanged.
 */

import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useSeasonQuota, seasonQuotaKeys } from './use-season-quota'

export type PaymentFlowState = 'idle' | 'pending' | 'granted' | 'timeout'

const POLL_INTERVAL_MS = 2000
const POLL_TIMEOUT_MS = 30_000

export interface UsePurchaseFlowResult {
  readonly state: PaymentFlowState
  readonly availableSeasons: number | null
  readonly trialConverted: boolean
  /**
   * Start polling for a grant.
   *
   * @param baseline - pre-purchase `purchased_seasons` snapshot (modal path).
   *                   Pass `null` when baseline is unknown (redirect path).
   */
  readonly startPolling: (baseline: number | null) => void
  readonly reset: () => void
}

export function usePurchaseFlow(): UsePurchaseFlowResult {
  const [state, setState] = useState<PaymentFlowState>('idle')
  const baselineRef = useRef<number | null>(null)
  const [trialConverted, setTrialConverted] = useState(false)
  const queryClient = useQueryClient()

  const isPolling = state === 'pending'
  const { data: quota } = useSeasonQuota(
    isPolling ? { refetchInterval: POLL_INTERVAL_MS } : undefined,
  )

  const currentPurchased = quota?.purchased_seasons ?? null

  // Watch for grant: flips state to 'granted' when purchased_seasons
  // crosses the baseline. For the redirect path (baseline=null), accept
  // any positive purchased_seasons as evidence of a successful grant.
  useEffect(() => {
    if (state !== 'pending' || currentPurchased == null) return

    const baseline = baselineRef.current
    const granted =
      baseline == null ? currentPurchased > 0 : currentPurchased > baseline

    if (granted) {
      // Detect trial conversion: if current season is no longer trial
      // after purchase, the RPC converted it.
      setTrialConverted(quota?.current_season_is_trial === false && (quota?.used_seasons ?? 0) > 0)
      setState('granted')
    }
  }, [state, currentPurchased, quota?.current_season_is_trial, quota?.used_seasons])

  // Hard timeout
  useEffect(() => {
    if (state !== 'pending') return
    const timerId = setTimeout(() => {
      setState((prev) => (prev === 'pending' ? 'timeout' : prev))
    }, POLL_TIMEOUT_MS)
    return () => clearTimeout(timerId)
  }, [state])

  const startPolling = (baseline: number | null) => {
    baselineRef.current = baseline
    setTrialConverted(false)
    setState('pending')
    void queryClient.invalidateQueries({ queryKey: seasonQuotaKeys.all })
  }

  const reset = () => {
    baselineRef.current = null
    setTrialConverted(false)
    setState('idle')
  }

  return {
    state,
    availableSeasons: quota?.available_seasons ?? null,
    trialConverted,
    startPolling,
    reset,
  }
}
```

**Step 2: Update baseline capture in PurchaseSeason.tsx**

In `frontend/src/pages/PurchaseSeason.tsx`, change the baseline from `available_seasons` to `purchased_seasons`:

Line ~220:
```typescript
// Before:
const baselineSeasons = quotaStatus?.available_seasons ?? 0
// After:
const baselineSeasons = quotaStatus?.purchased_seasons ?? 0
```

**Step 3: Run type check**

```bash
cd frontend && npx tsc --noEmit
```

**Step 4: Commit**

```bash
git add frontend/src/hooks/use-purchase-flow.ts frontend/src/pages/PurchaseSeason.tsx
git commit -m "fix(frontend): poll on purchased_seasons to detect grant after trial conversion"
```

---

## Task 5: Frontend — Update Success Banner for Trial Conversion

**Files:**
- Modify: `frontend/src/pages/PurchaseSeason.tsx` (PaymentStatusBanner component)

**Step 1: Pass `trialConverted` to the banner**

Update the `PaymentStatusBannerProps` interface and the banner's granted state to show context-aware messaging:

```typescript
interface PaymentStatusBannerProps {
  readonly state: PaymentFlowState
  readonly availableSeasons: number | null
  readonly trialConverted: boolean
  readonly onClose: () => void
  readonly onNavigateToSeasons: () => void
}
```

**Step 2: Update the granted banner content**

In the `// granted` return block of `PaymentStatusBanner`:

```typescript
  // granted
  return (
    <div className="mx-auto max-w-md rounded-xl border border-green-200 bg-green-50 p-4 animate-in fade-in slide-in-from-top-2 duration-300 dark:border-green-800 dark:bg-green-950">
      <div className="flex items-start gap-3">
        <CheckCircle className="h-5 w-5 flex-shrink-0 text-green-600 dark:text-green-400" />
        <div className="flex-1 space-y-2">
          <p className="font-medium text-green-800 dark:text-green-200">付款成功</p>
          <p className="text-sm text-green-700 dark:text-green-300">
            {trialConverted
              ? '你的賽季已升級為正式版，可以繼續使用'
              : availableSeasons != null
                ? `額度已入帳，目前共 ${availableSeasons} 季可用`
                : '額度已入帳'}
          </p>
          <button
            type="button"
            onClick={onNavigateToSeasons}
            className="mt-1 text-sm font-medium text-green-700 underline-offset-4 hover:underline dark:text-green-300"
          >
            {trialConverted ? '回到賽季 →' : '開始新賽季 →'}
          </button>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex-shrink-0 rounded-md p-1 text-green-600 transition-colors hover:bg-green-100 dark:text-green-400 dark:hover:bg-green-900"
          aria-label="關閉"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
```

**Step 3: Update the banner invocation** (~line 348)

```tsx
<PaymentStatusBanner
  state={purchaseFlow.state}
  availableSeasons={purchaseFlow.availableSeasons}
  trialConverted={purchaseFlow.trialConverted}
  onClose={closeBanner}
  onNavigateToSeasons={handleNavigateToSeasons}
/>
```

**Step 4: Update the FAQ** (~line 137)

The FAQ about trial expiration should reflect that purchasing converts the trial season:

```typescript
  {
    question: '試用期結束後會怎樣？',
    answer:
      '14 天試用期間可以無限使用。試用結束後需要購買才能繼續，購買後你的賽季會自動升級為正式版，所有數據都會保留。',
  },
```

**Step 5: Run lint + type check**

```bash
cd frontend && npx tsc --noEmit && npm run lint
```

**Step 6: Commit**

```bash
git add frontend/src/pages/PurchaseSeason.tsx
git commit -m "feat(frontend): context-aware success banner for trial conversion"
```

---

## Task 6: Backend — Update Existing Tests

**Files:**
- Modify: `backend/tests/unit/services/test_payment_service.py`
- Modify: `backend/tests/unit/services/test_season_quota_service.py`

**Step 1: Update payment service test mocks**

Any test that mocks `WebhookProcessingResult` needs the new `trial_converted` field:

```python
WebhookProcessingResult(status="granted", available_seasons=1, trial_converted=False)
```

**Step 2: Run existing tests to confirm nothing is broken**

```bash
cd backend && uv run pytest tests/ -v --tb=short
```

**Step 3: Add a test for trial conversion scenario**

In `test_season_quota_service.py`, add a test that verifies the _can_write logic still works correctly when `purchased_seasons > 0` and `is_trial = false` (post-conversion state):

```python
async def test_can_write_after_trial_conversion():
    """After trial conversion, season.is_trial=False but purchased_seasons > 0 → can_write=True."""
    alliance = Alliance(
        id=uuid4(), name="Test", purchased_seasons=1, used_seasons=1,
        created_at=datetime.now(UTC), updated_at=datetime.now(UTC),
    )
    season = Season(
        id=uuid4(), alliance_id=alliance.id, name="S1",
        is_trial=False,  # converted from trial
        activation_status="activated",
        activated_at=datetime.now(UTC),
    )
    service = SeasonQuotaService()
    result = await service._can_write_to_season(alliance, season)
    assert result is True
```

**Step 4: Run all tests**

```bash
cd backend && uv run pytest tests/ -v --tb=short
```

**Step 5: Commit**

```bash
git add backend/tests/
git commit -m "test(backend): update payment tests for trial_converted field"
```

---

## Task 7: Frontend — Update Quota Status Text for Post-Conversion State

**Files:**
- Modify: `frontend/src/pages/PurchaseSeason.tsx` (getQuotaStatusText function)
- Modify: `frontend/src/types/season-quota.ts` (warning messages)

**Step 1: Update getQuotaStatusText in PurchaseSeason.tsx**

The status text section (~line 302) should handle the post-conversion state where `current_season_is_trial = false` and `available_seasons = 0` but `can_write = true`:

```typescript
  const getQuotaStatusText = () => {
    if (isQuotaLoading || !quotaStatus) {
      return '載入中...'
    }

    const { available_seasons, has_trial_available, current_season_is_trial, trial_days_remaining, can_write } = quotaStatus

    if (has_trial_available) {
      return '尚未使用試用，啟用第一個賽季即可開始 14 天試用'
    }

    if (current_season_is_trial && trial_days_remaining !== null && trial_days_remaining > 0) {
      return `試用期剩餘 ${trial_days_remaining} 天`
    }

    if (available_seasons > 0) {
      return `剩餘 ${available_seasons} 季可啟用`
    }

    if (can_write) {
      return '賽季使用中'
    }

    return '已用完，購買後可繼續使用'
  }
```

**Step 2: Update warning message for expired trial**

In `frontend/src/types/season-quota.ts`, line ~57, the expired message for trial should clarify what purchase does:

```typescript
    case 'expired':
      if (status.current_season_is_trial) {
        return '試用期已結束，購買後自動升級為正式版'
      }
      return '目前沒有可用賽季，歡迎購買以繼續使用'
```

**Step 3: Run type check**

```bash
cd frontend && npx tsc --noEmit
```

**Step 4: Commit**

```bash
git add frontend/src/pages/PurchaseSeason.tsx frontend/src/types/season-quota.ts
git commit -m "feat(frontend): update quota status text for trial conversion UX"
```

---

## Verification Checklist

After all tasks are complete, verify these scenarios manually or with the test suite:

| # | Scenario | Expected State After Purchase |
|---|----------|-------------------------------|
| 1 | Trial active (day 5), buy 1 | `purchased=1, used=1, available=0, is_trial=false, can_write=true` |
| 2 | Trial expired, buy 1 | Same as #1 — season restored |
| 3 | Trial completed, buy 1 | `purchased=1, used=1, available=0` — completed season converted |
| 4 | No trial (never activated), buy 1 | `purchased=1, used=0, available=1, trial_converted=false` |
| 5 | Already purchased before, buy again | `purchased=N+1, used=M, available=N+1-M` — no conversion |
| 6 | Buy 2 with trial | `purchased=2, used=1, available=1` — trial converts, 1 left |
| 7 | Duplicate webhook (same event_id) | `duplicate_event` — no double-convert |
| 8 | Sibling event (checkout.completed after order.paid) | `duplicate_purchase` — no double-grant |

### Polling Verification

| Path | Baseline | Detection |
|------|----------|-----------|
| Modal (with baseline) | `purchased_seasons` pre-checkout | `purchased > baseline` |
| Redirect (no baseline) | null | `purchased > 0` |
| Trial conversion | `purchased=0` → `purchased=1` | Detected (1 > 0) even though available stays 0 |
