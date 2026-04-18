# Copper Source-of-Truth: Soft Warning Instead of Hard Reject

**Date**: 2026-04-19
**Status**: Design approved, ready for plan

## Problem

Currently when a user tries to register a copper mine whose coordinate is not in the official `copper_mine_coordinates` reference data for the season's `game_season_tag` (e.g. PK23), both LIFF `register_mine` and Dashboard `create_ownership` throw HTTP 400 with `座標 ({x}, {y}) 不在 {tag} 的銅礦資料中`.

This is too strict. Users may need to register edge cases (e.g., coordinate that the source sheet missed, or levels the sheet doesn't cover). They reported being blocked.

## Goal

Degrade the source-of-truth check from a hard validation to a soft reference:

- Coordinate found in source → auto-fill level + county/district (unchanged)
- Coordinate not found in source → **allow submission**, trust user-provided level, but display a visible warning during input so the user can self-correct typos
- Coordinate already taken → still reject (unchanged)

## Non-Goals

- No behavior change for seasons without `game_season_tag` or with `has_source_data = False`
- No changes to `search_copper_coordinates*` endpoints (they already only return in-source coords; correct behavior)
- No changes to rule validation (`_validate_rule`, tier/merit logic) — that still runs against the resolved level
- No new data loading pipeline; this is purely a UX softening

## Design

### Backend

#### 1. `copper_mine_service.py` — stop throwing on not-found

Rename `_validate_source_of_truth` → `_resolve_level_from_source` (more accurate). Remove the `raise HTTPException(400, ...)` branch. Contract becomes: **never throws; returns the effective level**.

```python
async def _resolve_level_from_source(
    self, game_season_tag: str | None, coord_x: int, coord_y: int, level: int
) -> int:
    """Returns source-of-truth level if coord found, otherwise user-provided level."""
    if not game_season_tag:
        return level

    has_data = await self.coordinate_repository.has_data(game_season_tag)
    if not has_data:
        return level

    coordinate = await self.coordinate_repository.get_by_coords(
        game_season_tag, coord_x, coord_y
    )
    if not coordinate:
        return level  # ← was raise HTTPException(400)
    return coordinate.level
```

Both existing call sites (`register_mine` at `:451`, `create_ownership` at `:689`) need no signature change.

#### 2. `lookup_copper_coordinate` (LIFF preview) — soften not-found response

```python
# When has_source_data and coord not found:
return CopperCoordinateLookupResult(
    coord_x=coord_x,
    coord_y=coord_y,
    is_taken=existing_mine is not None,
    can_register=existing_mine is None,            # was False
    requires_manual_level=True,                    # new signal to frontend
    message=(
        "此座標已被註冊"
        if existing_mine
        else f"座標不在 {game_season_tag} 官方資料中，仍可申請，請確認等級"
    ),
)
```

`requires_manual_level` already exists on `CopperCoordinateLookupResult` (currently used in the no-source-data branch at `:920`). Reusing it here unifies the "let user pick level" signal across both branches.

#### 3. New Dashboard lookup endpoint

Add `GET /copper-mines/coordinates/lookup?season_id={uuid}&coord_x={int}&coord_y={int}` in `copper_mines.py` that mirrors LIFF `lookup_copper_coordinate` but scoped by `season_id` instead of `line_group_id`.

New service method `lookup_copper_coordinate_by_season(season_id, coord_x, coord_y)` — thin wrapper around `coordinate_repository.get_by_coords` + `repository.get_mine_by_coords`, returning the same `CopperCoordinateLookupResult`.

### Frontend

#### LIFF `CopperTab.tsx`

1. Convert `useLiffCopperCoordinateLookup` from `useMutation` to a **debounced** `useQuery` with `enabled: canLookup`, where `canLookup = hasSourceData && validX && validY`.
2. Render a lookup-state indicator below the X/Y inputs:
   - **Loading**: silent (no layout shift)
   - **In source**: green badge `Lv.{level} · {county} {district}`; lock level selector to source level
   - **Not in source** (`requires_manual_level === true && !is_taken`): yellow `Alert` `⚠ 座標不在 {sourceDataLabel} 官方資料中，請確認等級`; **unlock** level selector (user picks 9/10)
   - **Taken** (`is_taken === true`): red inline text `此座標已被註冊`; disable submit button
3. Level selector `disabled` condition: change from `hasSourceData` to `lookupResult?.in_source === true && lookupResult?.level != null`.

#### LIFF `CopperSearchPage.tsx`

No changes — it only lists in-source coords and doesn't hit the warning path.

#### Dashboard `CopperMineFormDialog.tsx`

1. New API + hook: `useCopperCoordinateLookup(seasonId, coordX, coordY)` calling the new Dashboard lookup endpoint, debounced via watch-value + `useQuery` with `enabled`.
2. Render the same three-state indicator as LIFF, using the existing `Alert` component.
3. Level selector unlocks on `requires_manual_level === true`.
4. Keep the existing `submitError` Alert for non-lookup errors (409 duplicate, 404 member, 403 rule).

### Testing

**Backend**
- `test_copper_mine_service.py`: replace "raises 400 when coord not in source" test with "returns user-provided level when coord not in source" for both `register_mine` and `create_ownership`.
- Add test for `lookup_copper_coordinate` not-in-source branch: asserts `can_register=True`, `requires_manual_level=True`, warning message.
- Add test for new `lookup_copper_coordinate_by_season` method (Dashboard equivalent).
- Add endpoint test for `GET /copper-mines/coordinates/lookup`.

**Frontend**
- `use-liff-copper.test.ts`: add three-state tests for `useLiffCopperCoordinateLookup` (in-source / not-in-source / taken).
- `use-copper-mines.test.tsx` (new test): Dashboard lookup hook three states.
- No component test updates required (existing tests don't hit the warning path).

## Contract Summary

| Scenario | Before | After |
|---|---|---|
| Coord in source, not taken | `can_register=true`, level overridden | ✅ Unchanged |
| Coord in source, taken | `can_register=false`, `is_taken=true` | ✅ Unchanged |
| Coord **not** in source, not taken | `can_register=false`, error message | **`can_register=true`, `requires_manual_level=true`, warning message** |
| Coord not in source, taken | `can_register=false`, "不在官方資料" message | `can_register=false`, `is_taken=true`, "此座標已被註冊" message |
| Register not-in-source coord | HTTP 400 | HTTP 200, level = user-provided |
| No `game_season_tag` / no source data | `requires_manual_level=true` | ✅ Unchanged |

## Files Touched

**Backend**
- `backend/src/services/copper_mine_service.py` — rename + remove raise; new `lookup_copper_coordinate_by_season`
- `backend/src/api/v1/endpoints/copper_mines.py` — new `GET /coordinates/lookup`
- `backend/tests/unit/services/test_copper_mine_service.py` — update + new tests
- `backend/tests/unit/endpoints/test_copper_mines.py` — new endpoint test

**Frontend**
- `frontend/src/liff/hooks/use-liff-copper.ts` — `useLiffCopperCoordinateLookup` → `useQuery`
- `frontend/src/liff/pages/CopperTab.tsx` — three-state indicator, level unlock
- `frontend/src/liff/hooks/__tests__/use-liff-copper.test.ts` — three-state tests
- `frontend/src/lib/api/copper-mine-api.ts` — new `lookupCopperCoordinate`
- `frontend/src/hooks/use-copper-mines.ts` — new `useCopperCoordinateLookup` hook + key factory entry
- `frontend/src/components/copper-mines/CopperMineFormDialog.tsx` — three-state indicator, level unlock
- `frontend/src/hooks/__tests__/use-copper-mines.test.tsx` — Dashboard lookup test

## Open Questions

None. Design approved via option C in brainstorming on 2026-04-19.
