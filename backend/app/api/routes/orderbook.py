"""Orderbook endpoint - returns market depth data for a ticker.

Data source priority:
1. DFlow Metadata API (has CLP liquidity even when Kalshi orderbook is empty)
2. Kalshi WebSocket state (real-time, no API call)
3. Kalshi REST API (fallback, cached)
"""

import logging
import time
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.data.dflow_client import get_dflow_client
from app.data.kalshi_client import KalshiClient
from app.data.kalshi_ws import get_ws_manager

logger = logging.getLogger(__name__)

_orderbook_cache: dict[str, tuple[float, Any]] = {}
_CACHE_TTL = 10

router = APIRouter()


class OrderBookLevel(BaseModel):
    price: float
    quantity: int
    total: int


class OrderBookResponse(BaseModel):
    yes_bids: list[OrderBookLevel]
    yes_asks: list[OrderBookLevel]
    no_bids: list[OrderBookLevel]
    no_asks: list[OrderBookLevel]
    spread: float
    mid_price: float
    source: str = "unknown"


@router.get("/orderbook/{ticker}")
async def get_orderbook(ticker: str) -> OrderBookResponse:
    """Get orderbook depth. Tries DFlow first, then Kalshi WS, then Kalshi REST."""
    now = time.time()

    if ticker in _orderbook_cache:
        cached_time, cached_data = _orderbook_cache[ticker]
        if now - cached_time < _CACHE_TTL:
            return cached_data

    # 1. DFlow (has CLP liquidity even when Kalshi books are empty)
    try:
        result = await _fetch_dflow_orderbook(ticker)
        if result:
            _orderbook_cache[ticker] = (now, result)
            return result
    except Exception as e:
        logger.warning(f"DFlow orderbook failed for {ticker}: {e}")

    # 2. Kalshi WebSocket state
    try:
        ws_manager = get_ws_manager()
        ws_ob = ws_manager.get_orderbook(ticker)
        if ws_ob and (ws_ob.yes_bids or ws_ob.no_bids):
            result = _build_response_from_raw(
                [[p, q] for p, q in sorted(ws_ob.yes_bids.items(), reverse=True)],
                [[p, q] for p, q in sorted(ws_ob.no_bids.items(), reverse=True)],
                source="kalshi_ws",
            )
            _orderbook_cache[ticker] = (now, result)
            return result
    except Exception as e:
        logger.debug(f"WS orderbook failed for {ticker}: {e}")

    # 3. Kalshi REST
    try:
        result = await _fetch_kalshi_orderbook(ticker)
        if result:
            _orderbook_cache[ticker] = (now, result)
            return result
    except Exception as e:
        logger.debug(f"Kalshi REST orderbook failed for {ticker}: {e}")

    return OrderBookResponse(
        yes_bids=[], yes_asks=[], no_bids=[], no_asks=[],
        spread=0.0, mid_price=0.0, source="none",
    )


async def _fetch_dflow_orderbook(ticker: str) -> OrderBookResponse | None:
    """Fetch orderbook from DFlow Metadata API."""
    dflow = get_dflow_client()
    ob = await dflow.get_orderbook(ticker)

    yes_bids_raw = ob.yes_bids
    no_bids_raw = ob.no_bids

    if not yes_bids_raw and not no_bids_raw:
        return None

    yes_bids_cents = []
    for price_str, qty in yes_bids_raw.items():
        price_cents = round(float(price_str) * 100)
        yes_bids_cents.append([price_cents, qty])

    no_bids_cents = []
    for price_str, qty in no_bids_raw.items():
        price_cents = round(float(price_str) * 100)
        no_bids_cents.append([price_cents, qty])

    return _build_response_from_raw(yes_bids_cents, no_bids_cents, source="dflow")


async def _fetch_kalshi_orderbook(ticker: str) -> OrderBookResponse | None:
    """Fetch orderbook from Kalshi REST API."""
    kalshi = KalshiClient()
    data = await kalshi.get_market_orderbook(ticker)
    if not data:
        return None

    raw = data.get("orderbook", {}) if isinstance(data, dict) else {}
    yes_raw = raw.get("yes", [])
    no_raw = raw.get("no", [])
    if not yes_raw and not no_raw:
        return None

    return _build_response_from_raw(yes_raw, no_raw, source="kalshi")


def _build_response_from_raw(
    yes_bids_raw: list, no_bids_raw: list, source: str = "unknown",
) -> OrderBookResponse:
    yes_bids = _process_bid_levels(yes_bids_raw)
    yes_asks = _process_ask_levels_from_opposite_bids(no_bids_raw)
    no_bids = _process_bid_levels(no_bids_raw)
    no_asks = _process_ask_levels_from_opposite_bids(yes_bids_raw)

    best_yes_bid = yes_bids[0].price if yes_bids else 0.0
    best_yes_ask = yes_asks[0].price if yes_asks else 1.0
    spread = best_yes_ask - best_yes_bid
    mid_price = (best_yes_bid + best_yes_ask) / 2.0

    return OrderBookResponse(
        yes_bids=yes_bids, yes_asks=yes_asks,
        no_bids=no_bids, no_asks=no_asks,
        spread=spread, mid_price=mid_price, source=source,
    )


def _process_bid_levels(bid_levels: list) -> list[OrderBookLevel]:
    if not bid_levels:
        return []
    sorted_bids = sorted(bid_levels, key=lambda x: x[0], reverse=True)
    levels = []
    cumulative = 0
    for price_cents, quantity in sorted_bids:
        price = price_cents / 100.0
        cumulative += quantity
        levels.append(OrderBookLevel(price=price, quantity=quantity, total=cumulative))
    return levels


def _process_ask_levels_from_opposite_bids(opposite_bid_levels: list) -> list[OrderBookLevel]:
    if not opposite_bid_levels:
        return []
    inverted = [[100 - p, q] for p, q in opposite_bid_levels]
    sorted_asks = sorted(inverted, key=lambda x: x[0])
    levels = []
    cumulative = 0
    for price_cents, quantity in sorted_asks:
        price = price_cents / 100.0
        cumulative += quantity
        levels.append(OrderBookLevel(price=price, quantity=quantity, total=cumulative))
    return levels
