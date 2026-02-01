# Battle Event Edit UX Design

> 戰役事件編輯功能 UI/UX 設計文件

**作者**: Claude (Product Designer)
**日期**: 2026-01-29
**版本**: 1.0
**狀態**: Draft - 待審核

---

## 1. 背景與問題分析

### 1.1 現況痛點

目前戰役事件系統缺少編輯功能，造成以下問題：

| 問題 | 影響程度 | 發生頻率 |
|------|----------|----------|
| 建立後發現名稱打錯 | 🔴 High | 常見 |
| 選錯事件類型 (battle/siege/forbidden) | 🔴 High | 偶爾 |
| 想補充事件描述 | 🟡 Medium | 常見 |
| 時間範圍需要微調 | 🟢 Low | 少見 |

**現有解決方案**: 刪除 → 重新上傳 CSV → 重新建立 → 重新處理

**問題**: 耗時、易出錯、用戶體驗差

### 1.2 研究基礎

基於 2025-2026 SaaS UI/UX Best Practices 研究：

**關鍵發現**:

1. **Inline vs Modal 選擇** ([Medium - Modal UX Case Study](https://wowrakibul.medium.com/choosing-modals-over-inline-actions-a-ux-case-study-on-table-complexity-2552ee168b5c))
   - 簡單編輯 (1-2 欄位) → Inline editing
   - 多欄位編輯 → Modal/Dialog
   - 需要專注的任務 → 使用 Modal 保持 context isolation

2. **編輯觸發點位置** ([UX Design - Edit Button Guidelines](https://bootcamp.uxdesign.cc/ux-guidelines-for-placing-edit-button-9f35486ef050))
   - Edit 按鈕應放在 item header 區域
   - 與其他 actions (delete, view) 保持一致的視覺層級

3. **Destructive Action 確認** ([Eleken - Bulk Actions UX](https://www.eleken.co/blog-posts/bulk-actions-ux))
   - 高影響操作需要確認對話框
   - 提供 Undo 機制優於 confirmation dialog
   - 成功/錯誤要有明確 feedback (toast)

4. **Progressive Disclosure** ([Mouseflow - SaaS UX Best Practices](https://mouseflow.com/blog/saas-ux-design-best-practices/))
   - 不要一次顯示所有編輯選項
   - 讓用戶漸進式發現功能

---

## 2. 設計決策

### 2.1 編輯範圍定義

**Scope: 只編輯基本資訊（推薦方案）**

| 可編輯 | 不可編輯 | 原因 |
|--------|----------|------|
| ✅ 事件名稱 | ❌ CSV 快照 | 指標依賴原始數據 |
| ✅ 事件類型 | ❌ 成員指標 | 計算邏輯複雜 |
| ✅ 事件描述 | ❌ Season 歸屬 | 架構限制 |
| ⚠️ 時間範圍 (有限) | | 來自 CSV 時間戳 |

**設計原則**:
- 80/20 法則 — 80% 編輯需求是「改名稱」或「改類型」
- 重新處理 → 刪除重建（已支援，無需重複）
- 指標調整 → 不支援（維護數據完整性）

### 2.2 交互模式選擇

**選擇: Sheet (Side Panel) over Modal**

| 模式 | 優點 | 缺點 |
|------|------|------|
| Inline Editing | 快速、無 context switch | 空間有限、複雜表單難實現 |
| Modal Dialog | 專注、隔離 | 完全阻斷背景操作 |
| **Sheet (推薦)** | 保留 context、空間充足 | 需要額外開發 |

**理由**:
1. 用戶編輯時可能需要參考卡片上的現有資訊
2. 與專案現有的 EventDetail 頁面使用 Sheet 模式一致
3. 符合 [UX Movement - Inline Modal Windows](https://uxmovement.com/navigation/inline-modal-windows-more-content-without-losing-context/) 建議

### 2.3 編輯入口設計

**入口位置**: EventCard actions 區域（與現有的 "查看詳情" 按鈕並列）

```
┌─────────────────────────────────────────────────────────────┐
│ 🎯 徐州爭奪戰                    [戰役事件]                 │
│ 2026/01/15 10:00 - 2026/01/15 18:00 · 8小時 · 參與率 92%    │
│                                          [✏️] [>]          │
└─────────────────────────────────────────────────────────────┘
                                            ↑編輯  ↑詳情
```

**交互流程**:
1. 點擊編輯圖示 → 開啟 Sheet
2. 顯示可編輯欄位 → 用戶修改
3. 點擊儲存 → 顯示 loading state
4. 成功 → Toast 通知 + 關閉 Sheet + 列表更新
5. 失敗 → 顯示錯誤訊息 + 保持 Sheet 開啟

---

## 3. UI 設計規格

### 3.1 EventCard 編輯按鈕

**位置**: `CollapsibleCard` 的 `actions` slot

**設計**:
```tsx
// 在現有的 ChevronRight 按鈕前新增
<Button
  variant="ghost"
  size="sm"
  className="h-8 w-8 p-0"
  onClick={(e) => {
    e.stopPropagation()
    onEdit(event)
  }}
>
  <Pencil className="h-4 w-4" />
  <span className="sr-only">編輯事件</span>
</Button>
```

**權限控制**:
- 只有 `owner` 和 `collaborator` 可見編輯按鈕
- 使用現有的 `RoleGuard` 組件

### 3.2 Edit Sheet 設計

**寬度**: `sm:max-w-md` (適合表單)

**結構**:
```
┌──────────────────────────────────────┐
│ ✕                                    │
│                                      │
│ 編輯事件                              │
│ 修改事件的基本資訊                     │
│                                      │
│ ─────────────────────────────────── │
│                                      │
│ 事件名稱 *                            │
│ ┌────────────────────────────────┐   │
│ │ 徐州爭奪戰                      │   │
│ └────────────────────────────────┘   │
│                                      │
│ 事件類型 *                            │
│ ┌────────────────────────────────┐   │
│ │ 戰役事件 - 以戰功判定出席    ▼  │   │
│ └────────────────────────────────┘   │
│ ⚠️ 更改類型會影響參與判定和 MVP 計算  │
│                                      │
│ 事件描述                              │
│ ┌────────────────────────────────┐   │
│ │                                │   │
│ │                                │   │
│ └────────────────────────────────┘   │
│ 可選，最多 500 字                     │
│                                      │
│ ─────────────────────────────────── │
│                                      │
│ 時間資訊 (僅供參考)                   │
│ 開始: 2026/01/15 10:00               │
│ 結束: 2026/01/15 18:00               │
│ 來源: CSV 檔案時間戳                  │
│                                      │
│ ─────────────────────────────────── │
│                                      │
│             [取消]  [儲存變更]        │
│                                      │
└──────────────────────────────────────┘
```

### 3.3 事件類型變更警告

當用戶變更 `event_type` 時，顯示警告：

```tsx
{eventTypeChanged && (
  <Alert variant="warning">
    <AlertTriangle className="h-4 w-4" />
    <AlertDescription>
      更改事件類型會影響：
      • 參與判定邏輯（戰功/貢獻/勢力值）
      • MVP 計算方式
      • LINE Bot 報告格式

      已計算的指標數據不會重新計算。
    </AlertDescription>
  </Alert>
)}
```

### 3.4 儲存確認 Toast

```tsx
// 成功
toast({
  title: "事件已更新",
  description: `「${eventName}」的資訊已儲存`,
})

// 失敗
toast({
  title: "更新失敗",
  description: error.message,
  variant: "destructive",
})
```

---

## 4. 資料流設計

### 4.1 API 端點

**新增端點**: `PATCH /api/v1/events/{event_id}`

**Request**:
```typescript
interface UpdateEventRequest {
  name?: string
  event_type?: 'battle' | 'siege' | 'forbidden'
  description?: string | null
}
```

**Response**: `200 OK` with updated `BattleEvent`

**錯誤處理**:
- `400` - 驗證失敗 (name 空白等)
- `403` - 無權限
- `404` - 事件不存在

### 4.2 Frontend Hook

```typescript
// hooks/use-events.ts

export function useUpdateEvent(seasonId: string | undefined) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ eventId, data }: {
      eventId: string
      data: UpdateEventRequest
    }) => apiClient.updateEvent(eventId, data),

    onSuccess: () => {
      // 更新列表 cache
      queryClient.invalidateQueries({
        queryKey: eventKeys.list(seasonId)
      })
    },

    onSettled: () => {
      // 確保 cache 一致性 (CLAUDE.md 規範)
    }
  })
}
```

### 4.3 State 管理

```typescript
// EventEditSheet 內部 state
interface EditFormState {
  name: string
  eventType: EventCategory
  description: string
  isDirty: boolean  // 追蹤是否有變更
}
```

**Dirty State 判定**:
```typescript
const isDirty =
  formState.name !== originalEvent.name ||
  formState.eventType !== originalEvent.event_type ||
  formState.description !== (originalEvent.description ?? '')
```

---

## 5. 實作規格

### 5.1 檔案變更清單

| 檔案 | 變更類型 | 說明 |
|------|----------|------|
| `frontend/src/components/events/EventEditSheet.tsx` | 新增 | 編輯 Sheet 組件 |
| `frontend/src/components/events/EventCard.tsx` | 修改 | 新增編輯按鈕 |
| `frontend/src/pages/EventAnalytics.tsx` | 修改 | 整合 Sheet 狀態 |
| `frontend/src/hooks/use-events.ts` | 修改 | 新增 useUpdateEvent |
| `frontend/src/lib/api/event-api.ts` | 修改 | 新增 updateEvent |
| `frontend/src/types/event.ts` | 修改 | 新增 UpdateEventRequest |
| `backend/src/api/v1/endpoints/events.py` | 修改 | 新增 PATCH 端點 |
| `backend/src/services/battle_event_service.py` | 修改 | 新增 update_event |
| `backend/src/repositories/battle_event_repository.py` | 修改 | 新增 update |

### 5.2 組件結構

```
EventAnalytics (頁面)
├── EventCardWithData
│   └── EventCard
│       ├── CollapsibleCard
│       │   └── actions: [EditButton] [ViewButton]
│       └── ExpandedContent
└── EventEditSheet (新增)
    ├── SheetHeader
    ├── Form
    │   ├── Input (name)
    │   ├── Select (event_type)
    │   ├── Textarea (description)
    │   └── EventTypeWarning (conditional)
    └── SheetFooter
        └── [Cancel] [Save]
```

### 5.3 Accessibility 規格

- Sheet 開啟時 focus 移到第一個 input
- ESC 關閉 Sheet (Radix 內建)
- Tab navigation 正常運作
- 編輯按鈕有 `aria-label="編輯事件"`
- 表單欄位有正確的 label association

### 5.4 動畫規格

- Sheet 滑入: `slide-in-from-right` 500ms ease-out
- Sheet 滑出: `slide-out-to-right` 300ms ease-in
- 儲存按鈕 loading: `animate-spin` on icon
- Toast 進入: `slide-in-from-top` + `fade-in`

---

## 6. Edge Cases 處理

### 6.1 並發編輯

**情境**: 用戶 A 編輯中，用戶 B 已修改同一事件

**處理**: 樂觀更新 + 錯誤回滾
- 儲存時 API 返回 409 Conflict
- 顯示錯誤訊息：「事件已被其他人更新，請重新載入」
- 提供「重新載入」按鈕

### 6.2 網路錯誤

**情境**: 儲存時網路斷線

**處理**:
- 顯示錯誤 toast
- 保持 Sheet 開啟，保留用戶輸入
- 用戶可重試儲存

### 6.3 表單驗證

| 欄位 | 驗證規則 | 錯誤訊息 |
|------|----------|----------|
| name | 必填, 1-100 字元 | 「事件名稱不可為空」|
| event_type | 必填 | (Select 不可能為空) |
| description | 可選, 最多 500 字元 | 「描述最多 500 字」|

### 6.4 未儲存變更離開

**情境**: 用戶有未儲存變更，點擊關閉或點擊外部

**處理**:
- 偵測 `isDirty` 狀態
- 顯示確認對話框：「有未儲存的變更，確定要離開嗎？」
- 選項：「繼續編輯」/「放棄變更」

---

## 7. 測試規格

### 7.1 Unit Tests (Frontend)

```typescript
describe('EventEditSheet', () => {
  it('renders with event data populated')
  it('enables save button only when dirty')
  it('shows warning when event type changes')
  it('calls onSave with updated data')
  it('shows loading state during save')
  it('shows error toast on save failure')
})

describe('useUpdateEvent', () => {
  it('calls API with correct payload')
  it('invalidates event list on success')
  it('handles 403 error correctly')
  it('handles 404 error correctly')
})
```

### 7.2 Integration Tests (Backend)

```python
def test_update_event_success():
    """Test successful event update"""

def test_update_event_unauthorized():
    """Test 403 when user is not owner/collaborator"""

def test_update_event_not_found():
    """Test 404 when event doesn't exist"""

def test_update_event_validation():
    """Test 400 when name is empty"""
```

### 7.3 E2E Test Scenario

1. 登入 → 進入事件分析頁
2. 點擊事件的編輯按鈕
3. 修改名稱
4. 點擊儲存
5. 驗證 Toast 出現
6. 驗證列表更新

---

## 8. 實作順序

**建議順序** (依賴關係):

1. **Backend API** (無前端依賴)
   - `PATCH /events/{id}` 端點
   - Service 層 `update_event` 方法
   - Repository 層 `update` 方法

2. **Frontend API Client**
   - `updateEvent` function
   - `useUpdateEvent` hook
   - `UpdateEventRequest` type

3. **UI Components**
   - `EventEditSheet` 組件
   - `EventCard` 編輯按鈕
   - `EventAnalytics` 狀態整合

4. **Polish**
   - Dirty state 確認對話框
   - Event type 變更警告
   - Loading/error states

---

## 9. 設計審查清單

### UI Pro Max Pre-Delivery Checklist

- [ ] 無 emoji 作為圖示 (使用 Lucide icons)
- [ ] 所有可點擊元素有 `cursor-pointer`
- [ ] Hover states 不造成 layout shift
- [ ] Light/Dark mode 對比度正確
- [ ] Form inputs 有正確 labels
- [ ] Transitions 150-300ms
- [ ] Focus states 可見
- [ ] 響應式設計 (320px, 768px, 1024px)

### CLAUDE.md Compliance

- [ ] TanStack Query mutations 包含 `onSettled`
- [ ] 明確的 TypeScript interfaces
- [ ] 無 `any` 類型
- [ ] Query key factory pattern
- [ ] 4-Layer Architecture (API → Service → Repository)
- [ ] Pydantic V2 語法
- [ ] `from e` exception chaining

---

## 10. 參考資料

- [PatternFly - Inline Edit Design Guidelines](https://www.patternfly.org/components/inline-edit/design-guidelines/)
- [Modal vs Inline: UX Case Study](https://wowrakibul.medium.com/choosing-modals-over-inline-actions-a-ux-case-study-on-table-complexity-2552ee168b5c)
- [LogRocket - Modal UX Best Practices](https://blog.logrocket.com/ux-design/modal-ux-best-practices/)
- [Eleken - Bulk Actions UX Guidelines](https://www.eleken.co/blog-posts/bulk-actions-ux)
- [SaaS UI Design Patterns](https://www.saasui.design/)
- [Mouseflow - SaaS UX Best Practices 2025](https://mouseflow.com/blog/saas-ux-design-best-practices/)

---

**下一步**: 審核通過後，使用 `superpowers:writing-plans` 建立詳細實作計畫
