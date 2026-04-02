# Group-Scoped Member List Design

> 解決群組重新綁定後，後台已註冊成員列表顯示跨群組歷史資料的問題。

## Problem

`member_line_bindings` 只記錄 `alliance_id`，沒有記錄成員是透過哪個群組綁定註冊的。當群組解綁再重新綁定後，後台列表會顯示所有歷史成員，而非當前群組內的人。

## Solution: Add `group_binding_id` FK

在 `member_line_bindings` 加 `group_binding_id` 欄位（nullable FK → `line_group_bindings.id`），後台列表只顯示匹配當前 active binding 的成員。

### Database

```sql
ALTER TABLE member_line_bindings
ADD COLUMN group_binding_id UUID REFERENCES line_group_bindings(id) ON DELETE SET NULL;
```

- Nullable：既有資料不回填，NULL 代表歷史資料
- ON DELETE SET NULL：group binding 被刪時不連帶刪除 member binding

### Backend Changes

1. **Model** — `MemberLineBinding` 加 `group_binding_id: UUID | None = None`
2. **Repository** — `create_member_binding()` 加 `group_binding_id` 參數寫入
3. **Repository** — `get_all_member_bindings_by_alliance()` 加可選 `group_binding_id` 過濾
4. **Service** — `register_member()` 傳入 `group_binding.id`；同人同 game_id 重新註冊時 update `group_binding_id`
5. **Service** — `get_registered_members()` 查找 active binding(s)，用其 ID 過濾列表

### Frontend Changes

無。API response schema 不變。

### Edge Cases

| 場景 | 行為 |
|------|------|
| 舊成員在新群組重新註冊同一 game_id | Update 既有記錄的 group_binding_id，出現在新列表 |
| 同盟有 production + test 群組 | 各自 active binding 分別過濾，合併顯示 |
| 解綁後重綁相同群組 | 新 binding 新 ID，舊資料不顯示直到成員重新操作 |
| 解綁時 | 不動 member_line_bindings，自然不顯示（binding 已 inactive） |
