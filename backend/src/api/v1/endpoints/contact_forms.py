from fastapi import APIRouter, Request

from src.core.dependencies import ContactFormServiceDep
from src.core.rate_limit import PUBLIC_MUTATION_RATE, limiter
from src.models.contact_form import ContactFormCreate, ContactFormResponse

router = APIRouter(prefix="/contact", tags=["contact"])


@router.post("", response_model=ContactFormResponse, status_code=201)
@limiter.limit(PUBLIC_MUTATION_RATE)
async def submit_contact_form(
    request: Request,
    data: ContactFormCreate,
    service: ContactFormServiceDep,
) -> ContactFormResponse:
    """Public contact form submission. No auth required."""
    await service.submit(data)
    return ContactFormResponse()
