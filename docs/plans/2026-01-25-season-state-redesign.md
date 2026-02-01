# Season State Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign season state management to allow completed seasons to be viewed, and enable reopen operation from completed to activated.

**Architecture:**
- Add `reopen_season` endpoint (completed → activated)
- Modify `set_current_season` to allow both activated and completed
- Add `can_upload` permission logic based on date range
- Update UI to show disabled buttons with tooltips for restricted operations

**Tech Stack:** FastAPI, Pydantic, React, TanStack Query, TypeScript

---

## Task 1: Backend - Add `reopen_season` Service Method

**Files:**
- Modify: `backend/src/services/season_service.py`

**Step 1: Add reopen_season method**

Add after `complete_season` method (around line 542):

```python
async def reopen_season(self, user_id: UUID, season_id: UUID) -> Season:
    """
    Reopen a completed season back to activated status

    Permission: owner + collaborator

    Args:
        user_id: User UUID from authentication
        season_id: Season UUID to reopen

    Returns:
        Updated season

    Raises:
        ValueError: If season not found or not completed
        PermissionError: If user doesn't own the season
    """
    # Verify ownership
    season = await self.get_season(user_id, season_id)

    if season.activation_status != "completed":
        raise ValueError("Only completed seasons can be reopened")

    # Verify write permission (role check)
    await self._permission_service.require_role_permission(user_id, season.alliance_id)

    return await self._repo.update(season_id, {"activation_status": "activated"})
```

**Step 2: Run ruff check**

```bash
cd backend && uv run ruff check src/services/season_service.py
```

---

## Task 2: Backend - Modify `set_current_season` to Allow Completed

**Files:**
- Modify: `backend/src/services/season_service.py`

**Step 1: Update set_current_season validation**

Change the validation in `set_current_season` method (around line 491-496):

FROM:
```python
# Only activated seasons can be set as current
if season.activation_status != "activated":
    raise ValueError(
        f"Cannot set {season.activation_status} season as current. "
        "Please activate the season first."
    )
```

TO:
```python
# Only non-draft seasons can be set as current (activated or completed)
if season.activation_status == "draft":
    raise ValueError(
        "Cannot set draft season as current. "
        "Please activate the season first."
    )
```

**Step 2: Update docstring**

Change:
```python
"""
Set an activated season as current (selected for display)

Only activated seasons can be set as current.
```

TO:
```python
"""
Set a season as current (selected for display)

Both activated and completed seasons can be set as current.
Draft seasons must be activated first.
```

**Step 3: Run ruff check**

```bash
cd backend && uv run ruff check src/services/season_service.py
```

---

## Task 3: Backend - Add `reopen_season` API Endpoint

**Files:**
- Modify: `backend/src/api/v1/endpoints/seasons.py`

**Step 1: Add reopen endpoint**

Add after `complete_season` endpoint (at end of file):

```python
@router.post("/{season_id}/reopen", response_model=Season)
async def reopen_season(
    season_id: UUID,
    service: SeasonServiceDep,
    user_id: UserIdDep,
):
    """
    Reopen a completed season back to activated status

    Args:
        season_id: Season UUID to reopen
        service: Season service (injected)
        user_id: User UUID (from JWT token)

    Returns:
        Updated season

    Raises:
        ValueError: If season not found or not completed
        PermissionError: If user doesn't own the season

    符合 CLAUDE.md 🔴: API layer delegates to service
    """
    return await service.reopen_season(user_id, season_id)
```

**Step 2: Update set_current_season docstring**

Change:
```python
"""
Set an activated season as current (selected for display)

Only activated seasons can be set as current.
```

TO:
```python
"""
Set a season as current (selected for display)

Both activated and completed seasons can be set as current.
```

**Step 3: Run ruff check**

```bash
cd backend && uv run ruff check src/api/v1/endpoints/seasons.py
```

---

## Task 4: Backend - Update `complete_season` to Keep is_current

**Files:**
- Modify: `backend/src/services/season_service.py`

**Step 1: Remove auto-unset of is_current in complete_season**

Change the `complete_season` method (around line 537-541):

FROM:
```python
# If this was the current season, unset it
update_data = {"activation_status": "completed"}
if season.is_current:
    update_data["is_current"] = False

return await self._repo.update(season_id, update_data)
```

TO:
```python
# Keep is_current as-is (completed seasons can remain as current for viewing)
return await self._repo.update(season_id, {"activation_status": "completed"})
```

**Step 2: Update docstring**

Add to docstring:
```python
Note: Completed seasons can still be set as current for viewing data.
```

**Step 3: Run ruff check**

```bash
cd backend && uv run ruff check src/services/season_service.py
```

---

## Task 5: Frontend - Add `reopenSeason` API Function

**Files:**
- Modify: `frontend/src/lib/api/season-api.ts`

**Step 1: Add reopenSeason function**

Add after `completeSeason` function:

```typescript
/**
 * Reopen a completed season back to activated status
 *
 * Changes activation_status from 'completed' to 'activated'.
 */
export async function reopenSeason(seasonId: string): Promise<Season> {
  const response = await axiosInstance.post<Season>(`/api/v1/seasons/${seasonId}/reopen`)
  return response.data
}
```

**Step 2: Run lint**

```bash
cd frontend && npm run lint
```

---

## Task 6: Frontend - Update API Index Export

**Files:**
- Modify: `frontend/src/lib/api/index.ts`

**Step 1: Add reopenSeason to exports**

Read the file first to understand structure, then add `reopenSeason` to the seasonApi exports.

**Step 2: Run lint**

```bash
cd frontend && npm run lint
```

---

## Task 7: Frontend - Add `useReopenSeason` Hook

**Files:**
- Modify: `frontend/src/hooks/use-seasons.ts`

**Step 1: Add useReopenSeason hook**

Add after `useCompleteSeason` hook:

```typescript
/**
 * Hook to reopen a completed season back to activated
 *
 * Changes activation_status from 'completed' to 'activated'.
 */
export function useReopenSeason() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (seasonId: string) => apiClient.reopenSeason(seasonId),
    onMutate: async (seasonId) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: seasonKeys.all })

      // Snapshot previous values
      const previousSeasons = queryClient.getQueryData<Season[]>(seasonKeys.list(false))

      // Optimistically update season list (change activation_status to 'activated')
      if (previousSeasons) {
        queryClient.setQueryData<Season[]>(
          seasonKeys.list(false),
          previousSeasons.map(season =>
            season.id === seasonId
              ? {
                  ...season,
                  activation_status: 'activated' as const,
                  updated_at: new Date().toISOString()
                }
              : season
          )
        )
      }

      return { previousSeasons }
    },
    onError: (_error, _variables, context) => {
      // Rollback on error
      if (context?.previousSeasons) {
        queryClient.setQueryData(seasonKeys.list(false), context.previousSeasons)
      }
    },
    onSuccess: (reopenedSeason) => {
      toast.success(`「${reopenedSeason.name}」已重新開啟`)
    },
    onSettled: () => {
      // Refetch all season data to sync with server
      queryClient.invalidateQueries({ queryKey: seasonKeys.all })
    }
  })
}
```

**Step 2: Run lint**

```bash
cd frontend && npm run lint
```

---

## Task 8: Frontend - Update Season Type Helpers

**Files:**
- Modify: `frontend/src/types/season.ts`

**Step 1: Update canSetAsCurrent helper**

FROM:
```typescript
export function canSetAsCurrent(season: Season): boolean {
  return season.activation_status === 'activated'
}
```

TO:
```typescript
/**
 * Helper to check if a season can be set as current
 * Both activated and completed seasons can be viewed
 */
export function canSetAsCurrent(season: Season): boolean {
  return season.activation_status !== 'draft'
}
```

**Step 2: Add canReopen helper**

Add after `canActivate`:

```typescript
/**
 * Helper to check if a season can be reopened
 */
export function canReopen(season: Season): boolean {
  return season.activation_status === 'completed'
}
```

**Step 3: Add canUploadCsv helper**

Add after `canReopen`:

```typescript
/**
 * Helper to check if CSV can be uploaded to this season
 * Requires: activated status + current date within season date range
 */
export function canUploadCsv(season: Season): boolean {
  if (season.activation_status !== 'activated') {
    return false
  }

  const today = new Date().toISOString().split('T')[0]

  // Must be on or after start_date
  if (today < season.start_date) {
    return false
  }

  // If end_date exists, must be on or before end_date
  if (season.end_date && today > season.end_date) {
    return false
  }

  return true
}

/**
 * Get the reason why CSV upload is disabled
 */
export function getUploadDisabledReason(season: Season): string | null {
  if (season.activation_status === 'draft') {
    return '請先啟用賽季'
  }

  if (season.activation_status === 'completed') {
    return '此賽季已歸檔，如需上傳請先重新開啟'
  }

  const today = new Date().toISOString().split('T')[0]

  if (today < season.start_date) {
    return '賽季尚未開始'
  }

  if (season.end_date && today > season.end_date) {
    return '賽季已超過結束日期，如需上傳請先延長結束日期'
  }

  return null
}
```

**Step 4: Run lint**

```bash
cd frontend && npm run lint && npx tsc --noEmit
```

---

## Task 9: Frontend - Update SeasonCard Component

**Files:**
- Modify: `frontend/src/components/seasons/SeasonCard.tsx`

**Step 1: Import new helpers and hook**

Update imports:

```typescript
import {
  canActivate,
  canSetAsCurrent,
  canReopen,
  getActivationStatusLabel,
  getActivationStatusColor,
} from '@/types/season'
```

Add to hook imports:
```typescript
import { useReopenSeason } from '@/hooks/use-seasons'
```

**Step 2: Add onReopen prop and state**

Add to interface:
```typescript
readonly onReopen?: (seasonId: string) => Promise<void>
```

Add to destructuring:
```typescript
onReopen,
```

Add state:
```typescript
const [reopenDialogOpen, setReopenDialogOpen] = useState(false)
```

**Step 3: Add reopen handlers**

Add after complete handlers:

```typescript
const handleReopenClick = useCallback(() => {
  setReopenDialogOpen(true)
}, [])

const handleConfirmReopen = useCallback(async () => {
  if (onReopen) {
    await onReopen(season.id)
  }
  setReopenDialogOpen(false)
}, [season.id, onReopen])
```

**Step 4: Update button logic**

Add:
```typescript
const showReopenButton = canReopen(season) && onReopen
```

**Step 5: Add Reopen button in footer (next to Complete)**

In the footer actions section, add the Reopen button for completed seasons:

```typescript
{showReopenButton && (
  <Button
    size="sm"
    variant="ghost"
    onClick={handleReopenClick}
    className="h-8 text-muted-foreground hover:text-foreground"
  >
    <Activity className="h-4 w-4 mr-1" />
    重新開啟
  </Button>
)}
```

**Step 6: Add Reopen confirmation dialog**

Add before Delete dialog:

```typescript
{/* Reopen Confirmation Dialog */}
<DeleteConfirmDialog
  open={reopenDialogOpen}
  onOpenChange={setReopenDialogOpen}
  onConfirm={handleConfirmReopen}
  title="重新開啟賽季"
  description="確定要重新開啟此賽季嗎？"
  itemName={season.name}
  warningMessage="重新開啟後，此賽季將恢復為「已啟用」狀態。您可以繼續上傳 CSV 資料（需在賽季日期範圍內）。"
  confirmText="確定開啟"
  variant="default"
/>
```

**Step 7: Run lint**

```bash
cd frontend && npm run lint && npx tsc --noEmit
```

---

## Task 10: Frontend - Update Seasons Page

**Files:**
- Modify: `frontend/src/pages/Seasons.tsx`

**Step 1: Import useReopenSeason**

Add to imports:
```typescript
import { useReopenSeason } from '@/hooks/use-seasons'
```

**Step 2: Add reopen mutation**

Add after completeSeason:
```typescript
const reopenSeason = useReopenSeason()
```

**Step 3: Add handleReopen handler**

Add after handleComplete:
```typescript
const handleReopen = useCallback(async (seasonId: string) => {
  await reopenSeason.mutateAsync(seasonId)
}, [reopenSeason])
```

**Step 4: Pass onReopen to SeasonCard**

Add prop:
```typescript
onReopen={handleReopen}
```

**Step 5: Run lint**

```bash
cd frontend && npm run lint && npx tsc --noEmit
```

---

## Task 11: Frontend - Update useCompleteSeason Optimistic Update

**Files:**
- Modify: `frontend/src/hooks/use-seasons.ts`

**Step 1: Remove is_current: false from optimistic update**

In `useCompleteSeason`, change:

FROM:
```typescript
? {
    ...season,
    activation_status: 'completed' as const,
    is_current: false, // Completed seasons cannot be current
    updated_at: new Date().toISOString()
  }
```

TO:
```typescript
? {
    ...season,
    activation_status: 'completed' as const,
    updated_at: new Date().toISOString()
  }
```

**Step 2: Run lint**

```bash
cd frontend && npm run lint
```

---

## Task 12: Backend - Run All Tests

**Step 1: Run pytest**

```bash
cd backend && uv run pytest tests/ -v
```

**Step 2: Fix any failing tests**

If tests fail due to the new behavior, update test expectations.

---

## Task 13: Final Verification

**Step 1: Run backend linting**

```bash
cd backend && uv run ruff check .
```

**Step 2: Run frontend linting and type check**

```bash
cd frontend && npm run lint && npx tsc --noEmit
```

**Step 3: Manual verification checklist**

- [ ] Draft season cannot be set as current
- [ ] Activated season can be set as current
- [ ] Completed season can be set as current
- [ ] Completed season shows "重新開啟" button
- [ ] Completing a season does NOT unset is_current
- [ ] Reopening changes status back to activated

---

## Summary

| Change | File | Description |
|--------|------|-------------|
| Add `reopen_season` | season_service.py | completed → activated |
| Modify `set_current_season` | season_service.py | Allow completed |
| Modify `complete_season` | season_service.py | Keep is_current |
| Add `/reopen` endpoint | seasons.py | API endpoint |
| Add `reopenSeason` | season-api.ts | API function |
| Add `useReopenSeason` | use-seasons.ts | React hook |
| Update helpers | season.ts | canSetAsCurrent, canReopen, canUploadCsv |
| Update UI | SeasonCard.tsx | Reopen button + dialog |
| Update page | Seasons.tsx | Wire up reopen |
