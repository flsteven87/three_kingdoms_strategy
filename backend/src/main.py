"""
Three Kingdoms Strategy Manager FastAPI Application

符合 CLAUDE.md:
- redirect_slashes=False (cloud deployment requirement)
- Proper CORS configuration
- Global exception handlers (CLAUDE.md 🟡)
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from starlette.exceptions import HTTPException as StarletteHTTPException

from src.api.v1.endpoints import (
    alliance_collaborators,
    alliances,
    analytics,
    contact_forms,
    copper_mines,
    donations,
    events,
    hegemony_weights,
    linebot,
    payments,
    periods,
    season_quota,
    seasons,
    uploads,
    webhooks,
)
from src.core.alerts import close_alert_client
from src.core.config import settings
from src.core.exceptions import SeasonQuotaExhaustedError
from src.core.idempotency import IdempotencyMiddleware, create_idempotency_storage
from src.core.rate_limit import limiter
from src.core.startup import assert_production_config

logger = logging.getLogger(__name__)

# Create idempotency storage (Supabase in production, in-memory in development)
idempotency_storage = create_idempotency_storage()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Fail-closed startup checks — revenue-critical config must be complete in prod."""
    assert_production_config(settings)
    logger.info("Startup config validated (environment=%s)", settings.environment)
    yield
    await close_alert_client()


# Create FastAPI app
# 符合 CLAUDE.md 🔴: redirect_slashes=False for cloud deployment
app = FastAPI(
    title="Three Kingdoms Strategy Manager API",
    description="Alliance Member Performance Tracking System",
    version=settings.version,
    redirect_slashes=False,
    docs_url="/docs" if settings.debug else None,
    redoc_url="/redoc" if settings.debug else None,
    lifespan=lifespan,
)

# Rate limiter (per-IP, applied via decorators on individual endpoints)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

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
app.include_router(payments.router, prefix="/api/v1")
app.include_router(webhooks.router, prefix="/api/v1")
app.include_router(contact_forms.router, prefix="/api/v1")


# Global Exception Handlers
# 符合 CLAUDE.md 🟡: Domain exceptions → Global handler converts to HTTP responses
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    """Handle FastAPI request validation errors."""
    logger.warning("Validation error on %s %s: %s", request.method, request.url.path, exc.errors())
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"detail": exc.errors()},
    )


@app.exception_handler(ValueError)
async def value_error_handler(request: Request, exc: ValueError) -> JSONResponse:
    """
    Handle ValueError exceptions globally.

    Domain ValueError messages are user-facing; UnicodeDecodeError and other
    library-raised subclasses may leak internals, so we sanitize those.
    """
    logger.error("[ValueError] URL: %s, Error: %s", request.url, exc)
    if isinstance(exc, UnicodeDecodeError):
        detail = "無法解析檔案編碼，請使用 UTF-8 格式"
    else:
        detail = str(exc)
    return JSONResponse(status_code=status.HTTP_400_BAD_REQUEST, content={"detail": detail})


@app.exception_handler(FileNotFoundError)
async def file_not_found_handler(request: Request, exc: FileNotFoundError) -> JSONResponse:
    """
    Handle FileNotFoundError exceptions globally.

    Returns generic message to avoid exposing filesystem paths.
    """
    logger.error("[FileNotFoundError] URL: %s, Error: %s", request.url, exc)
    return JSONResponse(
        status_code=status.HTTP_404_NOT_FOUND,
        content={"detail": "找不到請求的資源"},
    )


@app.exception_handler(PermissionError)
async def permission_error_handler(request: Request, exc: PermissionError) -> JSONResponse:
    """
    Handle PermissionError exceptions globally.

    Returns generic message to avoid leaking internal permission details.
    """
    logger.error("[PermissionError] URL: %s, Error: %s", request.url, exc)
    return JSONResponse(
        status_code=status.HTTP_403_FORBIDDEN,
        content={"detail": "您沒有權限執行此操作"},
    )


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


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    """
    Log 4xx detail before returning the standard FastAPI HTTPException response.

    FastAPI's built-in handler is silent, which makes diagnosing 4xx failures
    in production logs impossible (only the status code reaches the access log).
    Skips 401 to avoid noise from expected LIFF token expiry.
    """
    if 400 <= exc.status_code < 500 and exc.status_code != 401:
        # exc.detail is typed Any; cap length so a future dict/list detail
        # (e.g. validation error payload) cannot blow up a single log line.
        logger.warning(
            "[HTTP %d] %s %s — %s",
            exc.status_code,
            request.method,
            request.url.path,
            str(exc.detail)[:500],
        )
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
        headers=exc.headers,
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """
    Catch-all for uncaught exceptions.

    Logs with full traceback server-side, returns a generic JSON 500
    (no exception message, no stack) to the client so internal detail
    never leaks. Handlers for specific exception types (ValueError,
    PermissionError, etc.) still take precedence.
    """
    logger.exception(
        "[Unhandled] %s %s — %s: %s",
        request.method,
        request.url.path,
        type(exc).__name__,
        exc,
    )
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "Internal server error"},
    )


# Health check endpoint (public, exempt from rate limiting for load balancers)
@app.get("/health")
@limiter.exempt
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
