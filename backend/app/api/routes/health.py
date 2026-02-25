"""Health check endpoints."""

from fastapi import APIRouter

from app.core.circuit_breakers import get_breaker_status
from app.core.encryption import is_encryption_configured
from app.services.candle_cache import get_candle_cache_health

router = APIRouter()

MONITORED_ASSETS = ["BTC", "ETH", "XRP", "SOL"]
MONITORED_INTERVALS = ["1m"]
MONITORED_LIMIT = 500


@router.get("/health")
async def health_check() -> dict:
    """
    Health check endpoint.

    Returns service status including circuit breaker states and candle cache telemetry.
    """
    candle_cache = await get_candle_cache_health(
        MONITORED_ASSETS,
        MONITORED_INTERVALS,
        MONITORED_LIMIT,
    )

    stale_alerts = [entry for entry in candle_cache if entry["stale_active"]]

    return {
        "status": "healthy" if not stale_alerts else "degraded",
        "service": "basilisk",
        "circuit_breakers": get_breaker_status(),
        "encryption_configured": is_encryption_configured(),
        "candle_cache": candle_cache,
        "stale_alerts": len(stale_alerts),
    }
