"""
Singleton HTTP client for connection pooling across the application.

Provides a shared AsyncClient to reuse HTTP connections and reduce latency.
Includes rate limiting and retry logic for API calls.
"""

import asyncio
import httpx
import logging
import time
from typing import Optional

logger = logging.getLogger(__name__)

# Global HTTP client singleton
_http_client: Optional[httpx.AsyncClient] = None

# Rate limiting for Kalshi API (10 requests per second is safe)
_last_request_time: float = 0.0
_min_request_interval: float = 0.1  # 100ms between requests


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


async def rate_limited_request(
    method: str,
    url: str,
    **kwargs,
) -> httpx.Response:
    """
    Make a rate-limited HTTP request with retry logic for 429 errors.

    Args:
        method: HTTP method (GET, POST, etc.)
        url: Request URL
        **kwargs: Additional arguments for httpx request

    Returns:
        httpx.Response
    """
    global _last_request_time

    client = await get_http_client()

    # Rate limiting: ensure minimum interval between requests
    now = time.monotonic()
    elapsed = now - _last_request_time
    if elapsed < _min_request_interval:
        await asyncio.sleep(_min_request_interval - elapsed)

    _last_request_time = time.monotonic()

    # Retry logic with exponential backoff for 429 errors
    max_retries = 3
    base_delay = 1.0  # Start with 1 second delay

    for attempt in range(max_retries):
        try:
            response = await client.request(method, url, **kwargs)

            if response.status_code == 429:
                # Rate limited - wait and retry
                retry_after = response.headers.get("Retry-After", str(base_delay * (2 ** attempt)))
                wait_time = float(retry_after)
                logger.warning(f"⚠️  Rate limited (429). Waiting {wait_time}s before retry {attempt + 1}/{max_retries}")
                await asyncio.sleep(wait_time)
                continue

            return response

        except httpx.HTTPStatusError as e:
            if e.response.status_code == 429 and attempt < max_retries - 1:
                wait_time = base_delay * (2 ** attempt)
                logger.warning(f"⚠️  Rate limited. Waiting {wait_time}s before retry")
                await asyncio.sleep(wait_time)
                continue
            raise

    # If we exhausted retries, make one final attempt
    return await client.request(method, url, **kwargs)


async def close_http_client():
    """Close HTTP client on shutdown"""
    global _http_client
    if _http_client:
        await _http_client.aclose()
        _http_client = None
        logger.info("✓ HTTP client closed")
