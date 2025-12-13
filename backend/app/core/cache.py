"""
Redis cache layer for API optimization

Provides caching decorators and utilities to reduce external API calls.
Uses Redis for shared cache across multiple workers/instances.
Falls back gracefully when Redis is unavailable.
"""

import json
import functools
from typing import Any, Callable, Optional
from datetime import datetime
import redis.asyncio as redis
import logging

logger = logging.getLogger(__name__)

# Global Redis client and availability flag
_redis_client: Optional[redis.Redis] = None
_redis_available: bool = True  # Assume available until proven otherwise


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


def cached(ttl: int, key_prefix: str):
    """
    Decorator for caching async function results in Redis

    Args:
        ttl: Time-to-live in seconds
        key_prefix: Prefix for cache key (e.g., "contracts", "price")

    Usage:
        @cached(ttl=60, key_prefix="contracts")
        async def get_bitcoin_contracts():
            # Expensive operation
            return data
    """
    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        async def wrapper(*args, **kwargs) -> Any:
            # Get Redis client (None if unavailable)
            client = await get_redis_client()

            # If Redis unavailable, just call the function directly
            if client is None:
                return await func(*args, **kwargs)

            # Generate cache key from function args (skip 'self' for instance methods)
            # args[0] is 'self' for instance methods, skip it
            cache_args = args[1:] if args and hasattr(args[0], '__dict__') else args
            arg_str = ":".join(str(arg) for arg in cache_args if arg)
            kwarg_str = ":".join(f"{k}={v}" for k, v in sorted(kwargs.items()))
            cache_key = f"{key_prefix}:{arg_str}:{kwarg_str}".rstrip(":")

            # Try to get from cache
            try:
                cached_data = await client.get(cache_key)
                if cached_data:
                    print(f"✅ [Cache HIT] {cache_key}")
                    return json.loads(cached_data)
            except Exception as e:
                print(f"⚠️  [Cache] Error reading from Redis: {e}")

            # Cache miss - fetch fresh data
            print(f"❌ [Cache MISS] {cache_key}, fetching fresh data...")
            result = await func(*args, **kwargs)

            # Store in cache
            try:
                await client.setex(
                    cache_key,
                    ttl,
                    json.dumps(result, default=str)  # default=str handles datetime serialization
                )
                print(f"💾 [Cache] Stored {cache_key} (TTL: {ttl}s)")
            except Exception as e:
                print(f"⚠️  [Cache] Error writing to Redis: {e}")

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
