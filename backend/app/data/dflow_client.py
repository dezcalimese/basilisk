"""DFlow API client for Solana-based prediction market trading.

Uses two separate API endpoints:
- Trade API (GET /order): For executing trades
- Metadata API: For market discovery and data

Docs: https://pond.dflow.net/build/introduction
"""

import logging
from datetime import datetime
from typing import Optional

import httpx
from pybreaker import CircuitBreaker

from app.core.config import settings
from app.core.http_client import resilient_request
from app.data.dflow_types import (
    DFlowEvent,
    DFlowFill,
    DFlowMarket,
    DFlowMarketAccountInfo,
    DFlowOrderbook,
    DFlowOrderResponse,
    DFlowOrderStatus,
    OrderRequest,
)

logger = logging.getLogger(__name__)

# USDC mint on Solana mainnet
USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"

# Kalshi maintenance window: Thursdays 3:00 AM to 5:00 AM ET
# Orders submitted during this window will be reverted.

# Circuit breakers
dflow_trade_breaker = CircuitBreaker(fail_max=5, reset_timeout=60, name="dflow-trade")
dflow_metadata_breaker = CircuitBreaker(fail_max=5, reset_timeout=60, name="dflow-metadata")


class DFlowClient:
    """
    Client for interacting with the DFlow API.

    DFlow provides tokenized access to Kalshi prediction markets on Solana.
    All prediction market trades are imperative and async — use GET /order
    then poll GET /order-status by transaction signature.
    """

    def __init__(self):
        self.trade_api_url = settings.dflow_trade_api_url.rstrip("/")
        self.metadata_api_url = settings.dflow_metadata_api_url.rstrip("/")
        self.api_key = settings.dflow_api_key

    def _get_headers(self) -> dict[str, str]:
        """Get request headers with API key if configured."""
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        if self.api_key:
            headers["x-api-key"] = self.api_key
        return headers

    async def _trade_request(
        self,
        method: str,
        path: str,
        params: Optional[dict] = None,
        json: Optional[dict] = None,
    ) -> dict:
        """Make a request to the DFlow Trade API."""
        url = f"{self.trade_api_url}{path}"
        headers = self._get_headers()

        async with httpx.AsyncClient() as client:
            response = await client.request(
                method, url, headers=headers, params=params, json=json, timeout=15.0,
            )

        response.raise_for_status()
        return response.json()

    async def _metadata_request(
        self,
        method: str,
        path: str,
        params: Optional[dict] = None,
        json: Optional[dict] = None,
    ) -> dict:
        """Make a request to the DFlow Metadata API."""
        url = f"{self.metadata_api_url}/api/v1{path}"
        headers = self._get_headers()

        async with httpx.AsyncClient() as client:
            response = await client.request(
                method, url, headers=headers, params=params, json=json, timeout=15.0,
            )

        response.raise_for_status()
        return response.json()

    # ============================================================
    # Trade API - GET /order (replaces legacy /quote + /swap)
    # ============================================================

    async def get_order(self, request: OrderRequest) -> DFlowOrderResponse:
        """
        Get a trade order with a ready-to-sign transaction.

        This is the recommended endpoint for all trades. It returns a quote
        and (if userPublicKey is provided) a base64-encoded transaction in
        a single call.

        Prediction market trades are always async — poll /order-status
        after submitting the transaction.

        Args:
            request: Order parameters (mints, amount, user wallet, slippage)

        Returns:
            Order response with transaction to sign
        """
        params: dict = {
            "inputMint": request.input_mint,
            "outputMint": request.output_mint,
            "amount": str(request.amount),
            "slippageBps": str(request.slippage_bps),
        }

        if request.user_public_key:
            params["userPublicKey"] = request.user_public_key

        if request.prediction_market_slippage_bps is not None:
            params["predictionMarketSlippageBps"] = str(
                request.prediction_market_slippage_bps
            )

        data = await self._trade_request("GET", "/order", params=params)

        return DFlowOrderResponse(
            input_mint=data["inputMint"],
            in_amount=data["inAmount"],
            output_mint=data["outputMint"],
            out_amount=data["outAmount"],
            other_amount_threshold=data.get("otherAmountThreshold"),
            slippage_bps=data.get("slippageBps"),
            price_impact_pct=data.get("priceImpactPct"),
            execution_mode=data.get("executionMode", "async"),
            transaction=data.get("transaction"),
            last_valid_block_height=data.get("lastValidBlockHeight"),
            revert_mint=data.get("revertMint"),
        )

    async def get_order_status(
        self,
        signature: str,
        last_valid_block_height: Optional[int] = None,
    ) -> DFlowOrderStatus:
        """
        Poll order status by transaction signature.

        For async trades (all prediction market trades), poll this endpoint
        with a 2-second interval while status is 'open' or 'pendingClose'.

        Args:
            signature: Base58 transaction signature
            last_valid_block_height: Optional block height for expiry detection

        Returns:
            Order status with fills
        """
        params: dict = {"signature": signature}
        if last_valid_block_height is not None:
            params["lastValidBlockHeight"] = str(last_valid_block_height)

        data = await self._trade_request("GET", "/order-status", params=params)

        fills = [
            DFlowFill(
                qty_in=fill.get("qtyIn"),
                qty_out=fill.get("qtyOut"),
            )
            for fill in data.get("fills", [])
        ]

        return DFlowOrderStatus(
            status=data["status"],
            fills=fills,
        )

    # ============================================================
    # Proof KYC - Verification
    # ============================================================

    async def verify_wallet(self, address: str) -> bool:
        """
        Check if a wallet address has been verified via Proof KYC.

        Required before buying prediction market outcome tokens.
        Selling does not require verification.

        Args:
            address: Solana wallet address

        Returns:
            True if wallet is verified
        """
        try:
            response = await resilient_request(
                breaker=dflow_trade_breaker,
                method="GET",
                url=f"https://proof.dflow.net/verify/{address}",
                headers={"Accept": "application/json"},
            )
            response.raise_for_status()
            data = response.json()
            return data.get("verified", False)
        except Exception:
            logger.warning(f"Failed to verify wallet {address[:8]}...")
            return False

    # ============================================================
    # Metadata API - Market discovery
    # ============================================================

    async def get_events(
        self,
        series_tickers: Optional[str] = None,
        status: str = "active",
        with_nested_markets: bool = True,
        limit: int = 200,
    ) -> list[DFlowEvent]:
        """
        Get events, optionally filtered by series ticker.

        Args:
            series_tickers: Comma-separated series tickers (e.g., "KXBTCD")
            status: Filter by status (active, closed, determined, etc.)
            with_nested_markets: Include nested market data
            limit: Max results

        Returns:
            List of events
        """
        params: dict = {
            "status": status,
            "withNestedMarkets": str(with_nested_markets).lower(),
            "limit": str(limit),
        }
        if series_tickers:
            params["seriesTickers"] = series_tickers

        data = await self._metadata_request("GET", "/events", params=params)

        events = []
        for item in data.get("events", []):
            events.append(
                DFlowEvent(
                    ticker=item["ticker"],
                    series_ticker=item.get("seriesTicker", ""),
                    title=item.get("title", ""),
                    subtitle=item.get("subtitle"),
                    status=item.get("status", "active"),
                    expiration_time=datetime.fromtimestamp(item["expirationTime"])
                    if item.get("expirationTime")
                    else None,
                )
            )
        return events

    async def get_markets(
        self,
        event_ticker: Optional[str] = None,
        status: str = "active",
        limit: int = 200,
    ) -> list[DFlowMarket]:
        """
        Get markets, optionally filtered by event ticker.

        Args:
            event_ticker: Filter by parent event
            status: Filter by status
            limit: Max results

        Returns:
            List of markets with accounts (YES/NO mints)
        """
        params: dict = {"status": status, "limit": str(limit)}
        if event_ticker:
            params["eventTicker"] = event_ticker

        data = await self._metadata_request("GET", "/markets", params=params)

        return [self._parse_market(item) for item in data.get("markets", [])]

    async def get_market(self, ticker: str) -> Optional[DFlowMarket]:
        """Get a single market by ticker."""
        try:
            data = await self._metadata_request("GET", f"/market/{ticker}")
            return self._parse_market(data)
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 404:
                return None
            raise

    async def get_market_by_mint(self, mint_address: str) -> Optional[DFlowMarket]:
        """Get market by outcome token mint address."""
        try:
            data = await self._metadata_request(
                "GET", f"/market/by-mint/{mint_address}"
            )
            return self._parse_market(data)
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 404:
                return None
            raise

    async def get_orderbook(self, ticker: str) -> DFlowOrderbook:
        """
        Get orderbook for a market.

        Returns yes_bids and no_bids as price->quantity maps.
        """
        data = await self._metadata_request("GET", f"/orderbook/{ticker}")

        return DFlowOrderbook(
            ticker=ticker,
            yes_bids=data.get("yes_bids", {}),
            no_bids=data.get("no_bids", {}),
            sequence=data.get("sequence"),
        )

    async def search_markets(self, query: str) -> dict:
        """Full-text search across events and markets."""
        data = await self._metadata_request(
            "GET", "/search", params={"query": query}
        )
        return data

    async def filter_outcome_mints(self, addresses: list[str]) -> list[str]:
        """Filter a list of mint addresses to only outcome token mints."""
        data = await self._metadata_request(
            "POST", "/filter_outcome_mints", json={"addresses": addresses}
        )
        return data.get("outcomeMints", [])

    async def get_markets_batch(self, mints: list[str]) -> list[DFlowMarket]:
        """Batch lookup markets by outcome mint addresses."""
        data = await self._metadata_request(
            "POST", "/markets/batch", json={"mints": mints}
        )
        return [self._parse_market(item) for item in data.get("markets", [])]

    # ============================================================
    # Convenience methods
    # ============================================================

    async def get_active_btc_markets(self) -> list[DFlowMarket]:
        """Get all active Bitcoin markets across all timeframes."""
        events = await self.get_events(series_tickers="KXBTCD")
        all_markets = []
        for event in events:
            markets = await self.get_markets(event_ticker=event.ticker)
            all_markets.extend(markets)
        return all_markets

    async def get_market_mints(self, ticker: str) -> Optional[dict[str, str]]:
        """Get YES/NO token mints for a market."""
        market = await self.get_market(ticker)
        if not market or not market.yes_mint or not market.no_mint:
            return None
        return {
            "yes_mint": market.yes_mint,
            "no_mint": market.no_mint,
        }

    # ============================================================
    # Internal helpers
    # ============================================================

    @staticmethod
    def _parse_market(item: dict) -> DFlowMarket:
        """Parse a market response dict into a DFlowMarket model."""
        accounts = {}
        for mint_key, acct_data in (item.get("accounts") or {}).items():
            accounts[mint_key] = DFlowMarketAccountInfo(
                market_ledger=acct_data.get("marketLedger", ""),
                yes_mint=acct_data.get("yesMint", ""),
                no_mint=acct_data.get("noMint", ""),
                is_initialized=acct_data.get("isInitialized", False),
                redemption_status=acct_data.get("redemptionStatus"),
                scalar_outcome_pct=acct_data.get("scalarOutcomePct"),
            )

        return DFlowMarket(
            ticker=item.get("ticker", ""),
            event_ticker=item.get("eventTicker", ""),
            title=item.get("title", ""),
            subtitle=item.get("subtitle"),
            status=item.get("status", ""),
            market_type=item.get("marketType"),
            yes_sub_title=item.get("yesSubTitle"),
            no_sub_title=item.get("noSubTitle"),
            yes_bid=item.get("yesBid"),
            yes_ask=item.get("yesAsk"),
            no_bid=item.get("noBid"),
            no_ask=item.get("noAsk"),
            volume=item.get("volume"),
            open_interest=item.get("openInterest"),
            open_time=item.get("openTime"),
            close_time=item.get("closeTime"),
            expiration_time=item.get("expirationTime"),
            accounts=accounts,
            result=item.get("result"),
            can_close_early=item.get("canCloseEarly", False),
        )


# Singleton instance
_dflow_client: Optional[DFlowClient] = None


def get_dflow_client() -> DFlowClient:
    """Get or create DFlow client singleton."""
    global _dflow_client
    if _dflow_client is None:
        _dflow_client = DFlowClient()
    return _dflow_client
