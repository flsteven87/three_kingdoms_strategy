# Custom Domain Binding (tktmanager.com) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Bind the Cloudflare domain `tktmanager.com` to the Zeabur-hosted Three Kingdoms Strategy app, ensuring all services (frontend, backend API, auth, webhooks) work correctly with the custom domain.

**Architecture:** Frontend at `tktmanager.com`, Backend API at `api.tktmanager.com`, both served via Zeabur with Cloudflare DNS proxying. SSL terminated at Cloudflare (Full Strict mode) with Zeabur origin certificates. All external service callbacks (Supabase Auth, LINE Webhook, LIFF, Recur Webhook) updated to use custom domain URLs.

**Tech Stack:** Cloudflare DNS, Zeabur (Docker deployment), Supabase Auth, LINE Messaging API / LIFF, Recur Payment

---

## Pre-Flight: Current State

The codebase is **already configured** for the custom domain:
- `frontend/.env.zeabur` → `VITE_API_BASE_URL=https://api.tktmanager.com`
- `backend/.env.zeabur` → `BACKEND_URL=https://api.tktmanager.com`, `FRONTEND_URL=https://tktmanager.com`, `CORS_ORIGINS=https://tktmanager.com`

What remains is **infrastructure binding** (DNS + external service config) and **documentation cleanup**.

---

## Task 1: Zeabur — Add Custom Domains to Services

**Context:** Zeabur needs to know which custom domains to accept traffic for. Each Zeabur service gets its own domain binding. This generates CNAME targets for DNS configuration.

**Step 1: Add frontend domain in Zeabur Dashboard**

1. Go to Zeabur Dashboard → Project → Frontend Service → Settings → Domains
2. Click "Custom Domain" → Enter `tktmanager.com`
3. Zeabur will show a CNAME target (e.g., `xxx.cname.zeabur-dns.com`) — **copy this value**
4. Also add `www.tktmanager.com` (for www redirect)

**Step 2: Add backend domain in Zeabur Dashboard**

1. Go to Zeabur Dashboard → Project → Backend Service → Settings → Domains
2. Click "Custom Domain" → Enter `api.tktmanager.com`
3. Copy the CNAME target

**Step 3: Record the CNAME targets**

Save these values — needed for Task 2:
```
tktmanager.com       → CNAME → <frontend-zeabur-cname>
www.tktmanager.com   → CNAME → <frontend-zeabur-cname>
api.tktmanager.com   → CNAME → <backend-zeabur-cname>
```

> **Note:** For root domain (`tktmanager.com`), Cloudflare supports CNAME flattening, so a CNAME record at the apex works fine (unlike standard DNS).

---

## Task 2: Cloudflare — Configure DNS Records

**Context:** Point the domain to Zeabur's servers via CNAME records. Cloudflare's proxy (orange cloud) provides DDoS protection, CDN caching for static assets, and automatic SSL.

**Step 1: Log into Cloudflare Dashboard**

1. Go to https://dash.cloudflare.com
2. Select domain `tktmanager.com`
3. Navigate to DNS → Records

**Step 2: Add DNS records**

Create these three CNAME records:

| Type | Name | Target | Proxy |
|------|------|--------|-------|
| CNAME | `@` (root) | `<frontend-zeabur-cname>` | Proxied (orange cloud) |
| CNAME | `www` | `<frontend-zeabur-cname>` | Proxied (orange cloud) |
| CNAME | `api` | `<backend-zeabur-cname>` | Proxied (orange cloud) |

> **Why Proxied?** Cloudflare proxy gives: CDN caching for frontend static assets, DDoS protection, automatic SSL certificate management, HTTP/3, and Brotli compression — all free. The tradeoff is WebSocket connections need explicit Cloudflare support (enabled by default on free plan).

**Step 3: Verify DNS propagation**

Wait 1-5 minutes, then verify:
```bash
dig tktmanager.com +short
dig api.tktmanager.com +short
dig www.tktmanager.com +short
```

Expected: Cloudflare IP addresses (since proxy is enabled, you'll see CF IPs, not Zeabur IPs)

---

## Task 3: Cloudflare — SSL/TLS & Security Configuration

**Context:** Both Cloudflare and Zeabur provide SSL. We need them to work together properly to avoid redirect loops or mixed content issues.

**Step 1: Set SSL/TLS mode to "Full (Strict)"**

1. Cloudflare Dashboard → SSL/TLS → Overview
2. Set encryption mode to **Full (strict)**

> **Why Full (strict)?** Zeabur provides valid origin certificates. "Full (strict)" means Cloudflare validates the origin cert, preventing MITM between Cloudflare and Zeabur. "Flexible" would cause infinite redirect loops because Zeabur expects HTTPS.

**Step 2: Enable Always Use HTTPS**

1. SSL/TLS → Edge Certificates
2. Enable "Always Use HTTPS" → ON

**Step 3: Enable HSTS (optional but recommended)**

1. SSL/TLS → Edge Certificates → HTTP Strict Transport Security (HSTS)
2. Enable with:
   - Max-Age: 6 months (15768000)
   - Include subdomains: Yes
   - Preload: No (enable later once stable)
   - No-Sniff: Yes

**Step 4: Set Minimum TLS Version**

1. SSL/TLS → Edge Certificates
2. Minimum TLS Version: **TLS 1.2**

---

## Task 4: Cloudflare — www Redirect & Page Rules

**Context:** Users typing `www.tktmanager.com` should be redirected to `tktmanager.com` (canonical URL). This is an SEO and consistency best practice.

**Step 1: Create redirect rule for www**

1. Cloudflare Dashboard → Rules → Redirect Rules
2. Create rule:
   - **Name:** "www to apex redirect"
   - **When:** Hostname equals `www.tktmanager.com`
   - **Then:** Dynamic redirect to `https://tktmanager.com${http.request.uri.path}`
   - **Status code:** 301 (permanent)
   - **Preserve query string:** Yes

---

## Task 5: Verify Zeabur Deployment Health

**Context:** After DNS is connected, verify both services respond correctly through the custom domain.

**Step 1: Check backend health**

```bash
curl -s https://api.tktmanager.com/health | jq .
```

Expected:
```json
{
  "status": "healthy",
  "environment": "production",
  "version": "0.9.0"
}
```

**Step 2: Check frontend loads**

```bash
curl -s -o /dev/null -w "%{http_code}" https://tktmanager.com
```

Expected: `200`

**Step 3: Check CORS headers**

```bash
curl -s -I -X OPTIONS https://api.tktmanager.com/api/v1/alliances \
  -H "Origin: https://tktmanager.com" \
  -H "Access-Control-Request-Method: GET"
```

Expected: `Access-Control-Allow-Origin: https://tktmanager.com`

**Step 4: Check SSL certificate chain**

```bash
echo | openssl s_client -connect tktmanager.com:443 -servername tktmanager.com 2>/dev/null | openssl x509 -noout -subject -issuer -dates
```

Expected: Valid certificate issued by Cloudflare (or Let's Encrypt via Zeabur, depending on proxy mode)

---

## Task 6: Supabase — Update Auth Redirect URLs

**Context:** Supabase Auth needs to know which URLs are allowed for OAuth redirects. Without this, Google login will fail with `redirect_uri_mismatch`.

**Step 1: Update Supabase Site URL**

1. Go to Supabase Dashboard → Project Settings → Authentication → URL Configuration
2. Set **Site URL** to: `https://tktmanager.com`

**Step 2: Add redirect URLs**

In the same page, add to **Redirect URLs**:
```
https://tktmanager.com/auth/callback
https://tktmanager.com/**
```

> **Note:** Keep `http://localhost:5187/**` for local development.

**Step 3: Verify OAuth redirect**

The frontend uses `window.location.origin` dynamically:
```typescript
// frontend/src/contexts/AuthContext.tsx:62
redirectTo: `${window.location.origin}/auth/callback`
```

This means it will automatically use `https://tktmanager.com/auth/callback` in production — no code change needed.

---

## Task 7: Google Cloud Console — Update OAuth Client

**Context:** If Google OAuth is configured, the redirect URI must match exactly. Supabase handles the OAuth flow, so the redirect goes through Supabase's callback endpoint.

**Step 1: Update authorized redirect URIs**

1. Go to Google Cloud Console → APIs & Services → Credentials
2. Find the OAuth 2.0 Client ID used for this project
3. Under "Authorized redirect URIs", ensure this is present:
   ```
   https://kseaylvmxjpbqahtlypb.supabase.co/auth/v1/callback
   ```
   (This should already be configured — Supabase's callback URL doesn't change with custom domain)

**Step 2: Update authorized JavaScript origins (if present)**

Add:
```
https://tktmanager.com
```

**Step 3: Test Google login flow**

1. Open `https://tktmanager.com` in an incognito window
2. Click "Sign in with Google"
3. Complete the OAuth flow
4. Verify redirect back to `https://tktmanager.com/auth/callback` → Dashboard

---

## Task 8: LINE Developer Console — Update Webhook URL

**Context:** The LINE Bot webhook must point to the custom domain. Without this, LINE messages won't reach the backend.

**Step 1: Update webhook URL**

1. Go to LINE Developers Console → Provider → Channel (Messaging API)
2. Navigate to Messaging API tab → Webhook settings
3. Set Webhook URL to:
   ```
   https://api.tktmanager.com/api/v1/webhook
   ```
4. Click "Verify" to test the connection
5. Ensure "Use webhook" is enabled

**Step 2: Verify webhook delivery**

Send a test message to the LINE Bot and check backend logs for successful webhook receipt.

---

## Task 9: LINE Developer Console — Update LIFF Endpoint URL

**Context:** LIFF apps open within LINE and load a web page. The endpoint URL must match the custom domain.

**Step 1: Update LIFF endpoint**

1. Go to LINE Developers Console → Provider → Channel (LINE Login)
2. Find LIFF app (ID: `2008810240-GTGc1ByP`)
3. Update Endpoint URL to:
   ```
   https://tktmanager.com/liff
   ```

**Step 2: Verify LIFF opens correctly**

Open a LIFF link in LINE chat and verify the page loads from `tktmanager.com`.

---

## Task 10: Recur Dashboard — Update Webhook URL

**Context:** Recur sends payment notifications to the webhook endpoint. Must point to the custom domain.

**Step 1: Update webhook endpoint**

1. Go to Recur Dashboard → Developers → Webhooks
2. Find existing webhook (or create new)
3. Set URL to:
   ```
   https://api.tktmanager.com/api/v1/webhooks/recur
   ```
4. Ensure events include: `checkout.completed`

> **Note:** If you create a new webhook, you'll get a new signing secret — update `RECUR_WEBHOOK_SECRET` in Zeabur backend env vars.

---

## Task 11: Documentation — Update RUNBOOK.md

**Files:**
- Modify: `docs/RUNBOOK.md`

**Context:** RUNBOOK.md still has placeholder `zeabur.app` URLs. Update to reflect the actual custom domain.

**Step 1: Update all domain references**

Replace all `your-*-domain.zeabur.app` placeholders with actual domains:

In `docs/RUNBOOK.md`, make these replacements:

```
your-frontend-domain.zeabur.app → tktmanager.com
your-backend-domain.zeabur.app  → api.tktmanager.com
your-backend.zeabur.app         → api.tktmanager.com
your-frontend.zeabur.app        → tktmanager.com
```

**Step 2: Add Cloudflare section**

Add a "Domain & DNS" section after the deployment architecture:

```markdown
## Domain & DNS

| Service | Domain | Provider |
|---------|--------|----------|
| Frontend | `tktmanager.com` | Cloudflare DNS → Zeabur |
| Backend API | `api.tktmanager.com` | Cloudflare DNS → Zeabur |
| Database | `kseaylvmxjpbqahtlypb.supabase.co` | Supabase |

**Cloudflare Settings:**
- SSL/TLS: Full (strict)
- Always HTTPS: Enabled
- www → apex redirect: 301
- Proxy: Enabled (orange cloud) on all records

**DNS Management:** Cloudflare Dashboard → tktmanager.com → DNS
```

**Step 3: Update the architecture diagram**

```markdown
## Deployment Architecture

```
┌─────────────┐     ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Cloudflare │────→│    Frontend     │────→│    Backend      │────→│    Supabase     │
│  DNS + CDN  │     │   (Zeabur)      │     │   (Zeabur)      │     │  (PostgreSQL)   │
│  tktmanager │     │   Nginx + React │     │   FastAPI       │     │   + RLS         │
│    .com     │     │   Port: 443     │     │   Port: 8087    │     │                 │
└─────────────┘     └─────────────────┘     └─────────────────┘     └─────────────────┘
```
```

**Step 4: Commit**

```bash
git add docs/RUNBOOK.md
git commit -m "docs: update RUNBOOK with custom domain configuration"
```

---

## Task 12: Documentation — Update frontend/.env.example

**Files:**
- Modify: `frontend/.env.example`

**Context:** The `.env.example` still references `zeabur.app` in a comment. Update for clarity.

**Step 1: Update production URL comment**

In `frontend/.env.example`, update the comment that references `three-kingdoms-strategy-api.zeabur.app`:

```
# Production: https://api.tktmanager.com
```

**Step 2: Commit**

```bash
git add frontend/.env.example
git commit -m "docs: update env example with production domain"
```

---

## Task 13: End-to-End Verification Checklist

**Context:** Final verification that all integrations work through the custom domain. Run through each flow manually.

**Checklist:**

- [ ] `https://tktmanager.com` loads the landing page
- [ ] `https://www.tktmanager.com` redirects to `https://tktmanager.com`
- [ ] `https://api.tktmanager.com/health` returns healthy status
- [ ] Google OAuth login works (sign in → callback → dashboard)
- [ ] API calls from frontend reach backend (check Network tab, no CORS errors)
- [ ] LINE Bot webhook receives messages (send test message, check logs)
- [ ] LIFF app opens correctly within LINE
- [ ] CSV upload works through the UI
- [ ] Recur checkout page loads (if configured)

**Debugging tips if something fails:**

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| ERR_TOO_MANY_REDIRECTS | Cloudflare SSL mode is "Flexible" | Change to "Full (strict)" |
| CORS error in browser | CORS_ORIGINS doesn't match domain | Update `CORS_ORIGINS` in Zeabur backend env |
| Google OAuth redirect_uri_mismatch | Missing redirect URI in Google Console | Add Supabase callback URL |
| LINE webhook verify fails | DNS not propagated yet | Wait 5 min and retry |
| 502 Bad Gateway | Zeabur service not running | Check Zeabur deployment status |
| Mixed Content warnings | HTTP resources loaded on HTTPS page | Ensure all URLs use `https://` |

---

## Summary: What Changes Where

### Code Changes (2 files)
| File | Change |
|------|--------|
| `docs/RUNBOOK.md` | Replace placeholder URLs, add Cloudflare section |
| `frontend/.env.example` | Update production URL comment |

### External Service Configuration (no code)
| Service | What to Configure |
|---------|------------------|
| **Zeabur** | Add custom domains to frontend + backend services |
| **Cloudflare** | 3 CNAME records + SSL Full Strict + www redirect |
| **Supabase** | Site URL + redirect URLs |
| **Google Cloud** | Authorized JavaScript origins |
| **LINE Developers** | Webhook URL + LIFF endpoint URL |
| **Recur** | Webhook endpoint URL |

### Environment Variables (already correct)
All `.env.zeabur` files already reference `tktmanager.com` — no changes needed.
