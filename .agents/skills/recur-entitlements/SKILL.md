---
name: recur-entitlements
description: Implement access control and permission checking with Recur entitlements API. Use when building paywalls, checking subscription status, gating premium features, or when user mentions "paywall", "權限檢查", "entitlements", "access control", "premium features".
license: Elastic-2.0
metadata:
  author: recur
  version: "0.1.0"
  stack: "FastAPI + React"
---

# Recur Entitlements & Access Control

You are helping implement access control using Recur's entitlements system. Entitlements let you check if a customer has access to your products (subscriptions or one-time purchases).

**This project uses FastAPI (Python) + React (TypeScript).** All examples match this stack.

## Quick Start: Client-Side Check (React)

```tsx
import { RecurProvider, useCustomer } from 'recur-tw'

// 1. Wrap app with provider and identify customer
function App() {
  const { user } = useAuth()

  return (
    <RecurProvider
      config={{ publishableKey: import.meta.env.VITE_RECUR_PUBLISHABLE_KEY }}
      customer={{ email: user.email }}
    >
      <Routes />
    </RecurProvider>
  )
}

// 2. Check access anywhere in your app
function PremiumFeature() {
  const { check, isLoading } = useCustomer()

  if (isLoading) return <div>載入中...</div>

  const { allowed } = check('pro-plan')

  if (!allowed) {
    return <UpgradePrompt />
  }

  return <PremiumContent />
}
```

> **Warning:** Client-side checks can be bypassed. Always verify on the backend for sensitive operations.

## Customer Identification

Identify customers using one of these methods:

```tsx
// By email (most common)
<RecurProvider customer={{ email: user.email }}>

// By your system's user ID
<RecurProvider customer={{ externalId: user.id }}>

// By Recur customer ID
<RecurProvider customer={{ id: 'cus_xxx' }}>
```

## Checking Access (React)

### Synchronous Check (Cached)

Fast, uses cached data. Good for UI rendering.

```tsx
const { check } = useCustomer()

// Check by product slug
const { allowed, entitlement } = check('pro-plan')

// Check by product ID
const { allowed } = check('prod_xxx')

if (allowed) {
  // User has access
  // entitlement contains details like status, expiresAt
}
```

### Async Check (Live)

Fetches fresh data from API. Use for critical operations.

```tsx
const { check } = useCustomer()

// Real-time check — good for:
// - Before processing important actions
// - After checkout to confirm access
// - When cached data might be stale
const { allowed, entitlement } = await check('pro-plan', { live: true })
```

### Manual Refetch

```tsx
const { refetch } = useCustomer()

// After checkout completion
onPaymentComplete: async () => {
  await refetch() // Refresh entitlements
  navigate('/dashboard')
}
```

## Entitlement Response Structure

```typescript
interface Entitlement {
  product: string          // Product slug
  productId: string        // Product ID
  status: EntitlementStatus
  source: 'subscription' | 'order'  // How they got access
  sourceId: string         // Subscription/Order ID
  grantedAt: string        // When access was granted
  expiresAt: string | null // When access expires (null = permanent)
}

type EntitlementStatus =
  | 'active'      // Subscription active
  | 'trialing'    // In trial period
  | 'past_due'    // Payment failed, in grace period
  | 'canceled'    // Cancelled but access until period end
  | 'purchased'   // One-time purchase (permanent)
```

## Server-Side Checking (FastAPI)

### Using REST API (Python)

```python
# src/services/entitlement_service.py
import httpx
import logging

from src.core.config import get_settings

logger = logging.getLogger(__name__)


class EntitlementService:
    """Check Recur entitlements server-side."""

    def __init__(self):
        self._settings = get_settings()

    async def check_access(
        self,
        product: str,
        *,
        email: str | None = None,
        external_id: str | None = None,
    ) -> bool:
        """Check if a customer has access to a product."""
        params: dict[str, str] = {"product": product}
        if email:
            params["email"] = email
        elif external_id:
            params["externalId"] = external_id
        else:
            raise ValueError("Must provide email or external_id")

        async with httpx.AsyncClient() as client:
            response = await client.get(
                "https://api.recur.tw/v1/customers/entitlements",
                params=params,
                headers={
                    "X-Recur-Secret-Key": self._settings.recur_secret_key,
                },
            )
            response.raise_for_status()
            data = response.json()
            return data.get("allowed", False)

    async def get_entitlements(
        self,
        *,
        email: str | None = None,
        external_id: str | None = None,
    ) -> list[dict]:
        """Get all entitlements for a customer."""
        params: dict[str, str] = {}
        if email:
            params["email"] = email
        elif external_id:
            params["externalId"] = external_id

        async with httpx.AsyncClient() as client:
            response = await client.get(
                "https://api.recur.tw/v1/customers/entitlements",
                params=params,
                headers={
                    "X-Recur-Secret-Key": self._settings.recur_secret_key,
                },
            )
            response.raise_for_status()
            data = response.json()
            return data.get("entitlements", [])
```

### FastAPI Dependency for Access Control

```python
# src/core/dependencies.py
from fastapi import Depends, HTTPException

from src.services.entitlement_service import EntitlementService


async def require_subscription(
    product: str,
    user_email: str,
    entitlement_service: EntitlementService = Depends(get_entitlement_service),
) -> None:
    """FastAPI dependency that requires an active subscription."""
    has_access = await entitlement_service.check_access(
        product,
        email=user_email,
    )
    if not has_access:
        raise HTTPException(
            status_code=403,
            detail={
                "error": "subscription_required",
                "message": "此功能需要訂閱才能使用",
                "product": product,
            },
        )


# Usage in endpoint
@router.get("/premium-data")
async def get_premium_data(
    current_user: User = Depends(get_current_user),
    _: None = Depends(lambda: require_subscription("pro-plan", current_user.email)),
):
    return {"data": "premium content"}
```

## Common Patterns (React)

### Paywall Component

```tsx
interface PaywallProps {
  readonly children: React.ReactNode
  readonly product: string
  readonly fallback?: React.ReactNode
}

function Paywall({ children, product, fallback }: PaywallProps) {
  const { check, isLoading } = useCustomer()

  if (isLoading) return <div>載入中...</div>

  const { allowed } = check(product)

  if (!allowed) {
    return fallback || <UpgradePrompt product={product} />
  }

  return <>{children}</>
}

// Usage
<Paywall product="pro-plan">
  <PremiumDashboard />
</Paywall>
```

### Feature Flag Hook

```tsx
function useFeature(featureProduct: string) {
  const { check, isLoading } = useCustomer()

  if (isLoading) {
    return { enabled: false, loading: true }
  }

  const { allowed, entitlement } = check(featureProduct)

  return {
    enabled: allowed,
    loading: false,
    entitlement,
    isTrial: entitlement?.status === 'trialing',
    isPastDue: entitlement?.status === 'past_due',
    isCanceled: entitlement?.status === 'canceled',
  }
}

// Usage
function MyComponent() {
  const { enabled, isTrial } = useFeature('pro-plan')

  if (!enabled) return <UpgradeButton />

  return (
    <>
      {isTrial && <TrialBanner />}
      <ProFeature />
    </>
  )
}
```

### Multiple Product Tiers

```tsx
function PricingGate() {
  const { check } = useCustomer()

  const hasEnterprise = check('enterprise-plan').allowed
  const hasPro = check('pro-plan').allowed

  if (hasEnterprise) return <EnterpriseDashboard />
  if (hasPro) return <ProDashboard />
  return <FreeDashboard />
}
```

## Handling Edge Cases

### Past Due Subscriptions

```tsx
const { allowed, entitlement } = check('pro-plan')

if (allowed && entitlement?.status === 'past_due') {
  // Show warning but allow access during grace period
  return (
    <>
      <PaymentFailedBanner />
      <PremiumContent />
    </>
  )
}
```

### Cancelled but Active

```tsx
const { entitlement } = check('pro-plan')

if (entitlement?.status === 'canceled') {
  // User cancelled but still has access until period end
  return (
    <>
      <ResubscribeBanner expiresAt={entitlement.expiresAt} />
      <PremiumContent />
    </>
  )
}
```

### Trial Subscriptions

```tsx
const { entitlement } = check('pro-plan')

if (entitlement?.status === 'trialing' && entitlement.expiresAt) {
  const trialEnds = new Date(entitlement.expiresAt)
  const daysLeft = Math.ceil((trialEnds.getTime() - Date.now()) / (1000 * 60 * 60 * 24))

  return <TrialBanner daysLeft={daysLeft} />
}
```

## Denial Reasons

When `allowed` is `false`, check the denial reason:

```tsx
const { allowed, denial } = check('pro-plan')

if (!allowed) {
  switch (denial?.reason) {
    case 'no_customer':
      return <CreateAccountPrompt />
    case 'no_entitlement':
      return <SubscribePrompt />
    case 'expired':
      return <RenewPrompt />
    case 'insufficient_balance':
      return <BuyCreditsPrompt />
    default:
      return <GenericUpgradePrompt />
  }
}
```

## Best Practices

1. **Use cached checks for UI** — fast rendering, good UX
2. **Use live checks for actions** — ensure fresh data for important operations
3. **Always verify on backend** — client-side checks are for UI only, not security
4. **Handle all statuses** — `active`, `trialing`, `past_due`, `canceled`, `purchased`
5. **Refetch after checkout** — call `refetch()` to update UI after purchase
6. **Graceful degradation** — show upgrade prompts, not error pages

## Related Skills

- `/recur-quickstart` - Initial SDK setup
- `/recur-checkout` - Implement purchase flows
- `/recur-webhooks` - Sync entitlements with webhooks (FastAPI handler)
- `/recur-portal` - Customer self-service management
