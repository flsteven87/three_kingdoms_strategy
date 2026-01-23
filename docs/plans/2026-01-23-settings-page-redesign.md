# Settings 頁面重構設計

> 整合賽季購買功能到設定頁面的完整設計文檔

## Overview

將「賽季購買」功能整合到 Settings 頁面，同時優化現有 Tab 結構，保持不超過 3 個 Tab。

## Design Decisions

### 1. 放置位置
- **決策**：Settings 內新增分頁，而非獨立頁面
- **理由**：
  - 購買是低頻操作，藏在設定是 SaaS 慣例
  - 獨立頁面增加導航複雜度
  - 用戶心智模型：「管理帳單/配額」→ 設定

### 2. Tab 整合策略
- **決策**：將「同盟設定」+「權限管理」合併為「同盟管理」
- **理由**：
  - 兩者都是「管理這個同盟」的操作
  - 權限說明表格改為 Tooltip，減少頁面長度
  - 騰出空間給「賽季額度」分頁

### 3. 購買流程
- **決策**：主動購買（設定內）+ 阻擋購買（Modal）雙軌制
- **理由**：符合 SaaS best practice，同時支援預防型和阻擋型場景

### 4. 購買權限
- **決策**：Owner + Collaborator 皆可購買
- **理由**：允許副盟主代購，提高便利性

## New Tab Structure

```
Settings
├── 同盟管理 (整合後)
│   ├── 同盟資訊卡片（名稱、伺服器、建立時間）
│   ├── 同盟設定表單（AllianceForm）
│   └── 協作者管理（AllianceCollaboratorManager）
│       └── 角色說明改為 Tooltip（移除大表格）
│
├── 賽季額度 (新增，Owner/Collaborator 可見)
│   ├── 額度狀態卡片
│   ├── 購買按鈕 → 購買 Modal
│   └── 使用紀錄列表
│
└── 帳戶設定 (保留，未來擴充)
    └── 個人資料（即將推出）
```

## UI Components

### 1. 賽季額度分頁

#### 額度狀態卡片

```
┌─────────────────────────────────────────────┐
│  賽季額度                                    │
│  ─────────────────────────────────────────  │
│                                             │
│  [試用中] 剩餘 12 天    或    [已啟用]      │
│                                             │
│  可用額度    已使用    已購買               │
│     3          2         5                  │
│                                             │
│            [ 購買額度 ]                      │
└─────────────────────────────────────────────┘
```

#### 使用紀錄列表

| 日期 | 事件 | 變動 |
|------|------|------|
| 2026-01-20 | 啟用「S3 賽季」 | -1 |
| 2026-01-15 | 購買 5 季 | +5 |
| 2026-01-01 | 開始試用 | — |

### 2. 購買 Modal（主動購買）

```
┌─────────────────────────────────────────────┐
│  購買賽季額度                          [X]  │
│  ─────────────────────────────────────────  │
│                                             │
│  目前可用：2 季                             │
│                                             │
│  購買數量                                   │
│  [ - ]     3     [ + ]                      │
│                                             │
│  ─────────────────────────────────────────  │
│  單價      NT$ 999 / 季                     │
│  小計      NT$ 2,997                        │
│  ─────────────────────────────────────────  │
│                                             │
│         [ 取消 ]    [ 前往付款 ]            │
└─────────────────────────────────────────────┘
```

**設計原則**（基於 SaaS Best Practices）：
- 簡單透明：用 +/- 調整數量，避免過多選項
- 即時反饋：顯示目前餘額和即時計算小計
- 單價獨立顯示：增加透明度

### 3. 阻擋 Modal（額度不足時）

觸發時機：用戶嘗試「啟用賽季」但額度為 0

```
┌─────────────────────────────────────────────┐
│  無法啟用賽季                          [X]  │
│  ─────────────────────────────────────────  │
│                                             │
│  ⚠️  你的賽季額度已用完                      │
│                                             │
│  試用期已於 2026/01/15 結束                 │
│  可用額度：0 季                             │
│                                             │
│  購買額度後即可啟用此賽季                   │
│                                             │
│  ─────────────────────────────────────────  │
│                                             │
│      [ 稍後再說 ]    [ 購買額度 ]           │
└─────────────────────────────────────────────┘
```

### 4. 漸進式提醒 Banner

| 狀態 | 提醒方式 | 阻擋？ |
|------|----------|--------|
| 剩餘 ≥ 2 季 | 無提醒 | ❌ |
| 剩餘 1 季 | Banner 提示 | ❌ |
| 剩餘 0 季 | 啟用時彈出 Modal | ✅ |

Banner 樣式（剩餘 1 季時，顯示在頁面頂部）：

```
┌─────────────────────────────────────────────────────────────┐
│ ⚠️ 賽季額度剩餘 1 季，建議提前購買以免中斷使用  [ 購買 ] [X] │
└─────────────────────────────────────────────────────────────┘
```

## Pricing

| 項目 | 價格 |
|------|------|
| 單季 | NT$ 999 |

## Implementation Plan

### Phase 1: Settings 頁面重構
1. 整合「同盟設定」+「權限管理」為「同盟管理」
2. 權限說明表格改為 Tooltip 或 Collapsible
3. 新增「賽季額度」Tab（僅 Owner/Collaborator 可見）

### Phase 2: 賽季額度分頁
1. 建立 `SeasonQuotaTab` 組件
2. 建立額度狀態卡片（讀取 alliance 的 quota 資料）
3. 建立使用紀錄列表（需要新增 API？）

### Phase 3: 購買 Modal
1. 建立 `PurchaseQuotaModal` 組件
2. 整合金流（Recur/綠界）跳轉

### Phase 4: 阻擋流程
1. 建立 `QuotaExhaustedModal` 組件
2. 在 `activateSeason` 流程中加入阻擋檢查
3. 建立低額度 Banner 組件

## Files to Create/Modify

### New Files
- `frontend/src/components/settings/SeasonQuotaTab.tsx`
- `frontend/src/components/settings/PurchaseQuotaModal.tsx`
- `frontend/src/components/settings/QuotaExhaustedModal.tsx`
- `frontend/src/components/settings/LowQuotaBanner.tsx`

### Modified Files
- `frontend/src/pages/Settings.tsx` - Tab 結構重構
- `frontend/src/components/alliance/AllianceCollaboratorManager.tsx` - 權限說明改為 Tooltip

## References

- [Growth Unhinged - 2025 State of SaaS Pricing](https://www.growthunhinged.com/p/2025-state-of-saas-pricing-changes)
- [m3ter - Guide to Credit Pricing](https://www.m3ter.com/guides/saas-credit-pricing)
- [Userpilot - Modal UX Design](https://userpilot.com/blog/modal-ux-design/)

## Changelog

| 日期 | 版本 | 說明 |
|------|------|------|
| 2026-01-23 | v1.0 | 初始設計文檔 |
