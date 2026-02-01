# Operations Runbook

> Three Kingdoms Strategy Manager - Deployment & Operations Guide

---

## Deployment Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│    Frontend     │────→│    Backend      │────→│    Supabase     │
│   (Zeabur)      │     │   (Zeabur)      │     │  (PostgreSQL)   │
│   Port: 443     │     │   Port: 8087    │     │   + RLS         │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

**Hosting**: Zeabur (Docker-based deployment)
**Database**: Supabase (PostgreSQL 17 with RLS)
**Auth**: Supabase Auth (Google OAuth)

---

## Deployment Procedures

### 1. Pre-Deployment Checklist

```bash
# Backend
cd backend
uv run ruff check .          # Must pass
uv run pytest tests/         # Must pass

# Frontend
cd frontend
npm run lint                  # Must pass
npx tsc --noEmit             # Must pass
npm run build                # Must succeed
```

### 2. Zeabur Deployment

#### Backend Deployment

```bash
# Zeabur auto-deploys from main branch
# Manual trigger if needed:
zeabur deploy --project three-kingdoms-strategy
```

**Backend Dockerfile** (`backend/Dockerfile`):
- Base image: Python 3.13
- Package manager: UV
- Exposes port 8087

#### Frontend Deployment

```bash
# Build and deploy
npm run build
# Zeabur auto-deploys static files
```

**Frontend Dockerfile** (`frontend/Dockerfile`):
- Multi-stage build (Node + Nginx)
- Static file serving via Nginx

### 3. Environment Variables (Zeabur)

Set these in Zeabur Dashboard > Project > Environment:

**Backend Production**:
```
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=<key>
SUPABASE_SERVICE_KEY=<key>
SUPABASE_JWT_SECRET=<secret>
SECRET_KEY=<generated-secret>
ENVIRONMENT=production
DEBUG=false
CORS_ORIGINS=https://your-frontend-domain.zeabur.app
```

**Frontend Production**:
```
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=<key>
VITE_API_BASE_URL=https://your-backend-domain.zeabur.app
```

---

## Monitoring & Health Checks

### Backend Health Endpoint

```bash
curl https://your-backend.zeabur.app/health

# Expected response:
{
  "status": "healthy",
  "environment": "production",
  "version": "0.9.0"
}
```

### Key Metrics to Monitor

| Metric | Threshold | Action |
|--------|-----------|--------|
| Response time | > 2s | Check database queries |
| Error rate | > 1% | Review logs |
| Memory usage | > 80% | Scale up or optimize |
| Database connections | > 80% pool | Review connection management |

### Supabase Dashboard

- **Database Health**: Supabase Dashboard > Database > Health
- **API Logs**: Supabase Dashboard > Edge Functions > Logs
- **RLS Policies**: Supabase Dashboard > Authentication > Policies

---

## Common Issues & Fixes

### 1. CORS Errors

**Symptom**: `Access-Control-Allow-Origin` errors in browser console

**Fix**:
```bash
# Check backend CORS_ORIGINS includes exact frontend domain
CORS_ORIGINS=https://your-frontend.zeabur.app
# Restart backend after changing
```

### 2. Google OAuth Redirect Mismatch

**Symptom**: `redirect_uri_mismatch` error after login

**Fix**:
1. Go to Google Cloud Console > OAuth 2.0 Client
2. Add authorized redirect URI:
   ```
   https://xxx.supabase.co/auth/v1/callback
   ```

### 3. Database Connection Timeout

**Symptom**: `connection timeout` errors

**Fix**:
1. Check Supabase Dashboard > Database > Connections
2. If pool exhausted, check for unclosed connections
3. Consider enabling connection pooling (PgBouncer)

### 4. CSV Upload Failures

**Symptom**: CSV upload returns 400 or 500 error

**Check**:
1. File encoding must be UTF-8
2. Filename format: `同盟統計YYYY年MM月DD日HH时MM分SS秒.csv`
3. Required columns present (13 columns)

**Fix**:
```bash
# Convert encoding if needed
iconv -f GB2312 -t UTF-8 input.csv > output.csv
```

### 5. RLS Policy Blocking Access

**Symptom**: Empty data returned despite data existing

**Debug**:
```sql
-- Check if RLS is blocking
SELECT * FROM alliances WHERE id = 'uuid';
-- If empty, check policy:
SELECT * FROM pg_policies WHERE tablename = 'alliances';
```

### 6. Trailing Slash 404s

**Symptom**: `/api/v1/alliances/` returns 404

**Root Cause**: FastAPI `redirect_slashes=False` setting

**Fix**: Use paths without trailing slash:
```
✅ /api/v1/alliances
❌ /api/v1/alliances/
```

---

## Rollback Procedures

### 1. Application Rollback (Zeabur)

```bash
# Via Zeabur Dashboard:
# 1. Go to Project > Deployments
# 2. Find previous successful deployment
# 3. Click "Redeploy"
```

### 2. Database Rollback

**Note**: This project uses direct SQL via Supabase MCP, not migrations.

```sql
-- For data rollback, restore from Supabase point-in-time recovery:
-- Supabase Dashboard > Database > Backups > Restore

-- For schema changes, manually revert:
ALTER TABLE table_name DROP COLUMN new_column;
```

### 3. Emergency Procedures

**Complete Outage**:
1. Check Supabase status: https://status.supabase.com
2. Check Zeabur status
3. Review recent deployments for breaking changes
4. Rollback to last known good deployment

**Data Corruption**:
1. Immediately pause writes if possible
2. Use Supabase point-in-time recovery
3. Identify source of corruption
4. Apply fix before restoring service

---

## Security Checklist

### Production Security

- [ ] `DEBUG=false` in production
- [ ] `ENVIRONMENT=production` set
- [ ] `SECRET_KEY` is unique and secure (32+ bytes)
- [ ] HTTPS enforced (Zeabur handles this)
- [ ] RLS enabled on all tables
- [ ] No `FOR ALL TO public USING (true)` policies
- [ ] `FORWARDED_ALLOW_IPS` is NOT `*`

### Credential Rotation

| Credential | Rotation Frequency | Location |
|------------|-------------------|----------|
| SECRET_KEY | Annually | Backend env |
| SUPABASE_SERVICE_KEY | On compromise only | Backend env |
| LINE_ACCESS_TOKEN | On compromise only | Backend env |
| RECUR_SECRET_KEY | On compromise only | Backend env |

---

## Performance Tuning

### Database Query Optimization

```sql
-- Add indexes for frequently queried columns
CREATE INDEX idx_members_alliance_id ON members(alliance_id);
CREATE INDEX idx_snapshots_upload_id ON member_snapshots(upload_id);

-- Check slow queries
SELECT * FROM pg_stat_statements ORDER BY total_time DESC LIMIT 10;
```

### RLS Policy Performance

```sql
-- Use subquery caching for auth.uid()
-- ❌ Slow (called per row)
USING (auth.uid() = user_id)

-- ✅ Fast (cached)
USING ((SELECT auth.uid()) = user_id)
```

### Frontend Bundle Size

Current: ~747KB (optimized from 1.47MB)

Monitor with:
```bash
cd frontend
npm run build
# Check dist/assets sizes
```

---

## Maintenance Windows

**Preferred Times**:
- Weekdays 2:00-4:00 AM (Taiwan Time)
- Avoid: Weekends, peak gaming hours

**Notification**:
- Post in LINE group 24h before planned maintenance
- Update status page if available

---

## Contacts & Escalation

| Issue Type | First Contact | Escalation |
|------------|---------------|------------|
| Application bug | GitHub Issues | Project maintainer |
| Infrastructure | Zeabur support | - |
| Database | Supabase support | - |
| Payment (Recur) | Recur support | - |

---

**Last Updated**: 2026-02-01
**Version**: 0.9.0
