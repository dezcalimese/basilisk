"""Generic price data client for any Coinbase/Binance-supported asset."""

from datetime import UTC, datetime
from typing import Any

from app.core.http_client import get_http_client


# Mapping of asset symbols to their Coinbase and Binance identifiers
ASSET_CONFIG = {
    "BTC": {"coinbase": "BTC-USD", "binance": "BTCUSDT"},
    "ETH": {"coinbase": "ETH-USD", "binance": "ETHUSDT"},
    "XRP": {"coinbase": "XRP-USD", "binance": "XRPUSDT"},
    "SOL": {"coinbase": "SOL-USD", "binance": "SOLUSDT"},
    "DOGE": {"coinbase": "DOGE-USD", "binance": "DOGEUSDT"},
    "HYPE": {"coinbase": None, "binance": "HYPEUSDT"},  # Hyperliquid — may not be on Coinbase
    "BNB": {"coinbase": None, "binance": "BNBUSDT"},
}


class GenericPriceClient:
    """Client for fetching spot prices and historical candles for any supported asset."""

    def __init__(self, symbol: str) -> None:
        self.symbol = symbol.upper()
        config = ASSET_CONFIG.get(self.symbol)
        if not config:
            raise ValueError(f"Unsupported asset: {symbol}. Supported: {list(ASSET_CONFIG.keys())}")

        self.coinbase_pair = config["coinbase"]
        self.binance_pair = config["binance"]
        self.coinbase_url = (
            f"https://api.coinbase.com/v2/prices/{self.coinbase_pair}/spot"
            if self.coinbase_pair
            else None
        )
        self.candles_url = "https://api.binance.us/api/v3/klines"

    async def get_spot_price(self) -> float:
        """Fetch current spot price in USD."""
        client = await get_http_client()

        # Try Coinbase first
        if self.coinbase_url:
            try:
                response = await client.get(self.coinbase_url, timeout=10.0)
                response.raise_for_status()
                data: dict[str, Any] = response.json()
                return float(data["data"]["amount"])
            except Exception:
                pass  # Fall through to Binance

        # Fallback to Binance ticker
        if self.binance_pair:
            try:
                response = await client.get(
                    "https://api.binance.us/api/v3/ticker/price",
                    params={"symbol": self.binance_pair},
                    timeout=10.0,
                )
                response.raise_for_status()
                data = response.json()
                return float(data["price"])
            except Exception:
                pass

        raise RuntimeError(f"Failed to fetch spot price for {self.symbol}")

    async def get_historical_candles(
        self, hours: int = 168, interval: str = "1h"
    ) -> list[dict[str, Any]]:
        """
        Fetch historical OHLCV candles.

        Args:
            hours: Number of hours of history to fetch
            interval: Candle interval (1m, 5m, 15m, 1h, 4h, 1d)

        Returns:
            List of candle dicts with open, high, low, close, volume, timestamp
        """
        if not self.binance_pair:
            return []

        client = await get_http_client()

        now = datetime.now(UTC)
        start_ms = int((now.timestamp() - hours * 3600) * 1000)
        end_ms = int(now.timestamp() * 1000)

        all_candles: list[dict[str, Any]] = []
        current_start = start_ms

        while current_start < end_ms:
            try:
                response = await client.get(
                    self.candles_url,
                    params={
                        "symbol": self.binance_pair,
                        "interval": interval,
                        "startTime": current_start,
                        "endTime": end_ms,
                        "limit": 1000,
                    },
                    timeout=15.0,
                )
                response.raise_for_status()
                data = response.json()

                if not data:
                    break

                for kline in data:
                    all_candles.append({
                        "timestamp": kline[0],
                        "open": float(kline[1]),
                        "high": float(kline[2]),
                        "low": float(kline[3]),
                        "close": float(kline[4]),
                        "volume": float(kline[5]),
                    })

                # Move to next batch
                current_start = data[-1][0] + 1

                if len(data) < 1000:
                    break

            except Exception:
                break

        return all_candles
