"""
Redis cache layer for API optimization

Provides caching decorators and utilities to reduce external API calls.
Uses Redis for shared cache across multiple workers/instances.
Falls back to in-memory cache when Redis is unavailable.
"""

import json
import functools
import time
from typing import Any, Callable, Optional
from datetime import datetime
import redis.asyncio as redis
import logging

logger = logging.getLogger(__name__)

# Global Redis client and availability flag
_redis_client: Optional[redis.Redis] = None
_redis_available: bool = True  # Assume available until proven otherwise

# In-memory fallback cache (used when Redis is unavailable)
_memory_cache: dict[str, tuple[Any, float]] = {}  # key -> (value, expiry_timestamp)

# Adaptive TTL multipliers (increase when rate limited)
_ttl_multipliers: dict[str, float] = {}  # key_prefix -> multiplier (1.0 = normal, higher = extend TTL)
_rate_limit_events: dict[str, int] = {}  # key_prefix -> count of rate limit events


def record_rate_limit_event(key_prefix: str):
    """Record a rate limit event to trigger adaptive caching."""
    global _ttl_multipliers, _rate_limit_events

    # Increment event counter
    _rate_limit_events[key_prefix] = _rate_limit_events.get(key_prefix, 0) + 1

    # Increase TTL multiplier (cap at 4x)
    current = _ttl_multipliers.get(key_prefix, 1.0)
    _ttl_multipliers[key_prefix] = min(current * 1.5, 4.0)
    logger.warning(f"⚠️  Rate limit event for {key_prefix}, TTL multiplier now {_ttl_multipliers[key_prefix]:.1f}x")


def get_adaptive_ttl(key_prefix: str, base_ttl: int) -> int:
    """Get TTL adjusted by rate limit events."""
    multiplier = _ttl_multipliers.get(key_prefix, 1.0)
    return int(base_ttl * multiplier)


def reset_ttl_multiplier(key_prefix: str):
    """Gradually reduce TTL multiplier after successful requests."""
    global _ttl_multipliers
    if key_prefix in _ttl_multipliers and _ttl_multipliers[key_prefix] > 1.0:
        _ttl_multipliers[key_prefix] = max(1.0, _ttl_multipliers[key_prefix] * 0.9)


def get_rate_limit_stats() -> dict[str, Any]:
    """Get rate limit statistics for monitoring."""
    return {
        "ttl_multipliers": dict(_ttl_multipliers),
        "rate_limit_events": dict(_rate_limit_events),
    }


async def get_redis_client() -> Optional[redis.Redis]:
    """Get or create Redis client singleton. Returns None if Redis unavailable."""
    global _redis_client, _redis_available

    if not _redis_available:
        return None

    if _redis_client is None:
        try:
            _redis_client = redis.from_url(
                "redis://localhost:6379",
                encoding="utf-8",
                decode_responses=True,
                max_connections=50
            )
            # Test connection
            await _redis_client.ping()
            logger.info("✓ Redis client initialized")
        except Exception as e:
            logger.warning(f"⚠️  Redis unavailable, caching disabled: {e}")
            _redis_available = False
            _redis_client = None
            return None

    return _redis_client


async def close_redis_client():
    """Close Redis connection on shutdown"""
    global _redis_client, _redis_available
    if _redis_client:
        try:
            await _redis_client.aclose()
        except Exception:
            pass
        _redis_client = None
        logger.info("✓ Redis client closed")


def is_redis_available() -> bool:
    """Check if Redis is available"""
    return _redis_available


def _get_from_memory_cache(key: str) -> Optional[Any]:
    """Get value from in-memory cache if not expired."""
    if key in _memory_cache:
        value, expiry = _memory_cache[key]
        if time.time() < expiry:
            return value
        else:
            # Expired, remove it
            del _memory_cache[key]
    return None


def _set_memory_cache(key: str, value: Any, ttl: int):
    """Store value in in-memory cache."""
    _memory_cache[key] = (value, time.time() + ttl)


def cached(ttl: int, key_prefix: str, adaptive: bool = True):
    """
    Decorator for caching async function results in Redis.
    Falls back to in-memory cache when Redis is unavailable.
    Supports adaptive TTL that increases when rate limits are hit.

    Args:
        ttl: Base time-to-live in seconds
        key_prefix: Prefix for cache key (e.g., "contracts", "price")
        adaptive: If True, extend TTL when rate limits are detected

    Usage:
        @cached(ttl=60, key_prefix="contracts")
        async def get_bitcoin_contracts():
            # Expensive operation
            return data
    """
    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        async def wrapper(*args, **kwargs) -> Any:
            # Generate cache key from function args (skip 'self' for instance methods)
            # args[0] is 'self' for instance methods, skip it
            cache_args = args[1:] if args and hasattr(args[0], '__dict__') else args
            arg_str = ":".join(str(arg) for arg in cache_args if arg)
            kwarg_str = ":".join(f"{k}={v}" for k, v in sorted(kwargs.items()))
            cache_key = f"{key_prefix}:{arg_str}:{kwarg_str}".rstrip(":")

            # Calculate effective TTL (may be extended if rate limited)
            effective_ttl = get_adaptive_ttl(key_prefix, ttl) if adaptive else ttl

            # Get Redis client (None if unavailable)
            client = await get_redis_client()

            # Try Redis cache first
            if client is not None:
                try:
                    cached_data = await client.get(cache_key)
                    if cached_data:
                        # Reset TTL multiplier on successful cache hit
                        reset_ttl_multiplier(key_prefix)
                        print(f"✅ [Cache HIT] {cache_key} (Redis)")
                        return json.loads(cached_data)
                except Exception as e:
                    print(f"⚠️  [Cache] Error reading from Redis: {e}")

            # Try in-memory cache as fallback
            memory_result = _get_from_memory_cache(cache_key)
            if memory_result is not None:
                reset_ttl_multiplier(key_prefix)
                print(f"✅ [Cache HIT] {cache_key} (memory)")
                return memory_result

            # Cache miss - fetch fresh data
            print(f"❌ [Cache MISS] {cache_key}, fetching fresh data...")
            try:
                result = await func(*args, **kwargs)
                # Reset multiplier on successful fetch
                reset_ttl_multiplier(key_prefix)
            except Exception as e:
                # Check if this is a rate limit error
                error_str = str(e).lower()
                if "429" in error_str or "rate limit" in error_str:
                    record_rate_limit_event(key_prefix)
                raise

            # Store in Redis cache with effective TTL
            if client is not None:
                try:
                    await client.setex(
                        cache_key,
                        effective_ttl,
                        json.dumps(result, default=str)  # default=str handles datetime serialization
                    )
                    print(f"💾 [Cache] Stored {cache_key} in Redis (TTL: {effective_ttl}s)")
                except Exception as e:
                    print(f"⚠️  [Cache] Error writing to Redis: {e}")

            # Always store in memory cache as backup
            _set_memory_cache(cache_key, result, effective_ttl)

            return result

        return wrapper
    return decorator


async def invalidate_cache(pattern: str):
    """
    Manually invalidate cache keys matching a pattern

    Args:
        pattern: Redis key pattern (e.g., "contracts:BTC:*")

    Usage:
        await invalidate_cache("contracts:BTC:*")
    """
    client = await get_redis_client()
    if client is None:
        return

    try:
        keys = await client.keys(pattern)
        if keys:
            await client.delete(*keys)
            logger.info(f"[Cache] Invalidated {len(keys)} keys matching {pattern}")
    except Exception as e:
        logger.warning(f"[Cache] Error invalidating keys: {e}")


async def get_cache_stats() -> dict[str, Any]:
    """Get cache statistics for monitoring"""
    client = await get_redis_client()
    if client is None:
        return {
            "available": False,
            "total_keys": 0,
            "hits": 0,
            "misses": 0,
            "hit_rate": 0,
            "memory_used_mb": 0,
        }

    try:
        info = await client.info("stats")
        return {
            "available": True,
            "total_keys": await client.dbsize(),
            "hits": info.get("keyspace_hits", 0),
            "misses": info.get("keyspace_misses", 0),
            "hit_rate": (
                info.get("keyspace_hits", 0) /
                max(info.get("keyspace_hits", 0) + info.get("keyspace_misses", 0), 1)
            ) * 100,
            "memory_used_mb": info.get("used_memory", 0) / 1024 / 1024,
        }
    except Exception as e:
        logger.warning(f"[Cache] Error getting stats: {e}")
        return {
            "available": False,
            "error": str(e),
        }
