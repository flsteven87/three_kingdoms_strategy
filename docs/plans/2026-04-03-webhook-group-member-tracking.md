# Webhook-Based Group Member Tracking — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Track LINE group membership via webhook events, so the admin registered-members list only shows members currently in an active LINE group — without needing the restricted `get group member user IDs` API.

**Architecture:** Create a `line_group_members` table that records which LINE users are in which groups. Populate it from three webhook sources: `memberJoined` (explicit join), `memberLeft` (explicit leave), and group message events (passive presence tracking). The `get_registered_members()` service method cross-joins this table with `member_line_bindings` to filter the admin view.

**Tech Stack:** FastAPI, Supabase PostgreSQL, Pydantic V2, pytest + AsyncMock

---

## Context for the Implementer

### Why not the LINE API?
The `GET /v2/bot/group/{groupId}/members/ids` endpoint requires a verified (blue shield) account. Our bot is unverified (grey shield), so we get `"Access to this API is not available for your account"`. Webhook events are available to all accounts.

### Why passive tracking from messages?
Webhook `memberJoined` only fires for members who join AFTER the bot is already in the group. For the ~200 existing members who were already in the group when the bot joined, we'd never see a `memberJoined` event. But when they send a message, the webhook payload includes their `userId` in `source` — so we can passively detect their presence.

### Data flow
```
memberJoined event  ──→ UPSERT line_group_members
memberLeft event    ──→ DELETE line_group_members
group message event ──→ UPSERT line_group_members (passive)

Admin view query:
  line_group_members ──JOIN── member_line_bindings
  (who's in group)           (who's registered)
  = only registered members currently in the group
```

### Key LINE webhook payloads

**memberJoined:**
```json
{
  "type": "memberJoined",
  "source": { "type": "group", "groupId": "C..." },
  "joined": { "members": [{ "type": "user", "userId": "U..." }] }
}
```

**memberLeft:**
```json
{
  "type": "memberLeft",
  "source": { "type": "group", "groupId": "C..." },
  "left": { "members": [{ "type": "user", "userId": "U..." }] }
}
```

**Group message:** `source.userId` contains the sender's LINE user ID.

### Files you'll touch

| Layer | File | What changes |
|-------|------|-------------|
| DB | `backend/migrations/20260403_create_line_group_members.sql` | New table |
| Model | `backend/src/models/line_binding.py` | Add `joined`/`left` fields to `LineWebhookEvent` |
| Repository | `backend/src/repositories/line_binding_repository.py` | Add group member CRUD + query methods |
| Service | `backend/src/services/line_binding_service.py` | Add tracking methods, update `get_registered_members()` + member_count |
| API | `backend/src/api/v1/endpoints/linebot.py` | Wire `memberJoined`/`memberLeft` tracking + passive tracking in messages |
| Tests | `backend/tests/unit/repositories/test_line_group_members.py` | Repository tests |
| Tests | `backend/tests/unit/services/test_line_binding_service.py` | Update existing + add tracking tests |

---

## Task 1: Database Migration

**Files:**
- Create: `backend/migrations/20260403_create_line_group_members.sql`

**Step 1: Write the migration SQL**

```sql
-- Migration: Create line_group_members table
-- Purpose: Track which LINE users are currently in which LINE groups,
--          populated from webhook events (memberJoined, memberLeft, message).
-- Date: 2026-04-03
--
-- Run this in Supabase SQL Editor.

CREATE TABLE line_group_members (
    line_group_id VARCHAR NOT NULL,
    line_user_id VARCHAR NOT NULL,
    tracked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (line_group_id, line_user_id)
);

COMMENT ON TABLE line_group_members IS
    'Tracks LINE group membership via webhook events. Used to filter registered members admin view.';
COMMENT ON COLUMN line_group_members.tracked_at IS
    'Last time this user was seen in this group (join event or message).';

-- Index for looking up all members in a group (primary use case)
-- PK already covers (line_group_id, line_user_id), so this is free.

-- Index for reverse lookup: which groups is a user in?
CREATE INDEX idx_line_group_members_user ON line_group_members (line_user_id);
```

**Step 2: Execute the migration via Supabase SQL Editor or MCP**

Run the SQL above in the Supabase SQL Editor. Verify with:
```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'line_group_members' ORDER BY ordinal_position;
```

**Step 3: Commit**

```bash
git add backend/migrations/20260403_create_line_group_members.sql
git commit -m "feat(line): add line_group_members table for webhook-based membership tracking"
```

---

## Task 2: Model — Update LineWebhookEvent

**Files:**
- Modify: `backend/src/models/line_binding.py:238-247`
- Test: `backend/tests/unit/models/test_line_webhook_event.py`

**Step 1: Write the failing test**

```python
"""Tests for LineWebhookEvent model — joined/left field parsing."""
import pytest
from src.models.line_binding import LineWebhookEvent


class TestLineWebhookEventJoinedLeft:

    def test_parses_member_joined_event(self):
        """memberJoined event should expose joined user IDs."""
        event = LineWebhookEvent(
            type="memberJoined",
            source={"type": "group", "groupId": "Cgroup123"},
            joined={"members": [
                {"type": "user", "userId": "Uaaa"},
                {"type": "user", "userId": "Ubbb"},
            ]},
            timestamp=1234567890,
        )
        assert event.joined is not None
        assert len(event.joined["members"]) == 2

    def test_parses_member_left_event(self):
        """memberLeft event should expose left user IDs."""
        event = LineWebhookEvent(
            type="memberLeft",
            source={"type": "group", "groupId": "Cgroup123"},
            left={"members": [{"type": "user", "userId": "Uccc"}]},
            timestamp=1234567890,
        )
        assert event.left is not None
        assert event.left["members"][0]["userId"] == "Uccc"

    def test_joined_left_default_to_none(self):
        """Normal message events should have joined=None, left=None."""
        event = LineWebhookEvent(
            type="message",
            source={"type": "group", "groupId": "Cgroup123"},
            message={"type": "text", "text": "hello"},
            timestamp=1234567890,
        )
        assert event.joined is None
        assert event.left is None
```

**Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/unit/models/test_line_webhook_event.py -v`
Expected: FAIL — `LineWebhookEvent` doesn't accept `joined`/`left` fields.

**Step 3: Write minimal implementation**

In `backend/src/models/line_binding.py`, update `LineWebhookEvent`:

```python
class LineWebhookEvent(BaseModel):
    """LINE webhook event (simplified)"""

    type: str
    reply_token: str | None = Field(None, alias="replyToken")
    source: dict
    message: dict | None = None
    joined: dict | None = None
    left: dict | None = None
    timestamp: int

    model_config = ConfigDict(populate_by_name=True)
```

**Step 4: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/unit/models/test_line_webhook_event.py -v`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/src/models/line_binding.py backend/tests/unit/models/test_line_webhook_event.py
git commit -m "feat(line): add joined/left fields to LineWebhookEvent model"
```

---

## Task 3: Repository — Group Member Tracking Methods

**Files:**
- Modify: `backend/src/repositories/line_binding_repository.py`
- Test: `backend/tests/unit/services/test_line_binding_service.py` (or a dedicated repo test)

We add 4 methods to `LineBindingRepository`:

1. `upsert_group_member(line_group_id, line_user_id)` — UPSERT on join or message
2. `remove_group_member(line_group_id, line_user_id)` — DELETE on leave
3. `get_group_member_user_ids(line_group_ids: list[str]) -> set[str]` — for registered members query
4. `count_group_members_registered(alliance_id, line_group_id) -> int` — for member_count display

**Step 1: Write the failing tests**

Add to `backend/tests/unit/services/test_line_binding_service.py` or create a new test file. Since these are repository methods that require Supabase, we'll test them through the service layer with mocks (consistent with existing test patterns).

Create `backend/tests/unit/repositories/test_line_group_members_repo.py`:

```python
"""
Unit Tests for LineBindingRepository group member tracking methods.

Tests cover:
1. upsert_group_member — idempotent insert/update
2. remove_group_member — delete on leave
3. get_group_member_user_ids — fetch user IDs for group(s)
4. count_group_members_registered — count registered members in a group
"""
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID

import pytest


class TestGroupMemberRepositoryMethods:
    """Verify repository methods are called with correct Supabase queries."""

    # These are integration-level tests. For unit testing the service layer,
    # we mock the repository. The actual DB queries are verified via manual
    # testing against Supabase.
    #
    # See Task 4 for service-level tests with mocked repository.
    pass
```

> Note: Repository methods are thin Supabase wrappers. The meaningful tests are at the service layer (Task 4) where we mock the repository. The repository code itself is verified via the integration step (Task 6).

**Step 2: Write the repository methods**

Add the following methods to `LineBindingRepository` in `backend/src/repositories/line_binding_repository.py`, near the existing `update_member_binding_group` method:

```python
async def upsert_group_member(self, line_group_id: str, line_user_id: str) -> None:
    """Track a user's presence in a LINE group (idempotent)."""
    await self._execute_async(
        lambda: self.client.from_("line_group_members")
        .upsert(
            {
                "line_group_id": line_group_id,
                "line_user_id": line_user_id,
                "tracked_at": datetime.now(UTC).isoformat(),
            },
            on_conflict="line_group_id,line_user_id",
        )
        .execute()
    )

async def remove_group_member(self, line_group_id: str, line_user_id: str) -> None:
    """Remove a user from group tracking (on memberLeft)."""
    await self._execute_async(
        lambda: self.client.from_("line_group_members")
        .delete()
        .eq("line_group_id", line_group_id)
        .eq("line_user_id", line_user_id)
        .execute()
    )

async def get_group_member_user_ids(self, line_group_ids: list[str]) -> set[str]:
    """Get all tracked LINE user IDs across the given group(s)."""
    if not line_group_ids:
        return set()

    result = await self._execute_async(
        lambda: self.client.from_("line_group_members")
        .select("line_user_id")
        .in_("line_group_id", line_group_ids)
        .execute()
    )

    data = self._handle_supabase_result(result, allow_empty=True)
    return {row["line_user_id"] for row in data}

async def count_group_members_registered(
    self, alliance_id: UUID, line_group_id: str
) -> int:
    """Count registered members (in member_line_bindings) who are also in the given LINE group."""
    result = await self._execute_async(
        lambda: self.client.rpc(
            "count_registered_group_members",
            {"p_alliance_id": str(alliance_id), "p_line_group_id": line_group_id},
        ).execute()
    )
    # RPC scalar return: result.data is the direct value
    return result.data or 0
```

**Step 3: Create the RPC function for count**

Add to migration or run directly:

```sql
CREATE OR REPLACE FUNCTION count_registered_group_members(
    p_alliance_id UUID,
    p_line_group_id TEXT
) RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
    SELECT COUNT(*)::integer
    FROM member_line_bindings mlb
    JOIN line_group_members lgm
        ON mlb.line_user_id = lgm.line_user_id
    WHERE mlb.alliance_id = p_alliance_id
        AND lgm.line_group_id = p_line_group_id;
$$;
```

> Alternative: skip the RPC and do two queries (get user IDs from line_group_members, then count in member_line_bindings with IN filter). The RPC is more efficient but either approach works. If you prefer simplicity, use the two-query approach and skip the RPC.

**Step 4: Verify lint passes**

Run: `cd backend && uv run ruff check src/repositories/line_binding_repository.py`
Expected: no errors

**Step 5: Commit**

```bash
git add backend/src/repositories/line_binding_repository.py
git commit -m "feat(line): add group member tracking repository methods"
```

---

## Task 4: Service — Tracking Methods + Update Registered Members Query

**Files:**
- Modify: `backend/src/services/line_binding_service.py`
- Modify: `backend/tests/unit/services/test_line_binding_service.py`

### Part A: Add tracking service methods

**Step 1: Write the failing tests**

Add to `backend/tests/unit/services/test_line_binding_service.py`:

```python
class TestGroupMemberTracking:
    """Tests for group member webhook tracking methods."""

    @pytest.mark.asyncio
    async def test_track_members_joined_calls_upsert_for_each(
        self, service: LineBindingService, mock_repository: MagicMock
    ):
        """Should upsert each joined user into line_group_members."""
        mock_repository.upsert_group_member = AsyncMock()

        await service.track_members_joined("Cgroup123", ["Uaaa", "Ubbb"])

        assert mock_repository.upsert_group_member.call_count == 2
        mock_repository.upsert_group_member.assert_any_call("Cgroup123", "Uaaa")
        mock_repository.upsert_group_member.assert_any_call("Cgroup123", "Ubbb")

    @pytest.mark.asyncio
    async def test_track_members_left_calls_remove_for_each(
        self, service: LineBindingService, mock_repository: MagicMock
    ):
        """Should remove each left user from line_group_members."""
        mock_repository.remove_group_member = AsyncMock()

        await service.track_members_left("Cgroup123", ["Uccc"])

        mock_repository.remove_group_member.assert_called_once_with("Cgroup123", "Uccc")

    @pytest.mark.asyncio
    async def test_track_group_presence_upserts_single_user(
        self, service: LineBindingService, mock_repository: MagicMock
    ):
        """Should upsert a single user on message event (passive tracking)."""
        mock_repository.upsert_group_member = AsyncMock()

        await service.track_group_presence("Cgroup123", "Uaaa")

        mock_repository.upsert_group_member.assert_called_once_with("Cgroup123", "Uaaa")
```

**Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/unit/services/test_line_binding_service.py::TestGroupMemberTracking -v`
Expected: FAIL — methods don't exist yet.

**Step 3: Write the service methods**

Add to `LineBindingService` in `backend/src/services/line_binding_service.py`:

```python
async def track_members_joined(self, line_group_id: str, user_ids: list[str]) -> None:
    """Track users who joined a LINE group (from memberJoined webhook)."""
    for user_id in user_ids:
        await self.repository.upsert_group_member(line_group_id, user_id)

async def track_members_left(self, line_group_id: str, user_ids: list[str]) -> None:
    """Remove users who left a LINE group (from memberLeft webhook)."""
    for user_id in user_ids:
        await self.repository.remove_group_member(line_group_id, user_id)

async def track_group_presence(self, line_group_id: str, user_id: str) -> None:
    """Track a user's presence from any group event (passive tracking)."""
    await self.repository.upsert_group_member(line_group_id, user_id)
```

**Step 4: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/unit/services/test_line_binding_service.py::TestGroupMemberTracking -v`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/src/services/line_binding_service.py backend/tests/unit/services/test_line_binding_service.py
git commit -m "feat(line): add group member tracking service methods"
```

### Part B: Update get_registered_members() and member_count

**Step 6: Write the failing tests**

Update the existing `TestGetRegisteredMembers` class. Replace the FK-based tests with group-member-table-based tests:

```python
class TestGetRegisteredMembers:
    """Tests for get_registered_members() — group member table filtering."""

    @pytest.mark.asyncio
    async def test_returns_only_members_in_active_groups(
        self, service: LineBindingService, mock_repository: MagicMock
    ):
        """Should cross-filter registered members with group member tracking."""
        binding = _make_group_binding()
        mock_repository.get_all_active_group_bindings_by_alliance = AsyncMock(
            return_value=[binding]
        )
        mock_repository.get_group_member_user_ids = AsyncMock(
            return_value={"Uuser1", "Uuser_not_registered"}
        )
        member = _make_member_binding(line_user_id="Uuser1", game_id="玩家A")
        mock_repository.get_member_bindings_by_line_user_ids = AsyncMock(
            return_value=[member]
        )

        result = await service.get_registered_members(ALLIANCE_ID)

        assert result.total == 1
        assert result.members[0].game_id == "玩家A"
        mock_repository.get_group_member_user_ids.assert_called_once_with(
            [binding.line_group_id]
        )

    @pytest.mark.asyncio
    async def test_returns_empty_when_no_active_bindings(
        self, service: LineBindingService, mock_repository: MagicMock
    ):
        """Should return empty when no active group bindings exist."""
        mock_repository.get_all_active_group_bindings_by_alliance = AsyncMock(
            return_value=[]
        )

        result = await service.get_registered_members(ALLIANCE_ID)

        assert result.total == 0
        assert result.members == []

    @pytest.mark.asyncio
    async def test_returns_empty_when_no_tracked_members(
        self, service: LineBindingService, mock_repository: MagicMock
    ):
        """Should return empty when group tracking table has no members."""
        binding = _make_group_binding()
        mock_repository.get_all_active_group_bindings_by_alliance = AsyncMock(
            return_value=[binding]
        )
        mock_repository.get_group_member_user_ids = AsyncMock(return_value=set())

        result = await service.get_registered_members(ALLIANCE_ID)

        assert result.total == 0
        assert result.members == []

    @pytest.mark.asyncio
    async def test_merges_members_from_multiple_groups(
        self, service: LineBindingService, mock_repository: MagicMock
    ):
        """Should collect tracked user IDs from all active group line_group_ids."""
        now = datetime.now()
        binding1 = _make_group_binding()  # line_group_id = GROUP_ID
        binding2 = LineGroupBinding(
            id=UUID("66666666-6666-6666-6666-666666666666"),
            alliance_id=ALLIANCE_ID,
            line_group_id="Cgroup5678",
            group_name="測試群",
            bound_by_line_user_id="Uadmin",
            is_active=True,
            is_test=True,
            bound_at=now,
            created_at=now,
            updated_at=now,
        )
        mock_repository.get_all_active_group_bindings_by_alliance = AsyncMock(
            return_value=[binding1, binding2]
        )
        mock_repository.get_group_member_user_ids = AsyncMock(
            return_value={"Uuser1", "Uuser2"}
        )
        member_a = _make_member_binding(line_user_id="Uuser1", game_id="玩家A")
        member_b = _make_member_binding(line_user_id="Uuser2", game_id="玩家B")
        mock_repository.get_member_bindings_by_line_user_ids = AsyncMock(
            return_value=[member_a, member_b]
        )

        result = await service.get_registered_members(ALLIANCE_ID)

        assert result.total == 2
        mock_repository.get_group_member_user_ids.assert_called_once_with(
            [GROUP_ID, "Cgroup5678"]
        )
```

**Step 7: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/unit/services/test_line_binding_service.py::TestGetRegisteredMembers -v`
Expected: FAIL — service still uses FK-based query.

**Step 8: Update get_registered_members() and get_line_binding_status()**

In `backend/src/services/line_binding_service.py`:

**`get_registered_members()`** — replace FK filtering with group member table:

```python
async def get_registered_members(self, alliance_id: UUID) -> RegisteredMembersResponse:
    """
    Get registered LINE members currently in the alliance's active group(s).

    Cross-filters member_line_bindings with line_group_members table
    (populated by webhook events). Only members who are both registered
    AND tracked as present in an active LINE group are returned.
    """
    active_bindings = await self.repository.get_all_active_group_bindings_by_alliance(
        alliance_id
    )

    if not active_bindings:
        return RegisteredMembersResponse(members=[], total=0)

    line_group_ids = [b.line_group_id for b in active_bindings]
    tracked_user_ids = await self.repository.get_group_member_user_ids(line_group_ids)

    if not tracked_user_ids:
        return RegisteredMembersResponse(members=[], total=0)

    bindings = await self.repository.get_member_bindings_by_line_user_ids(
        alliance_id, tracked_user_ids
    )

    members = [
        RegisteredMemberItem(
            line_user_id=b.line_user_id,
            line_display_name=b.line_display_name,
            game_id=b.game_id,
            is_verified=b.is_verified,
            registered_at=b.created_at,
        )
        for b in bindings
    ]

    return RegisteredMembersResponse(members=members, total=len(members))
```

**`get_line_binding_status()`** — update member_count per binding:

```python
# Replace the member_count loop in get_line_binding_status():
for binding in group_bindings:
    member_count = await self.repository.count_group_members_registered(
        alliance_id, binding.line_group_id
    )
    bindings_response.append(
        LineGroupBindingResponse(
            id=binding.id,
            # ... rest of fields ...
            member_count=member_count,
        )
    )
```

Also update `refresh_group_info()` similarly.

**Repository methods needed:** Re-add `get_member_bindings_by_line_user_ids` to the repository (was removed in the revert). See Task 3 for `get_group_member_user_ids`. The `count_group_members_registered` can use a simpler two-query approach if RPC is too complex:

```python
async def count_group_members_registered(
    self, alliance_id: UUID, line_group_id: str
) -> int:
    """Count registered members who are also tracked in the given LINE group."""
    tracked_ids = await self.get_group_member_user_ids([line_group_id])
    if not tracked_ids:
        return 0

    result = await self._execute_async(
        lambda: self.client.from_("member_line_bindings")
        .select("id", count="exact")
        .eq("alliance_id", str(alliance_id))
        .in_("line_user_id", list(tracked_ids))
        .execute()
    )
    return result.count or 0
```

**Step 9: Run all tests**

Run: `cd backend && uv run pytest tests/unit/services/test_line_binding_service.py -v`
Expected: ALL PASS

**Step 10: Commit**

```bash
git add backend/src/services/line_binding_service.py backend/src/repositories/line_binding_repository.py backend/tests/unit/services/test_line_binding_service.py
git commit -m "feat(line): filter registered members by webhook-tracked group membership"
```

---

## Task 5: Webhook Handlers — Wire Up Event Tracking

**Files:**
- Modify: `backend/src/api/v1/endpoints/linebot.py`

**Step 1: Add memberJoined tracking to existing handler**

In `_handle_member_joined()` (line ~707), extract joined user IDs and track them:

```python
async def _handle_member_joined(
    event: LineWebhookEvent,
    service: LineBindingService,
    settings: Settings,
) -> None:
    """新成員加入 → 追蹤群組成員 + 發送 LIFF 入口（群組層級 30 分鐘 CD）"""
    source = event.source
    line_group_id = source.get("groupId")
    reply_token = event.reply_token

    if not line_group_id:
        return

    # Track joined members
    if event.joined and "members" in event.joined:
        user_ids = [m["userId"] for m in event.joined["members"] if "userId" in m]
        if user_ids:
            await service.track_members_joined(line_group_id, user_ids)

    if not reply_token or not settings.liff_id:
        return

    # Existing welcome notification logic (unchanged)
    should_notify = await service.should_send_member_joined_notification(line_group_id)
    if not should_notify:
        return

    await service.record_liff_notification(line_group_id)

    liff_url = create_liff_url(settings.liff_id, line_group_id)
    await _send_liff_welcome(reply_token, liff_url)
```

**Step 2: Add memberLeft handler to dispatcher**

In `_handle_event()` (line ~636), add after the memberJoined block:

```python
# 成員離開群組
if event.type == "memberLeft" and source_type == "group":
    await _handle_member_left(event, service)
    return
```

Create the handler:

```python
async def _handle_member_left(
    event: LineWebhookEvent,
    service: LineBindingService,
) -> None:
    """成員離開群組 → 從追蹤表移除"""
    line_group_id = event.source.get("groupId")
    if not line_group_id:
        return

    if event.left and "members" in event.left:
        user_ids = [m["userId"] for m in event.left["members"] if "userId" in m]
        if user_ids:
            await service.track_members_left(line_group_id, user_ids)
```

**Step 3: Add passive tracking to group message handler**

In `_handle_group_message()` (line ~756), add passive tracking near the top, after extracting `line_user_id`:

```python
async def _handle_group_message(
    event: LineWebhookEvent,
    service: LineBindingService,
    battle_event_service: BattleEventService,
    settings: Settings,
) -> None:
    source = event.source
    message = event.message or {}
    text = message.get("text", "").strip()
    line_group_id = source.get("groupId")
    line_user_id = source.get("userId")
    reply_token = event.reply_token

    if not line_group_id or not line_user_id or not reply_token:
        return

    # Passive group membership tracking (fire-and-forget, don't block message handling)
    await service.track_group_presence(line_group_id, line_user_id)

    # ... rest of existing message handling unchanged ...
```

**Step 4: Verify lint passes**

Run: `cd backend && uv run ruff check src/api/v1/endpoints/linebot.py`

**Step 5: Commit**

```bash
git add backend/src/api/v1/endpoints/linebot.py
git commit -m "feat(line): track group membership from memberJoined/memberLeft/message webhooks"
```

---

## Task 6: Integration Verification

**Step 1: Run full test suite**

```bash
cd backend && uv run pytest tests/ -v --tb=short
```

Ensure all existing tests still pass plus the new ones.

**Step 2: Run lint**

```bash
cd backend && uv run ruff check .
```

**Step 3: Manual verification against production**

1. Deploy to Zeabur (or test locally)
2. Send a message in the S26 production group → should UPSERT into `line_group_members`
3. Check via Supabase SQL Editor:
   ```sql
   SELECT * FROM line_group_members ORDER BY tracked_at DESC LIMIT 10;
   ```
4. Open the admin panel → LINE 設定 → check registered members list
5. Verify only members who have sent a message (or joined after bot) appear

**Step 4: Final commit if any fixes needed**

```bash
git commit -m "fix(line): address integration test findings"
```

---

## Summary: What the User Sees

| Time | Registered Members List |
|------|------------------------|
| Day 0 (deploy) | Empty — no tracking data yet |
| Day 1+ | Members who sent messages in group start appearing |
| Ongoing | List grows as more members interact; leavers are removed |
| Steady state | All active members visible; inactive/left members hidden |

**Trade-off accepted:** No instant full list (would need blue shield API). Instead, organic population through normal group activity. Most active members will be visible within days.
