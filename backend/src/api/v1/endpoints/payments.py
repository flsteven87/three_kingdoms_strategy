"""Payment endpoints — checkout session creation with promotion codes."""

import logging

from fastapi import APIRouter, HTTPException

from src.core.config import settings
from src.core.dependencies import CheckoutServiceDep, UserIdDep
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
