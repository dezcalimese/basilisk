"""Multi-asset signals endpoint - returns hourly contract data for BTC, ETH, and XRP."""

import asyncio
import json
import traceback
from datetime import UTC, datetime
from typing import AsyncGenerator

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from app.api.routes.signals import SignalResponse
from app.data.bitcoin_client import BitcoinPriceClient
from app.data.ethereum_client import EthereumPriceClient
from app.data.generic_price_client import GenericPriceClient
from app.data.ripple_client import RipplePriceClient
from app.data.solana_client import SolanaPriceClient
from app.data.kalshi_ws import get_ws_manager
from app.data.ws_data_bus import get_data_bus
from app.services.market_service import MarketService

router = APIRouter()


class AssetPriceResponse(BaseModel):
    """Response model for asset price endpoint."""

    asset: str
    price: float
    timestamp: str


def get_price_client(asset: str):
    """Get the appropriate price client for the asset."""
    asset_upper = asset.upper()
    if asset_upper == "BTC":
        return BitcoinPriceClient()
    elif asset_upper == "ETH":
        return EthereumPriceClient()
    elif asset_upper == "XRP":
        return RipplePriceClient()
    elif asset_upper == "SOL":
        return SolanaPriceClient()
    elif asset_upper in ("DOGE", "HYPE", "BNB"):
        return GenericPriceClient(asset_upper)
    else:
        raise HTTPException(status_code=400, detail=f"Unsupported asset: {asset}")


def get_default_price(asset: str) -> float:
    """Get fallback price for asset."""
    asset_upper = asset.upper()
    if asset_upper == "BTC":
        return 95000.0
    elif asset_upper == "ETH":
        return 3500.0
    elif asset_upper == "XRP":
        return 0.62
    elif asset_upper == "SOL":
        return 200.0
    else:
        return 0.0


@router.get("/contracts/{asset}")
async def get_asset_contracts(asset: str) -> dict:
    """
    Get hourly contract signals for specified asset (BTC, ETH, XRP, or SOL).

    Fetches real data from Kalshi API (demo or production based on config).
    Includes volatility regime analysis.

    Args:
        asset: Asset symbol (btc, eth, xrp, or sol) - case insensitive
    """
    asset_upper = asset.upper()

    supported = ["BTC", "ETH", "XRP", "SOL", "DOGE", "HYPE", "BNB"]
    if asset_upper not in supported:
        raise HTTPException(status_code=400, detail=f"Unsupported asset: {asset}. Supported: {', '.join(supported)}")

    try:
        print(f"🔍 Creating MarketService for {asset_upper}...")
        market_service = MarketService()
        print("✓ MarketService created successfully")

        # Fetch and process contracts based on asset
        print(f"🔍 Fetching {asset_upper} contracts...")
        if asset_upper == "BTC":
            result = await market_service.get_bitcoin_hourly_contracts()
        elif asset_upper == "ETH":
            result = await market_service.get_ethereum_hourly_contracts()
        elif asset_upper == "XRP":
            result = await market_service.get_ripple_hourly_contracts()
        elif asset_upper == "SOL":
            result = await market_service.get_solana_hourly_contracts()
        else:
            result = await market_service.get_generic_hourly_contracts(asset_upper)

        print(f"✓ Fetched {len(result.get('contracts', []))} {asset_upper} contracts")

        # Convert contracts to SignalResponse format
        signals = [
            SignalResponse(**contract) for contract in result.get("contracts", [])
        ]

        return {
            "asset": asset_upper,
            "contracts": signals,
            "volatility": result.get("volatility", {})
        }
    except Exception as e:
        print(f"✗ ERROR in get_asset_contracts for {asset_upper}: {type(e).__name__}: {e}")
        print(f"Traceback:\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/current")
async def get_current_signals() -> dict:
    """
    Get current Bitcoin hourly contract signals (backward compatibility).

    DEPRECATED: Use /contracts/btc instead.

    Fetches real data from Kalshi API (demo or production based on config).
    Includes volatility regime analysis.
    """
    # Redirect to BTC endpoint for backward compatibility
    return await get_asset_contracts("btc")


@router.get("/price/{asset}", response_model=AssetPriceResponse)
async def get_asset_price(asset: str) -> AssetPriceResponse:
    """
    Get current spot price for specified asset (lightweight endpoint for frequent polling).

    This endpoint is optimized for frequent polling (every 3-5 seconds)
    to update prices in real-time without hitting Kalshi rate limits.

    Args:
        asset: Asset symbol (btc, eth, xrp, or sol) - case insensitive
    """
    asset_upper = asset.upper()

    supported = ["BTC", "ETH", "XRP", "SOL", "DOGE", "HYPE", "BNB"]
    if asset_upper not in supported:
        raise HTTPException(status_code=400, detail=f"Unsupported asset: {asset}. Supported: {', '.join(supported)}")

    try:
        price_client = get_price_client(asset_upper)
        price = await price_client.get_spot_price()
        timestamp = datetime.now(UTC).isoformat()

        return AssetPriceResponse(asset=asset_upper, price=price, timestamp=timestamp)
    except Exception as e:
        print(f"✗ ERROR in get_asset_price for {asset_upper}: {type(e).__name__}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/btc-price", response_model=AssetPriceResponse)
async def get_btc_price() -> AssetPriceResponse:
    """
    Get current Bitcoin spot price (backward compatibility).

    DEPRECATED: Use /price/btc instead.

    This endpoint is optimized for frequent polling (every 3-5 seconds)
    to update prices in real-time without hitting Kalshi rate limits.
    """
    # Redirect to BTC price endpoint for backward compatibility
    return await get_asset_price("btc")


async def asset_trading_stream(request: Request, asset: str, timeframe: str = "hourly") -> AsyncGenerator:
    """
    SSE stream generator for real-time asset trading data.

    Streams:
    - Asset price updates every 3 seconds
    - Contract data updates every 20 seconds (hourly) or 10 seconds (15m)

    Args:
        asset: Asset symbol (BTC, ETH, XRP, SOL, DOGE, HYPE, BNB)
        timeframe: "hourly" or "15m"
    """
    asset_upper = asset.upper()
    price_client = get_price_client(asset_upper)
    market_service = MarketService()

    last_price_update = 0.0
    last_contract_update = 0.0
    last_price = 0.0

    # Get the appropriate contract fetching method based on asset and timeframe
    if timeframe == "15m":
        # 15-minute contracts — all assets use the generic method
        async def _get_15m():
            return await market_service.get_generic_hourly_contracts(asset_upper, timeframe="15m")
        get_contracts = _get_15m
    else:
        # Hourly contracts — use dedicated methods for original assets, generic for new ones
        asset_method_map = {
            "BTC": market_service.get_bitcoin_hourly_contracts,
            "ETH": market_service.get_ethereum_hourly_contracts,
            "XRP": market_service.get_ripple_hourly_contracts,
            "SOL": market_service.get_solana_hourly_contracts,
        }

        if asset_upper in asset_method_map:
            get_contracts = asset_method_map[asset_upper]
        elif asset_upper in ("DOGE", "HYPE", "BNB"):
            async def _get_generic():
                return await market_service.get_generic_hourly_contracts(asset_upper)
            get_contracts = _get_generic
        else:
            raise ValueError(f"Unsupported asset: {asset}")

    try:
        # WebSocket integration
        ws_manager = get_ws_manager()
        data_bus = get_data_bus()
        ticker_queue = await data_bus.subscribe(f"ticker:{asset_upper}")
        ob_queue = await data_bus.subscribe(f"orderbook:{asset_upper}")
        ws_subscribed = False

        # Contract poll interval — 60s when WS is active, 20s as fallback
        contract_interval = 60.0 if ws_manager.is_connected else 20.0

        # Send initial connection event
        yield {
            "event": "connected",
            "data": json.dumps({
                "asset": asset_upper,
                "status": "connected",
                "ws_active": ws_manager.is_connected,
                "timestamp": datetime.now(UTC).isoformat()
            })
        }

        try:
            while True:
                # Check if client disconnected
                if await request.is_disconnected():
                    print(f"SSE client disconnected from {asset_upper} stream")
                    break

                current_time = asyncio.get_event_loop().time()

                # Drain WebSocket ticker updates (non-blocking)
                while True:
                    try:
                        ticker_update = ticker_queue.get_nowait()
                        # Push contract price update via SSE
                        yield {
                            "event": "ticker_update",
                            "data": json.dumps({
                                "asset": asset_upper,
                                **ticker_update,
                                "timestamp": datetime.now(UTC).isoformat()
                            })
                        }
                    except asyncio.QueueEmpty:
                        break

                # Drain WebSocket orderbook updates (non-blocking)
                while True:
                    try:
                        ob_update = ob_queue.get_nowait()
                        yield {
                            "event": "orderbook_update",
                            "data": json.dumps({
                                "asset": asset_upper,
                                **ob_update,
                                "timestamp": datetime.now(UTC).isoformat()
                            })
                        }
                    except asyncio.QueueEmpty:
                        break

                # Stream spot price every 3 seconds (from exchange, not Kalshi)
                if current_time - last_price_update >= 3.0:
                    try:
                        price = await price_client.get_spot_price()
                        if abs(price - last_price) > 0.01:
                            yield {
                                "event": f"{asset.lower()}_price",
                                "data": json.dumps({
                                    "asset": asset_upper,
                                    "price": price,
                                    "timestamp": datetime.now(UTC).isoformat()
                                })
                            }
                            last_price = price
                        last_price_update = current_time
                    except Exception as e:
                        print(f"Error fetching {asset_upper} price in stream: {e}")

                # Stream contract updates (60s with WS, 20s without)
                contract_interval = 60.0 if ws_manager.is_connected else 20.0
                if current_time - last_contract_update >= contract_interval:
                    try:
                        result = await get_contracts()
                        contracts = result.get("contracts", [])
                        signals = [
                            SignalResponse(**contract)
                            for contract in contracts
                        ]

                        yield {
                            "event": "contracts_update",
                            "data": json.dumps({
                                "asset": asset_upper,
                                "contracts": [s.model_dump() for s in signals],
                                "volatility": result.get("volatility", {}),
                                "timestamp": datetime.now(UTC).isoformat()
                            })
                        }
                        last_contract_update = current_time

                        # Subscribe contract tickers to WS for real-time updates
                        if not ws_subscribed and ws_manager.is_connected and contracts:
                            tickers = [c.get("ticker", "") for c in contracts if c.get("ticker")]
                            if tickers:
                                ws_manager.ensure_subscribed(
                                    ["ticker", "orderbook_delta"], tickers
                                )
                                ws_subscribed = True
                                print(f"Kalshi WS: Subscribed {len(tickers)} {asset_upper} tickers")

                    except Exception as e:
                        print(f"Error fetching {asset_upper} contracts in stream: {e}")

                # Small sleep to avoid tight loop
                await asyncio.sleep(0.5)

        finally:
            # Clean up data bus subscriptions
            await data_bus.unsubscribe(f"ticker:{asset_upper}", ticker_queue)
            await data_bus.unsubscribe(f"orderbook:{asset_upper}", ob_queue)

    except asyncio.CancelledError:
        print(f"{asset_upper} SSE stream cancelled")
    except Exception as e:
        print(f"{asset_upper} SSE stream error: {e}")
        traceback.print_exc()


async def trading_data_stream(request: Request) -> AsyncGenerator:
    """
    SSE stream generator for real-time BTC trading data (backward compatibility).

    DEPRECATED: Use /stream/{asset} instead.

    Streams:
    - BTC price updates every 3 seconds
    - Contract data updates every 20 seconds
    """
    async for event in asset_trading_stream(request, "BTC"):
        yield event


@router.get("/stream/{asset}")
async def stream_asset_data(request: Request, asset: str, timeframe: str = "hourly"):
    """
    Server-Sent Events endpoint for real-time asset trading data.

    Streams price updates and contract data for specified asset to connected clients.
    Auto-reconnects on disconnect with Last-Event-ID support.

    Args:
        asset: Asset symbol (btc, eth, xrp, sol, doge, hype, bnb) - case insensitive
        timeframe: Contract timeframe - "hourly" (default) or "15m"
    """
    asset_upper = asset.upper()
    timeframe_lower = timeframe.lower()

    supported = ["BTC", "ETH", "XRP", "SOL", "DOGE", "HYPE", "BNB"]
    if asset_upper not in supported:
        raise HTTPException(status_code=400, detail=f"Unsupported asset: {asset}. Supported: {', '.join(supported)}")

    if timeframe_lower not in ("hourly", "15m"):
        raise HTTPException(status_code=400, detail=f"Unsupported timeframe: {timeframe}. Supported: hourly, 15m")

    return EventSourceResponse(
        asset_trading_stream(request, asset_upper, timeframe_lower),
        headers={
            "X-Accel-Buffering": "no",  # Disable nginx buffering
            "Cache-Control": "no-cache",
        },
        ping=15,  # Send ping every 15 seconds to keep connection alive
    )


@router.get("/stream/trading")
async def stream_trading_data(request: Request):
    """
    Server-Sent Events endpoint for real-time BTC trading data (backward compatibility).

    DEPRECATED: Use /stream/btc instead.

    Streams BTC price updates and contract data to connected clients.
    Auto-reconnects on disconnect with Last-Event-ID support.
    """
    return EventSourceResponse(
        trading_data_stream(request),
        headers={
            "X-Accel-Buffering": "no",  # Disable nginx buffering
            "Cache-Control": "no-cache",
        },
        ping=15,  # Send ping every 15 seconds to keep connection alive
    )
