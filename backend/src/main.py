"""
Three Kingdoms Strategy Manager FastAPI Application

符合 CLAUDE.md:
- redirect_slashes=False (cloud deployment requirement)
- Proper CORS configuration
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.api.v1.endpoints import (
    alliance_collaborators,
    alliances,
    hegemony_weights,
    periods,
    seasons,
    uploads,
)
from src.core.config import settings

# Create FastAPI app
# 符合 CLAUDE.md 🔴: redirect_slashes=False for cloud deployment
app = FastAPI(
    title="Three Kingdoms Strategy Manager API",
    description="Alliance Member Performance Tracking System",
    version="0.1.0",
    redirect_slashes=False,
    docs_url="/docs" if settings.debug else None,
    redoc_url="/redoc" if settings.debug else None,
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

# Health check endpoint (public)
@app.get("/health")
async def health_check():
    """Health check endpoint (no auth required)"""
    return {
        "status": "healthy",
        "environment": settings.environment,
        "version": "0.1.0"
    }

# Root endpoint
@app.get("")
async def root():
    """API root endpoint"""
    return {
        "message": "Three Kingdoms Strategy Manager API",
        "docs": "/docs" if settings.debug else "disabled",
        "version": "0.1.0"
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "src.main:app",
        host="0.0.0.0",
        port=8087,
        reload=settings.debug,
        log_level=settings.log_level.lower()
    )
