"""DFlow API client for Solana-based prediction market trading."""

import logging
from datetime import datetime, timedelta
from typing import Optional

import httpx
from pybreaker import CircuitBreaker

from app.core.config import settings
from app.core.http_client import get_http_client, resilient_request
from app.data.dflow_types import (
    DFlowEvent,
    DFlowMarket,
    DFlowOrderbook,
    DFlowOrderbookLevel,
    DFlowOrderStatus,
    DFlowQuote,
    DFlowSwapTransaction,
    QuoteRequest,
    SwapRequest,
)

logger = logging.getLogger(__name__)

# Circuit breaker for DFlow API
dflow_breaker = CircuitBreaker(
    fail_max=5,
    reset_timeout=60,
    name="dflow",
)


class DFlowClient:
    """
    Client for interacting with the DFlow API.

    DFlow provides tokenized access to Kalshi prediction markets on Solana.
    Users can trade YES/NO tokens using USDC via the Swap API.
    """

    def __init__(self):
        self.base_url = settings.dflow_base_url.rstrip("/")
        self.api_key = settings.dflow_api_key

    def _get_headers(self) -> dict[str, str]:
        """Get request headers with API key if configured."""
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        if self.api_key:
            headers["X-API-Key"] = self.api_key
        return headers

    async def _request(
        self,
        method: str,
        path: str,
        params: Optional[dict] = None,
        json: Optional[dict] = None,
    ) -> dict:
        """Make a request to the DFlow API."""
        url = f"{self.base_url}{path}"
        headers = self._get_headers()

        response = await resilient_request(
            breaker=dflow_breaker,
            method=method,
            url=url,
            headers=headers,
            params=params,
            json=json,
        )

        response.raise_for_status()
        return response.json()

    # ============================================================
    # Metadata API - Market information
    # ============================================================

    async def get_events(self, series_ticker: str) -> list[DFlowEvent]:
        """
        Get all events for a series.

        Args:
            series_ticker: Series ticker (e.g., "KXBTCD" for BTC daily)

        Returns:
            List of events (daily/hourly contracts)
        """
        data = await self._request(
            "GET",
            "/events",
            params={"series_ticker": series_ticker, "status": "active"},
        )

        events = []
        for item in data.get("events", []):
            events.append(
                DFlowEvent(
                    ticker=item["ticker"],
                    series_ticker=item.get("series_ticker", series_ticker),
                    title=item["title"],
                    subtitle=item.get("subtitle"),
                    status=item["status"],
                    expiration_time=datetime.fromisoformat(
                        item["expiration_time"].replace("Z", "+00:00")
                    ),
                    settlement_time=datetime.fromisoformat(
                        item["settlement_time"].replace("Z", "+00:00")
                    )
                    if item.get("settlement_time")
                    else None,
                )
            )
        return events

    async def get_markets(self, event_ticker: str) -> list[DFlowMarket]:
        """
        Get all markets (strikes) for an event.

        Args:
            event_ticker: Event ticker (e.g., "KXBTCD-25JAN22")

        Returns:
            List of markets with token mints and prices
        """
        data = await self._request(
            "GET",
            "/markets",
            params={"event_ticker": event_ticker, "status": "active"},
        )

        markets = []
        for item in data.get("markets", []):
            markets.append(
                DFlowMarket(
                    ticker=item["ticker"],
                    event_ticker=item["event_ticker"],
                    title=item["title"],
                    subtitle=item.get("subtitle"),
                    status=item["status"],
                    strike_price=float(item["strike_price"]),
                    strike_type=item.get("strike_type", "above"),
                    yes_mint=item["yes_mint"],
                    no_mint=item["no_mint"],
                    yes_bid=float(item["yes_bid"]) if item.get("yes_bid") else None,
                    yes_ask=float(item["yes_ask"]) if item.get("yes_ask") else None,
                    no_bid=float(item["no_bid"]) if item.get("no_bid") else None,
                    no_ask=float(item["no_ask"]) if item.get("no_ask") else None,
                    last_price=float(item["last_price"]) if item.get("last_price") else None,
                    volume_24h=float(item["volume_24h"]) if item.get("volume_24h") else None,
                    open_interest=int(item["open_interest"]) if item.get("open_interest") else None,
                    expiration_time=datetime.fromisoformat(
                        item["expiration_time"].replace("Z", "+00:00")
                    ),
                    close_time=datetime.fromisoformat(
                        item["close_time"].replace("Z", "+00:00")
                    )
                    if item.get("close_time")
                    else None,
                )
            )
        return markets

    async def get_market(self, ticker: str) -> Optional[DFlowMarket]:
        """
        Get a single market by ticker.

        Args:
            ticker: Market ticker (e.g., "KXBTCD-25JAN22-T105000")

        Returns:
            Market details or None if not found
        """
        try:
            data = await self._request("GET", f"/markets/{ticker}")
            item = data.get("market")
            if not item:
                return None

            return DFlowMarket(
                ticker=item["ticker"],
                event_ticker=item["event_ticker"],
                title=item["title"],
                subtitle=item.get("subtitle"),
                status=item["status"],
                strike_price=float(item["strike_price"]),
                strike_type=item.get("strike_type", "above"),
                yes_mint=item["yes_mint"],
                no_mint=item["no_mint"],
                yes_bid=float(item["yes_bid"]) if item.get("yes_bid") else None,
                yes_ask=float(item["yes_ask"]) if item.get("yes_ask") else None,
                no_bid=float(item["no_bid"]) if item.get("no_bid") else None,
                no_ask=float(item["no_ask"]) if item.get("no_ask") else None,
                last_price=float(item["last_price"]) if item.get("last_price") else None,
                volume_24h=float(item["volume_24h"]) if item.get("volume_24h") else None,
                open_interest=int(item["open_interest"]) if item.get("open_interest") else None,
                expiration_time=datetime.fromisoformat(
                    item["expiration_time"].replace("Z", "+00:00")
                ),
                close_time=datetime.fromisoformat(
                    item["close_time"].replace("Z", "+00:00")
                )
                if item.get("close_time")
                else None,
            )
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 404:
                return None
            raise

    async def get_orderbook(self, ticker: str) -> DFlowOrderbook:
        """
        Get orderbook for a market.

        Args:
            ticker: Market ticker

        Returns:
            Orderbook with bids and asks for YES/NO tokens
        """
        data = await self._request("GET", f"/markets/{ticker}/orderbook")

        def parse_levels(levels: list) -> list[DFlowOrderbookLevel]:
            return [
                DFlowOrderbookLevel(
                    price=float(level["price"]),
                    quantity=int(level["quantity"]),
                )
                for level in levels
            ]

        return DFlowOrderbook(
            ticker=ticker,
            yes_bids=parse_levels(data.get("yes_bids", [])),
            yes_asks=parse_levels(data.get("yes_asks", [])),
            no_bids=parse_levels(data.get("no_bids", [])),
            no_asks=parse_levels(data.get("no_asks", [])),
            timestamp=datetime.fromisoformat(
                data["timestamp"].replace("Z", "+00:00")
            )
            if data.get("timestamp")
            else datetime.utcnow(),
        )

    # ============================================================
    # Swap API - Trading
    # ============================================================

    async def get_quote(self, request: QuoteRequest) -> DFlowQuote:
        """
        Get a quote for swapping tokens.

        Args:
            request: Quote request with input/output mints and amount

        Returns:
            Quote with price, output amount, and expiration
        """
        data = await self._request(
            "POST",
            "/swap/quote",
            json={
                "input_mint": request.input_mint,
                "output_mint": request.output_mint,
                "amount": request.amount,
                "side": request.side,
                "slippage_bps": request.slippage_bps,
            },
        )

        return DFlowQuote(
            quote_id=data["quote_id"],
            input_mint=data["input_mint"],
            output_mint=data["output_mint"],
            input_amount=int(data["input_amount"]),
            output_amount=int(data["output_amount"]),
            price=float(data["price"]),
            price_impact=float(data.get("price_impact", 0)),
            fee=float(data.get("fee", 0)),
            expires_at=datetime.fromisoformat(data["expires_at"].replace("Z", "+00:00")),
            slippage_bps=int(data.get("slippage_bps", request.slippage_bps)),
        )

    async def create_swap(self, request: SwapRequest) -> DFlowSwapTransaction:
        """
        Create an unsigned swap transaction.

        The user must sign this transaction with their wallet and broadcast it.

        Args:
            request: Swap request with quote_id and user wallet

        Returns:
            Unsigned transaction and order tracking info
        """
        data = await self._request(
            "POST",
            "/swap/transaction",
            json={
                "quote_id": request.quote_id,
                "user_wallet": request.user_wallet,
            },
        )

        return DFlowSwapTransaction(
            quote_id=data["quote_id"],
            transaction=data["transaction"],
            order_id=data["order_id"],
            expires_at=datetime.fromisoformat(data["expires_at"].replace("Z", "+00:00")),
        )

    async def get_order_status(self, order_id: str) -> DFlowOrderStatus:
        """
        Get the status of an order.

        Args:
            order_id: Order ID from create_swap response

        Returns:
            Order status with fill information
        """
        data = await self._request("GET", f"/orders/{order_id}")

        return DFlowOrderStatus(
            order_id=data["order_id"],
            quote_id=data["quote_id"],
            status=data["status"],
            input_mint=data["input_mint"],
            output_mint=data["output_mint"],
            input_amount=int(data["input_amount"]),
            output_amount=int(data["output_amount"]),
            filled_amount=int(data.get("filled_amount", 0)),
            average_price=float(data["average_price"]) if data.get("average_price") else None,
            transaction_signature=data.get("transaction_signature"),
            created_at=datetime.fromisoformat(data["created_at"].replace("Z", "+00:00")),
            updated_at=datetime.fromisoformat(data["updated_at"].replace("Z", "+00:00")),
            filled_at=datetime.fromisoformat(data["filled_at"].replace("Z", "+00:00"))
            if data.get("filled_at")
            else None,
        )

    # ============================================================
    # Convenience methods
    # ============================================================

    async def get_active_btc_markets(self) -> list[DFlowMarket]:
        """Get all active Bitcoin daily markets."""
        events = await self.get_events("KXBTCD")
        all_markets = []
        for event in events:
            markets = await self.get_markets(event.ticker)
            all_markets.extend(markets)
        return all_markets

    async def get_market_mints(self, ticker: str) -> Optional[dict[str, str]]:
        """
        Get YES/NO token mints for a market.

        Args:
            ticker: Market ticker

        Returns:
            Dict with yes_mint and no_mint, or None if not found
        """
        market = await self.get_market(ticker)
        if not market:
            return None
        return {
            "yes_mint": market.yes_mint,
            "no_mint": market.no_mint,
        }


# Singleton instance
_dflow_client: Optional[DFlowClient] = None


def get_dflow_client() -> DFlowClient:
    """Get or create DFlow client singleton."""
    global _dflow_client
    if _dflow_client is None:
        _dflow_client = DFlowClient()
    return _dflow_client
