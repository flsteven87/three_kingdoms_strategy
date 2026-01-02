# Three Kingdoms Strategy Manager

> 三國志戰略版盟友表現管理系統 - Alliance Member Performance Tracking System

[![Python](https://img.shields.io/badge/Python-3.13+-blue.svg)](https://www.python.org/downloads/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.118+-green.svg)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React-19.2-blue.svg)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue.svg)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## 🎯 專案概覽

**Three Kingdoms Strategy Manager** 是一個專為《三國志戰略版》遊戲設計的盟友表現管理工具，幫助盟主/官員追蹤與分析同盟成員的表現數據。

### 核心價值

- 📊 **自動化數據管理** - 透過 CSV 上傳自動處理成員表現數據
- 🎮 **多賽季追蹤** - 支援跨賽季數據比較與趨勢分析
- 📈 **即時數據分析** - 自動計算貢獻、戰功、助攻、捐獻等指標
- 🔒 **安全性保證** - 基於 Supabase RLS 的資料隔離機制
- 🌐 **現代化架構** - FastAPI + React 全棧解決方案

### 當前狀態

- **版本**: v0.3.0
- **完成度**: 90%
- **階段**: Phase 4 - 數據分析功能完成

---

## ✨ 核心功能

### 已完成 ✅

- **使用者認證** - Google OAuth + JWT 驗證
- **同盟管理** - CRUD + 協作者系統（Owner/Collaborator/Member 角色）+ 邀請機制
- **賽季管理** - 賽季 CRUD + 活躍切換
- **CSV 數據上傳** - Drag & Drop 介面 + 智能日期驗證 + 自動解析
- **霸業積分權重** - 權重設定 + 積分預覽計算
- **成員管理** - 自動 Upsert + 生命週期追蹤
- **Period 系統** - 自動期間劃分 + 指標計算
- **戰役事件管理** - 戰役 CRUD + 成員指標追蹤 + 分佈統計
- **成員表現分析** - 個人趨勢圖、雷達圖、排名歷史、同盟對比
- **組別分析** - 組別對比、成員排行、Box Plot、趨勢圖
- **戰役分析** - 事件時間軸、成員表現、指標分佈、統計摘要

### 優化中 🔧

- Overview Dashboard 數據整合
- 進階圖表互動功能（點擊跳轉、篩選器）

---

## 🛠️ 技術棧

| 類別 | 技術 | 版本 |
|------|------|------|
| **Backend** | Python + FastAPI | 3.13+ / 0.118.0 |
| | Supabase (PostgreSQL) | 2.21.1 |
| | UV Package Manager | latest |
| **Frontend** | React + TypeScript | 19.2.0 / 5.8.3 |
| | TanStack Query | 5.83.0 |
| | Tailwind CSS + shadcn/ui | 4.1.11 |
| **Database** | PostgreSQL + RLS | 17 (Supabase) |

---

## 🚀 快速開始

### 前置需求

- Python 3.13+ ([下載](https://www.python.org/downloads/))
- UV Package Manager ([安裝](https://docs.astral.sh/uv/))
- Node.js 18+ ([下載](https://nodejs.org/))
- Supabase 帳號 ([註冊](https://supabase.com/dashboard))

### 1️⃣ Clone 專案

```bash
git clone <repository-url>
cd three_kingdoms_strategy
```

### 2️⃣ Backend 設定

```bash
cd backend

# 安裝依賴
uv sync

# 設定環境變數
cp .env.example .env
# 編輯 .env 填入 Supabase credentials

# 啟動 Backend (Port 8087)
uv run python src/main.py
```

### 3️⃣ Frontend 設定

```bash
cd frontend

# 安裝依賴
npm install

# 設定環境變數
cp .env.example .env
# 編輯 .env 填入 Supabase URL + Anon Key

# 啟動 Frontend (Port 5187)
npm run dev
```

### 4️⃣ Google OAuth 設定

1. 前往 [Google Cloud Console](https://console.cloud.google.com/)
2. 建立 OAuth 2.0 Client ID
3. Authorized redirect URIs: `https://xxx.supabase.co/auth/v1/callback`
4. 在 Supabase Dashboard → Authentication → Providers 啟用 Google

### 5️⃣ 驗證安裝

```bash
# Backend Health Check
curl http://localhost:8087/health

# 預期回應: {"status": "healthy", "environment": "development", "version": "0.1.0"}
```

開啟瀏覽器: http://localhost:5187/landing

---

## ⚙️ 環境變數

### Backend (.env)

```bash
# Supabase (從 Dashboard 取得)
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_KEY=your_service_key
SUPABASE_JWT_SECRET=your_jwt_secret

# Backend
BACKEND_URL=http://localhost:8087
FRONTEND_URL=http://localhost:5187
CORS_ORIGINS=http://localhost:5187

# Security (使用 openssl rand -hex 32 生成)
SECRET_KEY=your_secret_key_here

# Environment
ENVIRONMENT=development
DEBUG=true
LOG_LEVEL=INFO
```

### Frontend (.env)

```bash
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key
```

---

## 📡 核心 API

**Base URL**: `http://localhost:8087/api/v1`

**認證**: `Authorization: Bearer <access_token>`

### 主要 Endpoints

| 模組 | Method | Endpoint | 功能 |
|------|--------|----------|------|
| **Alliance** | GET | `/alliances` | 取得同盟 |
| | POST | `/alliances` | 建立同盟 |
| | GET | `/alliances/{id}/collaborators` | 取得協作者 |
| | POST | `/alliances/{id}/collaborators` | 邀請協作者 |
| **Season** | GET | `/seasons` | 列出賽季 |
| | POST | `/seasons` | 建立賽季 |
| | PATCH | `/seasons/{id}/activate` | 設為活躍賽季 |
| **CSV Upload** | POST | `/uploads` | 上傳 CSV |
| | GET | `/uploads?season_id={id}` | 列出上傳記錄 |
| **Hegemony** | GET | `/hegemony-weights?season_id={id}` | 取得權重設定 |
| | POST | `/hegemony-weights/initialize` | 初始化權重 |
| **Events** | GET | `/events?season_id={id}` | 列出戰役事件 |
| | POST | `/events` | 建立戰役事件 |
| | GET | `/events/{id}/analytics` | 戰役分析數據 |
| **Periods** | GET | `/periods?season_id={id}` | 列出期間 |
| **Analytics** | GET | `/analytics/members/{id}/trends` | 成員趨勢分析 |
| | GET | `/analytics/groups` | 組別對比分析 |
| | GET | `/analytics/alliance/summary` | 同盟摘要統計 |

**API 文件**: 啟動 Backend 後訪問 http://localhost:8087/docs (Swagger UI)

---

## 🗄️ 資料庫架構

### 核心表格 (12+ tables)

```
auth.users (Supabase Auth)
    ↓ (1:1)
alliances (同盟)
    ├─→ alliance_collaborators (協作者)
    ├─→ pending_invitations (待處理邀請)
    └─→ seasons (賽季) ←─────────────────────┐
            ├─→ csv_uploads (CSV 上傳記錄)    │
            ├─→ hegemony_weights (霸業權重)   │
            ├─→ battle_events (戰役事件)      │
            │       └─→ battle_event_metrics (戰役成員指標)
            ├─→ periods (期間)                │
            │       └─→ member_period_metrics (成員期間指標)
            ├─→ member_snapshots (成員快照)   │
            │       └─→ members (成員資料) ───┘
            └──────────────────────────────────┘
```

### 表格說明

| 表格 | 用途 | 關鍵欄位 |
|------|------|----------|
| `alliances` | 同盟基本資訊 | name, owner_id |
| `alliance_collaborators` | 協作者關聯 | alliance_id, user_id, role |
| `pending_invitations` | 待處理邀請 | alliance_id, email, status |
| `seasons` | 賽季管理 | alliance_id, name, is_active |
| `members` | 成員基本資料 | name, alliance_id, first_seen_season |
| `csv_uploads` | 上傳記錄 | season_id, filename, upload_date |
| `member_snapshots` | 成員數據快照 | member_id, upload_id, 各項指標 |
| `hegemony_weights` | 霸業積分權重 | season_id, event_type, weight |
| `periods` | 期間劃分 | season_id, start_date, end_date |
| `member_period_metrics` | 期間指標 | member_id, period_id, 計算後指標 |
| `battle_events` | 戰役事件 | season_id, name, event_date |
| `battle_event_metrics` | 戰役成員指標 | event_id, member_id, 表現指標 |

### CSV 檔案格式

**檔名格式**: `同盟統計YYYY年MM月DD日HH时MM分SS秒.csv`

**範例**: `同盟統計2025年10月09日10时13分09秒.csv`

**CSV 欄位** (13 欄):
```csv
成員, 貢獻排行, 貢獻本週, 戰功本週, 助攻本週, 捐獻本週, 貢獻總量, 戰功總量, 助攻總量, 捐獻總量, 勢力值, 所屬州, 分組
```

---

## 📏 開發規範

### 🔴 CRITICAL 規範（零容忍）

1. **Repository Pattern** - 所有 Repository 必須繼承 `SupabaseRepository[T]`，使用 `_handle_supabase_result()`
2. **4-Layer Architecture** - API → Service → Repository → Database，禁止跨層呼叫
3. **Cloud Deployment** - FastAPI: `redirect_slashes=False`，Root routes: `@router.get("")`
4. **RLS 效能優化** - 使用 `(SELECT auth.uid())` subquery（30-70% 效能提升）

### 🟡 IMPORTANT 規範

1. **UV 工具鏈** - `uv run python script.py` / `uv add <package>` / `uv sync`
2. **Ruff 檢查** - 提交前必須執行 `uv run ruff check .`，零容忍 F821, E722, F841, B904
3. **命名規範** - 所有 API 欄位使用 `snake_case`（Backend + Frontend）
4. **Frontend** - 100% ES imports，JSX 語法，明確 TypeScript interfaces，TanStack Query

### 🟢 RECOMMENDED 規範

- Backend 單一檔案 <1000 行，Frontend 組件 <500 行
- 100% type hints (Python) + TypeScript interfaces
- Google-style docstrings

**完整開發規範**: [CLAUDE.md](CLAUDE.md)

---

## 📊 專案現況

### 完成度評估

| 類別 | 完成度 | 狀態 | 備註 |
|------|--------|------|------|
| Backend 基礎設施 | 100% | ✅ | 4-Layer Architecture 完整 |
| 認證與安全 | 100% | ✅ | Google OAuth + RLS 完整 |
| 核心功能 API | 100% | ✅ | 9 個 endpoint modules |
| Analytics API | 95% | ✅ | 成員/組別/同盟/戰役分析 |
| Events API | 100% | ✅ | 戰役 CRUD + 分析完整 |
| Frontend 基礎設施 | 100% | ✅ | React 19 + TanStack Query |
| 功能 UI | 95% | ✅ | 10/10 頁面完成 |
| 數據分析圖表 | 90% | ✅ | Recharts 整合完整 |
| **整體專案** | **92%** | 🚀 | Phase 4 完成 |

### 下一步優先級

1. **Overview Dashboard 整合** - 統計卡片 + 快速入口（4-6 小時）
2. **進階互動功能** - 圖表點擊跳轉、跨頁面篩選器同步
3. **效能優化** - 大數據量分頁、圖表採樣

---

## 🏗️ 專案架構

### 目錄結構

```
three_kingdoms_strategy/
├── backend/                    # Python FastAPI Backend
│   ├── src/
│   │   ├── api/v1/endpoints/  # API 路由層
│   │   ├── services/          # 業務邏輯層
│   │   ├── repositories/      # 資料存取層
│   │   ├── models/            # Pydantic 模型
│   │   ├── core/              # 核心配置 (auth, database, dependencies)
│   │   └── main.py            # FastAPI 應用入口
│   ├── pyproject.toml         # UV 依賴管理
│   └── uv.lock
│
├── frontend/                   # React TypeScript Frontend
│   ├── src/
│   │   ├── components/        # UI 組件 (9 dirs: ui/, layout/, alliance/, analytics/, events/, hegemony-weights/, overview/, seasons/, uploads/)
│   │   ├── pages/             # 路由頁面 (10 pages: Landing, AuthCallback, AllianceAnalytics, Seasons, DataManagement, HegemonyWeights, MemberPerformance, GroupAnalytics, EventAnalytics, Settings)
│   │   ├── hooks/             # Custom Hooks (11 hooks: alliance, analytics, auth, csv-uploads, events, hegemony-weights, periods, seasons, theme, user-role, alliance-collaborators)
│   │   ├── lib/               # api-client, supabase
│   │   ├── contexts/          # AuthContext, ThemeContext
│   │   └── types/             # TypeScript 類型定義
│   ├── package.json
│   └── vite.config.ts
│
├── data/                       # CSV 範例資料
├── CLAUDE.md                   # 開發規範
└── README.md                   # 本文件
```

### 4-Layer Architecture

```
API Layer (FastAPI)        ← HTTP 請求處理、驗證、認證
    ↓
Service Layer              ← 業務邏輯編排、多步驟操作
    ↓
Repository Layer           ← 資料庫查詢、資料轉換
    ↓
Database (Supabase)        ← 資料持久化、RLS 安全
```

**關鍵原則**: API Layer 完全委託給 Service，Service 無直接資料庫呼叫，Repository 強制錯誤處理

---

## ❓ 常見問題

### Q1: 為什麼使用 `uv run python` 而不是 `python`？

**A**: UV 自動管理虛擬環境，確保依賴隔離（符合 CLAUDE.md 🟡）

### Q2: CSV 上傳後如何處理？

**A**: 流程：解析 CSV → Upsert Members → Batch Create Snapshots → Update Member Activity

### Q3: 登入後出現 "redirect_uri_mismatch" 錯誤

**A**: 檢查 Google Cloud Console 的 Authorized redirect URIs，確保包含 `https://你的supabase專案.supabase.co/auth/v1/callback`

### Q4: CORS 錯誤

**A**: 確認 `backend/.env` 的 `CORS_ORIGINS` 包含 frontend URL，重啟 backend 伺服器

### Q5: 如何新增 Database Table？

**A**: 使用 Supabase MCP 執行 SQL，**不要**建立 migration files（符合 CLAUDE.md 🔴）

---

## 🔒 安全性建議

### 開發環境

- ✅ 使用 `.env` 檔案（已加入 `.gitignore`）
- ✅ 絕不將 `.env` 檔案 commit 到 Git
- ✅ 定期更換 `SECRET_KEY`

### 生產環境

1. 使用環境變數管理工具（AWS Secrets Manager, Vercel Environment Variables）
2. 啟用 HTTPS（必須！）
3. 更新 Google OAuth redirect URIs 為生產網域
4. 設定 `ENVIRONMENT=production` + `DEBUG=false`
5. 使用 Supabase RLS 保護資料

---

## 🤝 貢獻指南

1. Fork 本專案
2. 建立 feature branch (`git checkout -b feature/amazing-feature`)
3. **MUST**: 執行 `uv run ruff check .` 確保程式碼品質
4. Commit 變更 (`git commit -m 'Add amazing feature'`)
5. Push 到 branch (`git push origin feature/amazing-feature`)
6. 開啟 Pull Request

---

## 📚 相關資源

- [FastAPI 文件](https://fastapi.tiangolo.com/)
- [Supabase 文件](https://supabase.com/docs)
- [React 文件](https://react.dev/)
- [TanStack Query 文件](https://tanstack.com/query/latest)
- [shadcn/ui 文件](https://ui.shadcn.com/)
- [UV Package Manager](https://docs.astral.sh/uv/)

---

## 🎉 版本更新記錄

### v0.3.0 (2024-12-22) - Phase 4 Analytics Complete

**新增功能**:
- ✅ Period 系統 - 自動期間劃分與指標計算
- ✅ 成員表現分析頁面 - 趨勢圖、雷達圖、排名歷史
- ✅ 組別分析頁面 - 組別對比、成員排行、Box Plot
- ✅ Analytics API - 成員趨勢、賽季摘要、同盟平均值
- ✅ 圖表工具庫 - Recharts 整合、主題色彩標準化

**技術改進**:
- ✅ Pydantic V2 語法遷移完成
- ✅ 依賴注入標準化（Annotated pattern）
- ✅ API 路由效能優化
- ✅ 圖表組件提取與重用

**已完成模組**: 認證、同盟、賽季、CSV 上傳、霸業積分權重、成員分析、組別分析、戰役分析
**優化中模組**: Overview Dashboard 整合、進階互動功能

### v0.2.0 (2025-10-10) - Phase 3 Major Update

**新增功能**:
- ✅ CSV 上傳系統完整實作（Backend + Frontend）
- ✅ 賽季管理系統（CRUD + 活躍切換）
- ✅ 霸業積分權重系統（權重設定 + 積分預覽）
- ✅ Drag & Drop 上傳介面（智能日期驗證）
- ✅ 權限控管系統（Owner + Collaborator + Member 角色）

**技術改進**:
- ✅ TanStack Query Hooks 全面覆蓋
- ✅ 樂觀更新（Optimistic Updates）
- ✅ API Client 完整整合
- ✅ shadcn/ui 組件統一使用

---

## 📄 License

MIT License - 詳見 [LICENSE](LICENSE) 檔案

---

**Last Updated:** 2026-01-01
**Version:** 0.3.0
**Status:** 🚀 Active Development (Phase 4 完成)
**Python Version:** 3.13+
**Database:** PostgreSQL 17 (Supabase)
**Overall Completion:** 92%
