"""Main FastAPI application."""

from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import candles, current, health, orderbook, signals, statistics
from app.core.cache import get_redis_client, close_redis_client
from app.core.http_client import get_http_client, close_http_client
from app.core.config import settings
from app.db.database import init_db


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan events."""
    # Startup
    await init_db()
    await get_redis_client()  # Initialize Redis connection
    await get_http_client()  # Initialize HTTP client with connection pooling
    yield
    # Shutdown
    await close_http_client()  # Close HTTP client
    await close_redis_client()  # Close Redis connection


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="Kalshi digital options trading analytics dashboard - A serpent's eye for mispriced markets",
    lifespan=lifespan,
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(health.router, prefix=settings.api_v1_prefix, tags=["health"])
app.include_router(signals.router, prefix=settings.api_v1_prefix, tags=["signals"])
app.include_router(current.router, prefix=settings.api_v1_prefix, tags=["current"])
app.include_router(candles.router, prefix=settings.api_v1_prefix, tags=["candles"])
app.include_router(statistics.router, prefix=settings.api_v1_prefix, tags=["statistics"])
app.include_router(orderbook.router, prefix=settings.api_v1_prefix, tags=["orderbook"])


@app.get("/")
async def root() -> dict[str, str]:
    """Root endpoint."""
    return {
        "name": settings.app_name,
        "version": settings.app_version,
        "tagline": "A serpent's eye for mispriced markets",
    }
