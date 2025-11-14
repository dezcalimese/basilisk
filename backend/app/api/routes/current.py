"""Current signals endpoint - returns Bitcoin hourly contract data."""

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
from app.services.market_service import MarketService

router = APIRouter()


class BtcPriceResponse(BaseModel):
    """Response model for BTC price endpoint."""

    price: float
    timestamp: str


@router.get("/current")
async def get_current_signals() -> dict[str, list[SignalResponse]]:
    """
    Get current Bitcoin hourly contract signals from Kalshi.

    Fetches real data from Kalshi API (demo or production based on config).
    """
    try:
        print("🔍 Creating MarketService...")
        market_service = MarketService()
        print("✓ MarketService created successfully")

        # Fetch and process Bitcoin hourly contracts
        print("🔍 Fetching Bitcoin contracts...")
        contracts = await market_service.get_bitcoin_hourly_contracts()
        print(f"✓ Fetched {len(contracts)} contracts")

        # Convert to SignalResponse format
        signals = [SignalResponse(**contract) for contract in contracts]

        return {"contracts": signals}
    except Exception as e:
        print(f"✗ ERROR in get_current_signals: {type(e).__name__}: {e}")
        print(f"Traceback:\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/btc-price", response_model=BtcPriceResponse)
async def get_btc_price() -> BtcPriceResponse:
    """
    Get current Bitcoin spot price (lightweight endpoint for frequent polling).

    This endpoint is optimized for frequent polling (every 3-5 seconds)
    to update prices in real-time without hitting Kalshi rate limits.
    """
    try:
        btc_client = BitcoinPriceClient()
        price = await btc_client.get_spot_price()
        timestamp = datetime.now(UTC).isoformat()

        return BtcPriceResponse(price=price, timestamp=timestamp)
    except Exception as e:
        print(f"✗ ERROR in get_btc_price: {type(e).__name__}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


async def trading_data_stream(request: Request) -> AsyncGenerator:
    """
    SSE stream generator for real-time trading data.

    Streams:
    - BTC price updates every 3 seconds
    - Contract data updates every 20 seconds
    """
    btc_client = BitcoinPriceClient()
    market_service = MarketService()

    last_btc_update = 0.0
    last_contract_update = 0.0
    last_btc_price = 0.0

    try:
        # Send initial connection event
        yield {
            "event": "connected",
            "data": json.dumps({"status": "connected", "timestamp": datetime.now(UTC).isoformat()})
        }

        while True:
            # Check if client disconnected
            if await request.is_disconnected():
                print("SSE client disconnected")
                break

            current_time = asyncio.get_event_loop().time()

            # Stream BTC price every 3 seconds
            if current_time - last_btc_update >= 3.0:
                try:
                    price = await btc_client.get_spot_price()
                    # Only send if price changed
                    if abs(price - last_btc_price) > 0.01:
                        yield {
                            "event": "btc_price",
                            "data": json.dumps({
                                "price": price,
                                "timestamp": datetime.now(UTC).isoformat()
                            })
                        }
                        last_btc_price = price
                    last_btc_update = current_time
                except Exception as e:
                    print(f"Error fetching BTC price in stream: {e}")

            # Stream contract updates every 20 seconds
            if current_time - last_contract_update >= 20.0:
                try:
                    contracts = await market_service.get_bitcoin_hourly_contracts()
                    signals = [SignalResponse(**contract) for contract in contracts]

                    yield {
                        "event": "contracts_update",
                        "data": json.dumps({
                            "contracts": [s.model_dump() for s in signals],
                            "timestamp": datetime.now(UTC).isoformat()
                        })
                    }
                    last_contract_update = current_time
                except Exception as e:
                    print(f"Error fetching contracts in stream: {e}")

            # Small sleep to avoid tight loop
            await asyncio.sleep(0.5)

    except asyncio.CancelledError:
        print("SSE stream cancelled")
    except Exception as e:
        print(f"SSE stream error: {e}")
        traceback.print_exc()


@router.get("/stream/trading")
async def stream_trading_data(request: Request):
    """
    Server-Sent Events endpoint for real-time trading data.

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
