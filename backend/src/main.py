"""
Three Kingdoms Strategy Manager FastAPI Application

符合 CLAUDE.md:
- redirect_slashes=False (cloud deployment requirement)
- Proper CORS configuration
- Global exception handlers (CLAUDE.md 🟡)
"""

import logging

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from src.api.v1.endpoints import (
    alliance_collaborators,
    alliances,
    analytics,
    copper_mines,
    donations,
    events,
    hegemony_weights,
    linebot,
    periods,
    season_quota,
    seasons,
    uploads,
    webhooks,
)
from src.core.config import settings
from src.core.exceptions import SeasonQuotaExhaustedError
from src.core.idempotency import IdempotencyMiddleware, InMemoryIdempotencyStorage

logger = logging.getLogger(__name__)

# Create idempotency storage for preventing duplicate mutations
idempotency_storage = InMemoryIdempotencyStorage()

# Create FastAPI app
# 符合 CLAUDE.md 🔴: redirect_slashes=False for cloud deployment
app = FastAPI(
    title="Three Kingdoms Strategy Manager API",
    description="Alliance Member Performance Tracking System",
    version=settings.version,
    redirect_slashes=False,
    docs_url="/docs" if settings.debug else None,
    redoc_url="/redoc" if settings.debug else None,
)

# Idempotency middleware (must be added before CORS)
# Prevents duplicate mutations from network retries
app.add_middleware(
    IdempotencyMiddleware,
    storage=idempotency_storage,
    ttl_seconds=86400,  # 24 hours
)

# CORS middleware
# 符合 CLAUDE.md: Exact frontend domains
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(alliances.router, prefix="/api/v1")
app.include_router(alliance_collaborators.router, prefix="/api/v1")
app.include_router(seasons.router, prefix="/api/v1")
app.include_router(uploads.router, prefix="/api/v1")
app.include_router(hegemony_weights.router, prefix="/api/v1")
app.include_router(periods.router, prefix="/api/v1")
app.include_router(analytics.router, prefix="/api/v1")
app.include_router(events.router, prefix="/api/v1")
app.include_router(donations.router, prefix="/api/v1")
app.include_router(copper_mines.router, prefix="/api/v1")
app.include_router(linebot.router, prefix="/api/v1")
app.include_router(season_quota.router, prefix="/api/v1")
app.include_router(webhooks.router, prefix="/api/v1")


# Global Exception Handlers
# 符合 CLAUDE.md 🟡: Domain exceptions → Global handler converts to HTTP responses
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    """Handle FastAPI request validation errors."""
    logger.warning(f"Validation error on {request.method} {request.url.path}: {exc.errors()}")
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"detail": exc.errors()},
    )


@app.exception_handler(ValueError)
async def value_error_handler(request: Request, exc: ValueError) -> JSONResponse:
    """
    Handle ValueError exceptions globally

    Converts ValueError (domain exceptions) to HTTP 400 Bad Request
    This eliminates the need for repetitive try/except blocks in endpoints
    """
    logger.error(f"[ValueError] URL: {request.url}, Error: {exc}")
    return JSONResponse(status_code=status.HTTP_400_BAD_REQUEST, content={"detail": str(exc)})


@app.exception_handler(FileNotFoundError)
async def file_not_found_handler(request: Request, exc: FileNotFoundError) -> JSONResponse:
    """
    Handle FileNotFoundError exceptions globally

    Converts FileNotFoundError to HTTP 404 Not Found
    """
    return JSONResponse(status_code=status.HTTP_404_NOT_FOUND, content={"detail": str(exc)})


@app.exception_handler(PermissionError)
async def permission_error_handler(request: Request, exc: PermissionError) -> JSONResponse:
    """
    Handle PermissionError exceptions globally

    Converts PermissionError to HTTP 403 Forbidden
    """
    return JSONResponse(status_code=status.HTTP_403_FORBIDDEN, content={"detail": str(exc)})


@app.exception_handler(SeasonQuotaExhaustedError)
async def season_quota_exhausted_handler(
    request: Request, exc: SeasonQuotaExhaustedError
) -> JSONResponse:
    """
    Handle SeasonQuotaExhaustedError exceptions globally

    Converts SeasonQuotaExhaustedError to HTTP 402 Payment Required
    This indicates the user needs to purchase season quota to continue.
    """
    return JSONResponse(
        status_code=status.HTTP_402_PAYMENT_REQUIRED,
        content={"detail": exc.message, "error_code": exc.error_code},
    )


# Health check endpoint (public)
@app.get("/health")
async def health_check():
    """Health check endpoint (no auth required)"""
    return {"status": "healthy", "environment": settings.environment, "version": settings.version}


# Root endpoint
@app.get("")
async def root():
    """API root endpoint"""
    return {
        "message": "Three Kingdoms Strategy Manager API",
        "docs": "/docs" if settings.debug else "disabled",
        "version": settings.version,
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "src.main:app",
        host="0.0.0.0",
        port=8087,
        reload=settings.debug,
        log_level=settings.log_level.lower(),
    )
