---
name: recur-help
description: List all available Recur skills and how to use them. Use when user asks "what can Recur do", "Recur skills", "Recur 有什麼功能", "help with Recur", "如何使用 Recur skills".
license: Elastic-2.0
metadata:
  author: recur
  version: "0.1.0"
  stack: "FastAPI + React"
---

# Recur Skills 使用指南

當用戶詢問 Recur skills 的功能時，向他們介紹以下可用的 skills：

## 可用的 Skills

### 1. recur-quickstart
**用途**：快速開始 Recur 整合（安裝 SDK、設定 API Keys、RecurProvider）
**觸發方式**：
- 說：「幫我整合 Recur」「setup Recur」「Recur 串接」「金流設定」
- 或輸入：`/recur-quickstart`

### 2. recur-checkout
**用途**：實作結帳流程（modal、embedded、redirect 三種模式 + payment failure handling）
**觸發方式**：
- 說：「加上結帳按鈕」「checkout」「付款按鈕」「embedded checkout」
- 或輸入：`/recur-checkout`

### 3. recur-webhooks
**用途**：設定 FastAPI webhook handler 接收付款通知（含簽名驗證、冪等處理）
**觸發方式**：
- 說：「設定 webhook」「付款通知」「訂閱事件」
- 或輸入：`/recur-webhooks`

### 4. recur-entitlements
**用途**：實作付費功能權限檢查和 Paywall（前端 useCustomer + 後端 API 驗證）
**觸發方式**：
- 說：「檢查付費權限」「paywall」「權限檢查」「entitlements」
- 或輸入：`/recur-entitlements`

### 5. recur-portal
**用途**：實作客戶自助入口（管理訂閱、更新付款方式、查看帳單）
**觸發方式**：
- 說：「加上帳戶管理」「customer portal」「訂閱管理」「更新付款方式」
- 或輸入：`/recur-portal`

## 回覆格式

用繁體中文回覆，格式如下：

```
## Recur Skills 使用指南

我可以幫你完成以下 Recur 整合任務：

| Skill | 用途 | 怎麼觸發 |
|-------|------|---------|
| **quickstart** | 快速開始整合 | 說「幫我整合 Recur」 |
| **checkout** | 結帳流程（modal/embedded/redirect） | 說「加上結帳按鈕」 |
| **webhooks** | FastAPI 付款通知 handler | 說「設定 webhook」 |
| **entitlements** | 權限檢查（前端 + 後端） | 說「檢查付費權限」 |
| **portal** | 客戶自助入口 | 說「加上帳戶管理」 |

所有 skills 都針對本專案的 **FastAPI + React** 技術棧撰寫。

建議從 **quickstart** 開始，它會引導你完成 SDK 安裝和基本設定。

有什麼想做的嗎？
```
