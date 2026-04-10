
# Three Kingdoms Strategy - Project Context

> 本專案特定的配置。**通用開發規範請參考 `~/.Codex/AGENTS.md`**

## 專案概覽

**Three Kingdoms Strategy Manager** - 三國志戰略版盟友表現管理系統

- **版本**: v1.0.2
- **完成度**: 95%
- **狀態**: Pre-release - 核心功能完善，準備訂閱金流

---

## 技術棧

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

## 專案架構

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
│   │   ├── pages/             # 路由頁面 (10 pages)
│   │   ├── hooks/             # Custom Hooks (11 hooks: alliance, analytics, auth, csv-uploads, events, hegemony-weights, periods, seasons, theme, user-role, alliance-collaborators)
│   │   ├── lib/               # api-client, supabase
│   │   ├── contexts/          # AuthContext, ThemeContext
│   │   └── types/             # TypeScript 類型定義
│   ├── package.json
│   └── vite.config.ts
│
└── data/                       # CSV 範例資料
```

---

## 資料庫 Schema

### 核心表格關係 (12 tables)

```
auth.users (Supabase Auth)
    ↓ (1:1)
alliances (同盟)
    ├─→ alliance_collaborators (協作者)
    ├─→ pending_invitations (邀請)
    └─→ seasons (賽季) ←─────────────┐
            ├─→ csv_uploads (上傳記錄) │
            ├─→ hegemony_weights (霸業權重)
            ├─→ battle_events (戰役事件)
            │       └─→ battle_event_metrics (戰役指標)
            ├─→ periods (期間)
            │       └─→ member_period_metrics (成員期間指標)
            ├─→ member_snapshots (快照) ─→ members (成員)
            └─────────────────────────────────┘
```

### RLS 政策

本專案使用 Supabase RLS 進行資料隔離：
- 所有表格啟用 RLS
- 使用 `(SELECT auth.uid())` subquery 優化效能
- Owner/Collaborator/Member 三級權限

---

## Domain Model

### 核心 Entities

- **Alliance**: 同盟，由 Owner 建立，可邀請 Collaborators
- **Season**: 賽季，隸屬於同盟，追蹤跨賽季數據
- **Member**: 同盟成員，跨賽季追蹤
- **MemberSnapshot**: 成員快照，每次 CSV 上傳產生
- **Period**: 期間，由系統自動計算，用於分析

### CSV 處理流程

```
CSV Upload → Parse → Upsert Members → Batch Create Snapshots → Update Member Activity
```

**檔名格式**: `同盟統計YYYY年MM月DD日HH时MM分SS秒.csv`

---

## API 設計決策

### Base URL

- **Development**: `http://localhost:8087/api/v1`
- **認證**: `Authorization: Bearer <access_token>`

### 主要 Endpoints

| 模組 | Endpoint | 功能 |
|------|----------|------|
| Alliance | `/alliances` | 同盟 CRUD + 協作者管理 |
| Season | `/seasons` | 賽季 CRUD + 活躍切換 |
| Upload | `/uploads` | CSV 上傳處理 + 歷史記錄 |
| Hegemony | `/hegemony-weights` | 霸業積分權重設定 |
| Events | `/events` | 戰役事件 CRUD + 分析 |
| Periods | `/periods` | 期間查詢 + 指標計算 |
| Analytics | `/analytics/members/*` | 成員表現分析 (趨勢/對比/排名) |
| Analytics | `/analytics/groups/*` | 組別分析 (對比/排行/分佈) |
| Analytics | `/analytics/alliance/*` | 同盟整體分析 (趨勢/平均值) |

### API 文件

啟動 Backend 後訪問: http://localhost:8087/docs

---

## 專案特定規則

### 🔴 本專案強制規則

1. **CSV 欄位名稱必須完全匹配**:
   ```
   成員, 貢獻排行, 貢獻本週, 戰功本週, 助攻本週, 捐獻本週, 貢獻總量, 戰功總量, 助攻總量, 捐獻總量, 勢力值, 所屬州, 分組
   ```

2. **不使用 Supabase Migrations**:
   - 使用 Supabase MCP 直接執行 SQL
   - 不建立 migration files

3. **Port 配置**:
   - Backend: `8087`
   - Frontend: `5187`

### 🟡 本專案慣例

1. **Analytics API 命名**: `/analytics/{entity}/{action}`
2. **Period 計算**: 由 Backend Service 自動處理
3. **權限檢查**: 在 Service Layer 進行，不在 Repository

---

## 開發常用指令

```bash
# Backend
cd backend
uv sync                           # 安裝依賴
uv run python src/main.py         # 啟動 (Port 8087)
uv run ruff check .               # Lint 檢查
uv run pytest tests/              # 執行測試

# Frontend
cd frontend
npm install                       # 安裝依賴
npm run dev                       # 啟動 (Port 5187)
npm run lint                      # Lint 檢查
npx tsc --noEmit                  # Type 檢查
```

---

## 已知技術債務

> 詳細報告請參考 `docs/CODEBASE_AUDIT_REPORT.md`

### 🔴 Critical (需立即處理)

| Issue | 說明 | 行動 |
|-------|------|------|
| ~~npm 安全漏洞~~ | ~~react-router CSRF/XSS, tar 漏洞~~ | ✅ 已修復 |
| ~~測試覆蓋~~ | ~~111 測試 / 6 Services (37.5%)~~ | ✅ 333 Backend + 87 Frontend / 17 Services (100%) |
| ~~CI/CD~~ | ~~缺少自動化流程~~ | ⏸️ 使用 Zeabur + Dockerfile |

### 🟡 Major (應優先處理)

| Issue | 說明 | 行動 |
|-------|------|------|
| ~~超大檔案~~ | ~~analytics_service.py (1606行), MemberPerformance.tsx (1627行)~~ | ✅ 已拆分 (analytics→6檔, MemberPerformance→子組件, LineBinding→子組件) |
| ~~Barrel imports~~ | ~~20+ 檔案使用 `from 'lucide-react'`~~ | ✅ 無需修改 (已內建 tree-shaking) |
| ~~Bundle size~~ | ~~1.47MB (建議 <500KB)~~ | ✅ 已優化至 747KB (減少 53%) |

---

## 下一步優先級

### P0 - 已完成
1. ~~**npm 安全漏洞修復**~~ - ✅ 已完成 (2026-01-22)
2. ~~**Lucide imports 調查**~~ - ✅ 無需修改 (lucide-react 已內建 tree-shaking)
3. ~~**Bundle size 優化**~~ - ✅ 已完成 (747KB, -53%) (2026-01-25)
4. ~~**測試覆蓋提升**~~ - ✅ 333 Backend + 87 Frontend / 17 Services (100%) (2026-03-25)

### P1 - 準備中
1. **訂閱金流實作** - Recur 整合 (進行中)

### P2 - 持續進行
1. ~~**拆分超大檔案**~~ - ✅ 已完成 (analytics_service.py, MemberPerformance.tsx, LineBinding.tsx) (2026-03-25)
2. **增加測試覆蓋** - Backend 100% services, Frontend utilities covered; 目標: hooks + component tests

---

**通用開發規範**（架構、設計模式、程式碼風格）請參考：
- `~/.Codex/AGENTS.md`
- `docs/CODEBASE_AUDIT_REPORT.md` (審查報告)
