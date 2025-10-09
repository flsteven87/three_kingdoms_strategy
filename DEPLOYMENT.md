# 🚀 Zeabur Deployment Guide - Three Kingdoms Strategy Manager

> 分離式前後端部署指南

**Version:** 1.0.0
**Last Updated:** 2025-10-09
**Platform:** Zeabur

---

## 📋 目錄

- [部署架構](#-部署架構)
- [前置準備](#-前置準備)
- [Backend 部署](#-backend-部署)
- [Frontend 部署](#-frontend-部署)
- [環境變數配置](#-環境變數配置)
- [域名設定](#-域名設定)
- [健康檢查](#-健康檢查)
- [常見問題](#-常見問題)
- [安全性檢查清單](#-安全性檢查清單)

---

## 🏗️ 部署架構

```
┌─────────────────────────────────────────────────────────────┐
│                         Zeabur Platform                      │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌─────────────────────┐         ┌─────────────────────┐   │
│  │   Frontend Service  │         │  Backend Service    │   │
│  │   (Nginx + React)   │────────▶│  (FastAPI + UV)     │   │
│  │   Port: Dynamic     │  CORS   │  Port: Dynamic      │   │
│  │   nginx.conf        │         │  Uvicorn            │   │
│  └─────────────────────┘         └─────────────────────┘   │
│           │                                 │                │
│           │                                 │                │
│           └─────────────────────────────────┘                │
│                            │                                 │
│                            ▼                                 │
│                  ┌──────────────────┐                        │
│                  │  Supabase        │                        │
│                  │  (PostgreSQL)    │                        │
│                  └──────────────────┘                        │
└─────────────────────────────────────────────────────────────┘
```

---

## ✅ 前置準備

### 1. Zeabur 帳號設定

1. 前往 [Zeabur Dashboard](https://dash.zeabur.com/)
2. 使用 GitHub 帳號登入
3. 建立新的 Project: `three-kingdoms-strategy`

### 2. Supabase 專案準備

確保你已經完成：
- ✅ Supabase 專案建立
- ✅ Google OAuth 配置
- ✅ Database Schema 部署完成
- ✅ RLS Policies 啟用

### 3. GitHub Repository

確保你的專案已推送到 GitHub：
```bash
git add .
git commit -m "Add Docker configuration for Zeabur deployment"
git push origin main
```

---

## 🔧 Backend 部署

### Step 1: 建立 Backend Service

1. 前往 Zeabur Dashboard → 選擇你的 Project
2. 點擊 **"Add Service"** → **"Git"**
3. 選擇你的 GitHub repository
4. **Root Directory**: `backend/`
5. **Service Name**: `three-kingdoms-backend`
6. Zeabur 會自動偵測 `Dockerfile`

### Step 2: 設定環境變數

在 Backend Service 設定頁面，新增以下環境變數：

#### 必填環境變數 ✅

```bash
# Supabase Configuration
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SERVICE_KEY=eyJhbGc...
SUPABASE_JWT_SECRET=your_jwt_secret

# Security
SECRET_KEY=<使用 openssl rand -hex 32 生成>

# Backend Configuration
BACKEND_URL=https://your-backend.zeabur.app
FRONTEND_URL=https://your-frontend.zeabur.app

# CORS Configuration (重要！)
CORS_ORIGINS=https://your-frontend.zeabur.app

# Environment
ENVIRONMENT=production
DEBUG=false
LOG_LEVEL=INFO
```

#### 生成 SECRET_KEY

在本地終端執行：
```bash
openssl rand -hex 32
```

將輸出的字串貼到 `SECRET_KEY` 環境變數。

### Step 3: 部署

1. 點擊 **"Deploy"**
2. 等待建置完成（約 3-5 分鐘）
3. 檢查 Service Logs 確認沒有錯誤

### Step 4: 驗證部署

```bash
# Health check
curl https://your-backend.zeabur.app/health

# 預期回應
{
  "status": "healthy",
  "environment": "production",
  "version": "0.1.0"
}
```

---

## 🎨 Frontend 部署

### Step 1: 建立 Frontend Service

1. 在同一個 Project 中，點擊 **"Add Service"** → **"Git"**
2. 選擇相同的 GitHub repository
3. **Root Directory**: `frontend/`
4. **Service Name**: `three-kingdoms-frontend`
5. Zeabur 會自動偵測 `Dockerfile`

### Step 2: 設定環境變數

Frontend 需要在 **build time** 注入環境變數：

```bash
# Supabase Configuration
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGc...

# Backend API URL (重要！)
VITE_API_BASE_URL=https://your-backend.zeabur.app/api/v1
```

⚠️ **注意**: Vite 環境變數必須以 `VITE_` 開頭才會被打包進前端 bundle。

### Step 3: 部署

1. 點擊 **"Deploy"**
2. 等待建置完成（約 2-4 分鐘）
3. 檢查 Service 是否正常運行

### Step 4: 驗證部署

開啟瀏覽器：
```
https://your-frontend.zeabur.app
```

應該看到登入頁面。

---

## 🔐 環境變數配置

### Backend 環境變數完整清單

| 變數名稱 | 必填 | 說明 | 範例 |
|---------|------|------|------|
| `SUPABASE_URL` | ✅ | Supabase 專案 URL | `https://xxx.supabase.co` |
| `SUPABASE_ANON_KEY` | ✅ | Supabase 匿名金鑰 | `eyJhbGc...` |
| `SUPABASE_SERVICE_KEY` | ✅ | Supabase 服務金鑰（後端專用） | `eyJhbGc...` |
| `SUPABASE_JWT_SECRET` | ✅ | JWT 驗證密鑰 | 從 Supabase Dashboard 取得 |
| `SECRET_KEY` | ✅ | FastAPI 加密密鑰 | `openssl rand -hex 32` |
| `BACKEND_URL` | ✅ | Backend 完整 URL | `https://your-backend.zeabur.app` |
| `FRONTEND_URL` | ✅ | Frontend 完整 URL | `https://your-frontend.zeabur.app` |
| `CORS_ORIGINS` | ✅ | CORS 允許來源（逗號分隔） | `https://your-frontend.zeabur.app` |
| `ENVIRONMENT` | ❌ | 環境名稱 | `production` |
| `DEBUG` | ❌ | 除錯模式 | `false` |
| `LOG_LEVEL` | ❌ | 日誌等級 | `INFO` |

### Frontend 環境變數完整清單

| 變數名稱 | 必填 | 說明 |
|---------|------|------|
| `VITE_SUPABASE_URL` | ✅ | Supabase 專案 URL |
| `VITE_SUPABASE_ANON_KEY` | ✅ | Supabase 匿名金鑰 |
| `VITE_API_BASE_URL` | ✅ | Backend API 完整 URL |

---

## 🌐 域名設定

### 1. 使用 Zeabur 預設域名

Zeabur 會自動分配：
- Backend: `https://three-kingdoms-backend.zeabur.app`
- Frontend: `https://three-kingdoms-frontend.zeabur.app`

### 2. 使用自訂域名（推薦）

#### Backend 域名設定

1. 前往 Backend Service → **"Domains"**
2. 點擊 **"Add Custom Domain"**
3. 輸入你的域名（例如：`api.yourdomain.com`）
4. 按照指示設定 DNS CNAME 記錄：
   ```
   CNAME: api.yourdomain.com → three-kingdoms-backend.zeabur.app
   ```
5. 等待 SSL 證書自動配置（約 5-10 分鐘）

#### Frontend 域名設定

1. 前往 Frontend Service → **"Domains"**
2. 點擊 **"Add Custom Domain"**
3. 輸入你的域名（例如：`app.yourdomain.com`）
4. 設定 DNS CNAME 記錄：
   ```
   CNAME: app.yourdomain.com → three-kingdoms-frontend.zeabur.app
   ```

#### 更新環境變數

設定自訂域名後，記得更新環境變數：

**Backend**:
```bash
BACKEND_URL=https://api.yourdomain.com
FRONTEND_URL=https://app.yourdomain.com
CORS_ORIGINS=https://app.yourdomain.com
```

**Frontend**:
```bash
VITE_API_BASE_URL=https://api.yourdomain.com/api/v1
```

然後重新部署兩個 Service。

---

## 🏥 健康檢查

### Backend Health Check

Zeabur 會自動使用 Dockerfile 中的 `HEALTHCHECK` 指令：

```bash
# 檢查 /health endpoint
curl https://your-backend.zeabur.app/health
```

### Frontend Health Check

```bash
# 檢查 nginx /health endpoint
curl https://your-frontend.zeabur.app/health
```

### 監控建議

1. **Zeabur Metrics**
   - CPU 使用率
   - Memory 使用率
   - Request 數量

2. **Application Logs**
   - 查看 Service Logs 排查問題
   - 注意 500 錯誤和異常

3. **Uptime Monitoring（建議）**
   - 使用 UptimeRobot 或 BetterUptime
   - 監控 `/health` endpoints

---

## ❓ 常見問題

### Q1: CORS 錯誤

**症狀**: 前端無法呼叫 Backend API，出現 CORS 錯誤。

**解決方案**:
1. 檢查 Backend 環境變數 `CORS_ORIGINS` 是否包含正確的 Frontend URL
2. 確保 URL 完全匹配（包括 `https://` 和不含結尾斜線）
3. 重新部署 Backend Service

### Q2: 環境變數未生效

**症狀**: Frontend 無法連接 Backend，或 Backend 無法連接 Supabase。

**解決方案**:
1. **Frontend**: 環境變數必須以 `VITE_` 開頭
2. **Backend**: 檢查 `.env` 範例與 Zeabur 設定是否一致
3. 修改環境變數後，必須 **重新部署** Service

### Q3: Google OAuth 重導向錯誤

**症狀**: 登入後出現 `redirect_uri_mismatch` 錯誤。

**解決方案**:
1. 前往 [Google Cloud Console](https://console.cloud.google.com/)
2. 更新 **Authorized redirect URIs**:
   ```
   https://your-supabase-project.supabase.co/auth/v1/callback
   ```
3. 前往 Supabase Dashboard → Authentication → URL Configuration
4. 更新 **Site URL**: `https://your-frontend.zeabur.app`
5. 更新 **Redirect URLs**: `https://your-frontend.zeabur.app/auth/callback`

### Q4: 503 Service Unavailable

**症狀**: Service 無法啟動，出現 503 錯誤。

**解決方案**:
1. 檢查 Service Logs，查看啟動錯誤
2. 常見原因：
   - 環境變數缺失
   - Database 連線失敗
   - Port binding 錯誤
3. 確認 Dockerfile 中的 `CMD` 指令正確

### Q5: Build 失敗

**Backend Build 失敗**:
- 檢查 `pyproject.toml` 和 `uv.lock` 是否存在
- 確認 Python 版本兼容性（需要 3.13+）

**Frontend Build 失敗**:
- 檢查 `package.json` 和 `package-lock.json` 是否存在
- 確認 TypeScript 編譯無錯誤：`npx tsc --noEmit`
- 檢查 `VITE_*` 環境變數是否設定

---

## 🔒 安全性檢查清單

### 部署前檢查

- [ ] ✅ 所有敏感資訊（API keys, secrets）已設定在 Zeabur 環境變數
- [ ] ✅ `.env` 檔案已加入 `.dockerignore`，不會打包進 image
- [ ] ✅ Supabase RLS Policies 已啟用
- [ ] ✅ Backend 使用 non-root user 運行（已在 Dockerfile 配置）
- [ ] ✅ `DEBUG=false` 在 production 環境
- [ ] ✅ CORS 只允許特定 Frontend domain

### 部署後檢查

- [ ] ✅ HTTPS 已啟用（Zeabur 自動配置 SSL）
- [ ] ✅ Google OAuth redirect URIs 已更新為 production URLs
- [ ] ✅ Health check endpoints 正常運作
- [ ] ✅ 測試完整登入流程（Google OAuth）
- [ ] ✅ 測試 API 呼叫（CORS 無錯誤）
- [ ] ✅ 監控設定完成

### 定期維護

- [ ] 🔄 定期更新依賴套件（`uv sync`, `npm update`）
- [ ] 🔄 定期檢查 Zeabur Service Logs
- [ ] 🔄 監控 CPU/Memory 使用率
- [ ] 🔄 定期備份 Supabase Database

---

## 📊 效能優化建議

### Backend 優化

1. **Database Connection Pooling**
   - Supabase 已內建 connection pooling
   - 確保使用 `postgrest` 而非直接連線

2. **API Response Caching**（未來實作）
   - 使用 Redis 快取常用查詢
   - 設定合理的 TTL

3. **Log Level 調整**
   - Production: `LOG_LEVEL=WARNING` 或 `ERROR`
   - 減少不必要的 log 輸出

### Frontend 優化

1. **Static Assets Caching**
   - ✅ 已在 `nginx.conf` 配置 1 年快取
   - JS/CSS/Images 使用 `immutable` cache header

2. **Gzip Compression**
   - ✅ 已啟用 gzip，壓縮 text/css/js

3. **Code Splitting**（未來實作）
   - 使用 React Router lazy loading
   - 減少初始 bundle size

---

## 🎉 部署完成檢查清單

### Backend Service ✅

- [ ] ✅ Service 部署成功
- [ ] ✅ Health check 回應 200 OK
- [ ] ✅ 環境變數全部設定
- [ ] ✅ Logs 無錯誤訊息
- [ ] ✅ Database 連線正常

### Frontend Service ✅

- [ ] ✅ Service 部署成功
- [ ] ✅ 網站可正常開啟
- [ ] ✅ React Router 路由正常（SPA fallback）
- [ ] ✅ Google OAuth 登入成功
- [ ] ✅ API 呼叫正常（無 CORS 錯誤）

### 整合測試 ✅

- [ ] ✅ 完整登入流程
- [ ] ✅ 建立同盟
- [ ] ✅ 上傳 CSV
- [ ] ✅ 查看數據
- [ ] ✅ 多人協作（新增/移除成員）

---

## 📚 相關資源

- [Zeabur Documentation](https://zeabur.com/docs)
- [FastAPI Deployment Guide](https://fastapi.tiangolo.com/deployment/)
- [Nginx Configuration Best Practices](https://nginx.org/en/docs/)
- [Supabase Auth Documentation](https://supabase.com/docs/guides/auth)

---

**Last Updated:** 2025-10-09
**Version:** 1.0.0
**Author:** Three Kingdoms Strategy Team

如有問題，請參考本文件或聯繫開發團隊。
