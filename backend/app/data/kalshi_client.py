"""Kalshi API client for fetching contract data and placing orders."""

import base64
import time
import uuid
from dataclasses import dataclass
from enum import Enum
from pathlib import Path
from typing import Any

import httpx
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding

from app.core.config import settings
from app.core.http_client import get_http_client


class OrderSide(str, Enum):
    """Order side (yes/no)."""
    YES = "yes"
    NO = "no"


class OrderType(str, Enum):
    """Order type."""
    MARKET = "market"
    LIMIT = "limit"


class OrderAction(str, Enum):
    """Order action (buy/sell)."""
    BUY = "buy"
    SELL = "sell"


@dataclass
class OrderResult:
    """Result of an order placement."""
    success: bool
    order_id: str | None = None
    client_order_id: str | None = None
    filled_count: int = 0
    avg_price: float | None = None
    status: str | None = None
    error: str | None = None


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

    async def place_order(
        self,
        ticker: str,
        side: OrderSide,
        action: OrderAction,
        count: int,
        order_type: OrderType = OrderType.MARKET,
        limit_price: int | None = None,
        client_order_id: str | None = None,
        builder_code: str | None = None,
    ) -> OrderResult:
        """
        Place an order on Kalshi.

        Args:
            ticker: Market ticker symbol
            side: YES or NO
            action: BUY or SELL
            count: Number of contracts
            order_type: MARKET or LIMIT
            limit_price: Price in cents (1-99) for limit orders
            client_order_id: Client-generated order ID for idempotency
            builder_code: Optional builder code for revenue sharing

        Returns:
            OrderResult with order details or error
        """
        path = "/portfolio/orders"
        client = await get_http_client()

        # Generate client order ID if not provided
        if client_order_id is None:
            client_order_id = f"basilisk_{uuid.uuid4().hex[:16]}"

        # Build order payload
        payload: dict[str, Any] = {
            "ticker": ticker,
            "client_order_id": client_order_id,
            "side": side.value,
            "action": action.value,
            "count": count,
            "type": order_type.value,
        }

        # Add limit price for limit orders (in cents)
        if order_type == OrderType.LIMIT and limit_price is not None:
            payload["yes_price"] = limit_price if side == OrderSide.YES else None
            payload["no_price"] = limit_price if side == OrderSide.NO else None

        # Add builder code if provided
        if builder_code:
            payload["builder_code"] = builder_code

        try:
            response = await client.post(
                f"{self.base_url}{path}",
                json=payload,
                headers=self._get_auth_headers(method="POST", path=path),
                timeout=30.0,
            )
            response.raise_for_status()
            data = response.json()

            order = data.get("order", {})
            return OrderResult(
                success=True,
                order_id=order.get("order_id"),
                client_order_id=client_order_id,
                filled_count=order.get("filled_count", 0),
                avg_price=order.get("avg_price"),
                status=order.get("status"),
            )
        except httpx.HTTPStatusError as e:
            error_msg = str(e)
            try:
                error_data = e.response.json()
                error_msg = error_data.get("error", {}).get("message", str(e))
            except Exception:
                pass
            return OrderResult(
                success=False,
                client_order_id=client_order_id,
                error=error_msg,
            )
        except Exception as e:
            return OrderResult(
                success=False,
                client_order_id=client_order_id,
                error=str(e),
            )

    async def get_order(self, order_id: str) -> dict[str, Any]:
        """
        Get details of a specific order.

        Args:
            order_id: Kalshi order ID

        Returns:
            Order details
        """
        path = f"/portfolio/orders/{order_id}"
        client = await get_http_client()
        response = await client.get(
            f"{self.base_url}{path}",
            headers=self._get_auth_headers(method="GET", path=path),
            timeout=30.0,
        )
        response.raise_for_status()
        return response.json()

    async def cancel_order(self, order_id: str) -> bool:
        """
        Cancel an open order.

        Args:
            order_id: Kalshi order ID

        Returns:
            True if cancelled successfully
        """
        path = f"/portfolio/orders/{order_id}"
        client = await get_http_client()
        try:
            response = await client.delete(
                f"{self.base_url}{path}",
                headers=self._get_auth_headers(method="DELETE", path=path),
                timeout=30.0,
            )
            response.raise_for_status()
            return True
        except Exception:
            return False

    async def get_positions(self) -> dict[str, Any]:
        """
        Get all current positions.

        Returns:
            List of open positions
        """
        path = "/portfolio/positions"
        client = await get_http_client()
        response = await client.get(
            f"{self.base_url}{path}",
            headers=self._get_auth_headers(method="GET", path=path),
            timeout=30.0,
        )
        response.raise_for_status()
        return response.json()

    async def get_fills(
        self,
        ticker: str | None = None,
        limit: int = 100,
        cursor: str | None = None,
    ) -> dict[str, Any]:
        """
        Get trade fills history.

        Args:
            ticker: Optional ticker to filter fills
            limit: Number of results
            cursor: Pagination cursor

        Returns:
            List of fills
        """
        path = "/portfolio/fills"
        client = await get_http_client()
        params: dict[str, Any] = {"limit": limit}
        if ticker:
            params["ticker"] = ticker
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

    async def get_balance(self) -> dict[str, Any]:
        """
        Get account balance.

        Returns:
            Balance information
        """
        path = "/portfolio/balance"
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
