"""
Singleton HTTP client for connection pooling across the application.

Provides a shared AsyncClient to reuse HTTP connections and reduce latency.
"""

import httpx
import logging
from typing import Optional

logger = logging.getLogger(__name__)

# Global HTTP client singleton
_http_client: Optional[httpx.AsyncClient] = None


async def get_http_client() -> httpx.AsyncClient:
    """Get or create HTTP client singleton with connection pooling"""
    global _http_client

    if _http_client is None:
        # Create client with connection pooling and optimized settings
        _http_client = httpx.AsyncClient(
            limits=httpx.Limits(
                max_connections=100,  # Total connection pool size
                max_keepalive_connections=20,  # Connections to keep alive
                keepalive_expiry=30.0,  # Seconds to keep connections alive
            ),
            timeout=httpx.Timeout(30.0),  # Default timeout for all requests
            follow_redirects=True,
        )
        logger.info("✓ HTTP client initialized with connection pooling")

    return _http_client


async def close_http_client():
    """Close HTTP client on shutdown"""
    global _http_client
    if _http_client:
        await _http_client.aclose()
        _http_client = None
        logger.info("✓ HTTP client closed")
