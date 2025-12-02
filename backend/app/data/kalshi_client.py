"""Kalshi API client for fetching contract data."""

import base64
import time
from pathlib import Path
from typing import Any

import httpx
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding

from app.core.config import settings
from app.core.http_client import get_http_client


class KalshiClient:
    """Client for interacting with Kalshi API using RSA-PSS authentication."""

    def __init__(self) -> None:
        """Initialize Kalshi client."""
        self.base_url = (
            settings.kalshi_demo_base_url
            if settings.kalshi_use_demo
            else settings.kalshi_api_base_url
        )
        self.key_id = settings.kalshi_key_id
        self.private_key = self._load_private_key(settings.kalshi_private_key_path)

    async def get_markets(
        self,
        event_ticker: str | None = None,
        series_ticker: str | None = None,
        limit: int = 100,
        cursor: str | None = None,
    ) -> dict[str, Any]:
        """
        Fetch market data from Kalshi.

        Args:
            event_ticker: Optional event ticker to filter markets
            series_ticker: Optional series ticker to filter markets
            limit: Number of results to return (max 1000)
            cursor: Pagination cursor returned from prior call

        Returns:
            Market data from Kalshi API
        """
        path = "/markets"
        client = await get_http_client()
        params = {"limit": min(limit, 1000)}
        if event_ticker:
            params["event_ticker"] = event_ticker
        if series_ticker:
            params["series_ticker"] = series_ticker
        if cursor:
            params["cursor"] = cursor

        response = await client.get(
            f"{self.base_url}{path}",
            params=params,
            headers=self._get_auth_headers(method="GET", path=path),
            timeout=30.0,
        )
        response.raise_for_status()
        return response.json()

    async def get_market_orderbook(self, ticker: str) -> dict[str, Any]:
        """
        Fetch orderbook for a specific market.

        Args:
            ticker: Market ticker symbol

        Returns:
            Orderbook data with bids and asks
        """
        path = f"/markets/{ticker}/orderbook"
        client = await get_http_client()
        response = await client.get(
            f"{self.base_url}{path}",
            headers=self._get_auth_headers(method="GET", path=path),
            timeout=30.0,
        )
        response.raise_for_status()
        return response.json()

    def _load_private_key(self, key_path: str) -> Any:
        """
        Load RSA private key from PEM file.

        Args:
            key_path: Path to the PEM-formatted private key file

        Returns:
            RSA private key object
        """
        if not key_path:
            # Return None if no key path configured (for demo/testing)
            return None

        key_file = Path(key_path)
        if not key_file.exists():
            raise FileNotFoundError(f"Private key file not found: {key_path}")

        with open(key_file, "rb") as f:
            private_key = serialization.load_pem_private_key(
                f.read(), password=None, backend=default_backend()
            )
        return private_key

    def _sign_message(self, message: str) -> str:
        """
        Sign a message using RSA-PSS signature.

        Args:
            message: Message string to sign

        Returns:
            Base64-encoded signature
        """
        if not self.private_key:
            # Return empty signature if no key configured
            return ""

        message_bytes = message.encode("utf-8")
        signature = self.private_key.sign(
            message_bytes,
            padding.PSS(
                mgf=padding.MGF1(hashes.SHA256()),
                salt_length=padding.PSS.DIGEST_LENGTH,
            ),
            hashes.SHA256(),
        )
        return base64.b64encode(signature).decode("utf-8")

    def _get_auth_headers(self, method: str = "GET", path: str = "") -> dict[str, str]:
        """
        Generate authentication headers for Kalshi API.

        Uses RSA-PSS signature-based authentication as per Kalshi docs.

        Args:
            method: HTTP method (GET, POST, DELETE, etc.)
            path: API path without query parameters

        Returns:
            Dictionary of authentication headers
        """
        if not self.key_id or not self.private_key:
            # Return basic headers if not configured
            return {"Content-Type": "application/json"}

        # Generate timestamp in milliseconds
        timestamp = str(int(time.time() * 1000))

        # Create message to sign: timestamp + method + path
        # Path should NOT include query parameters
        message = timestamp + method + path

        # Sign the message
        signature = self._sign_message(message)

        return {
            "Content-Type": "application/json",
            "KALSHI-ACCESS-KEY": self.key_id,
            "KALSHI-ACCESS-SIGNATURE": signature,
            "KALSHI-ACCESS-TIMESTAMP": timestamp,
        }
