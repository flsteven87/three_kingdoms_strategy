# Contributing Guide

> Three Kingdoms Strategy Manager - Development Workflow

---

## Quick Start

```bash
# Clone repository
git clone <repository-url>
cd three_kingdoms_strategy

# Backend setup
cd backend && uv sync && cd ..

# Frontend setup
cd frontend && npm install && cd ..
```

---

## Development Workflow

### 1. Environment Setup

#### Backend (.env)

```bash
cd backend
cp .env.example .env
# Edit .env with your Supabase credentials
```

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPABASE_URL` | 🔴 Yes | Supabase project URL |
| `SUPABASE_ANON_KEY` | 🔴 Yes | Supabase anonymous key |
| `SUPABASE_SERVICE_KEY` | 🔴 Yes | Supabase service role key |
| `SUPABASE_JWT_SECRET` | 🔴 Yes | JWT secret for token verification |
| `SECRET_KEY` | 🔴 Yes | Application secret (use `openssl rand -hex 32`) |
| `BACKEND_URL` | No | Backend URL (default: `http://localhost:8087`) |
| `FRONTEND_URL` | No | Frontend URL (default: `http://localhost:5187`) |
| `CORS_ORIGINS` | No | Allowed CORS origins |
| `ENVIRONMENT` | No | `development` or `production` |
| `DEBUG` | No | Enable debug mode |
| `LOG_LEVEL` | No | Logging level (`DEBUG`, `INFO`, `WARNING`, `ERROR`) |
| `LINE_CHANNEL_ID` | No | LINE Messaging API Channel ID |
| `LINE_CHANNEL_SECRET` | No | LINE Channel Secret |
| `LINE_ACCESS_TOKEN` | No | LINE Channel Access Token |
| `LIFF_ID` | No | LINE LIFF App ID |
| `LINE_BOT_ID` | No | LINE Bot Basic ID (e.g., `@xxx`) |
| `LINE_BOT_USER_ID` | No | LINE Bot User ID (for @mention detection) |
| `RECUR_SECRET_KEY` | No | Recur payment secret key |
| `RECUR_WEBHOOK_SECRET` | No | Recur webhook signing secret |

#### Frontend (.env)

```bash
cd frontend
cp .env.example .env
# Edit .env with your configuration
```

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_SUPABASE_URL` | 🔴 Yes | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | 🔴 Yes | Supabase anonymous key |
| `VITE_API_BASE_URL` | No | Backend API URL (default: `http://localhost:8087`) |
| `VITE_APP_VERSION` | No | Application version display |
| `VITE_LIFF_ID` | No | LINE LIFF App ID |
| `VITE_LINE_BOT_ID` | No | LINE Bot Basic ID |
| `VITE_RECUR_PUBLISHABLE_KEY` | No | Recur publishable key |
| `VITE_RECUR_PRODUCT_ID` | No | Recur product ID |

---

### 2. Running Development Servers

#### Backend (Port 8087)

```bash
cd backend
uv run python src/main.py
```

#### Frontend (Port 5187)

```bash
cd frontend
npm run dev
```

---

## Available Scripts

### Frontend Scripts

| Script | Command | Description |
|--------|---------|-------------|
| `dev` | `npm run dev` | Start Vite dev server (HMR enabled) |
| `build` | `npm run build` | TypeScript compile + Vite production build |
| `lint` | `npm run lint` | Run ESLint on all files |
| `preview` | `npm run preview` | Preview production build locally |

### Backend Commands

| Command | Description |
|---------|-------------|
| `uv sync` | Install all dependencies from `uv.lock` |
| `uv add <package>` | Add production dependency |
| `uv add --dev <package>` | Add development dependency |
| `uv run python src/main.py` | Start FastAPI server |
| `uv run ruff check .` | Run linter (required before commit) |
| `uv run ruff format .` | Auto-format code |
| `uv run pytest tests/` | Run all tests |
| `uv run pytest tests/ -v` | Run tests with verbose output |
| `uv run pytest -k "test_name"` | Run specific test by name |

---

## Testing Procedures

### Backend Tests

```bash
cd backend

# Run all tests
uv run pytest tests/

# Run with coverage
uv run pytest tests/ --cov=src

# Run specific test file
uv run pytest tests/unit/test_upload_service.py -v

# Run tests matching pattern
uv run pytest -k "test_create" -v
```

### Frontend Type Check

```bash
cd frontend

# TypeScript type checking
npx tsc --noEmit

# Lint check
npm run lint
```

---

## Code Quality Checklist

### Before Every Commit

- [ ] Backend: `uv run ruff check .` passes with no errors
- [ ] Frontend: `npm run lint` passes
- [ ] Frontend: `npx tsc --noEmit` passes
- [ ] No `any` types in critical paths
- [ ] No `console.log` statements (use proper logging)

### Zero Tolerance Errors (Ruff)

| Code | Description |
|------|-------------|
| F821 | Undefined name |
| F841 | Unused variable |
| E722 | Bare except clause |
| B904 | Missing exception chaining |

---

## Architecture Rules

### 4-Layer Architecture

```
API Layer (FastAPI)  →  Service Layer  →  Repository Layer  →  Database
```

**Rules:**
- API layer only handles HTTP concerns
- Service layer contains business logic
- Repository layer handles data access
- Never skip layers (e.g., API → Database)

### Repository Pattern

```python
# ✅ Correct
class UserRepository(SupabaseRepository):
    def __init__(self):
        super().__init__(table_name="users", model_class=User)

# ❌ Wrong - bypasses error handling
result.data[0]

# ✅ Correct - uses base class method
data_list = self._handle_supabase_result(result)
```

---

## Git Workflow

### Branch Naming

```
feature/add-member-analytics
fix/csv-upload-validation
refactor/split-analytics-service
```

### Commit Message Format

```
<type>: <short description>

<optional body>

Types: feat, fix, refactor, docs, test, chore
```

### Pull Request Checklist

- [ ] Code follows project architecture
- [ ] All tests pass
- [ ] Linting passes (ruff + eslint)
- [ ] TypeScript types are correct
- [ ] No security vulnerabilities introduced
- [ ] Documentation updated if needed

---

## Getting Help

- **API Documentation**: http://localhost:8087/docs
- **Architecture Guide**: [docs/SYSTEM_ARCHITECTURE.md](./SYSTEM_ARCHITECTURE.md)
- **Codebase Audit**: [docs/CODEBASE_AUDIT_REPORT.md](./CODEBASE_AUDIT_REPORT.md)

---

**Last Updated**: 2026-02-01
**Source of Truth**: `package.json`, `pyproject.toml`, `.env.example`
