"""Candles API routes - Multi-exchange proxy with fallback."""

import httpx
import ccxt
from fastapi import APIRouter, HTTPException, Query
from typing import List, Any
import time

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


async def fetch_from_ccxt(interval: str, limit: int) -> List[Any]:
    """
    Fetch using CCXT library with multiple exchange fallback.
    Tries exchanges in order until one succeeds.
    """
    # Exchanges to try (in order of reliability for US users)
    exchanges_to_try = [
        {"id": "kraken", "symbol": "BTC/USD"},
        {"id": "coinbase", "symbol": "BTC/USD"},
        {"id": "bitfinex", "symbol": "BTC/USD"},
        {"id": "bybit", "symbol": "BTC/USDT"},
    ]

    ccxt_interval = INTERVAL_MAP.get(interval, {}).get("ccxt", "1m")
    errors = []

    for exchange_config in exchanges_to_try:
        try:
            # Create exchange instance
            exchange_class = getattr(ccxt, exchange_config["id"])
            exchange = exchange_class({"enableRateLimit": True})

            # Fetch OHLCV data
            ohlcv = exchange.fetch_ohlcv(
                exchange_config["symbol"], ccxt_interval, limit=limit
            )

            # CCXT format: [[timestamp, open, high, low, close, volume], ...]
            return ohlcv

        except Exception as e:
            errors.append(f"{exchange_config['id']}: {str(e)}")
            continue

    # If all exchanges failed, raise error
    raise Exception(f"All exchanges failed. Errors: {'; '.join(errors)}")


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
    try:
        # Validate interval
        if interval not in INTERVAL_MAP:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid interval. Must be one of: {', '.join(INTERVAL_MAP.keys())}"
            )

        # Try CCXT exchanges first (supports intraday data)
        try:
            candles = await fetch_from_ccxt(interval, limit)
            return candles
        except Exception as ccxt_error:
            print(f"[Candles API] CCXT failed: {ccxt_error}")

            # Fallback to CoinGecko (only for daily data)
            if interval == "1d":
                try:
                    candles = await fetch_from_coingecko(limit)
                    return candles
                except Exception as cg_error:
                    print(f"[Candles API] CoinGecko failed: {cg_error}")

            # If everything failed, raise the original CCXT error
            raise HTTPException(
                status_code=503,
                detail=f"Failed to fetch candles from any exchange: {str(ccxt_error)}"
            )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Internal error fetching candles: {str(e)}"
        )
