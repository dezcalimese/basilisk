"""Main FastAPI application."""

from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import auth, candles, current, health, mobile, orderbook, signals, statistics, trading, webhooks
from app.core.cache import get_redis_client, close_redis_client
from app.core.http_client import get_http_client, close_http_client
from app.core.config import settings
from app.data.kalshi_ws import get_ws_manager
from app.db.database import init_db


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan events."""
    # Startup
    await init_db()
    await get_redis_client()
    await get_http_client()
    ws_manager = get_ws_manager()
    await ws_manager.start()
    yield
    # Shutdown
    await ws_manager.stop()
    await close_http_client()
    await close_redis_client()


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
app.include_router(trading.router, prefix=settings.api_v1_prefix, tags=["trading"])
app.include_router(mobile.router, prefix=settings.api_v1_prefix, tags=["mobile"])
app.include_router(webhooks.router, prefix=settings.api_v1_prefix, tags=["webhooks"])
app.include_router(auth.router, prefix=settings.api_v1_prefix, tags=["auth"])


@app.get("/")
async def root() -> dict[str, str]:
    """Root endpoint."""
    return {
        "name": settings.app_name,
        "version": settings.app_version,
        "tagline": "A serpent's eye for mispriced markets",
    }
