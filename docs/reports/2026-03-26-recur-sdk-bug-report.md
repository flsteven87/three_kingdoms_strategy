# Recur SDK Bug Report: ONE_TIME Product Modal Checkout Fails with 500

> **Date**: 2026-03-26
> **SDK Version**: `recur-tw@0.16.0`
> **Environment**: Sandbox (`pk_test_*`)
> **Product Type**: ONE_TIME
> **Checkout Mode**: Modal
> **Severity**: Critical — ONE_TIME products cannot complete payment in modal mode

---

## Summary

When using `recur-tw@0.16.0` SDK's `checkout()` method with a **ONE_TIME** product in **modal mode**, the payment always fails at the `/pay` step with HTTP 500. The SDK sends an **empty body `{}`** to `POST /v1/checkouts/{id}/pay`, missing the PAYUNi payment credential (creditToken). The Recur API returns `internal_server_error`.

---

## Environment

| Item | Value |
|------|-------|
| SDK | `recur-tw@0.16.0` (latest as of 2026-03-26) |
| Integration | React + `useRecur()` hook |
| Provider Config | `{ publishableKey: 'pk_test_*', checkoutMode: 'modal' }` |
| Product ID | `bmbzr9p44vj8fx5pkp3iquo2` |
| Product Type | `ONE_TIME` |
| Product Price | 999 TWD |
| Domain | `tktmanager.com` (production domain, sandbox keys) |
| Test Card | `4147 6310 0000 0001` (VISA sandbox success card) |

---

## Steps to Reproduce

1. Initialize SDK with `RecurProvider` in modal mode
2. Call `checkout()` with a ONE_TIME product:

```tsx
const { checkout } = useRecur();

await checkout({
  productId: 'bmbzr9p44vj8fx5pkp3iquo2',  // ONE_TIME product
  customerEmail: 'user@example.com',
  customerName: 'Test User',
  externalCustomerId: 'user_uuid:1',
  successUrl: 'https://example.com/success',
  mode: 'modal',  // default
  onPaymentComplete: (result) => { /* ... */ },
  onError: (err) => { /* ... */ },
});
```

3. Fill in test card `4147 6310 0000 0001`, any future expiry, any CVC
4. Click submit

**Expected**: Payment succeeds, `onPaymentComplete` fires
**Actual**: Payment fails with 500, `onError` fires with `[object Object]`

---

## Network Trace

### Request 1: Create Checkout — ✅ Success

```
POST https://api.recur.tw/v1/checkouts
```

**Request Body:**
```json
{
  "customer_name": "Steven Wu",
  "customer_email": "sunkcost587@gmail.com",
  "product_id": "bmbzr9p44vj8fx5pkp3iquo2",
  "external_customer_id": "b53b1466-4c14-43f6-96b8-af4f1ad43663:1",
  "success_url": "https://tktmanager.com/purchase?payment=success"
}
```

**Response (201 Created):**
```json
{
  "checkout": {
    "id": "psx6bjbtl3bdrybikkedv2le",
    "client_secret": "pi_secret_psx6bjbtl3bdrybikkedv2le_...",
    "status": "REQUIRES_PAYMENT_METHOD",
    "product_id": "bmbzr9p44vj8fx5pkp3iquo2",
    "product_type": "ONE_TIME",
    "amount": 999,
    "currency": "TWD"
  },
  "product": {
    "id": "bmbzr9p44vj8fx5pkp3iquo2",
    "name": "賽季額度",
    "price": 999,
    "interval": null
  },
  "sdk_token": "ade97fdb60446556f4ea541de519b1...",
  "livemode": false
}
```

**Key observation**: Response does NOT include `credit_token` or `sdk_timestamp` for ONE_TIME products.

---

### PAYUNi SDK Initialization — ✅ Success

Console confirms PAYUNi SDK loaded and initialized with sandbox token:

```
[Recur SDK] PAYUNi SDK loaded successfully
[Recur SDK] PAYUNi SDK initialized successfully
[Recur SDK] Checkout flow initialized, waiting for user input...
```

---

### Card Submission & Trade Result — ✅ Success

```
[PaymentForm] Submit button disabled: false
[Recur SDK] Form submitted via Web Component
[Recur SDK] Getting trade result from PAYUNi...
[Recur SDK] Trade result received: Object
```

PAYUNi successfully validated and tokenized the card.

---

### Request 2: Execute Payment — ❌ Fails

```
POST https://api.recur.tw/v1/checkouts/psx6bjbtl3bdrybikkedv2le/pay
```

**Request Body:**
```json
{}
```

**Response (500 Internal Server Error):**
```json
{
  "error": {
    "code": "internal_server_error",
    "message": "An unexpected error occurred"
  }
}
```

---

## Root Cause Analysis

The bug is in the SDK's `checkout()` method submit handler (found in `recur.umd.js`).

### Problematic Code (SDK `checkout()` method):

```javascript
// After PAYUNi getTradeResult() succeeds:
let timestamp = tradeResult.HashTimestamp || tradeResult.timestamp;
let payBody = {};

if (checkout.productType === "SUBSCRIPTION") {
  // Only SUBSCRIPTION sends creditToken
  payBody = {
    creditToken: checkout.creditToken,   // from checkout creation response
    timestamp: checkout.sdkTimestamp || timestamp
  };
}

// ONE_TIME products: payBody remains {} — no payment credential sent!
fetch(`/v1/checkouts/${checkoutId}/pay`, {
  method: "POST",
  body: JSON.stringify(payBody)  // {} for ONE_TIME
});
```

### Correct Code (SDK `RecurPaymentForm` web component `handleSubmit`):

The same SDK has a **different code path** in the `RecurPaymentForm` web component that correctly handles ALL product types:

```javascript
// Web component always extracts token from PAYUNi trade result:
let tradeResult = await this.payuniSDK.getTradeResult();
let creditToken = tradeResult.EncryptInfo || tradeResult.creditToken;

fetch(`/v1/checkouts/${checkoutId}/pay`, {
  method: "POST",
  body: JSON.stringify({
    creditToken: creditToken,     // Always sent, regardless of product type
    timestamp: sdkTimestamp || tradeResult.HashTimestamp || tradeResult.timestamp
  })
});
```

### The Discrepancy

| Behavior | `checkout()` method | `RecurPaymentForm` web component |
|----------|--------------------|---------------------------------|
| Token source for SUBSCRIPTION | `checkout.credit_token` (from API response) | `tradeResult.EncryptInfo` (from PAYUNi) |
| Token source for ONE_TIME | ❌ Not sent (empty body) | ✅ `tradeResult.EncryptInfo` (from PAYUNi) |
| `/pay` body for ONE_TIME | `{}` | `{ creditToken, timestamp }` |

The `checkout()` method only sends `creditToken` for SUBSCRIPTION (sourced from the checkout creation response). For ONE_TIME products, the checkout response doesn't include `credit_token`, and the method doesn't fall back to extracting it from PAYUNi's trade result — unlike the web component.

---

## Additional Issue: Error Object Serialization

When the `/pay` endpoint returns an error, the SDK creates an Error with the raw error object:

```javascript
if (!response.ok) {
  let errorData = await response.json().catch(() => ({}));
  throw new Error(errorData.error || "Failed to execute payment");
  //                ^^^^^^^^^^^^^^
  //  errorData.error is { code: "...", message: "..." } (an object)
  //  new Error(object) produces message "[object Object]"
}
```

The `onError` callback then receives `{ code: "PAYMENT_FAILED", message: "[object Object]" }`, making the error unreadable for users.

**Suggestion**: Use `errorData.error?.message || errorData.error || "Failed to execute payment"` to extract the string message from the error object.

---

## Suggested Fix

In the `checkout()` method's submit event handler, extract the creditToken from PAYUNi's trade result for ALL product types, not just SUBSCRIPTION:

```javascript
// Current (broken for ONE_TIME):
let payBody = {};
if (checkout.productType === "SUBSCRIPTION") {
  payBody = { creditToken: checkout.creditToken, timestamp: ... };
}

// Suggested fix:
let payBody = {};
if (checkout.productType === "SUBSCRIPTION") {
  payBody = { creditToken: checkout.creditToken, timestamp: sdkTimestamp || timestamp };
} else {
  // ONE_TIME: extract token from PAYUNi trade result (same as RecurPaymentForm does)
  let creditToken = tradeResult.EncryptInfo || tradeResult.creditToken;
  if (creditToken) {
    payBody = { creditToken, timestamp };
  }
}
```

This aligns the `checkout()` method behavior with the already-working `RecurPaymentForm` web component.

---

## Workaround

Until the SDK is fixed, switching to **redirect mode** bypasses the issue since payment is handled entirely on Recur's hosted checkout page:

```tsx
await checkout({
  productId: 'bmbzr9p44vj8fx5pkp3iquo2',
  mode: 'redirect',
  successUrl: 'https://tktmanager.com/purchase?payment=success',
  cancelUrl: 'https://tktmanager.com/purchase',
  customerEmail: 'user@example.com',
});
```

---

## Verification Methodology

1. **Webhook signature tests** (curl): All passed — valid/invalid/missing signatures, idempotency
2. **Browser checkout test**: Reproduced consistently on `tktmanager.com` with sandbox keys
3. **Fetch interceptor**: Injected `window.fetch` wrapper to capture full request/response payloads
4. **SDK source analysis**: Read and compared both code paths in `recur-tw@0.16.0` (`recur.umd.js`)
5. **Console log analysis**: Confirmed all steps 1-7 succeed, failure occurs at step 8 (execute payment)
6. **Backend log verification**: Confirmed no webhook received — failure is entirely client-side/Recur API

---

## Contact

- **Product**: 三國志戰略版 - 盟友表現管理 (tktmanager.com)
- **Integration**: React 19 + recur-tw@0.16.0 + useRecur hook
