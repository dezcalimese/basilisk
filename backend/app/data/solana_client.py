"""Solana (SOL) price data client."""

from datetime import UTC, datetime
from typing import Any

from app.core.http_client import get_http_client


class SolanaPriceClient:
    """Client for fetching Solana (SOL) spot prices and historical data."""

    def __init__(self) -> None:
        """Initialize Solana price client."""
        # Coinbase API for spot price
        self.api_url = "https://api.coinbase.com/v2/prices/SOL-USD/spot"
        # Use Binance.US for US-based requests (Binance.com geo-blocks US traffic)
        self.candles_url = "https://api.binance.us/api/v3/klines"

    async def get_spot_price(self) -> float:
        """
        Fetch current Solana (SOL) spot price in USD.

        Returns:
            Current SOL price in USD
        """
        client = await get_http_client()
        response = await client.get(self.api_url, timeout=10.0)
        response.raise_for_status()
        data: dict[str, Any] = response.json()

        # Coinbase API format: {"data": {"amount": "123.45"}}
        price_str = data["data"]["amount"]
        return float(price_str)

    async def get_historical_candles(
        self,
        hours: int = 168,  # Default 1 week
        granularity: int = 3600,  # 1 hour in seconds (kept for API compatibility)
    ) -> list[dict[str, Any]]:
        """
        Fetch historical OHLCV candles from Binance.

        Args:
            hours: Number of hours of history to fetch (max 1000 due to Binance limit)
            granularity: Candle size in seconds (3600 = 1 hour, kept for compatibility)

        Returns:
            List of candles in format:
            [
                {
                    "timestamp": datetime,
                    "open": float,
                    "high": float,
                    "low": float,
                    "close": float,
                    "volume": float
                },
                ...
            ]
        """
        # Binance API returns max 1000 candles per request
        # For hourly candles, that's 1000 hours (~41 days)
        max_hours = min(hours, 1000)

        params = {
            "symbol": "SOLUSDT",  # SOL/USDT pair
            "interval": "1h",  # 1 hour candles
            "limit": max_hours,  # Number of candles to return
        }

        client = await get_http_client()
        response = await client.get(
            self.candles_url, params=params, timeout=10.0
        )
        response.raise_for_status()
        raw_candles: list[list[Any]] = response.json()

        # Binance format: [timestamp_ms, open, high, low, close, volume, ...]
        # Convert to more readable dict format
        candles = []
        for candle in raw_candles:
            candles.append(
                {
                    "timestamp": datetime.fromtimestamp(
                        int(candle[0]) / 1000, tz=UTC
                    ),
                    "open": float(candle[1]),
                    "high": float(candle[2]),
                    "low": float(candle[3]),
                    "close": float(candle[4]),
                    "volume": float(candle[5]),
                }
            )

        # Binance returns data in ascending order (oldest to newest)
        candles.sort(key=lambda x: x["timestamp"])

        return candles
