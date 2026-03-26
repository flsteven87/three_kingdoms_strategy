# Recur 金流上線行動計畫

> Generated: 2026-03-26
> Status: In Progress
> Checklist Source: https://recur.tw/resources/checklists/technical-integration

---

## Overview

Based on Recur's three official checklists (Technical Integration 31 items, Payment Review 20 items, Subscription Launch 27 items), we identified **8 gaps** blocking production go-live. This plan addresses each gap with specific implementation steps, ordered by priority.

**Current state**: Code integration is solid (SDK, checkout, webhook, entitlements all working). Gaps are in security, testing, compliance, and observability.

---

## ~~Gap 1: Secret Key Exposed in Git~~ — FALSE POSITIVE ✅

**Status**: NOT AN ISSUE — `.env.zeabur` was never committed to git. Already in `.gitignore`.

### Action Items

- [ ] **1.1** Remove `.env.zeabur` from git tracking
  ```bash
  git rm --cached backend/.env.zeabur
  echo "backend/.env.zeabur" >> .gitignore
  ```

- [ ] **1.2** Clean secret from git history (BFG or git filter-repo)
  ```bash
  # Option A: BFG Repo-Cleaner (simpler)
  bfg --delete-files .env.zeabur
  git reflog expire --expire=now --all && git gc --prune=now --aggressive

  # Option B: git filter-repo
  git filter-repo --invert-paths --path backend/.env.zeabur
  ```
  > Note: This rewrites history. Coordinate with any collaborators before force-pushing.

- [ ] **1.3** Rotate ALL exposed credentials
  | Secret | Where to rotate | Where to update |
  |--------|----------------|-----------------|
  | `RECUR_SECRET_KEY` | Recur Dashboard → API Keys | Zeabur env vars |
  | `RECUR_WEBHOOK_SECRET` | Recur Dashboard → Webhooks | Zeabur env vars |
  | `SUPABASE_SERVICE_KEY` | Supabase Dashboard → Settings → API | Zeabur env vars |
  | `SECRET_KEY` (JWT) | Generate new: `openssl rand -hex 32` | Zeabur env vars |
  | `LINE_CHANNEL_SECRET` | LINE Developers Console | Zeabur env vars |
  | `LINE_CHANNEL_ACCESS_TOKEN` | LINE Developers Console (re-issue) | Zeabur env vars |

- [ ] **1.4** Verify `.env.zeabur` is NOT in latest commit
  ```bash
  git log --all --full-history -- backend/.env.zeabur
  # Should return empty after cleanup
  ```

- [ ] **1.5** Document secret management in RUNBOOK
  - All production secrets managed exclusively via Zeabur Dashboard env vars
  - `.env.zeabur` is local-only template, never committed
  - Add `.env.zeabur` to `.gitignore` permanently

### Verification
- [ ] `git show HEAD:backend/.env.zeabur` returns error (not tracked)
- [ ] `grep -r "sk_test_\|sk_live_" --include="*.py" --include="*.ts" --include="*.json"` returns nothing
- [ ] Old keys no longer authenticate against Recur/Supabase APIs

---

## Gap 2: Sandbox End-to-End Testing — CRITICAL

**Checklist ref**: ti-test-2, ti-test-3, ti-test-4
**Risk**: Payment flow has never been tested end-to-end in sandbox

### Prerequisites
- Backend running on `localhost:8087`
- Frontend running on `localhost:5187`
- Sandbox keys configured (already done: `pk_test_*` / `sk_test_*`)

### Action Items

- [ ] **2.1** Test webhook signature verification via curl
  ```bash
  # Generate valid signature
  PAYLOAD='{"id":"evt_test_001","type":"checkout.completed","data":{"externalCustomerId":"<USER_UUID>:1","customerEmail":"test@example.com"}}'
  SECRET="<RECUR_WEBHOOK_SECRET>"
  SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$SECRET" -binary | base64)

  # Test valid signature (expect 200)
  curl -X POST http://localhost:8087/api/v1/webhooks/recur \
    -H "Content-Type: application/json" \
    -H "X-Recur-Signature: $SIGNATURE" \
    -d "$PAYLOAD"

  # Test invalid signature (expect 401)
  curl -X POST http://localhost:8087/api/v1/webhooks/recur \
    -H "Content-Type: application/json" \
    -H "X-Recur-Signature: invalid_signature_here" \
    -d "$PAYLOAD"
  ```

- [ ] **2.2** Test idempotency (send same event twice)
  ```bash
  # Send same event_id twice — second call should return {"success": true, "duplicate": true}
  # Use same curl as 2.1 with identical payload
  ```

- [ ] **2.3** Test full checkout flow in browser
  1. Login to app at `localhost:5187`
  2. Navigate to `/purchase`
  3. Click "buy season" button
  4. Use test card: `4147-6310-0000-0001`, any future expiry, any CVC
  5. Verify success banner appears
  6. Verify `GET /api/v1/season-quota` shows `purchased_seasons` incremented
  7. Verify `webhook_events` table has new record

- [ ] **2.4** Test payment failure flow
  1. Use failure test card: `4147-6310-0000-0002` (3D verification fail)
  2. Verify error message appears in UI
  3. Verify user can retry with different card

- [ ] **2.5** Test quota enforcement after purchase
  1. After successful purchase, activate a season
  2. Verify `used_seasons` increments
  3. Verify `available_seasons` decrements
  4. If `available_seasons = 0`, verify user cannot activate another season

- [ ] **2.6** Test trial flow (new user)
  1. Create a new alliance (no purchases, no activated seasons)
  2. Verify `has_trial_available = true`
  3. Activate a season (should be marked as trial)
  4. Verify `current_season_is_trial = true` with `trial_days_remaining = 14`
  5. Verify `can_write = true` during trial

### Verification
- [ ] All 6 test scenarios pass
- [ ] `webhook_events` table has correct audit records
- [ ] No console errors in browser during checkout

---

## Gap 3: Missing Legal/Policy Pages — BLOCKER for PAYUNi Review

**Checklist ref**: Payment Review checklist — mandatory policy pages
**Risk**: PAYUNi will reject the application without these pages

### Required Pages

| Page | Route | Content Required |
|------|-------|-----------------|
| Privacy Policy | `/privacy` | Personal data collection, usage, storage, third-party sharing, user rights |
| Terms of Service | `/terms` | Service description, user obligations, liability, dispute resolution, no-refund clause |

### Action Items

- [ ] **3.1** Create Privacy Policy page (`frontend/src/pages/PrivacyPolicy.tsx`)
  Must include:
  - What data we collect (email, game stats, alliance data)
  - How we use it (service provision, analytics)
  - Third-party services (Supabase, Recur/PAYUNi, LINE)
  - Data retention policy
  - User rights (access, deletion, portability)
  - Contact information
  - Cookie usage disclosure

- [ ] **3.2** Create Terms of Service page (`frontend/src/pages/TermsOfService.tsx`)
  Must include:
  - Service description (Three Kingdoms Strategy Manager)
  - Account registration and responsibilities
  - Payment terms (one-time purchase, NT$999/season)
  - Intellectual property
  - Limitation of liability
  - Termination conditions
  - Governing law (Taiwan)

- [ ] **3.3** Create Refund Policy page (`frontend/src/pages/RefundPolicy.tsx`)
  Must include:
  - Refund eligibility conditions
  - Refund request process
  - Timeline for refund processing
  - Non-refundable scenarios
  - Contact method for refund requests

- [ ] **3.4** Add routes to React Router
  ```tsx
  // Public routes, no auth required
  <Route path="/privacy" element={<PrivacyPolicy />} />
  <Route path="/terms" element={<TermsOfService />} />
  <Route path="/refund" element={<RefundPolicy />} />
  ```

- [ ] **3.5** Add footer links to policy pages
  - Add footer component with links to all three policy pages
  - Display on all public pages (login, purchase, landing)

- [ ] **3.6** Add policy links to checkout flow
  - Add "By purchasing, you agree to our Terms of Service and Privacy Policy" text
  - Link to `/terms` and `/privacy` near the purchase button

### Verification
- [ ] All three pages accessible at their routes without login
- [ ] Content is complete and in Traditional Chinese
- [ ] Links visible in footer and checkout flow
- [ ] Pages render correctly on mobile

---

## Gap 4: Error Monitoring — HIGH

**Checklist ref**: ti-webhook-5, ti-golive-3
**Risk**: Payment failures in production go unnoticed until users complain

### Action Items

- [ ] **4.1** Add structured logging for payment events
  Create a dedicated payment event logger that outputs JSON for easier parsing:
  ```python
  # backend/src/utils/payment_logger.py
  # Structured log entries for: payment_success, payment_failed, webhook_invalid, quota_changed
  ```

- [ ] **4.2** Add webhook failure alerting (lightweight approach)
  Since we're on Zeabur without Sentry, use one of:

  **Option A** — Zeabur runtime logs + external log drain (if supported)
  **Option B** — Discord/LINE webhook notification on payment failure
  ```python
  # In payment_service.py, on critical errors:
  # Send notification to admin LINE/Discord channel
  ```
  **Option C** — Sentry free tier (10K events/month)
  ```bash
  cd backend && uv add sentry-sdk[fastapi]
  ```
  ```python
  # In main.py:
  import sentry_sdk
  sentry_sdk.init(dsn=settings.sentry_dsn, traces_sample_rate=0.1)
  ```

- [ ] **4.3** Add health check for webhook endpoint
  ```python
  # GET /api/v1/webhooks/health — returns last webhook received timestamp
  # Alert if no webhook received in >24h during active usage
  ```

- [ ] **4.4** Fix silent audit record failure (existing bug)
  **File**: `backend/src/services/payment_service.py` lines 118-129
  Currently swallows exception when audit record write fails.
  Change to: log at CRITICAL level + optionally notify admin.

### Verification
- [ ] Payment failure triggers visible notification (logs, Discord, or Sentry)
- [ ] Can query Zeabur logs for `payment_success` / `payment_failed` events
- [ ] Audit record failure no longer silently swallowed

---

## Gap 5: Contact Information on Website — MEDIUM

**Checklist ref**: Payment Review — customer support channels
**Risk**: PAYUNi review requires visible contact information

### Action Items

- [ ] **5.1** Add contact information to footer or dedicated contact section
  Required:
  - Email address
  - At least one real-time channel (LINE Official Account recommended)
  - Customer support response time expectation

- [ ] **5.2** Add operator/business information to website
  For individual application:
  - Operator name visible on site
  - Valid contact email
  - Contact phone number

### Verification
- [ ] Contact info visible on public pages
- [ ] Email link is clickable and correct

---

## Gap 6: Product/Pricing Description Page — MEDIUM

**Checklist ref**: Payment Review — product description, Subscription Launch — plan benefits
**Risk**: Unclear pricing reduces conversion and may delay PAYUNi review

### Action Items

- [ ] **6.1** Enhance PurchaseSeason page or create dedicated pricing section
  Must clearly show:
  - What the user gets (1 season = full analytics, CSV upload, member tracking)
  - Price: NT$999 per season (one-time)
  - Trial: 14-day free trial for first season
  - What happens after trial expires (read-only access)
  - Payment method: Credit card (VISA, JCB)

- [ ] **6.2** Add feature comparison (free trial vs purchased)
  | Feature | Trial (14 days) | Purchased |
  |---------|-----------------|-----------|
  | CSV Upload | ✅ | ✅ |
  | Analytics | ✅ | ✅ |
  | Duration | 14 days | Unlimited |
  | Seasons | 1 | Per purchase |

### Verification
- [ ] Pricing is clear and unambiguous
- [ ] Trial terms are explicitly stated
- [ ] Accessible without login

---

## Gap 7: Production Key Switch — FINAL STEP

**Checklist ref**: ti-golive-1, ti-golive-2
**Prerequisite**: Gaps 1-6 resolved, sandbox testing passed

### Action Items

- [ ] **7.1** Get production keys from Recur Dashboard
  1. Login to https://dashboard.recur.tw
  2. Switch to Live mode
  3. Copy `pk_live_*` (publishable) and `sk_live_*` (secret)

- [ ] **7.2** Update Zeabur environment variables
  | Variable | Service | New Value |
  |----------|---------|-----------|
  | `VITE_RECUR_PUBLISHABLE_KEY` | Frontend | `pk_live_*` |
  | `RECUR_SECRET_KEY` | Backend | `sk_live_*` |
  | `RECUR_WEBHOOK_SECRET` | Backend | New webhook secret from Dashboard |

- [ ] **7.3** Set production Webhook URL in Recur Dashboard
  ```
  URL: https://api.tktmanager.com/api/v1/webhooks/recur
  Events: checkout.completed, order.paid, order.payment_failed
  ```

- [ ] **7.4** Small-scale production verification
  1. Make a real NT$999 purchase with your own card
  2. Verify webhook received and quota updated
  3. Verify season can be activated
  4. Refund the test transaction via Recur Dashboard

- [ ] **7.5** Confirm no test keys remain in production
  ```bash
  # On Zeabur, verify all env vars start with pk_live_ / sk_live_
  # No pk_test_ / sk_test_ in production
  ```

### Verification
- [ ] Real payment completes end-to-end
- [ ] Webhook fires and is processed correctly
- [ ] Refund processes successfully
- [ ] No test keys in production environment

---

## Gap 8: Payment Audit Record Bug — LOW

**Checklist ref**: ti-webhook-4 (idempotency robustness)
**File**: `backend/src/services/payment_service.py`

### Problem
Lines 118-129: When `update_event_details()` fails, exception is caught and logged but silently swallowed. Payment succeeds but audit trail is incomplete.

### Action Items

- [ ] **8.1** Change exception handling to log at CRITICAL level
  ```python
  except Exception:
      logger.critical(
          "AUDIT RECORD FAILED - payment processed but not recorded. "
          "event_id=%s, user_id=%s, quantity=%s — MANUAL RECONCILIATION NEEDED",
          event_id, user_id, quantity
      )
      # Don't re-raise — payment was already granted, re-raising would cause
      # Recur to retry and hit idempotency gate, making it look like a duplicate
  ```

- [ ] **8.2** Add admin notification on audit failure (if Gap 4 alerting is implemented)

### Verification
- [ ] Audit failure produces CRITICAL log entry
- [ ] Payment still succeeds (correct behavior — user paid, don't block)

---

## Execution Order

```
Phase 1: Security (Day 1)
  └─ Gap 1: Remove .env.zeabur + rotate keys

Phase 2: Testing (Day 1-2)
  └─ Gap 2: Sandbox E2E testing (start backend/frontend, run all scenarios)
  └─ Gap 8: Fix audit record bug (quick fix during testing)

Phase 3: Compliance (Day 2-3)
  └─ Gap 3: Legal pages (Privacy, Terms, Refund)
  └─ Gap 5: Contact information
  └─ Gap 6: Pricing description

Phase 4: Observability (Day 3)
  └─ Gap 4: Error monitoring setup

Phase 5: Go Live (Day 4)
  └─ Gap 7: Switch to production keys + real payment test
```

---

## Done Criteria

All items checked off, specifically:
- [ ] No secrets in git history
- [ ] Sandbox E2E test passed (checkout + webhook + failure + quota)
- [ ] Privacy Policy, Terms of Service, Refund Policy pages live
- [ ] Contact info visible on site
- [ ] Error monitoring active
- [ ] Production keys configured
- [ ] Real payment test completed and refunded
