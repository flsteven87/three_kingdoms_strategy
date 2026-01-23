# Codebase Audit Report

> 三國志戰略版管理系統 - 全面程式碼審查報告

**審查日期**: 2026-01-22 (更新於 2026-01-22)
**審查版本**: v0.9.0
**審查員**: Claude Code (Automated Audit)

---

## 執行摘要

| 類別 | 狀態 | 說明 |
|------|------|------|
| **整體架構** | ✅ 優秀 | 4-Layer Architecture 設計完善 |
| **程式碼品質** | ⚠️ 需改善 | 多個檔案超過行數限制 |
| **安全性** | ✅ 良好 | npm 漏洞已修復 |
| **效能** | ⚠️ 需優化 | Bundle size 過大 (1.47MB)，lucide-react 已確認支持 tree-shaking |
| **測試覆蓋** | ⚠️ 中等 | 111 測試 / 6 Services (37.5%) |
| **文檔完整性** | ✅ 良好 | 架構文檔完整 |
| **CI/CD** | ❌ 缺失 | 無自動化流程 |

---

## 🔴 Critical Issues (必須立即修復)

### ~~C1. 安全漏洞 - npm Dependencies~~ ✅ 已修復

**位置**: `frontend/package.json`
**狀態**: ✅ 已於 2026-01-22 修復

```bash
# 執行結果
cd frontend && npm audit fix
# changed 10 packages, found 0 vulnerabilities
```

**修復內容**:
- react-router CSRF/XSS 漏洞
- tar 檔案覆蓋漏洞
- Vite 7.1.9 → 7.3.1

### C2. 測試覆蓋率 - 持續改善中

**現況**:
- **測試總數**: 111 個測試 (109 passed, 2 skipped)
- **測試檔案**: 8 個測試檔案
- **Service 覆蓋率**: 6/16 (37.5%)

**已測試 Services**:
| Service | 測試數 |
|---------|--------|
| permission_service | 22 |
| csv_parser_service | 22 |
| season_service | 15 |
| copper_mine_service | 14 |
| alliance_service | 12 |
| csv_upload_service | 10 |
| event_report (整合測試) | 16 |

**待測試 Services** (10 個):
- alliance_collaborator_service
- analytics_service
- auth_service
- battle_event_service
- copper_mine_rule_service
- donation_service
- hegemony_weight_service
- line_binding_service
- period_metrics_service
- season_quota_service

**建議行動**:
1. 優先為高風險 Services 建立測試 (analytics, season_quota)
2. 為 Repository 層建立整合測試
3. 目標測試覆蓋率: >70%

### C3. 缺少 CI/CD Pipeline

**現況**: 無 `.github/workflows/` 目錄
**嚴重性**: HIGH

**影響**:
- 無自動化測試
- 部署依賴人工
- 無品質關卡

**建議行動**:
建立 `.github/workflows/ci.yml`:
```yaml
name: CI
on: [push, pull_request]
jobs:
  backend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v1
      - run: cd backend && uv sync && uv run ruff check . && uv run pytest

  frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: cd frontend && npm ci && npm run lint && npm run build
```

---

## 🟡 Major Issues (應優先處理)

### M1. 檔案行數超過限制

**違反規則**: CLAUDE.md 🟢 - Backend <1000 行, Frontend 組件 <500 行

| 檔案 | 行數 | 限制 | 超出 |
|------|------|------|------|
| `backend/src/services/analytics_service.py` | 1,606 | 1,000 | +606 |
| `backend/src/api/v1/endpoints/linebot.py` | 1,066 | 1,000 | +66 |
| `frontend/src/pages/MemberPerformance.tsx` | 1,627 | 500 | +1,127 |
| `frontend/src/pages/GroupAnalytics.tsx` | 1,014 | 500 | +514 |
| `frontend/src/pages/AllianceAnalytics.tsx` | 968 | 500 | +468 |
| `frontend/src/pages/LineBinding.tsx` | 905 | 500 | +405 |
| `frontend/src/components/hegemony-weights/HegemonyWeightCard.tsx` | 754 | 500 | +254 |
| `frontend/src/pages/EventDetail.tsx` | 562 | 500 | +62 |
| `frontend/src/pages/DonationAnalytics.tsx` | 560 | 500 | +60 |

**建議行動**:
1. `analytics_service.py`: 拆分為 `member_analytics.py`, `group_analytics.py`, `alliance_analytics.py`
2. `linebot.py`: 拆分為 `linebot_webhook.py`, `linebot_liff.py`, `linebot_webapp.py`
3. Frontend 大型頁面: 提取圖表組件到 `components/analytics/`

### ~~M2. Lucide-React Barrel Imports~~ ✅ 無需修改

**原規則**: CLAUDE.md 🔴 - 禁止 barrel imports

**調查結論**: lucide-react 已內建 tree-shaking 支持，**無需修改為 direct imports**

**技術分析**:
1. `lucide-react` package.json 設置 `"sideEffects": false`
2. 現代 bundler (Vite/Rollup) 會自動進行 tree-shaking
3. `dist/esm/icons/*` 路徑缺乏 TypeScript 類型聲明支持
4. 官方文檔推薦使用 named imports: `import { Icon } from 'lucide-react'`

**驗證方式**:
```bash
# 檢查 lucide-react 設定
cat node_modules/lucide-react/package.json | grep sideEffects
# 輸出: "sideEffects": false
```

**結論**: 保持現有 `import { Icon } from 'lucide-react'` 語法，Vite 會自動 tree-shake

### M3. Bundle Size 過大

**現況**: 1,473.15 kB (gzip: 413.05 kB)
**建議**: <500 kB (gzip: <150 kB)

**原因分析**:
1. Lucide-React barrel imports
2. Recharts 完整引入
3. 無 code splitting

**建議行動**:
1. 修復 lucide-react imports
2. 使用 dynamic import 進行 code splitting
3. 配置 `build.rollupOptions.output.manualChunks`

```typescript
// vite.config.ts
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-charts': ['recharts'],
          'vendor-ui': ['@radix-ui/react-dialog', '@radix-ui/react-select']
        }
      }
    }
  }
})
```

### M4. 缺少 Backend .env.example

**現況**: `frontend/.env.example` 存在，`backend/.env.example` 不存在
**影響**: 新開發者難以設定環境

**建議行動**:
建立 `backend/.env.example`:
```bash
# Supabase
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_KEY=your_service_key
SUPABASE_JWT_SECRET=your_jwt_secret

# Backend
BACKEND_URL=http://localhost:8087
FRONTEND_URL=http://localhost:5187
CORS_ORIGINS=http://localhost:5187

# Security
SECRET_KEY=your_secret_key_here

# Environment
ENVIRONMENT=development
DEBUG=true
LOG_LEVEL=INFO

# LINE Bot (optional)
LINE_CHANNEL_SECRET=your_channel_secret
LINE_CHANNEL_ACCESS_TOKEN=your_access_token
LIFF_ID=your_liff_id
```

---

## 🟢 Recommendations (建議改善)

### R1. 增加型別安全性

**建議**: 為關鍵路徑新增更多 TypeScript 嚴格檢查

```json
// tsconfig.json
{
  "compilerOptions": {
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true
  }
}
```

### R2. 改善錯誤處理一致性

**現況**: 部分 Service 使用 ValueError，部分使用自定義 Exception

**建議**: 建立統一的 Domain Exception 體系

```python
# src/core/exceptions.py
class DomainException(Exception):
    """Base domain exception"""
    pass

class NotFoundError(DomainException):
    def __init__(self, entity: str, identifier: str):
        super().__init__(f"{entity} not found: {identifier}")

class PermissionDeniedError(DomainException):
    pass

class ValidationError(DomainException):
    pass
```

### R3. 新增 Pre-commit Hooks

**建議**: 強制提交前檢查

```yaml
# .pre-commit-config.yaml
repos:
  - repo: local
    hooks:
      - id: ruff-check
        name: Ruff Check
        entry: uv run ruff check .
        language: system
        types: [python]

      - id: frontend-lint
        name: Frontend Lint
        entry: npm run lint
        language: system
        files: \.(ts|tsx)$
```

### R4. 改善 API 文檔

**建議**: 為每個 endpoint 新增詳細的 response schema 和 examples

```python
@router.get(
    "",
    response_model=AllianceResponse,
    responses={
        404: {"description": "User has no alliance"},
        403: {"description": "Permission denied"}
    },
    summary="Get user's alliance",
    description="Returns the alliance that the authenticated user belongs to"
)
```

---

## ✅ Good Practices (值得保持)

### G1. 架構設計優秀

- 4-Layer Architecture 嚴格遵守
- Repository Pattern 正確實作
- Service Layer 職責明確
- Dependency Injection 使用 Annotated pattern

### G2. Supabase 整合良好

- RLS Policy 使用 subquery 優化效能
- `_handle_supabase_result()` 統一錯誤處理
- `asyncio.to_thread()` 正確處理同步 SDK

### G3. 文檔完整

- `CLAUDE.md` 開發規範清晰
- `README.md` 專案說明完整
- `SYSTEM_ARCHITECTURE.md` 架構設計詳盡

### G4. Pydantic V2 遷移完成

- 正確使用 `@field_validator`
- 正確使用 `ConfigDict`
- 正確使用 `model_dump(mode='json')`

### G5. Docker 配置規範

- Multi-stage build
- Non-root user
- Health check
- UV package manager

---

## 優先級排序

| 優先級 | Issue | 預估工時 | 狀態 |
|--------|-------|----------|------|
| ~~P0~~ | ~~C1. npm 安全漏洞修復~~ | - | ✅ 已完成 |
| ~~P1~~ | ~~M2. Lucide imports~~ | - | ✅ 無需修改 (已內建 tree-shaking) |
| P0 | C3. 建立基本 CI/CD | 2h | ⏳ 待建立 |
| P1 | M1. 拆分超大檔案 | 8h | ⏳ 待處理 |
| P1 | M3. Bundle size 優化 | 4h | ⏳ 待處理 |
| P1 | M4. 建立 .env.example | 0.5h | ⏳ 待處理 |
| P2 | C2. 增加測試覆蓋 (目前 37.5%) | 16h+ | 🔄 進行中 (111 tests) |
| P3 | R1-R4 建議改善 | 8h | ⏳ 待處理 |

---

## 下一步行動

1. ~~**立即執行**: `cd frontend && npm audit fix`~~ ✅ 已完成
2. ~~**調查**: Lucide barrel imports~~ ✅ 確認無需修改 (lucide-react 內建 tree-shaking)
3. **本週完成**: 建立 CI/CD pipeline
4. **下週開始**: 拆分超大檔案 (`analytics_service.py`, `MemberPerformance.tsx`)
5. **持續進行**: 增加測試覆蓋率

---

**審查結束**
**整體評分**: B+ (良好，有明確改善空間)

---

## 更新歷史

| 日期 | 版本 | 更新內容 |
|------|------|----------|
| 2026-01-22 | v0.3.0 | 初始審查報告 |
| 2026-01-22 | v0.9.0 | 版本升級至 Pre-release，更新 Lucide imports 結論 (無需修改，已內建 tree-shaking) |
| 2026-01-23 | v0.9.1 | 測試覆蓋率更新：111 測試 / 6 Services (37.5%)，修復過時測試引用 |

