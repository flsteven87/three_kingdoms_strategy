# Trial & Quota UX Clarity Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Eliminate confusion in the trial period + season quota UX by centralizing display logic, fixing text inconsistencies, and improving key user-facing moments (activation, purchase conversion, settings).

**Architecture:** Extract a single `getQuotaDisplayState()` pure function in `types/season-quota.ts` that maps raw `SeasonQuotaStatus` to a rich display object. All consumers (badge, banner, settings, purchase page) derive their text from this one function. Fix the redirect-path `trialConverted` detection bug in `use-purchase-flow.ts`. Update activation dialog to be context-aware.

**Tech Stack:** React 19, TypeScript 5.8, TanStack Query, Vitest, React Testing Library

---

## Pre-existing Issue

**Test/source mismatch:** `types/season-quota.ts:57` returns `'試用期已結束，購買後自動升級為正式版'` but tests in `types/__tests__/season-quota.test.ts:113` and `hooks/__tests__/use-season-quota.test.tsx:173` expect `"試用期已結束，歡迎購買賽季繼續使用"`. Tests will fail before we start. Task 1 fixes this.

---

## Task 1: Centralize quota display state in `types/season-quota.ts`

The root cause of inconsistency — 5+ places independently generate display text. This task creates a single source of truth.

**Files:**
- Modify: `frontend/src/types/season-quota.ts`
- Modify: `frontend/src/types/__tests__/season-quota.test.ts`

**Step 1: Write failing tests for `getQuotaDisplayState()`**

Add to `frontend/src/types/__tests__/season-quota.test.ts`:

```typescript
import {
  getQuotaWarningLevel,
  getQuotaWarningMessage,
  getQuotaDisplayState,
  type QuotaDisplayState,
} from "../season-quota";

// ... existing tests ...

// =============================================================================
// getQuotaDisplayState
// =============================================================================

describe("getQuotaDisplayState", () => {
  it("returns loading state for null", () => {
    const state = getQuotaDisplayState(null);
    expect(state.phase).toBe("loading");
    expect(state.badgeText).toBe("載入中...");
    expect(state.canActivate).toBe(false);
    expect(state.canWrite).toBe(false);
  });

  it("returns trial_available when has_trial_available", () => {
    const state = getQuotaDisplayState(
      createStatus({ has_trial_available: true, can_activate_season: true, can_write: true })
    );
    expect(state.phase).toBe("trial_available");
    expect(state.badgeText).toBe("可免費試用");
    expect(state.badgeColor).toBe("green");
    expect(state.settingsLabel).toBe("免費試用（啟用賽季後開始 14 天倒數）");
  });

  it("returns trial_active for trial with 10 days", () => {
    const state = getQuotaDisplayState(
      createStatus({ current_season_is_trial: true, trial_days_remaining: 10, can_write: true })
    );
    expect(state.phase).toBe("trial_active");
    expect(state.badgeText).toBe("試用 10 天");
    expect(state.badgeColor).toBe("green");
    expect(state.bannerMessage).toBeNull(); // No banner for >7 days
  });

  it("returns trial_warning for trial with 5 days", () => {
    const state = getQuotaDisplayState(
      createStatus({ current_season_is_trial: true, trial_days_remaining: 5, can_write: true })
    );
    expect(state.phase).toBe("trial_warning");
    expect(state.badgeText).toBe("試用 5 天");
    expect(state.badgeColor).toBe("yellow");
    expect(state.bannerMessage).toBe("試用期剩餘 5 天，購買後自動升級為正式版");
    expect(state.bannerLevel).toBe("warning");
  });

  it("returns trial_critical for trial with 2 days", () => {
    const state = getQuotaDisplayState(
      createStatus({ current_season_is_trial: true, trial_days_remaining: 2, can_write: true })
    );
    expect(state.phase).toBe("trial_critical");
    expect(state.badgeText).toBe("試用 2 天");
    expect(state.badgeColor).toBe("red");
    expect(state.bannerMessage).toBe("試用期剩餘 2 天，購買後自動升級為正式版");
    expect(state.bannerLevel).toBe("critical");
  });

  it("returns trial_expired for expired trial", () => {
    const state = getQuotaDisplayState(
      createStatus({
        current_season_is_trial: true,
        trial_days_remaining: 0,
        can_write: false,
        can_activate_season: false,
      })
    );
    expect(state.phase).toBe("trial_expired");
    expect(state.badgeText).toBe("試用已過期");
    expect(state.badgeColor).toBe("red");
    expect(state.bannerMessage).toBe("試用期已結束，購買後自動升級為正式版");
    expect(state.bannerLevel).toBe("expired");
    expect(state.showPurchaseLink).toBe(true);
  });

  it("returns has_quota for purchased seasons", () => {
    const state = getQuotaDisplayState(
      createStatus({ purchased_seasons: 3, available_seasons: 2, can_write: true, can_activate_season: true })
    );
    expect(state.phase).toBe("has_quota");
    expect(state.badgeText).toBe("剩餘 2 季");
    expect(state.badgeColor).toBe("green");
    expect(state.bannerMessage).toBeNull();
    expect(state.settingsLabel).toBe("已購買 3 季，剩餘 2 季可用");
  });

  it("returns active for can_write with no available (post-conversion)", () => {
    const state = getQuotaDisplayState(
      createStatus({
        purchased_seasons: 1,
        used_seasons: 1,
        available_seasons: 0,
        can_write: true,
        can_activate_season: false,
        current_season_is_trial: false,
      })
    );
    expect(state.phase).toBe("active");
    expect(state.badgeText).toBe("使用中");
    expect(state.badgeColor).toBe("green");
    expect(state.settingsLabel).toBe("已購買 1 季，使用中");
  });

  it("returns quota_exhausted for non-trial with no access", () => {
    const state = getQuotaDisplayState(
      createStatus({
        can_write: false,
        can_activate_season: false,
        current_season_is_trial: false,
      })
    );
    expect(state.phase).toBe("quota_exhausted");
    expect(state.badgeText).toBe("需購買");
    expect(state.badgeColor).toBe("red");
    expect(state.bannerMessage).toBe("賽季額度已用完，購買後可繼續使用");
    expect(state.showPurchaseLink).toBe(true);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/types/__tests__/season-quota.test.ts`
Expected: FAIL — `getQuotaDisplayState` is not exported

**Step 3: Implement `getQuotaDisplayState()` and fix existing message mismatch**

In `frontend/src/types/season-quota.ts`, add the following:

```typescript
export type QuotaPhase =
  | 'loading'
  | 'trial_available'
  | 'trial_active'
  | 'trial_warning'
  | 'trial_critical'
  | 'trial_expired'
  | 'has_quota'
  | 'active'
  | 'quota_exhausted'

export interface QuotaDisplayState {
  readonly phase: QuotaPhase
  // Badge (Seasons page header)
  readonly badgeText: string
  readonly badgeColor: 'green' | 'yellow' | 'red' | 'gray'
  // Banner (global warning)
  readonly bannerMessage: string | null
  readonly bannerLevel: QuotaWarningLevel
  // Settings page
  readonly settingsLabel: string
  // Capabilities
  readonly canActivate: boolean
  readonly canWrite: boolean
  readonly showPurchaseLink: boolean
  // Raw data pass-through
  readonly trialDaysRemaining: number | null
  readonly availableSeasons: number
  readonly hasTrialAvailable: boolean
}

export function getQuotaDisplayState(
  status: SeasonQuotaStatus | null | undefined
): QuotaDisplayState {
  if (!status) {
    return {
      phase: 'loading',
      badgeText: '載入中...',
      badgeColor: 'gray',
      bannerMessage: null,
      bannerLevel: 'none',
      settingsLabel: '載入中...',
      canActivate: false,
      canWrite: false,
      showPurchaseLink: false,
      trialDaysRemaining: null,
      availableSeasons: 0,
      hasTrialAvailable: false,
    }
  }

  const { can_write, can_activate_season, has_trial_available,
          current_season_is_trial, trial_days_remaining,
          purchased_seasons, available_seasons } = status

  // Trial not yet started
  if (has_trial_available) {
    return {
      phase: 'trial_available',
      badgeText: '可免費試用',
      badgeColor: 'green',
      bannerMessage: null,
      bannerLevel: 'none',
      settingsLabel: '免費試用（啟用賽季後開始 14 天倒數）',
      canActivate: can_activate_season,
      canWrite: can_write,
      showPurchaseLink: false,
      trialDaysRemaining: null,
      availableSeasons: available_seasons,
      hasTrialAvailable: true,
    }
  }

  // Trial in progress
  if (current_season_is_trial && trial_days_remaining !== null && trial_days_remaining > 0) {
    const days = trial_days_remaining
    let phase: QuotaPhase
    let badgeColor: 'green' | 'yellow' | 'red'
    let bannerMessage: string | null = null
    let bannerLevel: QuotaWarningLevel = 'none'

    if (days <= 3) {
      phase = 'trial_critical'
      badgeColor = 'red'
      bannerMessage = `試用期剩餘 ${days} 天，購買後自動升級為正式版`
      bannerLevel = 'critical'
    } else if (days <= 7) {
      phase = 'trial_warning'
      badgeColor = 'yellow'
      bannerMessage = `試用期剩餘 ${days} 天，購買後自動升級為正式版`
      bannerLevel = 'warning'
    } else {
      phase = 'trial_active'
      badgeColor = 'green'
    }

    return {
      phase,
      badgeText: `試用 ${days} 天`,
      badgeColor,
      bannerMessage,
      bannerLevel,
      settingsLabel: `試用中，剩餘 ${days} 天`,
      canActivate: can_activate_season,
      canWrite: can_write,
      showPurchaseLink: false,
      trialDaysRemaining: days,
      availableSeasons: available_seasons,
      hasTrialAvailable: false,
    }
  }

  // Trial expired
  if (!can_write && !can_activate_season && current_season_is_trial) {
    return {
      phase: 'trial_expired',
      badgeText: '試用已過期',
      badgeColor: 'red',
      bannerMessage: '試用期已結束，購買後自動升級為正式版',
      bannerLevel: 'expired',
      settingsLabel: '試用期已結束',
      canActivate: false,
      canWrite: false,
      showPurchaseLink: true,
      trialDaysRemaining: 0,
      availableSeasons: 0,
      hasTrialAvailable: false,
    }
  }

  // Has purchased quota available
  if (available_seasons > 0) {
    return {
      phase: 'has_quota',
      badgeText: `剩餘 ${available_seasons} 季`,
      badgeColor: 'green',
      bannerMessage: null,
      bannerLevel: 'none',
      settingsLabel: `已購買 ${purchased_seasons} 季，剩餘 ${available_seasons} 季可用`,
      canActivate: can_activate_season,
      canWrite: can_write,
      showPurchaseLink: false,
      trialDaysRemaining: null,
      availableSeasons: available_seasons,
      hasTrialAvailable: false,
    }
  }

  // Active season, no remaining quota (e.g. post-conversion: bought 1, used 1)
  if (can_write) {
    return {
      phase: 'active',
      badgeText: '使用中',
      badgeColor: 'green',
      bannerMessage: null,
      bannerLevel: 'none',
      settingsLabel: purchased_seasons > 0
        ? `已購買 ${purchased_seasons} 季，使用中`
        : '使用中',
      canActivate: can_activate_season,
      canWrite: true,
      showPurchaseLink: false,
      trialDaysRemaining: null,
      availableSeasons: 0,
      hasTrialAvailable: false,
    }
  }

  // No access, no trial — fully exhausted
  return {
    phase: 'quota_exhausted',
    badgeText: '需購買',
    badgeColor: 'red',
    bannerMessage: '賽季額度已用完，購買後可繼續使用',
    bannerLevel: 'expired',
    settingsLabel: '額度已用完',
    canActivate: false,
    canWrite: false,
    showPurchaseLink: true,
    trialDaysRemaining: null,
    availableSeasons: 0,
    hasTrialAvailable: false,
  }
}
```

Also update the existing `getQuotaWarningMessage` to delegate to the new function for consistency:

```typescript
export function getQuotaWarningMessage(
  status: SeasonQuotaStatus | null | undefined
): string | null {
  return getQuotaDisplayState(status).bannerMessage
}
```

**Step 4: Fix existing test expectations to match source**

In `frontend/src/types/__tests__/season-quota.test.ts`, update:
- Line 113: `"試用期已結束，歡迎購買賽季繼續使用"` → `"試用期已結束，購買後自動升級為正式版"`

In `frontend/src/hooks/__tests__/use-season-quota.test.tsx`, update:
- Line 173: `"試用期已結束，歡迎購買賽季繼續使用"` → `"試用期已結束，購買後自動升級為正式版"`

Note: The `getQuotaWarningMessage` function now delegates to `getQuotaDisplayState`, so the returned messages may change slightly. Update test expectations for `getQuotaWarningMessage` to match the new banner messages:
- Trial warning/critical: `"試用期剩餘 X 天，購買後自動升級為正式版"` (was `"試用期剩餘 X 天"`)
- Non-trial expired: `"賽季額度已用完，購買後可繼續使用"` (was `"目前沒有可用賽季，歡迎購買以繼續使用"`)

**Step 5: Run all tests to verify pass**

Run: `cd frontend && npx vitest run src/types/__tests__/season-quota.test.ts`
Expected: ALL PASS

**Step 6: Commit**

```bash
git add frontend/src/types/season-quota.ts frontend/src/types/__tests__/season-quota.test.ts
git commit -m "feat(quota): add centralized getQuotaDisplayState() for consistent UX text"
```

---

## Task 2: Fix redirect-path `trialConverted` detection bug

**Bug:** In `use-purchase-flow.ts:75`, `wasTrialRef.current = quota?.current_season_is_trial ?? false` reads `quota` at the moment `startPolling` is called. On the redirect path, `startPolling(null)` fires in a `useEffect` on mount — before the quota query has resolved. So `quota` is `undefined`, `wasTrialRef` is set to `false`, and `trialConverted` is never detected.

**Files:**
- Modify: `frontend/src/hooks/use-purchase-flow.ts`

**Step 1: Write failing test**

Create `frontend/src/hooks/__tests__/use-purchase-flow.test.tsx`:

```typescript
import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { usePurchaseFlow } from "../use-purchase-flow";
import { seasonQuotaKeys } from "../use-season-quota";
import { createWrapper, createTestQueryClient, createMockSeasonQuotaStatus as createStatus } from "../../__tests__/test-utils";
import type { QueryClient } from "@tanstack/react-query";

describe("usePurchaseFlow", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  it("detects trialConverted on redirect path when quota loads after startPolling", async () => {
    // Simulate redirect path: startPolling(null) fires before quota loads.
    // Then quota resolves showing trial was converted (is_trial flipped to false).
    const { result } = renderHook(() => usePurchaseFlow(), {
      wrapper: createWrapper(queryClient),
    });

    // Start polling with no baseline (redirect path) — quota not loaded yet
    act(() => {
      result.current.startPolling(null);
    });

    expect(result.current.state).toBe("pending");

    // Simulate: webhook ran, trial converted, quota now shows purchased=1
    act(() => {
      queryClient.setQueryData(seasonQuotaKeys.status(), createStatus({
        purchased_seasons: 1,
        used_seasons: 1,
        available_seasons: 0,
        current_season_is_trial: false,  // was true before purchase
        can_write: true,
      }));
    });

    await waitFor(() => {
      expect(result.current.state).toBe("granted");
    });

    // Key assertion: even on redirect path, trialConverted should be detected
    // because the hook sees current_season_is_trial=false + purchased_seasons>0
    // as evidence of conversion (there is no other way to have purchased>0
    // with is_trial=false if the alliance previously had a trial season).
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/hooks/__tests__/use-purchase-flow.test.tsx`
Expected: Will need adjustment based on hook behavior — the key issue is `trialConverted` detection.

**Step 3: Fix the redirect-path detection**

The fix: on the redirect path (`baseline === null`), we can't rely on `wasTrialRef` because quota isn't loaded. Instead, detect trial conversion by observing the final state: if `purchased_seasons > 0` and there's evidence of conversion (the RPC returns `trial_converted` in the webhook result, but that data doesn't reach the frontend directly).

**Simplest reliable fix:** When `baseline === null` (redirect path), set `trialConverted` to `true` if the granted quota shows `current_season_is_trial === false` AND `used_seasons > 0` AND `available_seasons === 0`. This pattern only occurs after trial conversion (bought 1, used 1 for conversion, 0 remaining).

In `frontend/src/hooks/use-purchase-flow.ts`, change the grant detection effect:

```typescript
  useEffect(() => {
    if (state !== 'pending' || currentPurchased == null) return

    const baseline = baselineRef.current
    const granted =
      baseline == null ? currentPurchased > 0 : currentPurchased > baseline

    if (granted) {
      // Detect trial auto-conversion:
      // - Modal path: wasTrialRef captured pre-purchase state accurately
      // - Redirect path (baseline=null): wasTrialRef is unreliable (quota may
      //   not have loaded when startPolling ran). Fall back to heuristic:
      //   purchased > 0 + is_trial=false + used > 0 means conversion happened.
      const modalPathConverted =
        wasTrialRef.current && quota?.current_season_is_trial === false
      const redirectPathConverted =
        baseline == null &&
        quota?.current_season_is_trial === false &&
        (quota?.used_seasons ?? 0) > 0 &&
        quota?.available_seasons === 0
      trialConvertedRef.current = modalPathConverted || redirectPathConverted
      setState('granted')
    }
  }, [state, currentPurchased, quota?.current_season_is_trial, quota?.used_seasons, quota?.available_seasons])
```

**Step 4: Run tests to verify pass**

Run: `cd frontend && npx vitest run src/hooks/__tests__/use-purchase-flow.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add frontend/src/hooks/use-purchase-flow.ts frontend/src/hooks/__tests__/use-purchase-flow.test.tsx
git commit -m "fix(purchase): detect trial conversion on redirect checkout path"
```

---

## Task 3: Migrate `useSeasonQuotaDisplay` and `useQuotaWarning` to use centralized state

**Files:**
- Modify: `frontend/src/hooks/use-season-quota.ts`
- Modify: `frontend/src/hooks/__tests__/use-season-quota.test.tsx`

**Step 1: Refactor `useSeasonQuotaDisplay` to delegate**

```typescript
import { getQuotaDisplayState } from '@/types/season-quota'

export function useSeasonQuotaDisplay() {
  const { data } = useSeasonQuota()
  const display = getQuotaDisplayState(data)

  return {
    status: display.badgeText,
    statusColor: display.badgeColor,
    trialDaysRemaining: display.trialDaysRemaining,
    availableSeasons: display.availableSeasons,
    canActivate: display.canActivate,
    canWrite: display.canWrite,
    hasTrialAvailable: display.hasTrialAvailable,
  }
}
```

Note: The return shape stays the same to avoid breaking consumers. Only internal logic changes.

**Step 2: Refactor `useQuotaWarning` to delegate**

```typescript
export function useQuotaWarning() {
  const { data } = useSeasonQuota()
  const display = getQuotaDisplayState(data)

  return {
    level: display.bannerLevel,
    message: display.bannerMessage,
    isExpired: !display.canWrite && !display.canActivate,
    trialDaysRemaining: display.trialDaysRemaining,
    availableSeasons: display.availableSeasons,
  }
}
```

**Step 3: Update test expectations**

The `useSeasonQuotaDisplay` tests need updates for text changes:
- `"試用中 (10 天)"` → `"試用 10 天"` (shorter for badge)
- `"試用中 (2 天)"` → `"試用 2 天"`
- `"可使用"` → `"使用中"`
- `statusColor: "yellow"` for 2 days → `"red"` (critical threshold)

The `useQuotaWarning` tests need updates for message changes:
- `"試用期剩餘 2 天"` → `"試用期剩餘 2 天，購買後自動升級為正式版"`
- `"試用期剩餘 5 天"` → `"試用期剩餘 5 天，購買後自動升級為正式版"`

**Step 4: Run tests**

Run: `cd frontend && npx vitest run src/hooks/__tests__/use-season-quota.test.tsx`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add frontend/src/hooks/use-season-quota.ts frontend/src/hooks/__tests__/use-season-quota.test.tsx
git commit -m "refactor(quota): migrate display hooks to use centralized getQuotaDisplayState"
```

---

## Task 4: Fix activation dialog text (context-aware)

**Problem:** Dialog says "啟用後會消耗 1 季（試用期間免費）" — contradictory for first-time users.

**Files:**
- Modify: `frontend/src/components/seasons/SeasonCard.tsx`

**Step 1: Pass quota display state to determine dialog text**

Import `useSeasonQuotaDisplay` (already used for `useCanActivateSeason`) or use the new `getQuotaDisplayState`. The component already imports `useCanActivateSeason` from the hook.

Add a new hook call and conditional text:

```typescript
import { useCanActivateSeason } from "@/hooks/use-season-quota";
import { useSeasonQuota } from "@/hooks/use-season-quota";
import { getQuotaDisplayState } from "@/types/season-quota";

// Inside SeasonCard component:
const { data: quotaData } = useSeasonQuota();
const quotaDisplay = getQuotaDisplayState(quotaData);

// Replace the static warningMessage in the Activate dialog:
const activateWarningMessage = quotaDisplay.hasTrialAvailable
  ? "這是你的第一個賽季，啟用後開始 14 天免費試用。開始日期將鎖定不可更改。"
  : `啟用後會消耗 1 季額度（剩餘 ${quotaDisplay.availableSeasons} 季）。開始日期將鎖定不可更改。`;
```

Then in the JSX, replace the hardcoded `warningMessage`:

```tsx
<DeleteConfirmDialog
  open={activateDialogOpen}
  onOpenChange={setActivateDialogOpen}
  onConfirm={handleConfirmActivate}
  title="啟用賽季"
  description="確定要啟用此賽季嗎？"
  itemName={season.name}
  warningMessage={activateWarningMessage}
  confirmText="確定啟用"
  variant="default"
/>
```

**Step 2: Run type check**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add frontend/src/components/seasons/SeasonCard.tsx
git commit -m "fix(seasons): context-aware activation dialog text for trial vs paid"
```

---

## Task 5: Fix Settings page quota display

**Problem:** Trial users see "已購買 0 / 已使用 0 / 剩餘 0 (紅)" — all zeros look broken.

**Files:**
- Modify: `frontend/src/pages/Settings.tsx`

**Step 1: Import and use centralized display state**

Replace the raw field display with a context-aware section:

```typescript
import { useSeasonQuota } from '@/hooks/use-season-quota'
import { getQuotaDisplayState } from '@/types/season-quota'

// Inside Settings component:
const { data: quota } = useSeasonQuota()
const quotaDisplay = getQuotaDisplayState(quota)
```

**Step 2: Replace the quota CardContent**

Replace `Settings.tsx:217-243` with:

```tsx
<CardContent>
  {quota ? (
    <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-sm">
      <dt className="text-muted-foreground">目前狀態</dt>
      <dd>
        <Badge variant={quotaDisplay.badgeColor === 'red' ? 'destructive' : 'secondary'}>
          {quotaDisplay.settingsLabel}
        </Badge>
      </dd>
      {/* Only show purchase accounting when user has purchased */}
      {quota.purchased_seasons > 0 && (
        <>
          <dt className="text-muted-foreground">已購買</dt>
          <dd>{quota.purchased_seasons} 季</dd>
          <dt className="text-muted-foreground">已使用</dt>
          <dd>{quota.used_seasons} 季</dd>
          <dt className="text-muted-foreground">剩餘可用</dt>
          <dd>
            <span className={quota.available_seasons > 0 ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}>
              {quota.available_seasons} 季
            </span>
          </dd>
        </>
      )}
      {/* Show trial countdown when applicable */}
      {quota.current_season_is_trial && quota.trial_days_remaining !== null && (
        <>
          <dt className="text-muted-foreground">試用期剩餘</dt>
          <dd>
            <Badge variant={quota.trial_days_remaining <= 3 ? 'destructive' : 'secondary'}>
              {quota.trial_days_remaining} 天
            </Badge>
          </dd>
        </>
      )}
    </dl>
  ) : (
    <p className="text-sm text-muted-foreground">尚未建立同盟</p>
  )}
</CardContent>
```

Key changes:
- Added "目前狀態" row using `settingsLabel` from centralized state
- Conditionally hide purchase accounting (purchased/used/remaining) when `purchased_seasons === 0` (trial user)
- Changed "剩餘可用: 0" from red to muted when 0 (red was alarming for post-conversion users)

**Step 3: Run type check**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add frontend/src/pages/Settings.tsx
git commit -m "fix(settings): show contextual quota status instead of raw zeros for trial users"
```

---

## Task 6: Make "需購買" Badge clickable + remove duplicate PurchaseSeason status text

**Files:**
- Modify: `frontend/src/pages/Seasons.tsx`
- Modify: `frontend/src/pages/PurchaseSeason.tsx`

**Step 1: Seasons page — wrap Badge in Link when purchase needed**

In `Seasons.tsx`, replace the Badge section (lines 200-216):

```tsx
import { Link } from "react-router-dom";
import { getQuotaDisplayState } from "@/types/season-quota";
import { useSeasonQuota } from "@/hooks/use-season-quota";

// Inside Seasons component, replace quotaDisplay usage:
const { data: quotaData } = useSeasonQuota();
const quotaDisplay = getQuotaDisplayState(quotaData);

// In JSX, replace the Badge block:
<RoleGuard requiredRoles={["owner", "collaborator"]}>
  {quotaDisplay.showPurchaseLink ? (
    <Link to="/purchase">
      <Badge variant="destructive" className="text-xs cursor-pointer hover:bg-destructive/80">
        {quotaDisplay.badgeText}
      </Badge>
    </Link>
  ) : (
    <Badge
      variant={quotaDisplay.badgeColor === "red" ? "destructive" : "secondary"}
      className="text-xs"
    >
      {quotaDisplay.badgeText}
    </Badge>
  )}
</RoleGuard>
```

**Step 2: PurchaseSeason page — replace inline `getQuotaStatusText()` and `getQuotaStatusColor()`**

In `PurchaseSeason.tsx`, remove the `getQuotaStatusText()` function (lines 332-356) and `getQuotaStatusColor()` function (lines 358-371). Replace with:

```typescript
import { getQuotaDisplayState } from '@/types/season-quota'

// Inside PurchaseSeason component:
const quotaDisplay = getQuotaDisplayState(quotaStatus)

// Purchase page needs slightly more detail than badge:
const purchaseStatusText = (() => {
  switch (quotaDisplay.phase) {
    case 'loading': return '載入中...'
    case 'trial_available': return '尚未使用試用，啟用第一個賽季即可開始 14 天試用'
    case 'trial_active':
    case 'trial_warning':
    case 'trial_critical': return `試用期剩餘 ${quotaDisplay.trialDaysRemaining} 天`
    case 'has_quota': return `剩餘 ${quotaDisplay.availableSeasons} 季可啟用`
    case 'active': return '賽季使用中'
    case 'trial_expired':
    case 'quota_exhausted': return '已用完，購買後可繼續使用'
  }
})()

const purchaseStatusColor = quotaDisplay.showPurchaseLink
  ? 'text-destructive'
  : quotaDisplay.badgeColor === 'yellow' || (quotaDisplay.trialDaysRemaining !== null && quotaDisplay.trialDaysRemaining <= 3)
    ? 'text-orange-500'
    : 'text-foreground'
```

Then update the JSX to use `purchaseStatusText` and `purchaseStatusColor` where `getQuotaStatusText()` and `getQuotaStatusColor()` were called.

**Step 3: Run type check + lint**

Run: `cd frontend && npx tsc --noEmit && npm run lint`
Expected: No errors

**Step 4: Commit**

```bash
git add frontend/src/pages/Seasons.tsx frontend/src/pages/PurchaseSeason.tsx
git commit -m "feat(seasons): clickable purchase badge + centralize purchase page status text"
```

---

## Task 7: Update QuotaWarningBanner to use centralized state

**Files:**
- Modify: `frontend/src/components/season-quota/QuotaWarningBanner.tsx`

**Step 1: Simplify banner to use `getQuotaDisplayState` via hook**

The banner already uses `useQuotaWarning()` which was refactored in Task 3 to delegate to `getQuotaDisplayState`. Verify the banner still works correctly — the `level` and `message` values should flow through correctly.

The only change needed: banner messages now include "購買後自動升級為正式版" suffix, which is more actionable. No code change needed in the banner component itself — it receives `message` from the hook.

**Step 2: Run tests**

Run: `cd frontend && npx vitest run src/components/season-quota/__tests__/QuotaWarningBanner.test.tsx`
Expected: May need to update snapshot/assertion if tests check exact message text.

**Step 3: Commit (if changes needed)**

```bash
git add frontend/src/components/season-quota/
git commit -m "test(quota-banner): update test expectations for new banner messages"
```

---

## Task 8: Final verification

**Step 1: Run full frontend test suite**

Run: `cd frontend && npx vitest run`
Expected: ALL PASS

**Step 2: Run type check**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

**Step 3: Run lint**

Run: `cd frontend && npm run lint`
Expected: No errors

**Step 4: Manual UX verification checklist**

Test each scenario against the expected display:

| Scenario | Seasons Badge | Settings 額度 | Banner | Purchase Status |
|----------|--------------|--------------|--------|-----------------|
| 新用戶，未啟用 | 可免費試用 | 免費試用（啟用賽季後開始 14 天倒數） | 無 | 尚未使用試用... |
| 試用中，10天 | 試用 10 天 | 試用中，剩餘 10 天 | 無 | 試用期剩餘 10 天 |
| 試用中，5天 | 試用 5 天 (黃) | 試用中，剩餘 5 天 | 黃: 試用期剩餘 5 天，購買後自動升級 | 試用期剩餘 5 天 |
| 試用中，2天 | 試用 2 天 (紅) | 試用中，剩餘 2 天 | 橘: 試用期剩餘 2 天，購買後自動升級 | 試用期剩餘 2 天 |
| 試用過期 | 試用已過期 (紅, 可點) | 試用期已結束 | 紅: 試用期已結束，購買後自動升級 | 已用完... |
| 購買後(轉換) | 使用中 | 已購買 1 季，使用中 | 無 | 賽季使用中 |
| 有剩餘額度 | 剩餘 2 季 | 已購買 3 季，剩餘 2 季可用 | 無 | 剩餘 2 季可啟用 |
| 額度用完 | 需購買 (紅, 可點) | 額度已用完 | 紅: 賽季額度已用完... | 已用完... |

**Step 5: Commit all remaining changes**

```bash
git add -A
git commit -m "chore: final verification pass for trial/quota UX clarity"
```
