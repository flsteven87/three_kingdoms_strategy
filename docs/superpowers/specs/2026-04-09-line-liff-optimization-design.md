# LINE / LIFF Optimization Design

**Date:** 2026-04-09
**Approach:** Incremental fixes (方案 A) — each item is independent, deployable, and testable in isolation.
**Scope:** Backend performance (#1-4) + Frontend LIFF UX (#5-7)

---

## §1 — `_send_reply` Async Conversion

**Problem:** `_send_reply()` at `linebot.py:1380` is synchronous. It calls `line_bot.reply_message()` which blocks the event loop until the LINE API responds. All message senders (`_send_flex_message`, `_reply_text`) call this function from async context without offloading to a thread.

**Impact:** At 10-100 msg/min, a slow LINE API response (200-500ms) blocks the entire event loop, causing cascading delays for concurrent webhooks. Worst case: LINE webhook 30s timeout.

**Fix:**

```python
# linebot.py — convert to async + asyncio.to_thread
async def _send_reply(reply_token: str, messages: list) -> None:
    line_bot = get_line_bot_api()
    if not line_bot:
        logger.warning("LINE Bot API not available")
        return
    try:
        await asyncio.to_thread(
            line_bot.reply_message,
            ReplyMessageRequest(reply_token=reply_token, messages=messages),
        )
    except ApiException as e:
        logger.error("LINE API reply failed: %s", e)
```

`_send_flex_message` and `_reply_text` are already `async def` — they just need `await` added before `_send_reply(...)`.

**Files changed:** `backend/src/api/v1/endpoints/linebot.py` (3 functions)
**Risk:** Very low — `asyncio.to_thread` is the standard pattern per CLAUDE.md async/sync rules.

---

## §2 — Eliminate Duplicate `get_group_binding` Query

**Problem:** In `_handle_group_message` (line 852), the trial gate fetches `get_group_binding` to check quota. Then every command handler calls `_resolve_alliance_and_season` (line 99) which fetches `get_group_binding` again. This is 1 redundant DB round-trip per group message.

**Fix:** Thread the already-fetched `group_binding` through to `_resolve_alliance_and_season`.

```python
# Add optional parameter
async def _resolve_alliance_and_season(
    line_group_id: str,
    reply_token: str,
    service: LineBindingService,
    group_binding: GroupBinding | None = None,  # NEW — skip re-fetch if provided
) -> tuple[UUID, UUID | None] | None:
    if group_binding is None:
        group_binding = await service.get_group_binding(line_group_id)
    if not group_binding:
        await _reply_text(reply_token, _MSG_GROUP_NOT_BOUND)
        return None
    alliance_id = group_binding.alliance_id
    season_id = await service.get_current_season_id(alliance_id)
    return alliance_id, season_id
```

All callers within `_handle_group_message` pass the binding that was already fetched at line 852.

**Files changed:** `backend/src/api/v1/endpoints/linebot.py` (signature change + caller updates)
**Risk:** Low — backward-compatible default `None` preserves behavior for any other callers.

---

## §3 — Cooldown Query Consolidation (3→1)

**Problem:** `should_send_liff_notification()` in `line_binding_service.py:690-807` executes 3 sequential queries:
1. `get_group_binding` — is the group bound?
2. `get_member_bindings_by_line_user` — is the user registered?
3. `_is_group_in_cooldown` — was a LIFF notification sent in the last 30 minutes?

At 10-100 msg/min, this generates 30-300 cooldown-related queries/min.

**Fix:** New Supabase RPC that answers all 3 questions in a single query.

### Migration

```sql
-- 20260409_check_liff_notification_eligibility.sql
CREATE OR REPLACE FUNCTION check_liff_notification_eligibility(
    p_line_group_id TEXT,
    p_line_user_id TEXT,
    p_cooldown_minutes INT DEFAULT 30
)
RETURNS JSON
LANGUAGE SQL
SECURITY DEFINER
SET search_path = 'public'
AS $$
SELECT json_build_object(
    'is_bound', EXISTS(
        SELECT 1 FROM line_group_bindings
        WHERE line_group_id = p_line_group_id AND unbound_at IS NULL
    ),
    'is_registered', EXISTS(
        SELECT 1 FROM member_line_bindings
        WHERE line_user_id = p_line_user_id
    ),
    'in_cooldown', EXISTS(
        SELECT 1 FROM line_user_notifications
        WHERE line_group_id = p_line_group_id
          AND line_user_id = '__GROUP__'
          AND notified_at > NOW() - (p_cooldown_minutes || ' minutes')::INTERVAL
    )
);
$$;
```

### Repository

```python
# line_binding_repository.py — new method
async def check_liff_notification_eligibility(
    self, line_group_id: str, line_user_id: str, cooldown_minutes: int = 30,
) -> dict:
    result = await self._execute_async(
        lambda: self.client.rpc(
            "check_liff_notification_eligibility",
            {
                "p_line_group_id": line_group_id,
                "p_line_user_id": line_user_id,
                "p_cooldown_minutes": cooldown_minutes,
            },
        ).execute()
    )
    return result.data
```

### Service

```python
# line_binding_service.py — replace should_send_liff_notification
async def should_send_liff_notification(
    self, line_group_id: str, line_user_id: str,
) -> bool:
    result = await self.repository.check_liff_notification_eligibility(
        line_group_id, line_user_id, cooldown_minutes=30,
    )
    # Only send if: group is bound AND user is NOT registered AND NOT in cooldown
    return result["is_bound"] and not result["is_registered"] and not result["in_cooldown"]
```

**Files changed:**
- New migration: `backend/migrations/20260409_check_liff_notification_eligibility.sql`
- `backend/src/repositories/line_binding_repository.py` (new method)
- `backend/src/services/line_binding_service.py` (simplify `should_send_liff_notification`)

**Risk:** Medium — new RPC needs Supabase migration. Test with existing unit tests for `should_send_liff_notification`.

---

## §4 — Search Result Limit

**Problem:** `search_id_bindings` in `line_binding_repository.py:333` uses `ILIKE` without a limit. A broad search term in a large alliance could return hundreds of results.

**Fix:** Add `.limit(10)` to the query chain.

```python
# line_binding_repository.py — one-line change
.or_(f"game_id.ilike.%{safe_query}%,line_display_name.ilike.%{safe_query}%")
.limit(10)  # ADD THIS
.execute()
```

**Files changed:** `backend/src/repositories/line_binding_repository.py` (1 line)
**Risk:** None.

---

## §5 — LIFF `useLiffPerformance` staleTime

**Problem:** `useLiffPerformance` has no `staleTime`, so TanStack Query refetches on every tab focus. Performance data doesn't change frequently — 1 minute cache is appropriate.

**Fix:**

```typescript
// use-liff-performance.ts
staleTime: 60_000,  // 1 minute
```

Also add staleTime to `useLiffEventList`:

```typescript
// use-liff-battle.ts
staleTime: 30_000,  // 30 seconds
```

**Files changed:** `frontend/src/liff/hooks/use-liff-performance.ts`, `frontend/src/liff/hooks/use-liff-battle.ts`
**Risk:** None.

---

## §6 — Event Report Prefetch

**Problem:** Expanding an event card in BattleTab triggers a fetch. With 10 events, expanding all = 10 sequential user-visible loading states.

**Fix:** Prefetch report data when the event card enters the viewport (IntersectionObserver) or on first render of visible cards.

```typescript
// BattleTab.tsx — prefetch visible event reports
const queryClient = useQueryClient()

// On card mount (visible events)
useEffect(() => {
  if (events) {
    events.slice(0, 5).forEach((event) => {
      queryClient.prefetchQuery({
        queryKey: liffBattleKeys.report(groupId, event.id),
        queryFn: () => liffApi.getEventReport(context, event.id),
        staleTime: 60_000,
      })
    })
  }
}, [events])
```

**Files changed:** `frontend/src/liff/pages/BattleTab.tsx`
**Risk:** Low — prefetch is best-effort, doesn't block UI. Only prefetches first 5 visible events to limit network usage.

---

## §7 — Event List Pagination

**Problem:** All events rendered at once. Active alliances may have 50+ events over a season.

**Fix:** Limit initial fetch to 10 events, add "載入更多" button.

### Backend

The existing `get_recent_completed_events_for_alliance` already accepts `limit`. Add `offset` parameter:

```python
# battle_event_service.py or relevant repo method
async def get_recent_completed_events_for_alliance(
    self, alliance_id, season_id=None, limit=10, offset=0
):
    ...
    .range(offset, offset + limit - 1)
    ...
```

### Frontend

```typescript
// use-liff-battle.ts — manual offset pagination (simpler than useInfiniteQuery for this case)
const [events, setEvents] = useState<Event[]>([])
const [offset, setOffset] = useState(0)
const PAGE_SIZE = 10

// Query fetches PAGE_SIZE events at current offset
// "載入更多" button: setOffset(prev => prev + PAGE_SIZE), append new results to events[]
// Hide button when returned results < PAGE_SIZE (no more data)
```

**Files changed:**
- Backend: `backend/src/repositories/battle_event_repository.py` (add offset)
- Frontend: `frontend/src/liff/hooks/use-liff-battle.ts` + `frontend/src/liff/pages/BattleTab.tsx`

**Risk:** Low — additive change, existing behavior preserved when offset=0.

---

## Testing Strategy

| Item | Test Approach |
|------|--------------|
| §1 async reply | Existing tests pass (no behavior change). Add test that `_send_reply` is awaitable. |
| §2 binding passthrough | Existing `test_linebot_trial_gate.py` covers the gate path. Verify binding is passed (mock assert). |
| §3 cooldown RPC | New unit test for RPC return values. Update `test_line_binding_service.py` cooldown tests. |
| §4 search limit | Existing search tests + add test for >10 results. |
| §5-7 frontend | Manual LIFF testing in LINE app. Verify network tab shows fewer requests. |

## Execution Order

1. §1 (async reply) — zero dependency, immediate safety win
2. §4 (search limit) — one line, immediate
3. §2 (binding passthrough) — linebot.py only
4. §5 (staleTime) — frontend one-liners
5. §3 (cooldown RPC) — needs migration, test
6. §6 (prefetch) — frontend, test in LINE
7. §7 (pagination) — fullstack, largest change
