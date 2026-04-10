---
name: recur-checkout
description: Implement Recur checkout flows including embedded, modal, and redirect modes. Use when adding payment buttons, checkout forms, subscription purchase flows, or when user mentions "checkout", "結帳", "付款按鈕", "embedded checkout".
license: Elastic-2.0
metadata:
  author: recur
  version: "0.1.0"
  stack: "FastAPI + React"
---

# Recur Checkout Integration

You are helping implement Recur checkout flows. Recur supports multiple checkout modes for different use cases.

**This project uses FastAPI (Python) + React (TypeScript).** All examples match this stack.

## Checkout Modes

| Mode | Best For | User Experience |
|------|----------|-----------------|
| `modal` | Quick purchases (default) | Form appears in a dialog overlay |
| `embedded` | SPA apps | Form renders inline in your page |
| `redirect` | Simple integration | Full page redirect to Recur hosted page |

## Basic Implementation (React)

### Using useRecur Hook

```tsx
import { useRecur } from 'recur-tw'

interface CheckoutButtonProps {
  readonly productId: string
  readonly userEmail: string
  readonly userId: string
}

function CheckoutButton({ productId, userEmail, userId }: CheckoutButtonProps) {
  const { checkout, isLoading } = useRecur()

  const handleClick = async () => {
    await checkout({
      productId,
      // Or use productSlug: 'pro-plan'

      // Pre-fill customer info from auth
      customerEmail: userEmail,
      externalCustomerId: userId,

      // Callbacks
      onPaymentComplete: (result) => {
        // result.id - Subscription/Order ID
        // result.status - 'ACTIVE', 'TRIALING', etc.
        console.log('Success!', result)
      },
      onPaymentFailed: (error) => {
        console.error('Failed:', error)
        return { action: 'retry' } // or 'close' or 'custom'
      },
      onPaymentCancel: () => {
        console.log('User cancelled')
      },
    })
  }

  return (
    <button onClick={handleClick} disabled={isLoading}>
      {isLoading ? '處理中...' : '訂閱'}
    </button>
  )
}
```

### Using useSubscribe Hook (with state management)

```tsx
import { useSubscribe } from 'recur-tw'
import { useNavigate } from 'react-router-dom'

function SubscribeButton({ productId }: { readonly productId: string }) {
  const { subscribe, isLoading, error, subscription } = useSubscribe()
  const navigate = useNavigate()

  const handleClick = () => {
    subscribe({
      productId,
      onPaymentComplete: () => {
        navigate('/dashboard')
      },
    })
  }

  if (subscription) {
    return <p>已訂閱！ID: {subscription.id}</p>
  }

  return (
    <>
      <button onClick={handleClick} disabled={isLoading}>
        訂閱
      </button>
      {error && <p className="text-destructive">{error.message}</p>}
    </>
  )
}
```

## Embedded Mode Setup

For embedded mode, set `checkoutMode` in RecurProvider:

```tsx
<RecurProvider
  config={{
    publishableKey: import.meta.env.VITE_RECUR_PUBLISHABLE_KEY,
    checkoutMode: 'embedded',
    containerElementId: 'recur-checkout-container',
  }}
>
  {children}
</RecurProvider>

// In your checkout page
function CheckoutPage() {
  return (
    <div>
      <h1>完成購買</h1>
      {/* Recur renders the payment form here */}
      <div id="recur-checkout-container" />
    </div>
  )
}
```

## Handling 3D Verification

Recur handles 3D Secure automatically. For redirect flows:

```tsx
await checkout({
  productId,
  successUrl: 'https://tktmanager.com/checkout/success',
  cancelUrl: 'https://tktmanager.com/checkout/cancel',
})
```

## Product Types

| Type | Billing | Use Case |
|------|---------|----------|
| `SUBSCRIPTION` | Recurring (weekly/monthly/yearly) | Ongoing subscriptions |
| `ONE_TIME` | Single payment | One-time purchases |
| `CREDITS` | Top-up | In-app credit packages |
| `DONATION` | Custom amount | Donation/contribution |

```tsx
// Subscription (recurring)
checkout({ productId: 'prod_subscription_xxx' })

// One-time purchase
checkout({ productId: 'prod_onetime_xxx' })

// Credits
checkout({ productId: 'prod_credits_xxx' })
```

### Product Metadata

Products can have family grouping for pricing tiers:
- `productFamily` — group related plans (e.g., "premium")
- `variantType` — billing variant: `WEEKLY`, `MONTHLY`, `YEARLY`, `CUSTOM`
- `isMainVariant` — primary variant in family

## Listing Products

```tsx
import { useProducts } from 'recur-tw'

function PricingPage() {
  const { products, isLoading } = useProducts({
    type: 'SUBSCRIPTION',
  })

  if (isLoading) return <div>載入中...</div>

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {products.map(product => (
        <PricingCard key={product.id} product={product} />
      ))}
    </div>
  )
}
```

## Payment Failed Handling

```tsx
onPaymentFailed: (error) => {
  switch (error.code) {
    case 'CARD_DECLINED':
    case 'PAYUNI_DECLINED':
      return { action: 'retry' }
    case 'INSUFFICIENT_FUNDS':
      return {
        action: 'custom',
        customTitle: '餘額不足',
        customMessage: '請使用其他付款方式',
      }
    case 'EXPIRED_CARD':
      return {
        action: 'custom',
        customTitle: '卡片已過期',
        customMessage: '請更換有效的信用卡',
      }
    case 'NETWORK_ERROR':
    case 'TIMEOUT':
      return { action: 'retry' }
    default:
      return { action: 'close' }
  }
}
```

### All Payment Failure Codes

```typescript
type PaymentFailureCode =
  | 'PAYUNI_DECLINED'
  | 'UNAPPROVED'
  | 'INSUFFICIENT_FUNDS'
  | 'CARD_DECLINED'
  | 'EXPIRED_CARD'
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'INVALID_CARD'
  | 'UNKNOWN'
```

## Browser Events (Alternative to Callbacks)

```tsx
useEffect(() => {
  const handleSuccess = (e: CustomEvent) => {
    const { subscriptionId, orderId } = e.detail
    console.log('Payment success:', subscriptionId || orderId)
  }

  const handleError = (e: CustomEvent) => {
    const { message, code } = e.detail
    console.error('Payment error:', code, message)
  }

  const handleClose = () => {
    console.log('Modal closed')
  }

  window.addEventListener('recur:success', handleSuccess as EventListener)
  window.addEventListener('recur:error', handleError as EventListener)
  window.addEventListener('recur:close', handleClose)

  return () => {
    window.removeEventListener('recur:success', handleSuccess as EventListener)
    window.removeEventListener('recur:error', handleError as EventListener)
    window.removeEventListener('recur:close', handleClose)
  }
}, [])
```

## Server-Side Checkout (FastAPI)

For server-controlled checkout flows:

```python
import httpx

async def create_checkout_session(
    product_id: str,
    customer_email: str,
    external_customer_id: str,
) -> str:
    """Create a Recur checkout session and return the checkout URL."""
    async with httpx.AsyncClient() as client:
        response = await client.post(
            "https://api.recur.tw/v1/checkout/sessions",
            headers={
                "X-Recur-Secret-Key": settings.recur_secret_key,
                "Content-Type": "application/json",
            },
            json={
                "productId": product_id,
                "customerEmail": customer_email,
                "externalCustomerId": external_customer_id,
                "successUrl": f"{settings.frontend_url}/checkout/success",
                "cancelUrl": f"{settings.frontend_url}/checkout/cancel",
            },
        )
        response.raise_for_status()
        data = response.json()
        return data["checkoutUrl"]
```

## Checkout Result Structure

```typescript
interface CheckoutResult {
  id: string              // Subscription or Order ID
  status: string          // 'ACTIVE', 'TRIALING', 'PENDING'
  productId: string
  amount: number          // In cents (e.g., 29900 = NT$299)
  billingPeriod?: string  // 'MONTHLY', 'YEARLY' for subscriptions
  currentPeriodEnd?: string  // ISO date
  trialEndsAt?: string    // ISO date if trial
}
```

## Checkout Options Reference

```typescript
interface CheckoutOptions {
  productId?: string              // Product ID (required unless productSlug)
  productSlug?: string            // Alternative to productId
  customerName?: string           // Pre-fill customer name
  customerEmail?: string          // Pre-fill & required at checkout
  externalCustomerId?: string     // Link to your user system
  successUrl?: string             // Redirect after success
  cancelUrl?: string              // Redirect after cancellation
  onPaymentComplete?: (result: CheckoutResult) => void
  onPaymentFailed?: (error: PaymentError) => PaymentFailedAction
  onPaymentCancel?: () => void
}
```

## Best Practices

1. **Always handle all callbacks** — `onPaymentComplete`, `onPaymentFailed`, `onPaymentCancel`
2. **Show loading states** — use `isLoading` to disable buttons during checkout
3. **Pre-fill customer info** — pass `customerEmail` and `externalCustomerId` from auth context
4. **Test in sandbox** — use `pk_test_*` keys during development
5. **Cleanup event listeners** — always return cleanup in `useEffect`

## Related Skills

- `/recur-quickstart` - Initial SDK setup
- `/recur-webhooks` - Receive payment notifications (FastAPI handler)
- `/recur-entitlements` - Check subscription access
