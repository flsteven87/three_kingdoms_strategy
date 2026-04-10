# Promotion Code Checkout Integration Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow users to apply promotion code `DDYH200` (NT$200 off) when purchasing season quota, reducing price from NT$999 to NT$799.

**Architecture:** Dual checkout path — users without promo code keep the existing modal checkout (Recur SDK `checkout()`); users with promo code go through a server-side checkout session creation (`POST https://api.recur.tw/v1/checkout/sessions` with `promotion_code`) then redirect to hosted checkout. Backend webhook amount validation relaxed to accept discounted amounts.

**Tech Stack:** Python/FastAPI (backend), httpx (new dep), React/TypeScript (frontend), Recur API, recur-tw SDK

---

## Context & Constraints

### Why dual checkout path?
- Recur SDK's `CheckoutOptions` does NOT support a `promotionCode` parameter (verified in `recur-tw/dist/index.d.ts:213-313`)
- Promo codes can only be applied via server-side API: `POST https://api.recur.tw/v1/checkout/sessions` with `promotion_code` field (from docs.recur.tw/api)
- Server-created sessions return a hosted checkout URL (`https://checkout.recur.tw/cs_xxx`) — redirect, not modal
- Keep modal for no-promo-code purchases (better UX, no redirect)

### Webhook amount validation
- Current: strict `amount == 999` (`payment_service.py:200-212`)
- With coupon: webhook `amount` will be `799` → current validation rejects it
- Fix: accept `0 < amount <= recur_expected_amount_twd` (webhook signature ensures authenticity)

### Files to touch

| Layer | File | Action |
|-------|------|--------|
| Backend | `pyproject.toml` | Add `httpx` dependency |
| Backend | `src/services/checkout_service.py` | **Create** — Recur API checkout session creation |
| Backend | `src/api/v1/endpoints/payments.py` | **Create** — `POST /payments/checkout-session` endpoint |
| Backend | `src/models/payment.py` | **Create** — Request/response models |
| Backend | `src/core/dependencies.py` | Add CheckoutService DI |
| Backend | `src/main.py` | Register payments router |
| Backend | `src/services/payment_service.py` | Relax `_validate_amount()` |
| Backend | `src/core/config.py` | No change needed (existing config sufficient) |
| Frontend | `src/lib/api/payment-api.ts` | **Create** — checkout session API call |
| Frontend | `src/lib/api/index.ts` | Export payment-api |
| Frontend | `src/pages/PurchaseSeason.tsx` | Add promo code input + dual checkout flow |
| Frontend | `src/constants/pricing.ts` | Add `PROMO_CODE_DISCOUNT` constant |
| Tests | `backend/tests/unit/services/test_checkout_service.py` | **Create** |
| Tests | `backend/tests/integration/test_payment_to_season_flow.py` | Update amount validation tests |

---

## Task 1: Backend — Add `httpx` dependency

**Files:**
- Modify: `backend/pyproject.toml`

**Step 1: Add httpx to dependencies**

In `backend/pyproject.toml`, add `"httpx>=0.28.0"` to the `dependencies` list:

```toml
dependencies = [
    "fastapi>=0.118.0",
    "uvicorn[standard]>=0.37.0",
    "tzdata>=2025.2",
    "pydantic>=2.12.0",
    "pydantic-settings>=2.7.0",
    "supabase>=2.21.1",
    "python-dotenv>=1.0.0",
    "python-multipart>=0.0.9",
    "python-jose[cryptography]>=3.5.0",
    "email-validator>=2.3.0",
    "line-bot-sdk>=3.21.0",
    "slowapi>=0.1.9",
    "openpyxl>=3.1.5",
    "httpx>=0.28.0",
]
```

**Step 2: Install**

Run: `cd backend && uv sync`
Expected: httpx installed successfully

**Step 3: Commit**

```bash
git add backend/pyproject.toml backend/uv.lock
git commit -m "chore: add httpx dependency for Recur API calls"
```

---

## Task 2: Backend — Relax webhook amount validation

**Files:**
- Modify: `backend/src/services/payment_service.py:200-212`
- Modify: `backend/tests/integration/test_payment_to_season_flow.py`

**Step 1: Write the failing test**

In `backend/tests/integration/test_payment_to_season_flow.py`, add a test for discounted amount:

```python
@pytest.mark.asyncio
async def test_discounted_amount_accepted(
    payment_service, mock_webhook_repo, fake_payment_settings,
):
    """Webhook with coupon-discounted amount (799) should be accepted."""
    data = valid_event_data()
    data["amount"] = 799  # NT$999 - NT$200 coupon

    result = await payment_service.handle_payment_success(
        data, event_id="evt_discount_1", event_type="order.paid",
    )
    assert result["status"] == "granted"
```

**Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/integration/test_payment_to_season_flow.py::test_discounted_amount_accepted -v`
Expected: FAIL with `WebhookPermanentError: amount_mismatch`

**Step 3: Update `_validate_amount()` in `payment_service.py:200-212`**

Replace the strict equality check with a range check:

```python
@staticmethod
def _validate_amount(event_data: dict, *, event_id: str) -> None:
    expected = settings.recur_expected_amount_twd
    raw = event_data.get("amount")
    try:
        actual = int(raw) if raw is not None else None
    except (TypeError, ValueError) as e:
        raise WebhookPermanentError(
            "amount_unparseable", event_id=event_id, expected=expected, actual=raw
        ) from e
    # Webhook signature guarantees authenticity. Product ID check ensures
    # our product. Allow any positive amount up to the base price — this
    # covers valid coupon discounts without hardcoding specific amounts.
    if actual is None or actual <= 0 or actual > expected:
        raise WebhookPermanentError(
            "amount_out_of_range", event_id=event_id, expected=expected, actual=actual
        )
```

**Step 4: Run tests**

Run: `cd backend && uv run pytest tests/integration/test_payment_to_season_flow.py -v`
Expected: ALL PASS (including new discounted amount test)

**Step 5: Also add edge case tests**

```python
@pytest.mark.asyncio
async def test_amount_zero_rejected(payment_service, fake_payment_settings):
    """Zero amount should be rejected even with signature."""
    data = valid_event_data()
    data["amount"] = 0
    with pytest.raises(WebhookPermanentError, match="amount_out_of_range"):
        await payment_service.handle_payment_success(
            data, event_id="evt_zero", event_type="order.paid",
        )

@pytest.mark.asyncio
async def test_amount_above_expected_rejected(payment_service, fake_payment_settings):
    """Amount exceeding expected price should be rejected."""
    data = valid_event_data()
    data["amount"] = 1500
    with pytest.raises(WebhookPermanentError, match="amount_out_of_range"):
        await payment_service.handle_payment_success(
            data, event_id="evt_over", event_type="order.paid",
        )
```

**Step 6: Run all tests and verify**

Run: `cd backend && uv run pytest tests/integration/test_payment_to_season_flow.py -v`
Expected: ALL PASS

**Step 7: Lint check**

Run: `cd backend && uv run ruff check .`
Expected: No errors

**Step 8: Commit**

```bash
git add backend/src/services/payment_service.py backend/tests/integration/test_payment_to_season_flow.py
git commit -m "fix(payment): accept coupon-discounted amounts in webhook validation"
```

---

## Task 3: Backend — Create checkout session endpoint

**Files:**
- Create: `backend/src/models/payment.py`
- Create: `backend/src/services/checkout_service.py`
- Create: `backend/src/api/v1/endpoints/payments.py`
- Modify: `backend/src/core/dependencies.py`
- Modify: `backend/src/main.py`

**Step 1: Create request/response models**

Create `backend/src/models/payment.py`:

```python
"""Payment models for checkout session creation."""

from pydantic import BaseModel


class CreateCheckoutSessionRequest(BaseModel):
    promotion_code: str | None = None
    success_url: str
    cancel_url: str | None = None


class CreateCheckoutSessionResponse(BaseModel):
    checkout_url: str
```

**Step 2: Create CheckoutService**

Create `backend/src/services/checkout_service.py`:

```python
"""Checkout Service — creates Recur checkout sessions via API.

Used when promotion codes need to be applied, since the client-side
Recur SDK does not support passing promotion codes to checkout().
"""

import logging

import httpx

from src.core.config import settings

logger = logging.getLogger(__name__)

RECUR_API_BASE = "https://api.recur.tw/v1"


class CheckoutSessionError(Exception):
    """Raised when Recur API rejects the session creation."""

    def __init__(self, status_code: int, detail: str) -> None:
        self.status_code = status_code
        self.detail = detail
        super().__init__(f"Recur API error {status_code}: {detail}")


class CheckoutService:
    async def create_session(
        self,
        *,
        product_id: str,
        customer_email: str,
        customer_name: str | None = None,
        external_customer_id: str | None = None,
        promotion_code: str | None = None,
        success_url: str,
        cancel_url: str | None = None,
    ) -> str:
        """Create a Recur checkout session. Returns the hosted checkout URL.

        Raises ``CheckoutSessionError`` on API failure.
        """
        payload: dict = {
            "product_id": product_id,
            "customer_email": customer_email,
            "success_url": success_url,
        }
        if customer_name:
            payload["customer_name"] = customer_name
        if external_customer_id:
            payload["external_customer_id"] = external_customer_id
        if promotion_code:
            payload["promotion_code"] = promotion_code
        if cancel_url:
            payload["cancel_url"] = cancel_url

        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{RECUR_API_BASE}/checkout/sessions",
                json=payload,
                headers={
                    "Authorization": f"Bearer {settings.recur_secret_key}",
                    "Content-Type": "application/json",
                },
                timeout=15.0,
            )

        if resp.status_code >= 400:
            body = resp.text
            logger.error(
                "Recur checkout session creation failed status=%s body=%s",
                resp.status_code,
                body[:500],
            )
            raise CheckoutSessionError(resp.status_code, body)

        data = resp.json()
        url = data.get("url")
        if not url:
            raise CheckoutSessionError(500, "Recur API returned no checkout URL")

        logger.info(
            "Checkout session created id=%s promotion_code=%s",
            data.get("id"),
            promotion_code,
        )
        return url
```

**Step 3: Create payments endpoint**

Create `backend/src/api/v1/endpoints/payments.py`:

```python
"""Payment endpoints — checkout session creation with promotion codes."""

import logging

from fastapi import APIRouter, HTTPException

from src.core.config import settings
from src.core.dependencies import CheckoutServiceDep, UserIdDep
from src.core.auth import get_current_user_email, get_current_user_name
from src.models.payment import CreateCheckoutSessionRequest, CreateCheckoutSessionResponse
from src.services.checkout_service import CheckoutSessionError

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/payments", tags=["payments"])


@router.post("/checkout-session", response_model=CreateCheckoutSessionResponse)
async def create_checkout_session(
    body: CreateCheckoutSessionRequest,
    user_id: UserIdDep,
    service: CheckoutServiceDep,
):
    """Create a Recur checkout session with optional promotion code.

    Returns a hosted checkout URL that the frontend redirects to.
    Used when the client-side SDK cannot apply promotion codes directly.
    """
    product_id = settings.recur_product_id
    if not product_id:
        raise HTTPException(status_code=503, detail="Payment not configured")

    try:
        checkout_url = await service.create_session(
            product_id=product_id,
            customer_email=body.customer_email,
            customer_name=body.customer_name,
            external_customer_id=str(user_id),
            promotion_code=body.promotion_code,
            success_url=body.success_url,
            cancel_url=body.cancel_url,
        )
    except CheckoutSessionError as e:
        logger.error("Checkout session failed user=%s: %s", user_id, e)
        raise HTTPException(status_code=502, detail="Payment provider error") from e

    return CreateCheckoutSessionResponse(checkout_url=checkout_url)
```

> **Note:** The endpoint needs the user's email and name. We need to check how `get_current_user_id` works and whether we can get email from the JWT. If not, we pass email/name from the frontend request body.

**Step 3b: Update the request model to include email/name**

Update `backend/src/models/payment.py`:

```python
"""Payment models for checkout session creation."""

from pydantic import BaseModel, EmailStr


class CreateCheckoutSessionRequest(BaseModel):
    customer_email: EmailStr
    customer_name: str | None = None
    promotion_code: str | None = None
    success_url: str
    cancel_url: str | None = None


class CreateCheckoutSessionResponse(BaseModel):
    checkout_url: str
```

**Step 4: Add DI wiring**

In `backend/src/core/dependencies.py`, add:

```python
# At top, add import:
from src.services.checkout_service import CheckoutService

# Add provider function:
def get_checkout_service() -> CheckoutService:
    """Get checkout service instance"""
    return CheckoutService()

# Add type alias:
CheckoutServiceDep = Annotated[CheckoutService, Depends(get_checkout_service)]
```

**Step 5: Register router in main.py**

In `backend/src/main.py`, add:

```python
from src.api.v1.endpoints import payments

app.include_router(payments.router, prefix="/api/v1")
```

**Step 6: Run lint**

Run: `cd backend && uv run ruff check .`
Expected: No errors

**Step 7: Commit**

```bash
git add backend/src/models/payment.py backend/src/services/checkout_service.py \
  backend/src/api/v1/endpoints/payments.py backend/src/core/dependencies.py backend/src/main.py
git commit -m "feat(payment): add checkout session endpoint for promotion codes"
```

---

## Task 4: Backend — Unit tests for CheckoutService

**Files:**
- Create: `backend/tests/unit/services/test_checkout_service.py`

**Step 1: Write tests**

```python
"""Unit tests for CheckoutService — Recur API checkout session creation."""

from unittest.mock import AsyncMock, patch

import httpx
import pytest

from src.services.checkout_service import CheckoutService, CheckoutSessionError


@pytest.fixture
def service():
    return CheckoutService()


@pytest.fixture(autouse=True)
def fake_settings():
    with patch("src.services.checkout_service.settings") as s:
        s.recur_secret_key = "sk_test_fake"
        yield s


class TestCreateSession:
    @pytest.mark.asyncio
    async def test_success_returns_url(self, service):
        """Successful session creation returns the checkout URL."""
        mock_response = httpx.Response(
            200,
            json={"id": "cs_123", "url": "https://checkout.recur.tw/cs_123"},
            request=httpx.Request("POST", "https://api.recur.tw/v1/checkout/sessions"),
        )

        with patch("httpx.AsyncClient.post", new_callable=AsyncMock, return_value=mock_response):
            url = await service.create_session(
                product_id="prod_test",
                customer_email="test@example.com",
                success_url="https://example.com/success",
                promotion_code="DDYH200",
            )

        assert url == "https://checkout.recur.tw/cs_123"

    @pytest.mark.asyncio
    async def test_api_error_raises(self, service):
        """API error response raises CheckoutSessionError."""
        mock_response = httpx.Response(
            400,
            text='{"error":{"code":"invalid_promotion_code"}}',
            request=httpx.Request("POST", "https://api.recur.tw/v1/checkout/sessions"),
        )

        with patch("httpx.AsyncClient.post", new_callable=AsyncMock, return_value=mock_response):
            with pytest.raises(CheckoutSessionError) as exc_info:
                await service.create_session(
                    product_id="prod_test",
                    customer_email="test@example.com",
                    success_url="https://example.com/success",
                    promotion_code="INVALID",
                )
            assert exc_info.value.status_code == 400

    @pytest.mark.asyncio
    async def test_no_url_in_response_raises(self, service):
        """Missing URL in API response raises CheckoutSessionError."""
        mock_response = httpx.Response(
            200,
            json={"id": "cs_123"},
            request=httpx.Request("POST", "https://api.recur.tw/v1/checkout/sessions"),
        )

        with patch("httpx.AsyncClient.post", new_callable=AsyncMock, return_value=mock_response):
            with pytest.raises(CheckoutSessionError, match="no checkout URL"):
                await service.create_session(
                    product_id="prod_test",
                    customer_email="test@example.com",
                    success_url="https://example.com/success",
                )

    @pytest.mark.asyncio
    async def test_promotion_code_included_in_payload(self, service):
        """Promotion code is passed to Recur API payload."""
        mock_response = httpx.Response(
            200,
            json={"id": "cs_123", "url": "https://checkout.recur.tw/cs_123"},
            request=httpx.Request("POST", "https://api.recur.tw/v1/checkout/sessions"),
        )

        with patch("httpx.AsyncClient.post", new_callable=AsyncMock, return_value=mock_response) as mock_post:
            await service.create_session(
                product_id="prod_test",
                customer_email="test@example.com",
                success_url="https://example.com/success",
                promotion_code="DDYH200",
            )

            call_kwargs = mock_post.call_args
            payload = call_kwargs.kwargs.get("json") or call_kwargs[1].get("json")
            assert payload["promotion_code"] == "DDYH200"

    @pytest.mark.asyncio
    async def test_no_promo_code_omits_field(self, service):
        """When no promotion code, field is omitted from payload."""
        mock_response = httpx.Response(
            200,
            json={"id": "cs_123", "url": "https://checkout.recur.tw/cs_123"},
            request=httpx.Request("POST", "https://api.recur.tw/v1/checkout/sessions"),
        )

        with patch("httpx.AsyncClient.post", new_callable=AsyncMock, return_value=mock_response) as mock_post:
            await service.create_session(
                product_id="prod_test",
                customer_email="test@example.com",
                success_url="https://example.com/success",
            )

            call_kwargs = mock_post.call_args
            payload = call_kwargs.kwargs.get("json") or call_kwargs[1].get("json")
            assert "promotion_code" not in payload
```

**Step 2: Run tests**

Run: `cd backend && uv run pytest tests/unit/services/test_checkout_service.py -v`
Expected: ALL PASS

**Step 3: Commit**

```bash
git add backend/tests/unit/services/test_checkout_service.py
git commit -m "test(payment): add unit tests for CheckoutService"
```

---

## Task 5: Frontend — Add payment API module

**Files:**
- Create: `frontend/src/lib/api/payment-api.ts`
- Modify: `frontend/src/lib/api/index.ts`

**Step 1: Create payment API module**

Create `frontend/src/lib/api/payment-api.ts`:

```typescript
/**
 * Payment API
 *
 * Server-side checkout session creation for promotion code support.
 */

import { axiosInstance } from './base-client'

interface CreateCheckoutSessionRequest {
  customer_email: string
  customer_name?: string
  promotion_code?: string
  success_url: string
  cancel_url?: string
}

interface CreateCheckoutSessionResponse {
  checkout_url: string
}

/**
 * Create a Recur checkout session with optional promotion code.
 * Returns a hosted checkout URL to redirect the user to.
 */
export async function createCheckoutSession(
  params: CreateCheckoutSessionRequest,
): Promise<CreateCheckoutSessionResponse> {
  const response = await axiosInstance.post<CreateCheckoutSessionResponse>(
    '/api/v1/payments/checkout-session',
    params,
  )
  return response.data
}
```

**Step 2: Export from index**

In `frontend/src/lib/api/index.ts`, add:

```typescript
export * from "./payment-api";
```

And in the apiClient imports section:

```typescript
import * as paymentApi from "./payment-api";
```

Add to the apiClient object:

```typescript
...paymentApi,
```

**Step 3: Commit**

```bash
git add frontend/src/lib/api/payment-api.ts frontend/src/lib/api/index.ts
git commit -m "feat(frontend): add payment API module for checkout sessions"
```

---

## Task 6: Frontend — Add promotion code UI to PurchaseSeason

**Files:**
- Modify: `frontend/src/pages/PurchaseSeason.tsx`
- Modify: `frontend/src/constants/pricing.ts`

**Step 1: Add pricing constants**

In `frontend/src/constants/pricing.ts`, add:

```typescript
export const PROMO_CODE_DISCOUNT = 200  // TWD — DDYH200 coupon
```

**Step 2: Update PurchaseSeason.tsx**

Add promotion code input field and dual checkout logic. Key changes:

1. **State for promo code**: `const [promoCode, setPromoCode] = useState('')`
2. **State for discount active**: `const [discountApplied, setDiscountApplied] = useState(false)`
3. **Import** `createCheckoutSession` from `@/lib/api`
4. **Promo code input section** below the price display:

```tsx
{/* Promotion Code Input */}
<div className="space-y-2">
  <div className="flex gap-2">
    <input
      type="text"
      value={promoCode}
      onChange={(e) => {
        setPromoCode(e.target.value.toUpperCase())
        setDiscountApplied(false)
      }}
      placeholder="輸入優惠碼"
      className="flex-1 rounded-lg border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
      disabled={isCheckingOut}
    />
  </div>
  {promoCode && (
    <p className="text-xs text-muted-foreground">
      結帳時將自動套用優惠碼
    </p>
  )}
</div>
```

5. **Price display with discount**:

```tsx
<div className="text-center space-y-1">
  <div className="text-5xl font-bold tracking-tight">
    NT$ {promoCode
      ? (PRICE_PER_SEASON - PROMO_CODE_DISCOUNT).toLocaleString()
      : PRICE_PER_SEASON.toLocaleString()}
  </div>
  {promoCode && (
    <div className="text-sm text-muted-foreground line-through">
      NT$ {PRICE_PER_SEASON.toLocaleString()}
    </div>
  )}
  <div className="text-lg text-muted-foreground">/ 賽季</div>
</div>
```

6. **Dual checkout flow in handlePurchase**:

```typescript
const handlePurchase = async () => {
  setError(null)
  // ... existing validation ...

  const baseUrl = window.location.origin
  const baselineSeasons = quotaStatus?.purchased_seasons ?? 0

  try {
    const externalCustomerId = user.id

    if (promoCode) {
      // Server-side checkout session with promotion code → hosted (redirect)
      const { checkout_url } = await createCheckoutSession({
        customer_email: customerEmail,
        customer_name: user.user_metadata?.full_name ?? user.user_metadata?.name,
        promotion_code: promoCode,
        success_url: `${baseUrl}/purchase?payment=success`,
        cancel_url: `${baseUrl}/purchase`,
      })
      window.location.href = checkout_url
      return
    }

    // No promo code → existing modal checkout
    await checkout({
      productId,
      customerEmail,
      customerName: user.user_metadata?.full_name ?? user.user_metadata?.name ?? undefined,
      externalCustomerId,
      successUrl: `${baseUrl}/purchase?payment=success`,
      onError: (checkoutError) => { /* existing */ },
      onPaymentComplete: async () => {
        purchaseFlow.startPolling(baselineSeasons)
      },
      onPaymentFailed: (err) => { /* existing */ },
    })
  } catch (err: unknown) {
    // ... existing error handling ...
  }
}
```

**Step 3: Run frontend lint**

Run: `cd frontend && npm run lint`
Expected: No errors

**Step 4: Run type check**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

**Step 5: Commit**

```bash
git add frontend/src/pages/PurchaseSeason.tsx frontend/src/constants/pricing.ts
git commit -m "feat(purchase): add promotion code input with dual checkout flow"
```

---

## Task 7: Add FAQ entry for promotion codes

**Files:**
- Modify: `frontend/src/pages/PurchaseSeason.tsx`

**Step 1: Add FAQ item**

Add to `FAQ_ITEMS` array:

```typescript
{
  question: '有優惠碼可以用嗎？',
  answer:
    '有！在購買頁面輸入優惠碼即可享有折扣。優惠碼使用後，付款金額會自動扣除折扣。每個帳號每個優惠碼限用一次。',
},
```

**Step 2: Commit**

```bash
git add frontend/src/pages/PurchaseSeason.tsx
git commit -m "docs(purchase): add promotion code FAQ entry"
```

---

## Task 8: End-to-end verification

**Step 1: Run all backend tests**

Run: `cd backend && uv run pytest -v`
Expected: ALL PASS

**Step 2: Run backend lint**

Run: `cd backend && uv run ruff check .`
Expected: No errors

**Step 3: Run frontend type check + lint**

Run: `cd frontend && npx tsc --noEmit && npm run lint`
Expected: No errors

**Step 4: Manual testing checklist**

- [ ] Purchase page loads with promo code input visible
- [ ] Entering `DDYH200` shows discounted price (NT$799)
- [ ] Clicking purchase with promo code redirects to Recur hosted checkout
- [ ] Clicking purchase without promo code opens modal checkout (existing behavior)
- [ ] After hosted checkout payment, redirect back to `/purchase?payment=success` works
- [ ] Backend webhook accepts amount=799 for discounted purchase
- [ ] Backend webhook still accepts amount=999 for full-price purchase
- [ ] Season quota increments after successful discounted payment

**Step 5: Final commit**

```bash
git add -A
git commit -m "feat(promotion): complete DDYH200 coupon integration (NT$200 off)"
```
