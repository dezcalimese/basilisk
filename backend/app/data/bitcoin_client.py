"""Bitcoin price data client."""

from typing import Any

import httpx

from app.core.config import settings


class BitcoinPriceClient:
    """Client for fetching Bitcoin spot prices."""

    def __init__(self) -> None:
        """Initialize Bitcoin price client."""
        self.api_url = settings.bitcoin_price_api_url

    async def get_spot_price(self) -> float:
        """
        Fetch current Bitcoin spot price in USD.

        Returns:
            Current BTC price in USD
        """
        async with httpx.AsyncClient() as client:
            response = await client.get(self.api_url, timeout=10.0)
            response.raise_for_status()
            data: dict[str, Any] = response.json()

            # Coinbase API format: {"data": {"amount": "67890.12"}}
            price_str = data["data"]["amount"]
            return float(price_str)
