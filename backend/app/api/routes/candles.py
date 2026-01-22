"""Candles API routes - Multi-exchange proxy with fallback."""

import asyncio
import httpx
import ccxt
from fastapi import APIRouter, HTTPException, Query
from typing import List, Any
import time

from app.core.cache import cached

router = APIRouter()


# Map friendly intervals to exchange-specific formats
INTERVAL_MAP = {
    "1m": {"ccxt": "1m", "minutes": 1},
    "5m": {"ccxt": "5m", "minutes": 5},
    "15m": {"ccxt": "15m", "minutes": 15},
    "1h": {"ccxt": "1h", "minutes": 60},
    "4h": {"ccxt": "4h", "minutes": 240},
    "1d": {"ccxt": "1d", "minutes": 1440},
}


async def fetch_from_coingecko(limit: int = 500) -> List[Any]:
    """
    Fetch from CoinGecko (free, globally accessible, no API key).
    Returns 1-day candles by default.
    """
    try:
        # CoinGecko provides daily OHLC data for free
        # For intraday data, we'd need their paid API
        url = "https://api.coingecko.com/api/v3/coins/bitcoin/ohlc"
        params = {
            "vs_currency": "usd",
            "days": min(limit // 24, 90),  # Max 90 days
        }

        async with httpx.AsyncClient() as client:
            response = await client.get(url, params=params, timeout=15.0)
            response.raise_for_status()
            data = response.json()

            # CoinGecko format: [[timestamp_ms, open, high, low, close], ...]
            # Add volume as 0 since it's not provided
            candles = [
                [candle[0], candle[1], candle[2], candle[3], candle[4], 0.0]
                for candle in data
            ]

            return candles[-limit:] if len(candles) > limit else candles

    except Exception as e:
        raise Exception(f"CoinGecko error: {str(e)}")


def _sync_fetch_ohlcv(exchange_id: str, symbol: str, interval: str, limit: int) -> List[Any]:
    """
    Synchronous CCXT fetch - runs in thread pool to avoid blocking event loop.
    """
    exchange_class = getattr(ccxt, exchange_id)
    exchange = exchange_class({"enableRateLimit": True})
    return exchange.fetch_ohlcv(symbol, interval, limit=limit)


async def fetch_from_ccxt(asset: str, interval: str, limit: int) -> List[Any]:
    """
    Fetch using CCXT library with multiple exchange fallback.
    Tries exchanges in order until one succeeds.
    Uses asyncio.to_thread() to avoid blocking the event loop.

    Args:
        asset: Asset to fetch (BTC, ETH, XRP)
        interval: Candle interval
        limit: Number of candles
    """
    # Exchange configs per asset
    ASSET_EXCHANGES = {
        "BTC": [
            {"id": "kraken", "symbol": "BTC/USD"},
            {"id": "coinbase", "symbol": "BTC/USD"},
            {"id": "bitfinex", "symbol": "BTC/USD"},
            {"id": "bybit", "symbol": "BTC/USDT"},
        ],
        "ETH": [
            {"id": "kraken", "symbol": "ETH/USD"},
            {"id": "coinbase", "symbol": "ETH/USD"},
            {"id": "bitfinex", "symbol": "ETH/USD"},
            {"id": "bybit", "symbol": "ETH/USDT"},
        ],
        "XRP": [
            {"id": "kraken", "symbol": "XRP/USD"},
            {"id": "bitfinex", "symbol": "XRP/USD"},
            {"id": "bybit", "symbol": "XRP/USDT"},
        ],
        "SOL": [
            {"id": "kraken", "symbol": "SOL/USD"},
            {"id": "coinbase", "symbol": "SOL/USD"},
            {"id": "bitfinex", "symbol": "SOL/USD"},
            {"id": "bybit", "symbol": "SOL/USDT"},
        ],
    }

    exchanges_to_try = ASSET_EXCHANGES.get(asset.upper(), ASSET_EXCHANGES["BTC"])
    ccxt_interval = INTERVAL_MAP.get(interval, {}).get("ccxt", "1m")
    errors = []

    for exchange_config in exchanges_to_try:
        try:
            # Run synchronous CCXT call in thread pool to avoid blocking
            ohlcv = await asyncio.to_thread(
                _sync_fetch_ohlcv,
                exchange_config["id"],
                exchange_config["symbol"],
                ccxt_interval,
                limit,
            )

            # CCXT format: [[timestamp, open, high, low, close, volume], ...]
            print(f"[Candles] Fetched {asset} from {exchange_config['id']}")
            return ohlcv

        except Exception as e:
            errors.append(f"{exchange_config['id']}: {str(e)}")
            continue

    # If all exchanges failed, raise error
    raise Exception(f"All exchanges failed for {asset}. Errors: {'; '.join(errors)}")


@cached(ttl=30, key_prefix="candles")
async def _get_candles_cached(asset: str, interval: str, limit: int) -> List[Any]:
    """
    Cached candle fetching with multi-exchange fallback.
    TTL is 30 seconds to balance freshness with rate limiting.
    """
    # Try CCXT exchanges first (supports intraday data)
    try:
        candles = await fetch_from_ccxt(asset, interval, limit)
        return candles
    except Exception as ccxt_error:
        print(f"[Candles API] CCXT failed for {asset}: {ccxt_error}")

        # Fallback to CoinGecko (only for BTC daily data)
        if interval == "1d" and asset == "BTC":
            try:
                candles = await fetch_from_coingecko(limit)
                return candles
            except Exception as cg_error:
                print(f"[Candles API] CoinGecko failed: {cg_error}")

        # If everything failed, raise the original CCXT error
        raise ccxt_error


async def _get_candles(asset: str, interval: str, limit: int) -> List[Any]:
    """Common candle fetching logic for all assets."""
    try:
        # Validate interval
        if interval not in INTERVAL_MAP:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid interval. Must be one of: {', '.join(INTERVAL_MAP.keys())}"
            )

        return await _get_candles_cached(asset, interval, limit)

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=503,
            detail=f"Failed to fetch {asset} candles from any exchange: {str(e)}"
        )


@router.get("/candles/btcusd")
async def get_btc_candles(
    interval: str = Query(default="1m", description="Candle interval (1m, 5m, 15m, 1h, 4h, 1d)"),
    limit: int = Query(default=500, ge=1, le=1000, description="Number of candles to return"),
) -> List[Any]:
    """
    Fetch BTC/USD candlestick data with multi-exchange fallback.

    Tries multiple data sources in order:
    1. CCXT exchanges (Kraken, Coinbase, Bitfinex, Bybit)
    2. CoinGecko (fallback for daily data)

    Returns:
        List of candles in format: [timestamp, open, high, low, close, volume]
    """
    return await _get_candles("BTC", interval, limit)


@router.get("/candles/ethusd")
async def get_eth_candles(
    interval: str = Query(default="1m", description="Candle interval (1m, 5m, 15m, 1h, 4h, 1d)"),
    limit: int = Query(default=500, ge=1, le=1000, description="Number of candles to return"),
) -> List[Any]:
    """
    Fetch ETH/USD candlestick data with multi-exchange fallback.

    Returns:
        List of candles in format: [timestamp, open, high, low, close, volume]
    """
    return await _get_candles("ETH", interval, limit)


@router.get("/candles/xrpusd")
async def get_xrp_candles(
    interval: str = Query(default="1m", description="Candle interval (1m, 5m, 15m, 1h, 4h, 1d)"),
    limit: int = Query(default=500, ge=1, le=1000, description="Number of candles to return"),
) -> List[Any]:
    """
    Fetch XRP/USD candlestick data with multi-exchange fallback.

    Returns:
        List of candles in format: [timestamp, open, high, low, close, volume]
    """
    return await _get_candles("XRP", interval, limit)


@router.get("/candles/solusd")
async def get_sol_candles(
    interval: str = Query(default="1m", description="Candle interval (1m, 5m, 15m, 1h, 4h, 1d)"),
    limit: int = Query(default=500, ge=1, le=1000, description="Number of candles to return"),
) -> List[Any]:
    """
    Fetch SOL/USD candlestick data with multi-exchange fallback.

    Returns:
        List of candles in format: [timestamp, open, high, low, close, volume]
    """
    return await _get_candles("SOL", interval, limit)
