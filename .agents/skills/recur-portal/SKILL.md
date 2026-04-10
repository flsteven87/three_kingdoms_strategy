---
name: recur-portal
description: Implement Customer Portal for subscription self-service. Use when building account pages, letting customers manage subscriptions, update payment methods, view billing history, or when user mentions "customer portal", "帳戶管理", "訂閱管理", "更新付款方式", "self-service".
license: Elastic-2.0
metadata:
  author: recur
  version: "0.1.0"
  stack: "FastAPI + React"
---

# Recur Customer Portal Integration

You are helping implement Recur's Customer Portal, which allows subscribers to self-manage their subscriptions without contacting support.

**This project uses FastAPI (Python) + React (TypeScript).** All examples match this stack.

## What is Customer Portal?

Customer Portal is a Recur-hosted page where customers can:
- View active subscriptions and billing history
- Update payment methods
- Cancel or reactivate subscriptions
- Switch between plans (upgrade/downgrade)
- Pause/resume subscriptions

## When to Use

| Scenario | Solution |
|----------|----------|
| "Add account management page" | Create portal session and redirect |
| "Let users update their card" | Portal handles payment method updates |
| "Users need to cancel subscription" | Portal provides self-service cancellation |
| "Show billing history" | Portal displays invoices and payments |

## FastAPI: Create Portal Session

Portal sessions must be created **server-side** (requires Secret Key).

### Portal Endpoint

```python
# src/api/v1/endpoints/portal.py
import httpx
import logging

from fastapi import APIRouter, Depends, HTTPException

from src.core.auth import get_current_user
from src.core.config import Settings, get_settings
from src.models.user import User

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/portal/session")
async def create_portal_session(
    current_user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> dict:
    """Create a Recur Customer Portal session for the authenticated user."""
    async with httpx.AsyncClient() as client:
        response = await client.post(
            "https://api.recur.tw/v1/portal/sessions",
            headers={
                "X-Recur-Secret-Key": settings.recur_secret_key,
                "Content-Type": "application/json",
            },
            json={
                "email": current_user.email,
                "returnUrl": f"{settings.frontend_url}/account",
            },
        )

        if response.status_code == 404:
            raise HTTPException(
                status_code=404,
                detail="找不到訂閱資料，請先訂閱方案",
            )

        response.raise_for_status()
        data = response.json()

    return {"url": data["url"]}
```

### Customer Identification

You can identify customers by (in priority order):

```python
# By Recur customer ID (highest priority)
json={"customer": "cus_xxx", "returnUrl": return_url}

# By your system's user ID
json={"externalId": user.id, "returnUrl": return_url}

# By email (lowest priority)
json={"email": user.email, "returnUrl": return_url}
```

## React: Portal Button Component

```tsx
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { apiClient } from '@/lib/api-client'

function PortalButton() {
  const [isLoading, setIsLoading] = useState(false)

  const handleClick = async () => {
    setIsLoading(true)
    try {
      const { url } = await apiClient.post<{ url: string }>('/portal/session')
      window.location.href = url
    } catch (error) {
      console.error('Failed to open portal:', error)
      // Show error toast
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Button onClick={handleClick} disabled={isLoading} variant="outline">
      {isLoading ? '載入中...' : '管理訂閱'}
    </Button>
  )
}
```

## Portal Session Response

```python
{
    "id": "portal_sess_xxx",
    "object": "portal.session",
    "url": "https://billing.recur.tw/portal/...",  # Redirect customer here
    "customer": "cus_xxx",
    "returnUrl": "https://tktmanager.com/account",
    "status": "active",           # "active" or "expired"
    "expiresAt": "2026-03-26T13:00:00Z",  # Sessions last 1 hour
    "accessedAt": None,
    "createdAt": "2026-03-26T12:00:00Z",
}
```

## Common Patterns

### Account Page with Portal Link

```tsx
import { useAuth } from '@/contexts/AuthContext'
import { useFeature } from '@/hooks/useFeature'

function AccountPage() {
  const { user } = useAuth()
  const { enabled: hasSubscription } = useFeature('pro-plan')

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">帳戶設定</h1>
      <p>Email: {user?.email}</p>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">訂閱管理</h2>
        {hasSubscription ? (
          <>
            <p className="text-muted-foreground">
              管理您的訂閱、更新付款方式、查看帳單記錄
            </p>
            <PortalButton />
          </>
        ) : (
          <>
            <p className="text-muted-foreground">您目前沒有訂閱</p>
            <Button asChild>
              <Link to="/pricing">查看方案</Link>
            </Button>
          </>
        )}
      </section>
    </div>
  )
}
```

### Conditional Portal Access

```tsx
function SubscriptionSection() {
  const { enabled, entitlement } = useFeature('pro-plan')

  if (!enabled) {
    return (
      <div>
        <p>您目前沒有訂閱</p>
        <Link to="/pricing">查看方案</Link>
      </div>
    )
  }

  return (
    <div>
      <p>
        目前方案：Pro
        {entitlement?.status === 'canceled' && ' (已取消，到期前仍可使用)'}
        {entitlement?.status === 'past_due' && ' (付款失敗，請更新付款方式)'}
      </p>
      <PortalButton />
    </div>
  )
}
```

## Portal Configuration

Configure portal behavior in **Recur Dashboard** → **Settings** → **Customer Portal**:

- **Default Return URL**: Where to redirect after leaving portal
- **Allowed Actions**: Enable/disable cancel, update payment, switch plan
- **Branding**: Custom logo and colors

## Security Notes

1. **Server-side only** — Portal sessions require Secret Key (`sk_*`), never expose on frontend
2. **Short-lived** — Sessions expire in 1 hour
3. **One-time use** — Each session URL should only be used once
4. **Authenticate first** — Always verify the user's identity before creating a portal session

## Error Handling

```python
try:
    response = await client.post(
        "https://api.recur.tw/v1/portal/sessions",
        headers={"X-Recur-Secret-Key": settings.recur_secret_key, ...},
        json={"email": user.email, "returnUrl": return_url},
    )
    response.raise_for_status()
except httpx.HTTPStatusError as e:
    if e.response.status_code == 404:
        # Customer doesn't exist in Recur — they haven't subscribed yet
        raise HTTPException(status_code=404, detail="找不到訂閱資料") from e
    raise HTTPException(status_code=502, detail="無法連接付款服務") from e
```

## Related Skills

- `/recur-quickstart` - Initial SDK setup
- `/recur-checkout` - Implement purchase flows
- `/recur-entitlements` - Check subscription access
- `/recur-webhooks` - Receive payment events (FastAPI handler)
