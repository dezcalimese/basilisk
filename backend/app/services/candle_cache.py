"""Helpers for persisting candle payloads and stale event telemetry."""

from __future__ import annotations

import time
from datetime import datetime, timezone
from typing import Any, List, Optional

from app.core.cache import cache_set_json, cache_get_json

LAST_KNOWN_CACHE_PREFIX = "candles:last_success"
LAST_STALE_CACHE_PREFIX = "candles:last_stale"
LAST_KNOWN_CACHE_TTL = 300  # seconds


def _last_known_key(asset: str, interval: str, limit: int) -> str:
    return f"{LAST_KNOWN_CACHE_PREFIX}:{asset.upper()}:{interval}:{limit}"


def _last_stale_key(asset: str, interval: str, limit: int) -> str:
    return f"{LAST_STALE_CACHE_PREFIX}:{asset.upper()}:{interval}:{limit}"


async def store_last_known(asset: str, interval: str, limit: int, candles: List[Any]) -> None:
    payload = {
        "candles": candles,
        "stored_at": time.time(),
        "asset": asset.upper(),
        "interval": interval,
        "limit": limit,
    }
    await cache_set_json(_last_known_key(asset, interval, limit), payload, ttl=LAST_KNOWN_CACHE_TTL)


async def get_last_known_payload(asset: str, interval: str, limit: int) -> Optional[dict[str, Any]]:
    payload = await cache_get_json(_last_known_key(asset, interval, limit))
    return payload


async def get_last_known_candles(asset: str, interval: str, limit: int) -> Optional[List[Any]]:
    payload = await get_last_known_payload(asset, interval, limit)
    if not payload:
        return None
    return payload.get("candles")


async def record_stale_event(asset: str, interval: str, limit: int, error: str) -> None:
    payload = {
        "served_at": time.time(),
        "asset": asset.upper(),
        "interval": interval,
        "limit": limit,
        "error": error,
    }
    await cache_set_json(_last_stale_key(asset, interval, limit), payload, ttl=LAST_KNOWN_CACHE_TTL)


async def get_last_stale_event(asset: str, interval: str, limit: int) -> Optional[dict[str, Any]]:
    return await cache_get_json(_last_stale_key(asset, interval, limit))


def _format_timestamp(ts: Optional[float]) -> Optional[str]:
    if not ts:
        return None
    return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()


async def get_candle_cache_health(
    assets: List[str],
    intervals: List[str],
    limit: int,
) -> List[dict[str, Any]]:
    """
    Build telemetry records per asset/interval for health monitoring.
    """
    health: List[dict[str, Any]] = []
    now = time.time()

    for asset in assets:
        for interval in intervals:
            payload = await get_last_known_payload(asset, interval, limit)
            stale_event = await get_last_stale_event(asset, interval, limit)

            last_success_ts = payload.get("stored_at") if payload else None
            last_stale_ts = stale_event.get("served_at") if stale_event else None

            health.append({
                "asset": asset.upper(),
                "interval": interval,
                "limit": limit,
                "cached_candles": len(payload.get("candles", [])) if payload else 0,
                "last_success_at": _format_timestamp(last_success_ts),
                "seconds_since_success": (now - last_success_ts) if last_success_ts else None,
                "last_stale_at": _format_timestamp(last_stale_ts),
                "seconds_since_stale": (now - last_stale_ts) if last_stale_ts else None,
                "last_stale_error": stale_event.get("error") if stale_event else None,
                "stale_active": bool(
                    last_stale_ts and (now - last_stale_ts) < LAST_KNOWN_CACHE_TTL
                ),
            })

    return health
