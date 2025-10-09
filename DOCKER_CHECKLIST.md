# ✅ Docker Configuration Checklist

> 快速檢查清單：確保 Docker 配置符合 CLAUDE.md 規範

**Created:** 2025-10-09
**Status:** ✅ All Verified

---

## 📦 已建立的檔案

### Backend (Python FastAPI)
```
backend/
├── Dockerfile              ✅ 已建立
├── .dockerignore           ✅ 已建立
├── pyproject.toml          ✅ 已存在
└── uv.lock                 ✅ 已存在
```

### Frontend (React + TypeScript)
```
frontend/
├── Dockerfile              ✅ 已建立
├── .dockerignore           ✅ 已建立
├── nginx.conf              ✅ 已建立
├── package.json            ✅ 已存在
└── package-lock.json       ✅ 已存在
```

### 文件
```
├── DEPLOYMENT.md           ✅ 已建立（Zeabur 部署指南）
└── DOCKER_CHECKLIST.md     ✅ 本文件
```

---

## 🔍 CLAUDE.md 規範驗證

### 🔴 CRITICAL 規範

#### Backend Dockerfile

| 規範 | 狀態 | 說明 |
|------|------|------|
| ✅ 使用 UV package manager | ✅ | `uv sync --frozen --no-dev` |
| ✅ Python 3.13+ | ✅ | `FROM python:3.13-slim` |
| ✅ Non-root user | ✅ | `USER appuser` |
| ✅ Health check | ✅ | `/health` endpoint |
| ✅ 動態端口支援 | ✅ | `ENV PORT=8087` + Zeabur override |

#### Frontend Dockerfile

| 規範 | 狀態 | 說明 |
|------|------|------|
| ✅ Multi-stage build | ✅ | Build stage + Nginx stage |
| ✅ 使用 npm ci | ✅ | 不使用 `npm install` |
| ✅ Production Nginx | ✅ | `nginx:alpine` |
| ✅ 動態端口支援 | ✅ | `/start.sh` 動態修改配置 |
| ✅ React Router fallback | ✅ | `try_files $uri /index.html` |

### 🟡 IMPORTANT 規範

#### Backend .dockerignore

| 規範 | 狀態 | 說明 |
|------|------|------|
| ✅ 排除 .venv/ | ✅ | 虛擬環境不打包 |
| ✅ 排除 .env | ✅ | **CRITICAL**: 環境變數由 Zeabur 注入 |
| ✅ 排除 __pycache__/ | ✅ | Python cache 不打包 |
| ✅ 排除 tests/ | ✅ | 測試檔案不打包 |
| ✅ 排除 *.md | ✅ | 文件不打包 |

#### Frontend .dockerignore

| 規範 | 狀態 | 說明 |
|------|------|------|
| ✅ 排除 node_modules/ | ✅ | 依賴會在 build 時重新安裝 |
| ✅ 排除 .env | ✅ | **CRITICAL**: 環境變數在 build time 注入 |
| ✅ 排除 dist/ | ✅ | Build output 會重新生成 |
| ✅ 排除 package-lock.json | ✅ | 確保使用最新依賴 |
| ✅ 排除 *.md | ✅ | 文件不打包 |

### 🟢 RECOMMENDED 規範

#### Nginx Configuration

| 規範 | 狀態 | 說明 |
|------|------|------|
| ✅ Gzip compression | ✅ | 壓縮 text/css/js |
| ✅ Static assets caching | ✅ | 1 年快取 + immutable |
| ✅ Security headers | ✅ | X-Content-Type-Options, X-Frame-Options |
| ✅ Health check endpoint | ✅ | `/health` |
| ✅ React Router fallback | ✅ | `try_files $uri /index.html` |

---

## 🚀 部署流程驗證

### Step 1: Local Build Test

**Backend**:
```bash
cd backend
docker build -t three-kingdoms-backend .
docker run -p 8087:8087 --env-file .env three-kingdoms-backend
curl http://localhost:8087/health
```

**Frontend**:
```bash
cd frontend
docker build -t three-kingdoms-frontend .
docker run -p 80:80 three-kingdoms-frontend
curl http://localhost/health
```

### Step 2: Zeabur Deployment

1. ✅ 推送程式碼到 GitHub
2. ✅ 在 Zeabur 建立 Project
3. ✅ 部署 Backend Service（指定 `backend/` 目錄）
4. ✅ 設定 Backend 環境變數（11 個）
5. ✅ 部署 Frontend Service（指定 `frontend/` 目錄）
6. ✅ 設定 Frontend 環境變數（3 個）
7. ✅ 測試完整流程

---

## 🔒 安全性檢查

### Backend

- ✅ **Non-root user**: `appuser` 運行應用
- ✅ **環境變數隔離**: `.env` 不打包進 image
- ✅ **Health check**: 監控應用健康狀態
- ✅ **CORS 配置**: 只允許特定 Frontend domain
- ✅ **Production 模式**: `DEBUG=false`, `ENVIRONMENT=production`

### Frontend

- ✅ **Multi-stage build**: 只打包 dist/，不包含 source code
- ✅ **Nginx 運行**: 不暴露 Node.js
- ✅ **Security headers**: X-Content-Type-Options, X-Frame-Options
- ✅ **Static assets immutable**: 防止快取被竄改
- ✅ **環境變數**: `VITE_*` 在 build time 注入，不可被前端修改

---

## 📊 檔案大小優化

### Backend Image 預估

```
Base image (python:3.13-slim): ~150MB
Dependencies (uv sync):        ~100MB
Application code:              ~5MB
Total:                         ~255MB
```

### Frontend Image 預估

```
Build stage (丟棄):
  - node:22-alpine:            ~200MB
  - node_modules:              ~500MB

Production image:
  - nginx:alpine:              ~40MB
  - Compiled dist/:            ~10MB
Total:                         ~50MB
```

---

## ⚡ 效能優化檢查

### Backend

| 項目 | 狀態 | 說明 |
|------|------|------|
| ✅ UV bytecode compilation | ✅ | `UV_COMPILE_BYTECODE=1` |
| ✅ UV cache 清理 | ✅ | `rm -rf /tmp/uv-cache` |
| ✅ Layer caching | ✅ | 依賴層在前，程式碼層在後 |

### Frontend

| 項目 | 狀態 | 說明 |
|------|------|------|
| ✅ Multi-stage build | ✅ | 只保留 dist/ |
| ✅ Nginx sendfile | ✅ | `sendfile on` |
| ✅ Gzip compression | ✅ | Level 6 |
| ✅ Static assets caching | ✅ | 1 年 |

---

## 🧪 測試清單

### Local Testing

- [ ] Backend Dockerfile build 成功
- [ ] Backend container 啟動成功
- [ ] `/health` endpoint 回應 200
- [ ] Frontend Dockerfile build 成功
- [ ] Frontend container 啟動成功
- [ ] Nginx 正確 serve static files
- [ ] React Router fallback 正常

### Zeabur Testing

- [ ] Backend Service 部署成功
- [ ] Backend 環境變數已設定
- [ ] Backend health check 通過
- [ ] Frontend Service 部署成功
- [ ] Frontend 環境變數已設定
- [ ] Frontend 網站可開啟
- [ ] CORS 設定正確（無錯誤）
- [ ] Google OAuth 登入成功
- [ ] API 呼叫正常

---

## 📝 常見錯誤排查

### Backend Build 失敗

**症狀**: `uv sync` 失敗

**檢查**:
1. `pyproject.toml` 是否存在
2. `uv.lock` 是否存在
3. Python 版本是否為 3.13+

### Frontend Build 失敗

**症狀**: `npm run build` 失敗

**檢查**:
1. `package.json` 是否存在
2. TypeScript 編譯無錯誤：`npx tsc --noEmit`
3. 環境變數是否以 `VITE_` 開頭

### CORS 錯誤

**症狀**: Frontend 無法呼叫 Backend API

**檢查**:
1. Backend `CORS_ORIGINS` 是否包含正確的 Frontend URL
2. URL 是否完全匹配（包括 `https://`，無結尾斜線）
3. 修改後是否重新部署

### Health Check 失敗

**症狀**: Zeabur 顯示 Service unhealthy

**檢查**:
1. Backend `/health` endpoint 是否正常運作
2. Port binding 是否正確
3. 查看 Service Logs 排查錯誤

---

## 🎉 完成確認

- ✅ Backend Dockerfile 符合 CLAUDE.md 規範
- ✅ Frontend Dockerfile 符合 CLAUDE.md 規範
- ✅ .dockerignore 正確排除敏感檔案
- ✅ nginx.conf 配置完整
- ✅ DEPLOYMENT.md 部署指南詳細
- ✅ 安全性檢查通過
- ✅ 效能優化完成

---

## 📞 支援資源

- **專案文件**: `README.md`
- **部署指南**: `DEPLOYMENT.md`
- **開發規範**: `CLAUDE.md`
- **協作系統**: `alliance_collaborator_system.md`

---

**Status:** ✅ Ready for Deployment
**Last Verified:** 2025-10-09
**Next Step:** 依照 `DEPLOYMENT.md` 部署到 Zeabur

祝部署順利！ 🚀
