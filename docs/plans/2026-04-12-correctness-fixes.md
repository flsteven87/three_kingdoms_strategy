# Correctness Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task.

**Goal:** Fix 4 independent correctness bugs — silent payment loss on purchase-flow redirect, stale analytics cache after CSV upload, TOCTOU misreporting season-quota exhaustion (HTTP 400 instead of 402), and swallowed exceptions in pending-invitation processing.

**Architecture:** Four independent tasks, each one small commit. Ordered smallest-first (backend TOCTOU → backend exceptions → frontend cache → frontend purchase flow) so wins land early. All fixes preserve existing API contracts and must leave the test suites green at every commit boundary.

**Tech Stack:**
- **Backend:** Python 3.13 + FastAPI + Supabase (pytest/anyio, `uv run` for everything)
- **Frontend:** React 19 + TypeScript + TanStack Query + vitest
- **Regression guards:** backend **1,061** pytest + frontend **489** vitest. Both must stay green after each task.

---

## Ground Rules

1. **TDD everywhere.** Red → green → refactor → commit. No skipping the red.
2. **One task = one commit.** Each task is independently revertable.
3. **Never skip hooks.** `uv run ruff check .` + `npx tsc --noEmit` gates each task.
4. **Run the full suite** at the end of each task (not just the touched test file) — regressions caught here are cheap.
5. **File paths are exact.** If a line number drifts after a formatter hook, trust the symbol name, not the number.

---

## Task 1: Season Quota TOCTOU — raise `SeasonQuotaExhaustedError` (→402) instead of `ValueError` (→400)

### Context

`season_service.activate_season()` calls `require_season_activation()` (non-atomic check) followed by `consume_season()` (atomic RPC). Between the two calls a concurrent request can consume the last slot. The loser's `consume_season_quota` RPC then returns `status='exhausted'`, and `SeasonQuotaService.consume_season` maps that to `raise ValueError("No available seasons or trial to consume")` — which the global handler converts to HTTP 400 with an English message, not 402 with the proper Chinese copy.

The `require_season_activation` pre-check is dead weight now that the RPC is atomic (`FOR UPDATE` row lock per `backend/migrations/20260409_consume_season_quota.sql`). Deleting it both fixes the bug and removes a redundant DB round-trip.

### Files

- **Modify:** `backend/src/services/season_quota_service.py:315`
  - `raise ValueError("No available seasons or trial to consume")` → `raise SeasonQuotaExhaustedError("您的可用季數已用完，請購買季數以啟用新賽季。")`
- **Modify:** `backend/src/services/season_service.py:246`
  - Delete `await self._season_quota_service.require_season_activation(season.alliance_id)`
- **Test (update):** `backend/tests/unit/services/test_season_quota_service.py:687-703` (`test_raises_when_no_quota_and_no_trial`)
- **Test (review):** `backend/tests/unit/services/test_season_service.py` — any activate_season test that relied on the pre-check

### Step 1: Run the existing exhausted test to confirm current behavior

```bash
cd backend && uv run pytest tests/unit/services/test_season_quota_service.py::TestConsumeSeasonAdditional::test_raises_when_no_quota_and_no_trial -v
```

Expected: PASS (current `ValueError` behavior).

### Step 2: Invert the test — it should now expect `SeasonQuotaExhaustedError`

Edit `tests/unit/services/test_season_quota_service.py:700-703`:

```python
# Act & Assert
with pytest.raises(SeasonQuotaExhaustedError) as exc_info:
    await quota_service.consume_season(alliance_id)
assert "可用季數已用完" in str(exc_info.value)
```

### Step 3: Run the test — should FAIL

```bash
cd backend && uv run pytest tests/unit/services/test_season_quota_service.py::TestConsumeSeasonAdditional::test_raises_when_no_quota_and_no_trial -v
```

Expected: FAIL with `DID NOT RAISE SeasonQuotaExhaustedError` (currently raises `ValueError`).

### Step 4: Fix `consume_season` in the service

Edit `backend/src/services/season_quota_service.py:314-315`:

```python
# status == "exhausted"
raise SeasonQuotaExhaustedError(
    "您的可用季數已用完，請購買季數以啟用新賽季。"
)
```

`SeasonQuotaExhaustedError` is already imported at line 26 — no new import needed.

### Step 5: Run the test — should PASS

```bash
cd backend && uv run pytest tests/unit/services/test_season_quota_service.py::TestConsumeSeasonAdditional::test_raises_when_no_quota_and_no_trial -v
```

Expected: PASS.

### Step 6: Delete the dead pre-check in `activate_season`

Edit `backend/src/services/season_service.py:245-246`. Remove:

```python
# Verify can activate (has trial or seasons)
await self._season_quota_service.require_season_activation(season.alliance_id)
```

The atomic `consume_season` on the next line now owns the decision.

### Step 7: Hunt for callers of `require_season_activation`

```bash
cd backend && grep -rn "require_season_activation" src/ tests/
```

If the only remaining references are the definition in `season_quota_service.py:246` and the test file, the method is dead code. Delete it too (and its tests) in the same commit — `super:writing-plans` principle: no half-done cleanups.

If any other caller exists, leave the method alone and only remove the one call site at `season_service.py:246`.

### Step 8: Run the full backend suite

```bash
cd backend && uv run ruff check . && uv run pytest
```

Expected: `1,061 passed` (or `1,060` / `1,059` if you deleted dead tests in Step 7 — note the new number in the commit message).

### Step 9: Commit

```bash
git add backend/src/services/season_quota_service.py backend/src/services/season_service.py backend/tests/unit/services/test_season_quota_service.py
# plus any dead code removed in Step 7
git commit -m "$(cat <<'EOF'
fix(quota): raise SeasonQuotaExhaustedError on TOCTOU exhaustion

consume_season_quota RPC is atomic (FOR UPDATE row lock), but the Python
wrapper was mapping the 'exhausted' status to ValueError, which the global
handler returns as HTTP 400 with an English message. Concurrent season
activation races now correctly surface as HTTP 402 with the user-facing
Chinese copy.

Also removes the redundant require_season_activation pre-check from
activate_season: the atomic RPC owns the decision, so the pre-check was
both a wasted DB round-trip and the source of the TOCTOU window.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `process_pending_invitations` — stop swallowing exceptions

### Context

`alliance_collaborator_service.process_pending_invitations` wraps the whole batch in `try/except Exception → return 0` and each per-invitation call in another `try/except Exception → continue`. On a transient DB outage every invitation silently fails, the endpoint returns `{"processed_count": 0, "message": "Processed 0 pending invitations"}`, and the newly-registered user thinks they have no invitations when in fact they do. No retry, no alert.

The fix is scope-narrowing, not broader behavior change: keep the batch-continue semantics only for *expected* failures (already-collaborator race), and let unexpected failures bubble up to the global Exception handler added in commit `65c1efb`.

### Files

- **Modify:** `backend/src/services/alliance_collaborator_service.py:301-373` (`process_pending_invitations`)
- **Test (update + add):** `backend/tests/unit/services/test_alliance_collaborator_service.py:497-569` (`TestProcessPendingInvitations`)

### Step 1: Write the failing test — DB outage must propagate

Append to `TestProcessPendingInvitations` in `test_alliance_collaborator_service.py`:

```python
@pytest.mark.asyncio
async def test_should_propagate_db_outage(
    self,
    collaborator_service: AllianceCollaboratorService,
    mock_invitation_repo: MagicMock,
    mock_collaborator_repo: MagicMock,
    target_user_id: UUID,
    alliance_id: UUID,
):
    """DB outage while fetching invitations must propagate, not return 0."""
    email = "newuser@example.com"
    mock_invitation_repo.get_pending_by_email = AsyncMock(
        side_effect=RuntimeError("connection pool exhausted")
    )

    with pytest.raises(RuntimeError, match="connection pool exhausted"):
        await collaborator_service.process_pending_invitations(target_user_id, email)

@pytest.mark.asyncio
async def test_should_propagate_per_invitation_failure(
    self,
    collaborator_service: AllianceCollaboratorService,
    mock_invitation_repo: MagicMock,
    mock_collaborator_repo: MagicMock,
    target_user_id: UUID,
    alliance_id: UUID,
):
    """Unexpected per-invitation error must propagate, not continue silently."""
    email = "newuser@example.com"
    invitation = create_mock_pending_invitation(alliance_id, email)

    mock_invitation_repo.get_pending_by_email = AsyncMock(return_value=[invitation])
    mock_collaborator_repo.is_collaborator = AsyncMock(return_value=False)
    mock_collaborator_repo.add_collaborator = AsyncMock(
        side_effect=RuntimeError("db timeout")
    )

    with pytest.raises(RuntimeError, match="db timeout"):
        await collaborator_service.process_pending_invitations(target_user_id, email)
```

### Step 2: Run the new tests — should FAIL

```bash
cd backend && uv run pytest tests/unit/services/test_alliance_collaborator_service.py::TestProcessPendingInvitations -v
```

Expected: new tests FAIL (current code returns `0`), existing tests PASS.

### Step 3: Narrow the exception scope in `process_pending_invitations`

Edit `backend/src/services/alliance_collaborator_service.py:301-373`. Replace the whole method body with:

```python
async def process_pending_invitations(self, user_id: UUID, email: str) -> int:
    """
    Process all pending invitations for a newly registered user.

    Called from the /collaborators/process-invitations endpoint right after
    login so a user who was invited pre-registration auto-joins their
    alliance on first sign-in.

    Unexpected errors (DB outage, RPC failure) propagate to the global
    exception handler so the client can retry. Only the specific
    "user is already a collaborator" race is swallowed — that is the one
    recoverable case where it is correct to mark the invitation accepted
    and move on.

    符合 CLAUDE.md 🔴: Service layer orchestrates multi-step workflow
    """
    logger.info("Looking for pending invitations for: %s", email)

    pending_invitations = await self._invitation_repo.get_pending_by_email(email)

    if not pending_invitations:
        logger.info("No pending invitations found for: %s", email)
        return 0

    logger.info(
        "Found %d pending invitation(s) for: %s", len(pending_invitations), email
    )
    processed_count = 0

    for invitation in pending_invitations:
        is_existing = await self._collaborator_repo.is_collaborator(
            invitation.alliance_id, user_id
        )

        if is_existing:
            logger.warning(
                "User already a collaborator, marking invitation as accepted"
            )
            await self._invitation_repo.mark_as_accepted(invitation.id)
            processed_count += 1
            continue

        await self._collaborator_repo.add_collaborator(
            alliance_id=invitation.alliance_id,
            user_id=user_id,
            role=invitation.role,
            invited_by=invitation.invited_by,
        )
        await self._invitation_repo.mark_as_accepted(invitation.id)
        processed_count += 1

    logger.info(
        "Processed %d/%d invitations", processed_count, len(pending_invitations)
    )
    return processed_count
```

Key changes:
- **No `try/except Exception` anywhere.** Errors propagate to the global Exception handler (commit `65c1efb`).
- Switched `f"..."` log calls to `%s` args — lazier formatting, but also matches the rest of the codebase. (Cosmetic, don't obsess.)
- Kept `is_collaborator` branch as the single "recoverable" case — already idempotent, no exception needed.

### Step 4: Run all `TestProcessPendingInvitations` tests — should PASS

```bash
cd backend && uv run pytest tests/unit/services/test_alliance_collaborator_service.py::TestProcessPendingInvitations -v
```

Expected: all 5 tests (3 existing + 2 new) PASS.

### Step 5: Run the full backend suite

```bash
cd backend && uv run ruff check . && uv run pytest
```

Expected: `1,063 passed` (was 1,061 + 2 new tests — or 1,062/1,061 depending on Task 1 dead-test removal).

### Step 6: Commit

```bash
git add backend/src/services/alliance_collaborator_service.py backend/tests/unit/services/test_alliance_collaborator_service.py
git commit -m "$(cat <<'EOF'
fix(collaborators): stop swallowing errors in pending-invitation processing

process_pending_invitations wrapped the batch in try/except Exception and
each per-invitation step in another. On a transient DB outage every
invitation silently failed and the endpoint returned processed_count=0,
leaving the newly-registered user unaware that they had invitations waiting.

Errors now propagate to the global Exception handler so the client sees
HTTP 500 and can retry. The already-collaborator branch still continues
silently because it is genuinely idempotent.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Invalidate analytics cache after CSV upload / delete / period recalculation

### Context

`useUploadCsv.onSettled` only invalidates `csvUploadKeys.list(seasonId)`. `useDeleteCsvUpload.onSettled` does the same. `useRecalculateSeasonPeriods.onSettled` also invalidates `periodKeys.list(seasonId)`. None of them touch the 8 `analyticsKeys.*` query groups, so analytics pages show stale member/period/alliance data for up to 5 minutes (`staleTime`).

The fix is a single helper `invalidateSeasonDerivedData(queryClient, seasonId)` used by all three mutation hooks — DRY, and the helper is the single place a future dev adds new derived key groups.

### Files

- **Create:** `frontend/src/lib/query-invalidation.ts`
- **Modify:** `frontend/src/hooks/use-csv-uploads.ts:75-80, 124-127`
- **Modify:** `frontend/src/hooks/use-periods.ts:34-37`
- **Test (update):** `frontend/src/hooks/__tests__/use-csv-uploads.test.tsx`
- **Test (update):** `frontend/src/hooks/__tests__/use-periods.test.tsx`

### Step 1: Read the analytics key factory to enumerate invalidation targets

```bash
cd frontend && sed -n '16,63p' src/hooks/use-analytics.ts
```

You should see 8 key groups rooted at `analyticsKeys.all = ["analytics"]`. Invalidating `analyticsKeys.all` nukes all of them — acceptable because CSV upload affects every analytics dimension transitively.

### Step 2: Create the helper

Create `frontend/src/lib/query-invalidation.ts`:

```typescript
/**
 * Query invalidation helpers for cross-hook cache coordination.
 *
 * When a mutation changes data that multiple query groups derive from
 * (CSV upload → periods → member/group/alliance analytics), every hook
 * that touches that dataset should funnel through a single helper so
 * future keys are invalidated in one place.
 */

import type { QueryClient } from "@tanstack/react-query";
import { analyticsKeys } from "@/hooks/use-analytics";
import { csvUploadKeys } from "@/hooks/use-csv-uploads";
import { periodKeys } from "@/hooks/use-periods";

/**
 * Invalidate every cache that a CSV upload, delete, or period
 * recalculation can affect for a given season.
 */
export function invalidateSeasonDerivedData(
  queryClient: QueryClient,
  seasonId: string,
): void {
  queryClient.invalidateQueries({ queryKey: csvUploadKeys.list(seasonId) });
  queryClient.invalidateQueries({ queryKey: periodKeys.list(seasonId) });
  queryClient.invalidateQueries({ queryKey: analyticsKeys.all });
}
```

**Caveat — import cycle:** `use-periods.ts` already imports `csvUploadKeys` from `use-csv-uploads.ts`. Importing both into `query-invalidation.ts` is fine, but importing `query-invalidation.ts` back from either hook file creates a cycle. Keep the helper consumer-only — the hook files import it, it does not import the hooks. ✅ (This is how the above is written.)

### Step 3: Write the failing test for `useUploadCsv`

Add to `frontend/src/hooks/__tests__/use-csv-uploads.test.tsx` inside the existing `describe("useUploadCsv", ...)` block:

```typescript
it("invalidates analytics + periods + csv-uploads after successful upload", async () => {
  const mockResponse: CsvUploadResponse = {
    upload_id: "upload-new",
    season_id: SEASON_ID,
    alliance_id: "alliance-1",
    snapshot_date: "2026-03-01",
    filename: "stats.csv",
    total_members: 50,
    total_snapshots: 50,
    total_periods: 3,
    replaced_existing: false,
  };
  vi.mocked(apiClient.uploadCsv).mockResolvedValueOnce(mockResponse);

  const spy = vi.spyOn(queryClient, "invalidateQueries");

  const { result } = renderHook(() => useUploadCsv(), {
    wrapper: createWrapper(queryClient),
  });

  await act(async () => {
    await result.current.mutateAsync({
      seasonId: SEASON_ID,
      file: new File(["data"], "stats.csv"),
    });
  });

  // csv-uploads list, periods list, and analytics root should all be invalidated
  const invalidatedKeys = spy.mock.calls.map((call) => call[0]?.queryKey);
  expect(invalidatedKeys).toEqual(
    expect.arrayContaining([
      ["csv-uploads", "list", { seasonId: SEASON_ID }],
      ["periods", "list", { seasonId: SEASON_ID }],
      ["analytics"],
    ]),
  );
});
```

Repeat the same pattern for `useDeleteCsvUpload` (inside its own `describe`) and for `useRecalculateSeasonPeriods` in `use-periods.test.tsx`.

### Step 4: Run the new tests — should FAIL

```bash
cd frontend && npx vitest run src/hooks/__tests__/use-csv-uploads.test.tsx src/hooks/__tests__/use-periods.test.tsx
```

Expected: the three new invalidation tests FAIL (current code only invalidates `csv-uploads` / partial sets).

### Step 5: Wire the helper into the three hooks

Edit `frontend/src/hooks/use-csv-uploads.ts`:

```typescript
import { invalidateSeasonDerivedData } from "@/lib/query-invalidation";

// in useUploadCsv:
onSettled: (_data, _error, variables) => {
  invalidateSeasonDerivedData(queryClient, variables.seasonId);
},

// in useDeleteCsvUpload:
onSettled: () => {
  invalidateSeasonDerivedData(queryClient, seasonId);
},
```

Edit `frontend/src/hooks/use-periods.ts`:

```typescript
import { invalidateSeasonDerivedData } from "@/lib/query-invalidation";

// in useRecalculateSeasonPeriods:
onSettled: () => {
  invalidateSeasonDerivedData(queryClient, seasonId);
},
```

Delete the now-unused `csvUploadKeys` import in `use-periods.ts` (the helper owns the reference).

### Step 6: Run the tests — should PASS

```bash
cd frontend && npx vitest run src/hooks/__tests__/use-csv-uploads.test.tsx src/hooks/__tests__/use-periods.test.tsx
```

Expected: all tests PASS.

### Step 7: Run the full frontend suite + typecheck + lint

```bash
cd frontend && npx tsc --noEmit && npm run lint && npm test -- --run
```

Expected: `489 passed` (+3 new tests = 492), no TS errors, no lint errors.

### Step 8: Commit

```bash
git add frontend/src/lib/query-invalidation.ts frontend/src/hooks/use-csv-uploads.ts frontend/src/hooks/use-periods.ts frontend/src/hooks/__tests__/use-csv-uploads.test.tsx frontend/src/hooks/__tests__/use-periods.test.tsx
git commit -m "$(cat <<'EOF'
fix(cache): invalidate analytics cache on CSV upload/delete/recalc

useUploadCsv, useDeleteCsvUpload, and useRecalculateSeasonPeriods only
invalidated a subset of the caches derived from their data. Analytics
pages (member trends, period averages, alliance trend, group analytics)
showed stale data for up to 5 minutes after a CSV upload.

Introduces invalidateSeasonDerivedData as a single helper so future
derived query groups are added in one place.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Purchase flow — eliminate silent payment loss on redirect path

### Context

`use-purchase-flow.ts:57-58` grants on *any positive* `purchased_seasons` when `baseline == null`. `PurchaseSeason.tsx:188-195` reads the pre-purchase baseline from `sessionStorage`; if sessionStorage is unavailable (privacy mode, Safari ITP, cross-origin storage isolation), `baseline` becomes null and **any previous purchase** is mistaken for a successful new grant. A webhook failure then manifests as a false "購買成功" banner while the user's money disappears.

**Fix shape:** Encode the baseline in the Recur return URL as a query parameter. Query params round-trip through the hosted checkout reliably, survive redirects, and require no backend changes. The hook stops honouring `baseline == null` as "any positive grants" — instead it transitions to a new `unverifiable` state that surfaces an explicit "we cannot confirm your payment, please refresh or contact support" UI.

**Threat model note:** A user can tamper with the URL to set `baseline` higher than reality, causing the hook to never "grant" — but that only harms themselves. They cannot use URL tampering to unlock an un-paid grant because the backend (not the FE) owns the actual quota.

**Caveat to verify during execution:** Confirm that Recur's hosted checkout preserves query parameters on `successUrl`. If it strips them, fall back to a URL fragment (`#baseline=1`, never sent to Recur servers) or a backend-issued short-lived token. The plan assumes query-param preservation — if Step 2's smoke test fails, stop and pivot before continuing.

### Files

- **Modify:** `frontend/src/hooks/use-purchase-flow.ts`
- **Modify:** `frontend/src/pages/PurchaseSeason.tsx`
- **Test (update):** `frontend/src/hooks/__tests__/use-purchase-flow.test.tsx`

### Step 1: Read the current PurchaseSeason redirect handler and Recur checkout call

```bash
cd frontend && sed -n '184,260p' src/pages/PurchaseSeason.tsx
```

Note the `PURCHASE_BASELINE_KEY` constant (you will delete it) and the `successUrl: \`${baseUrl}/purchase?payment=success\`` template literal (you will extend it).

### Step 2: Verify Recur preserves query parameters (smoke test)

Before writing any code, run one real sandbox checkout in the staging env:

1. Set `successUrl` to `${baseUrl}/purchase?payment=success&baseline=99`.
2. Complete the sandbox checkout (use the test credit card documented by the `recur-quickstart` skill).
3. Check that the redirected URL in the browser still contains `&baseline=99`.

If the query param survives → continue.
If Recur strips/rewrites it → **STOP**. Abandon this plan and pivot to URL fragment (`#baseline=99`) or a backend-issued correlation token. Report to the user before implementing the pivot.

### Step 3: Add the `unverifiable` state to the hook (red phase)

Edit `frontend/src/hooks/use-purchase-flow.ts:15`:

```typescript
export type PaymentFlowState =
  | "idle"
  | "pending"
  | "granted"
  | "timeout"
  | "unverifiable";
```

### Step 4: Invert the failing test in `use-purchase-flow.test.tsx`

At `use-purchase-flow.test.tsx:92-107` (the "redirect path (baseline=null) grants on any positive purchased_seasons" test) — this test encodes the exact bug behavior. Replace it with:

```typescript
it("redirect path with no baseline transitions to unverifiable", async () => {
  queryClient.setQueryData(
    seasonQuotaKeys.status(),
    createMockStatus({ purchased_seasons: 1, available_seasons: 1 }),
  );

  const { result } = renderHook(() => usePurchaseFlow(), {
    wrapper: createWrapper(queryClient),
  });

  act(() => {
    result.current.startPolling(null);
  });

  await waitFor(() =>
    expect(result.current.state).toBe("unverifiable"),
  );
});
```

Also update the two redirect-path trial-conversion tests at lines 188-215 and 217-239 — those currently pass `startPolling(null)` and expect `granted`. Change them to pass a real baseline (`startPolling(0)`) since the baseline now travels via URL param in production. Keep the trial-conversion assertion logic (the `wasTrialRef` / heuristic branches).

### Step 5: Run the hook tests — should FAIL

```bash
cd frontend && npx vitest run src/hooks/__tests__/use-purchase-flow.test.tsx
```

Expected: FAIL on the new `unverifiable` test; the trial-conversion tests may also fail depending on how you rewired them.

### Step 6: Implement `unverifiable` in the hook

Edit `frontend/src/hooks/use-purchase-flow.ts`. Change the redirect-path branch of the grant detection (`use-purchase-flow.ts:53-77`) and `startPolling` so that `baseline == null` is rejected at the door:

```typescript
// Detect grant: purchased_seasons strictly increased above baseline.
// baseline == null is rejected upstream (startPolling → unverifiable).
useEffect(() => {
  if (state !== "pending" || currentPurchased == null) return;

  const baseline = baselineRef.current;
  if (baseline == null) return; // defensive; startPolling should never let us land here

  if (currentPurchased > baseline) {
    const trialConvertedNow =
      wasTrialRef.current && currentIsTrial === false;
    setTrialConverted(trialConvertedNow);
    setState("granted");
  }
}, [state, currentPurchased, currentIsTrial]);
```

Remove the `redirectPathConverted` heuristic entirely — it existed to compensate for baseline=null, which is now an error state.

Update `startPolling`:

```typescript
const startPolling = (baseline: number | null) => {
  if (baseline == null) {
    setState("unverifiable");
    return;
  }
  baselineRef.current = baseline;
  wasTrialRef.current = quota?.current_season_is_trial ?? false;
  setTrialConverted(false);
  setState("pending");
  void queryClient.invalidateQueries({ queryKey: seasonQuotaKeys.all });
};
```

Also drop `currentUsed` / `currentAvailable` from the grant-detection effect deps if they're no longer read — the React-compiler will flag unused reads.

### Step 7: Run the hook tests — should PASS

```bash
cd frontend && npx vitest run src/hooks/__tests__/use-purchase-flow.test.tsx
```

Expected: all tests PASS.

### Step 8: Encode baseline in successUrl + read from URL param

Edit `frontend/src/pages/PurchaseSeason.tsx`:

**Delete** the `PURCHASE_BASELINE_KEY` constant at the top of the file (grep for it).

**Replace** the redirect handler useEffect at line 188-195:

```typescript
useEffect(() => {
  if (searchParams.get("payment") !== "success") return;
  const baselineParam = searchParams.get("baseline");
  const baseline =
    baselineParam !== null && /^\d+$/.test(baselineParam)
      ? Number(baselineParam)
      : null;
  startPolling(baseline);
  setSearchParams({}, { replace: true });
}, [searchParams, setSearchParams, startPolling]);
```

**Replace** the `successUrl` in `handlePurchase` (line ~242):

```typescript
successUrl: `${baseUrl}/purchase?payment=success&baseline=${baselineSeasons}`,
```

**Delete** the `sessionStorage.setItem(PURCHASE_BASELINE_KEY, ...)` call at line 228-230 — the URL param is now the only transport.

### Step 9: Add an `unverifiable` banner to PurchaseSeason

Locate the existing banner rendering for `state === "granted"` / `state === "timeout"` and add a sibling for `unverifiable`:

```tsx
{purchaseFlow.state === "unverifiable" && (
  <Alert variant="destructive">
    <AlertCircle className="h-4 w-4" />
    <AlertTitle>無法確認付款狀態</AlertTitle>
    <AlertDescription>
      我們無法從目前的瀏覽器狀態確認本次付款結果。請重新整理頁面，若季數仍未更新，請聯繫客服並提供您的 Email。
    </AlertDescription>
  </Alert>
)}
```

Use the existing `Alert` component and icons the page already imports — do not add new UI primitives.

### Step 10: Run the full frontend suite

```bash
cd frontend && npx tsc --noEmit && npm run lint && npm test -- --run
```

Expected: all tests PASS (`492` if Task 3 was committed first). Fix any broken tests that depended on the old `sessionStorage` path.

### Step 11: Manual smoke test on the dev server

```bash
cd frontend && npm run dev
# in another terminal
cd backend && uv run python src/main.py
```

Visit `http://localhost:5187/purchase`, click purchase, complete sandbox checkout, verify:
1. URL on return contains `?payment=success&baseline=<N>`.
2. Banner shows "granted" with correct remaining seasons.
3. Manually visit `http://localhost:5187/purchase?payment=success` (no baseline param) → banner shows "無法確認付款狀態".

### Step 12: Commit

```bash
git add frontend/src/hooks/use-purchase-flow.ts frontend/src/pages/PurchaseSeason.tsx frontend/src/hooks/__tests__/use-purchase-flow.test.tsx
git commit -m "$(cat <<'EOF'
fix(purchase): eliminate silent payment loss when sessionStorage fails

use-purchase-flow treated baseline=null as 'any positive purchased_seasons
means success', so a user with a prior purchase plus broken sessionStorage
(privacy mode, Safari ITP, cross-origin isolation) would see a false
'purchase successful' banner after a new checkout whose webhook silently
failed.

Baseline now travels through the Recur return URL as a query parameter
instead of sessionStorage, and baseline=null on return transitions the
hook to a new 'unverifiable' state that tells the user to refresh or
contact support.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Post-Implementation Checklist

After all four tasks are committed:

- [ ] `cd backend && uv run pytest` → **1,063** passed (or the adjusted count — document in MEMORY.md)
- [ ] `cd frontend && npm test -- --run` → **492** passed
- [ ] `cd backend && uv run ruff check .` → clean
- [ ] `cd frontend && npx tsc --noEmit && npm run lint` → clean
- [ ] `git log --oneline origin/main..HEAD` shows exactly 4 commits
- [ ] `git push origin main` (only after user confirms — Zeabur will auto-deploy)
- [ ] **Post-deploy smoke test on production:**
  - Purchase flow: real sandbox card → verify banner + DB quota both update.
  - Purchase flow edge: visit `/purchase?payment=success` with no `baseline` → verify "無法確認付款狀態" banner.
  - Pending invitation: invite an unregistered email, register with that email, log in → verify alliance auto-join.
  - CSV upload: upload a new CSV → switch to analytics page → verify data is fresh (not stale).
- [ ] Update `MEMORY.md` Active Work with the new test counts and any discoveries.

---

## Risk & Rollback Notes

- **Task 1** is the safest: pure error-mapping refactor, behavior change is invisible to success paths.
- **Task 2** changes error visibility — the endpoint now returns 500 on DB failure instead of 200. If the frontend was silently relying on the 200 for something, we'll know immediately from Sentry (once wired) or Discord error webhook.
- **Task 3** is pure cache invalidation. Worst case: unnecessary re-fetches. Zero user impact.
- **Task 4** is the highest-risk: touches the live payment flow. Mitigation: the Step 2 smoke test is non-negotiable, and Step 11 includes a manual end-to-end walkthrough before commit.

Rollback: each task is one commit. `git revert <sha>` on any individual task is safe.
