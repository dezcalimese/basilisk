"""Health check endpoints."""

from fastapi import APIRouter

from app.core.circuit_breakers import get_breaker_status
from app.core.encryption import is_encryption_configured

router = APIRouter()


@router.get("/health")
async def health_check() -> dict:
    """
    Health check endpoint.

    Returns service status including circuit breaker states.
    """
    return {
        "status": "healthy",
        "service": "basilisk",
        "circuit_breakers": get_breaker_status(),
        "encryption_configured": is_encryption_configured(),
    }
