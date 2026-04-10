# Unregistered Members (未登記成員) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Show LINE group members who haven't registered a game ID yet ("未登記") alongside the existing verified/unverified sections in the admin members view.

**Architecture:** Extend `line_group_members` table with `line_display_name` column. On webhook events (message, memberJoined), fetch LINE profile via `get_group_member_profile` and store the display name. Extend the existing `get_registered_members` API to also return unregistered members (group members minus registered members). Frontend adds a third collapsible section.

**Tech Stack:** FastAPI, Supabase, LINE Messaging API SDK (`linebot.v3.messaging`), React, TanStack Query, shadcn/ui

---

### Task 1: Add `line_display_name` column to `line_group_members`

**Files:**
- Create: `backend/migrations/20260403_add_display_name_to_line_group_members.sql`

**Step 1: Write migration SQL**

```sql
ALTER TABLE line_group_members
ADD COLUMN line_display_name VARCHAR;
```

**Step 2: Execute migration via Supabase MCP**

Run the SQL above against the database.

**Step 3: Commit**

```bash
git add backend/migrations/20260403_add_display_name_to_line_group_members.sql
git commit -m "feat(db): add line_display_name to line_group_members table"
```

---

### Task 2: Add profile fetching helper to `line_auth.py`

**Files:**
- Modify: `backend/src/core/line_auth.py`

**Step 1: Write the failing test**

```python
# backend/tests/unit/core/test_line_profile.py

import pytest
from unittest.mock import MagicMock, patch

from src.core.line_auth import get_group_member_display_name


class TestGetGroupMemberDisplayName:
    @patch("src.core.line_auth.get_line_bot_api")
    def test_returns_display_name(self, mock_get_api):
        mock_api = MagicMock()
        mock_profile = MagicMock()
        mock_profile.display_name = "張飛"
        mock_api.get_group_member_profile.return_value = mock_profile
        mock_get_api.return_value = mock_api

        result = get_group_member_display_name("group123", "user456")

        assert result == "張飛"
        mock_api.get_group_member_profile.assert_called_once_with("group123", "user456")

    @patch("src.core.line_auth.get_line_bot_api")
    def test_returns_none_when_api_unavailable(self, mock_get_api):
        mock_get_api.return_value = None

        result = get_group_member_display_name("group123", "user456")

        assert result is None

    @patch("src.core.line_auth.get_line_bot_api")
    def test_returns_none_on_api_error(self, mock_get_api):
        mock_api = MagicMock()
        mock_api.get_group_member_profile.side_effect = Exception("API error")
        mock_get_api.return_value = mock_api

        result = get_group_member_display_name("group123", "user456")

        assert result is None
```

**Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/unit/core/test_line_profile.py -v`
Expected: FAIL — `ImportError: cannot import name 'get_group_member_display_name'`

**Step 3: Implement `get_group_member_display_name` in `line_auth.py`**

Add after `get_line_bot_api()` function:

```python
def get_group_member_display_name(group_id: str, user_id: str) -> str | None:
    """Fetch a group member's display name via LINE Messaging API.

    Returns None if API is unavailable or call fails (best-effort).
    """
    line_bot = get_line_bot_api()
    if not line_bot:
        return None

    try:
        profile = line_bot.get_group_member_profile(group_id, user_id)
        return profile.display_name
    except Exception:
        logger.debug("Failed to fetch profile for user %s in group %s", user_id, group_id)
        return None
```

**Step 4: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/unit/core/test_line_profile.py -v`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/src/core/line_auth.py backend/tests/unit/core/test_line_profile.py
git commit -m "feat(line): add helper to fetch group member display name"
```

---

### Task 3: Store display name when tracking group members

**Files:**
- Modify: `backend/src/repositories/line_binding_repository.py` — `upsert_group_member`
- Modify: `backend/src/services/line_binding_service.py` — `track_group_presence`, `track_members_joined`
- Modify: `backend/src/api/v1/endpoints/linebot.py` — pass display name through

**Step 1: Write failing tests for repository**

```python
# Add to backend/tests/unit/repositories/test_line_binding_repository.py (or create if needed)

class TestUpsertGroupMember:
    async def test_upsert_includes_display_name(self, mock_repo):
        """upsert_group_member should pass display_name when provided"""
        await mock_repo.upsert_group_member("group1", "user1", "張飛")
        # Verify upsert was called with display_name in payload
```

**Step 2: Update `upsert_group_member` to accept optional `line_display_name`**

In `backend/src/repositories/line_binding_repository.py`, modify `upsert_group_member` (line ~413):

```python
async def upsert_group_member(
    self, line_group_id: str, line_user_id: str, line_display_name: str | None = None
) -> None:
    """Track a user's presence in a LINE group (idempotent)."""
    data = {
        "line_group_id": line_group_id,
        "line_user_id": line_user_id,
        "tracked_at": datetime.now(UTC).isoformat(),
    }
    if line_display_name:
        data["line_display_name"] = line_display_name

    await self._execute_async(
        lambda: self.client.from_("line_group_members")
        .upsert(data, on_conflict="line_group_id,line_user_id")
        .execute()
    )
```

**Step 3: Update service methods to fetch and pass display name**

In `backend/src/services/line_binding_service.py`:

Update `track_group_presence`:
```python
async def track_group_presence(
    self, line_group_id: str, line_user_id: str, line_display_name: str | None = None
) -> None:
    """Track that a user is present in a group (passive tracking from messages)."""
    await self.repository.upsert_group_member(line_group_id, line_user_id, line_display_name)
```

Update `track_members_joined`:
```python
async def track_members_joined(
    self,
    line_group_id: str,
    user_ids: list[str],
    display_names: dict[str, str] | None = None,
) -> None:
    """Track multiple members joining a group."""
    names = display_names or {}
    for user_id in user_ids:
        await self.repository.upsert_group_member(
            line_group_id, user_id, names.get(user_id)
        )
```

**Step 4: Update webhook handlers to fetch profile and pass display name**

In `backend/src/api/v1/endpoints/linebot.py`:

Add import:
```python
from src.core.line_auth import get_group_member_display_name
```

Update `_handle_group_message` (line ~801):
```python
# Fetch display name best-effort for passive tracking
display_name = get_group_member_display_name(line_group_id, line_user_id)
await service.track_group_presence(line_group_id, line_user_id, display_name)
```

Update `_handle_member_joined` (line ~725-727):
```python
user_ids = _extract_member_user_ids(event.joined)
if user_ids:
    # Best-effort fetch display names for new members
    display_names = {}
    for uid in user_ids:
        name = get_group_member_display_name(line_group_id, uid)
        if name:
            display_names[uid] = name
    await service.track_members_joined(line_group_id, user_ids, display_names)
```

**Step 5: Run tests**

Run: `cd backend && uv run pytest tests/unit/services/test_line_binding_service.py -v`
Expected: PASS (existing tests still pass)

**Step 6: Run lint**

Run: `cd backend && uv run ruff check .`

**Step 7: Commit**

```bash
git add backend/src/repositories/line_binding_repository.py backend/src/services/line_binding_service.py backend/src/api/v1/endpoints/linebot.py
git commit -m "feat(line): store display name when tracking group members"
```

---

### Task 4: Add unregistered members to API response

**Files:**
- Modify: `backend/src/models/line_binding.py` — add `UnregisteredMemberItem`, update response model
- Modify: `backend/src/repositories/line_binding_repository.py` — add `get_group_members` method
- Modify: `backend/src/services/line_binding_service.py` — add unregistered logic

**Step 1: Write failing test**

```python
# Add to backend/tests/unit/services/test_line_binding_service.py

async def test_get_registered_members_includes_unregistered(self):
    """Unregistered members = group members minus registered members"""
    # Setup: 3 group members, 1 registered
    # Expect: 1 registered member + 2 unregistered members
```

**Step 2: Add models**

In `backend/src/models/line_binding.py`, add after `RegisteredMemberItem`:

```python
class UnregisteredMemberItem(BaseModel):
    """Unregistered group member (in LINE group but no game ID registered)"""

    line_user_id: str
    line_display_name: str | None = None
    tracked_at: datetime
```

Update `RegisteredMembersResponse`:

```python
class RegisteredMembersResponse(BaseModel):
    """Response for registered members list"""

    members: list[RegisteredMemberItem]
    unregistered: list[UnregisteredMemberItem]
    total: int
    unregistered_count: int
```

**Step 3: Add repository method to get full group members list**

In `backend/src/repositories/line_binding_repository.py`, add:

```python
async def get_group_members(
    self, line_group_ids: list[str]
) -> list[dict]:
    """Get all tracked group members with display names."""
    if not line_group_ids:
        return []

    result = await self._execute_async(
        lambda: self.client.from_("line_group_members")
        .select("line_user_id, line_display_name, tracked_at")
        .in_("line_group_id", line_group_ids)
        .execute()
    )

    return self._handle_supabase_result(result, allow_empty=True)
```

**Step 4: Update service to compute unregistered members**

In `backend/src/services/line_binding_service.py`, update `get_registered_members`:

```python
async def get_registered_members(self, alliance_id: UUID) -> RegisteredMembersResponse:
    active_bindings = await self.repository.get_all_active_group_bindings_by_alliance(
        alliance_id
    )

    if not active_bindings:
        return RegisteredMembersResponse(
            members=[], unregistered=[], total=0, unregistered_count=0
        )

    line_group_ids = [b.line_group_id for b in active_bindings]

    # Fetch all group members and registered bindings in parallel
    all_group_members, bindings_for_alliance = await asyncio.gather(
        self.repository.get_group_members(line_group_ids),
        self.repository.get_member_bindings_for_alliance(alliance_id),
    )

    if not all_group_members:
        return RegisteredMembersResponse(
            members=[], unregistered=[], total=0, unregistered_count=0
        )

    tracked_user_ids = {m["line_user_id"] for m in all_group_members}
    registered_user_ids = {b.line_user_id for b in bindings_for_alliance}

    # Registered members (in group AND registered)
    in_group_bindings = [
        b for b in bindings_for_alliance if b.line_user_id in tracked_user_ids
    ]
    members = [
        RegisteredMemberItem(
            line_user_id=b.line_user_id,
            line_display_name=b.line_display_name,
            game_id=b.game_id,
            is_verified=b.is_verified,
            registered_at=b.created_at,
        )
        for b in in_group_bindings
    ]

    # Unregistered members (in group but NOT registered)
    group_member_map = {m["line_user_id"]: m for m in all_group_members}
    unregistered = [
        UnregisteredMemberItem(
            line_user_id=uid,
            line_display_name=group_member_map[uid].get("line_display_name"),
            tracked_at=group_member_map[uid]["tracked_at"],
        )
        for uid in tracked_user_ids - registered_user_ids
    ]

    return RegisteredMembersResponse(
        members=members,
        unregistered=unregistered,
        total=len(members),
        unregistered_count=len(unregistered),
    )
```

Note: `get_member_bindings_for_alliance` is a new repository method that fetches all bindings for an alliance (without the group member filter). If `get_member_bindings_by_line_user_ids` already works but requires user IDs, add a simpler variant:

```python
async def get_member_bindings_for_alliance(
    self, alliance_id: UUID
) -> list[MemberLineBinding]:
    """Get all member bindings for an alliance."""
    result = await self._execute_async(
        lambda: self.client.from_("member_line_bindings")
        .select("*")
        .eq("alliance_id", str(alliance_id))
        .order("created_at", desc=True)
        .execute()
    )
    data = self._handle_supabase_result(result, allow_empty=True)
    return [MemberLineBinding(**row) for row in data]
```

**Step 5: Run tests and lint**

Run: `cd backend && uv run pytest tests/unit/services/test_line_binding_service.py -v`
Run: `cd backend && uv run ruff check .`

**Step 6: Commit**

```bash
git add backend/src/models/line_binding.py backend/src/repositories/line_binding_repository.py backend/src/services/line_binding_service.py
git commit -m "feat(line): include unregistered group members in admin members API"
```

---

### Task 5: Update frontend types and API

**Files:**
- Modify: `frontend/src/types/line-binding.ts`
- No changes needed to `frontend/src/lib/api/line-api.ts` (same endpoint)

**Step 1: Update TypeScript types**

In `frontend/src/types/line-binding.ts`:

```typescript
export interface UnregisteredMemberItem {
  readonly line_user_id: string
  readonly line_display_name: string | null
  readonly tracked_at: string
}

export interface RegisteredMembersResponse {
  readonly members: RegisteredMemberItem[]
  readonly unregistered: UnregisteredMemberItem[]
  readonly total: number
  readonly unregistered_count: number
}
```

**Step 2: Commit**

```bash
git add frontend/src/types/line-binding.ts
git commit -m "feat(line): add unregistered member types to frontend"
```

---

### Task 6: Update `RegisteredMembersCard` UI

**Files:**
- Modify: `frontend/src/components/line-binding/RegisteredMembersCard.tsx`

**Step 1: Add unregistered section**

Add state and data:
```typescript
const [unregisteredOpen, setUnregisteredOpen] = useState(true)
const unregisteredMembers = membersData?.unregistered ?? []
```

Add stats card for unregistered count (alongside existing verified/unverified cards):
```typescript
<div className="text-center">
  <div className="text-2xl font-bold text-muted-foreground">
    {unregisteredMembers.length}
  </div>
  <div className="text-xs text-muted-foreground">未登記</div>
</div>
```

Add collapsible section (before or after the existing unverified/verified sections):
```tsx
{/* 未登記成員 */}
<div className="border rounded-lg overflow-hidden">
  <button
    onClick={() => setUnregisteredOpen(!unregisteredOpen)}
    className="w-full flex items-center justify-between p-3 hover:bg-muted/50"
  >
    <div className="flex items-center gap-2">
      <UserX className="h-4 w-4 text-muted-foreground" />
      <span className="font-medium">未登記成員</span>
      <Badge variant="outline" className="text-xs">
        {unregisteredMembers.length}
      </Badge>
    </div>
    {unregisteredOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
  </button>
  {unregisteredOpen && (
    <div className="border-t">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/30">
            <th className="p-3 text-left font-medium">LINE 名稱</th>
            <th className="p-3 text-right font-medium">最後活動</th>
          </tr>
        </thead>
        <tbody>
          {unregisteredMembers.map((member) => (
            <tr key={member.line_user_id} className="border-b hover:bg-muted/20">
              <td className="p-3">
                {member.line_display_name ?? (
                  <span className="text-muted-foreground italic">未知</span>
                )}
              </td>
              <td className="p-3 text-right tabular-nums text-muted-foreground">
                {formatDateTW(member.tracked_at, { padded: true })}
              </td>
            </tr>
          ))}
          {unregisteredMembers.length === 0 && (
            <tr>
              <td colSpan={2} className="p-6 text-center text-muted-foreground">
                所有群組成員皆已登記
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )}
</div>
```

Import `UserX` icon: `import { UserX } from 'lucide-react/UserX'` (or from existing lucide imports if barrel import is used).

**Step 2: Run type check**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS

**Step 3: Run lint**

Run: `cd frontend && npm run lint`

**Step 4: Commit**

```bash
git add frontend/src/components/line-binding/RegisteredMembersCard.tsx
git commit -m "feat(line): add unregistered members section to admin view"
```

---

### Task 7: Update existing tests

**Files:**
- Modify: `backend/tests/unit/services/test_line_binding_service.py`

**Step 1: Update tests for new response shape**

Existing tests that assert on `RegisteredMembersResponse` need to account for the new `unregistered` and `unregistered_count` fields.

**Step 2: Add test for unregistered computation**

```python
async def test_unregistered_members_computed_correctly(self, service, mock_repo):
    """Members in group but not registered should appear as unregistered"""
    mock_repo.get_all_active_group_bindings_by_alliance.return_value = [
        mock_group_binding(line_group_id="g1")
    ]
    mock_repo.get_group_members.return_value = [
        {"line_user_id": "u1", "line_display_name": "張飛", "tracked_at": "2026-04-03T00:00:00Z"},
        {"line_user_id": "u2", "line_display_name": "關羽", "tracked_at": "2026-04-03T00:00:00Z"},
        {"line_user_id": "u3", "line_display_name": None, "tracked_at": "2026-04-03T00:00:00Z"},
    ]
    mock_repo.get_member_bindings_for_alliance.return_value = [
        mock_binding(line_user_id="u1", game_id="張飛", is_verified=True),
    ]

    result = await service.get_registered_members(UUID("00000000-0000-0000-0000-000000000001"))

    assert result.total == 1
    assert result.unregistered_count == 2
    assert {m.line_user_id for m in result.unregistered} == {"u2", "u3"}
```

**Step 3: Run all tests**

Run: `cd backend && uv run pytest tests/ -v`

**Step 4: Commit**

```bash
git add backend/tests/
git commit -m "test(line): add unregistered members computation tests"
```

---

## Notes

- **Display name 為 best-effort**：LINE profile API 有 rate limit，且 `get_group_member_profile` 是 sync call（SDK 限制）。失敗時靜默降級，前端顯示「未知」。
- **漸進式填充**：部署後，`line_display_name` 欄位從 NULL 開始，隨著成員發送訊息或新成員加入逐漸填充（與 `line_group_members` 本身的填充機制一致）。
- **`get_group_member_profile` vs `get_profile`**：使用 group 版本，不需要用戶加好友也能取得資料。
- **Performance**：`memberJoined` 事件可能一次多人加入，每人一次 API call。LINE rate limit 是 2000/min，一般群組不會有問題。
