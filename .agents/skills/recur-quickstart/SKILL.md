---
name: recur-quickstart
description: Quick setup guide for Recur payment integration. Use when starting a new Recur integration, setting up API keys, installing the SDK, or when user mentions "integrate Recur", "setup Recur", "Recur 串接", "金流設定".
license: Elastic-2.0
metadata:
  author: recur
  version: "0.1.0"
  stack: "FastAPI + React"
---

# Recur Quickstart

You are helping a developer integrate Recur, Taiwan's subscription payment platform (similar to Stripe Billing).

**This project uses FastAPI (Python) + React (TypeScript).** All examples match this stack.

## Step 1: Install SDK

### Frontend (React)

```bash
npm install recur-tw
```

### Backend (FastAPI)

No SDK needed — use `httpx` for API calls and `hmac` for webhook verification (both already available).

## Step 2: Get API Keys

API keys are available in the Recur dashboard at `app.recur.tw` → Settings → Developers.

**Key formats:**
- `pk_test_xxx` - Publishable key (frontend, safe to expose)
- `sk_test_xxx` - Secret key (backend only, never expose)
- `pk_live_xxx` / `sk_live_xxx` - Production keys

**Environment variables to set:**

Frontend (`.env` / Zeabur):
```bash
VITE_RECUR_PUBLISHABLE_KEY=pk_test_xxx
```

Backend (`.env` / Zeabur):
```bash
RECUR_SECRET_KEY=sk_test_xxx
RECUR_WEBHOOK_SECRET=whsec_xxx
```

> **Note:** `VITE_*` vars are build-time — frontend needs rebuild after changes.

## Step 3: Add Provider (React)

Wrap your app with `RecurProvider`:

```tsx
import { RecurProvider } from 'recur-tw'

function App({ children }: { children: React.ReactNode }) {
  return (
    <RecurProvider
      config={{
        publishableKey: import.meta.env.VITE_RECUR_PUBLISHABLE_KEY,
      }}
    >
      {children}
    </RecurProvider>
  )
}
```

## Step 4: Backend Config (FastAPI)

```python
# src/core/config.py — add to Settings class
class Settings(BaseSettings):
    recur_secret_key: str = ""
    recur_webhook_secret: str = ""
```

## Step 5: Create Your First Checkout

```tsx
import { useRecur } from 'recur-tw'

function PricingButton({ productId }: { productId: string }) {
  const { checkout, isLoading } = useRecur()

  const handleCheckout = async () => {
    await checkout({
      productId,
      customerEmail: user.email,         // Pre-fill from auth
      externalCustomerId: user.id,        // Link to your user system
      onPaymentComplete: (result) => {
        console.log('Payment successful!', result)
      },
      onPaymentFailed: (error) => {
        console.error('Payment failed:', error)
        return { action: 'retry' }
      },
    })
  }

  return (
    <button onClick={handleCheckout} disabled={isLoading}>
      {isLoading ? '處理中...' : '訂閱'}
    </button>
  )
}
```

## Step 6: Set Up Webhooks

See `/recur-webhooks` for FastAPI webhook handler with signature verification.

## Quick Verification Checklist

- [ ] `recur-tw` installed (`npm list recur-tw`)
- [ ] Environment variables set (frontend `VITE_RECUR_PUBLISHABLE_KEY`, backend `RECUR_SECRET_KEY` + `RECUR_WEBHOOK_SECRET`)
- [ ] `RecurProvider` wrapping app
- [ ] Test checkout works in sandbox (`pk_test_*` key)
- [ ] Webhook endpoint configured in Recur dashboard

## API Rate Limits

| Environment | Limit |
|------------|-------|
| Sandbox | 120 req/min |
| Production | 600 req/min |

Response headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`

## Common Issues

### "Invalid API key"
- Check key format: must start with `pk_test_`, `sk_test_`, `pk_live_`, or `sk_live_`
- Frontend uses publishable key (`pk_*`), backend uses secret key (`sk_*`)

### "Product not found"
- Verify product exists in Recur dashboard
- Check you're using correct environment (sandbox vs production)

### Checkout not appearing
- Ensure `RecurProvider` wraps your app
- Check browser console for errors
- Verify `VITE_RECUR_PUBLISHABLE_KEY` is set (requires rebuild)

## Next Steps

- `/recur-checkout` - Learn checkout flow options (modal, embedded, redirect)
- `/recur-webhooks` - Set up FastAPI webhook handler
- `/recur-entitlements` - Implement access control
- `/recur-portal` - Customer self-service portal

## Pricing

| 月營收 | 平台手續費 |
|-------|----------|
| < NT$100,000 | **免費** |
| ≥ NT$100,000 | **2.4%** (低於市場 2.8%) |

支付處理商：PAYUNi（台灣信用卡）

## Resources

- [Recur Documentation](https://docs.recur.tw/)
- [SDK on npm](https://www.npmjs.com/package/recur-tw) (latest: v0.16.0)
- [GitHub](https://github.com/kaikhq/recur.tw/)
- Support: support@recur.tw
