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
from app.data.ripple_client import RipplePriceClient
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
    else:
        return 0.0


@router.get("/contracts/{asset}")
async def get_asset_contracts(asset: str) -> dict:
    """
    Get hourly contract signals for specified asset (BTC, ETH, or XRP).

    Fetches real data from Kalshi API (demo or production based on config).
    Includes volatility regime analysis.

    Args:
        asset: Asset symbol (btc, eth, or xrp) - case insensitive
    """
    asset_upper = asset.upper()

    if asset_upper not in ["BTC", "ETH", "XRP"]:
        raise HTTPException(status_code=400, detail=f"Unsupported asset: {asset}. Supported: BTC, ETH, XRP")

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
        asset: Asset symbol (btc, eth, or xrp) - case insensitive
    """
    asset_upper = asset.upper()

    if asset_upper not in ["BTC", "ETH", "XRP"]:
        raise HTTPException(status_code=400, detail=f"Unsupported asset: {asset}. Supported: BTC, ETH, XRP")

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


async def asset_trading_stream(request: Request, asset: str) -> AsyncGenerator:
    """
    SSE stream generator for real-time asset trading data.

    Streams:
    - Asset price updates every 3 seconds
    - Contract data updates every 20 seconds

    Args:
        asset: Asset symbol (BTC, ETH, or XRP)
    """
    asset_upper = asset.upper()
    price_client = get_price_client(asset_upper)
    market_service = MarketService()

    last_price_update = 0.0
    last_contract_update = 0.0
    last_price = 0.0

    # Get the appropriate contract fetching method
    if asset_upper == "BTC":
        get_contracts = market_service.get_bitcoin_hourly_contracts
    elif asset_upper == "ETH":
        get_contracts = market_service.get_ethereum_hourly_contracts
    elif asset_upper == "XRP":
        get_contracts = market_service.get_ripple_hourly_contracts
    else:
        raise ValueError(f"Unsupported asset: {asset}")

    try:
        # Send initial connection event
        yield {
            "event": "connected",
            "data": json.dumps({
                "asset": asset_upper,
                "status": "connected",
                "timestamp": datetime.now(UTC).isoformat()
            })
        }

        while True:
            # Check if client disconnected
            if await request.is_disconnected():
                print(f"SSE client disconnected from {asset_upper} stream")
                break

            current_time = asyncio.get_event_loop().time()

            # Stream price every 3 seconds
            if current_time - last_price_update >= 3.0:
                try:
                    price = await price_client.get_spot_price()
                    # Only send if price changed
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

            # Stream contract updates every 20 seconds
            if current_time - last_contract_update >= 20.0:
                try:
                    result = await get_contracts()
                    signals = [
                        SignalResponse(**contract)
                        for contract in result.get("contracts", [])
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
                except Exception as e:
                    print(f"Error fetching {asset_upper} contracts in stream: {e}")

            # Small sleep to avoid tight loop
            await asyncio.sleep(0.5)

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
async def stream_asset_data(request: Request, asset: str):
    """
    Server-Sent Events endpoint for real-time asset trading data.

    Streams price updates and contract data for specified asset to connected clients.
    Auto-reconnects on disconnect with Last-Event-ID support.

    Args:
        asset: Asset symbol (btc, eth, or xrp) - case insensitive
    """
    asset_upper = asset.upper()

    if asset_upper not in ["BTC", "ETH", "XRP"]:
        raise HTTPException(status_code=400, detail=f"Unsupported asset: {asset}. Supported: BTC, ETH, XRP")

    return EventSourceResponse(
        asset_trading_stream(request, asset_upper),
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
