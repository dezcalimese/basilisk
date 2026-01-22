"""
Singleton HTTP client for connection pooling across the application.

Provides a shared AsyncClient to reuse HTTP connections and reduce latency.
Includes rate limiting, retry logic, and circuit breaker support for API calls.
"""

import asyncio
import httpx
import logging
import time
from dataclasses import dataclass, field
from typing import Optional

from pybreaker import CircuitBreaker, CircuitBreakerError
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
)

logger = logging.getLogger(__name__)

# Global HTTP client singleton
_http_client: Optional[httpx.AsyncClient] = None


@dataclass
class TokenBucket:
    """Token bucket rate limiter with burst support."""

    capacity: float  # Maximum tokens
    refill_rate: float  # Tokens per second
    tokens: float = field(init=False)
    last_refill: float = field(init=False)
    _lock: asyncio.Lock = field(default_factory=asyncio.Lock, repr=False)

    def __post_init__(self):
        self.tokens = self.capacity
        self.last_refill = time.monotonic()

    async def acquire(self, tokens: float = 1.0) -> float:
        """
        Acquire tokens from the bucket. Returns wait time if bucket is empty.

        Args:
            tokens: Number of tokens to acquire

        Returns:
            Wait time in seconds (0 if tokens available immediately)
        """
        async with self._lock:
            now = time.monotonic()

            # Refill tokens based on elapsed time
            elapsed = now - self.last_refill
            self.tokens = min(self.capacity, self.tokens + elapsed * self.refill_rate)
            self.last_refill = now

            if self.tokens >= tokens:
                self.tokens -= tokens
                return 0.0

            # Calculate wait time for tokens to become available
            needed = tokens - self.tokens
            wait_time = needed / self.refill_rate
            return wait_time

    async def wait_and_acquire(self, tokens: float = 1.0):
        """Wait for tokens to become available and acquire them."""
        wait_time = await self.acquire(tokens)
        if wait_time > 0:
            await asyncio.sleep(wait_time)
            # Re-acquire after waiting
            await self.acquire(tokens)


# Per-API rate limiters with different configurations
class APIRateLimiters:
    """Centralized rate limiters for different APIs."""

    def __init__(self):
        # Kalshi: 10 requests/second, allow burst of 5
        self.kalshi = TokenBucket(capacity=5.0, refill_rate=10.0)

        # Coinbase: 10 requests/second, allow burst of 10
        self.coinbase = TokenBucket(capacity=10.0, refill_rate=10.0)

        # Deribit: 5 requests/second, allow burst of 3
        self.deribit = TokenBucket(capacity=3.0, refill_rate=5.0)

        # Generic fallback: 5 requests/second
        self.generic = TokenBucket(capacity=3.0, refill_rate=5.0)

        # Adaptive backoff multiplier (increases when rate limited)
        self._backoff_multiplier: dict[str, float] = {
            "kalshi": 1.0,
            "coinbase": 1.0,
            "deribit": 1.0,
            "generic": 1.0,
        }

    def get_limiter(self, url: str) -> tuple[TokenBucket, str]:
        """Get appropriate rate limiter based on URL."""
        url_lower = url.lower()

        if "kalshi" in url_lower or "api.elections" in url_lower:
            return self.kalshi, "kalshi"
        elif "coinbase" in url_lower:
            return self.coinbase, "coinbase"
        elif "deribit" in url_lower:
            return self.deribit, "deribit"
        else:
            return self.generic, "generic"

    def apply_backoff(self, api_name: str, multiplier: float = 2.0):
        """Increase backoff multiplier after rate limit hit."""
        current = self._backoff_multiplier.get(api_name, 1.0)
        self._backoff_multiplier[api_name] = min(current * multiplier, 8.0)
        logger.warning(f"⚠️ {api_name} backoff increased to {self._backoff_multiplier[api_name]}x")

    def reset_backoff(self, api_name: str):
        """Reset backoff multiplier after successful requests."""
        if self._backoff_multiplier.get(api_name, 1.0) > 1.0:
            self._backoff_multiplier[api_name] = max(1.0, self._backoff_multiplier[api_name] * 0.8)

    def get_backoff(self, api_name: str) -> float:
        """Get current backoff multiplier for an API."""
        return self._backoff_multiplier.get(api_name, 1.0)


# Global rate limiters instance
_rate_limiters: Optional[APIRateLimiters] = None

# Global request queue for serializing API calls
_request_lock: Optional[asyncio.Lock] = None
_api_locks: dict[str, asyncio.Lock] = {}


def get_rate_limiters() -> APIRateLimiters:
    """Get or create rate limiters singleton."""
    global _rate_limiters
    if _rate_limiters is None:
        _rate_limiters = APIRateLimiters()
    return _rate_limiters


def get_api_lock(api_name: str) -> asyncio.Lock:
    """Get or create a lock for serializing requests to a specific API."""
    global _api_locks
    if api_name not in _api_locks:
        _api_locks[api_name] = asyncio.Lock()
    return _api_locks[api_name]


async def serialized_request(
    method: str,
    url: str,
    serialize: bool = True,
    priority: int = 1,
    **kwargs,
) -> httpx.Response:
    """
    Make a serialized, rate-limited HTTP request.

    This ensures that requests to the same API are processed one at a time,
    preventing concurrent requests from overwhelming rate limits.

    Args:
        method: HTTP method (GET, POST, etc.)
        url: Request URL
        serialize: If True, serialize requests to the same API (default True for Kalshi)
        priority: Request priority (higher = more tokens consumed)
        **kwargs: Additional arguments for httpx request

    Returns:
        httpx.Response
    """
    limiters = get_rate_limiters()
    _, api_name = limiters.get_limiter(url)

    if serialize and api_name == "kalshi":
        # Serialize Kalshi requests to prevent concurrent rate limit hits
        lock = get_api_lock(api_name)
        async with lock:
            return await rate_limited_request(method, url, priority=priority, **kwargs)
    else:
        # Other APIs can run concurrently with rate limiting
        return await rate_limited_request(method, url, priority=priority, **kwargs)


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
    priority: int = 1,
    **kwargs,
) -> httpx.Response:
    """
    Make a rate-limited HTTP request with per-API token bucket and retry logic.

    Args:
        method: HTTP method (GET, POST, etc.)
        url: Request URL
        priority: Request priority (higher = more tokens consumed, use 1 for normal)
        **kwargs: Additional arguments for httpx request

    Returns:
        httpx.Response
    """
    client = await get_http_client()
    limiters = get_rate_limiters()

    # Get appropriate rate limiter for this API
    limiter, api_name = limiters.get_limiter(url)
    backoff = limiters.get_backoff(api_name)

    # Wait for tokens (with backoff multiplier applied)
    tokens_needed = priority * backoff
    await limiter.wait_and_acquire(tokens_needed)

    # Retry logic with exponential backoff for 429 errors
    max_retries = 4
    base_delay = 1.0  # Start with 1 second delay

    for attempt in range(max_retries):
        try:
            response = await client.request(method, url, **kwargs)

            if response.status_code == 429:
                # Rate limited - apply backoff and wait
                limiters.apply_backoff(api_name)
                retry_after = response.headers.get("Retry-After", str(base_delay * (2 ** attempt)))
                wait_time = float(retry_after) * backoff
                logger.warning(
                    f"⚠️  {api_name} rate limited (429). "
                    f"Waiting {wait_time:.1f}s before retry {attempt + 1}/{max_retries}"
                )
                await asyncio.sleep(wait_time)
                # Re-acquire tokens after waiting
                await limiter.wait_and_acquire(tokens_needed)
                continue

            # Success - gradually reset backoff
            limiters.reset_backoff(api_name)
            return response

        except httpx.HTTPStatusError as e:
            if e.response.status_code == 429 and attempt < max_retries - 1:
                limiters.apply_backoff(api_name)
                wait_time = base_delay * (2 ** attempt) * backoff
                logger.warning(f"⚠️  {api_name} rate limited. Waiting {wait_time:.1f}s before retry")
                await asyncio.sleep(wait_time)
                await limiter.wait_and_acquire(tokens_needed)
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


class ServiceUnavailableError(Exception):
    """Raised when a service is unavailable (circuit breaker open)."""

    def __init__(self, service_name: str, message: str = "Service temporarily unavailable"):
        self.service_name = service_name
        super().__init__(f"{message}: {service_name}")


async def resilient_request(
    breaker: CircuitBreaker,
    method: str,
    url: str,
    **kwargs,
) -> httpx.Response:
    """
    Make resilient HTTP request with circuit breaker + rate limiting + retry.

    This is the recommended function for calling external APIs. It provides:
    - Circuit breaker to fail fast when services are down
    - Rate limiting to prevent overwhelming APIs
    - Retry logic with exponential backoff for transient failures

    Args:
        breaker: Circuit breaker instance for this service
        method: HTTP method (GET, POST, etc.)
        url: Request URL
        **kwargs: Additional arguments for httpx request

    Returns:
        httpx.Response

    Raises:
        ServiceUnavailableError: When circuit breaker is open
        httpx.HTTPError: When request fails after retries
    """

    async def _make_request() -> httpx.Response:
        """Inner function that makes the actual request with rate limiting."""
        return await rate_limited_request(method, url, **kwargs)

    async def _call_with_breaker() -> httpx.Response:
        """Wrap request with circuit breaker."""
        try:
            return await breaker.call_async(_make_request)
        except CircuitBreakerError:
            logger.warning(f"Circuit breaker open for {breaker.name}, failing fast")
            raise ServiceUnavailableError(breaker.name)

    # Retry transient failures (network errors, timeouts)
    # but NOT circuit breaker errors (those should fail fast)
    max_attempts = 3
    base_wait = 1
    max_wait = 10

    for attempt in range(max_attempts):
        try:
            return await _call_with_breaker()
        except ServiceUnavailableError:
            # Don't retry circuit breaker errors
            raise
        except (httpx.TimeoutException, httpx.NetworkError, httpx.ConnectError) as e:
            if attempt < max_attempts - 1:
                wait_time = min(base_wait * (2 ** attempt), max_wait)
                logger.warning(
                    f"Transient error ({type(e).__name__}), "
                    f"retrying in {wait_time}s (attempt {attempt + 1}/{max_attempts})"
                )
                await asyncio.sleep(wait_time)
            else:
                raise

    # Should not reach here, but just in case
    return await _call_with_breaker()
