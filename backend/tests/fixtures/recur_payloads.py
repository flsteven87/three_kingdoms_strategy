"""
Real Recur webhook payloads captured from sandbox on 2026-04-08.

These are the canonical shapes the production code MUST handle. Any new test
for payment-webhook logic should build its input by copying one of these
and overriding only the fields under test.
"""

from __future__ import annotations

from copy import deepcopy
from uuid import UUID

# UUIDs for synthetic tests — matches the style used in existing tests.
TEST_USER_ID = UUID("11111111-1111-1111-1111-111111111111")
TEST_PRODUCT_ID = "prod_test_999"
TEST_CHECKOUT_ID = "chk_test_aaaaaaaaaaaaaaaaaaaaaaaa"
TEST_ORDER_ID = "ord_test_bbbbbbbbbbbbbbbbbbbbbbbb"


def checkout_completed(
    *,
    user_id: UUID = TEST_USER_ID,
    product_id: str = TEST_PRODUCT_ID,
    checkout_id: str = TEST_CHECKOUT_ID,
    amount: int = 999,
    currency: str = "TWD",
) -> dict:
    """Return a real-shaped ``checkout.completed`` webhook payload."""
    return {
        "id": checkout_id,
        "amount": amount,
        "status": "COMPLETED",
        "currency": currency,
        "customer": {
            "id": "recur_cust_test",
            "name": "Test User",
            "email": "test@example.com",
            "external_id": str(user_id),
        },
        "discount": None,
        "metadata": None,
        "subtotal": amount,
        "created_at": "2026-04-08T16:21:09.644Z",
        "product_id": product_id,
        "completed_at": "2026-04-08T16:21:31.958Z",
        "customer_email": None,
    }


def order_paid(
    *,
    user_id: UUID = TEST_USER_ID,
    product_id: str = TEST_PRODUCT_ID,
    checkout_id: str = TEST_CHECKOUT_ID,
    order_id: str = TEST_ORDER_ID,
    amount: int = 999,
    currency: str = "TWD",
) -> dict:
    """Return a real-shaped ``order.paid`` webhook payload."""
    return {
        "id": order_id,
        "amount": amount,
        "status": "PAID",
        "paid_at": "2026-04-08T16:21:31.958Z",
        "currency": currency,
        "customer": {
            "id": "recur_cust_test",
            "name": "Test User",
            "email": "test@example.com",
            "external_id": str(user_id),
        },
        "discount": None,
        "metadata": {},
        "order_id": order_id,
        "subtotal": None,
        "created_at": "2026-04-08T16:21:09.621Z",
        "product_id": product_id,
        "checkout_id": checkout_id,
        "billing_reason": "purchase",
        "payment_method": "card",
        "subscription_id": None,
    }


def clone(payload: dict) -> dict:
    """Deep-copy a payload so tests can mutate freely without cross-test leakage."""
    return deepcopy(payload)
