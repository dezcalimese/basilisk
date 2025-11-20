"""Orderbook endpoint - returns market depth data for a ticker."""

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.data.kalshi_client import KalshiClient

router = APIRouter()


class OrderBookLevel(BaseModel):
    """Single level in the orderbook."""

    price: float
    quantity: int
    total: int


class OrderBookResponse(BaseModel):
    """Response model for orderbook data."""

    yes_bids: list[OrderBookLevel]
    yes_asks: list[OrderBookLevel]
    no_bids: list[OrderBookLevel]
    no_asks: list[OrderBookLevel]
    spread: float
    mid_price: float


@router.get("/orderbook/{ticker}")
async def get_orderbook(ticker: str) -> OrderBookResponse:
    """
    Get orderbook depth for a specific market ticker.

    Args:
        ticker: Market ticker symbol (e.g., KXBTCD-25NOV1810-T91750.99)

    Returns:
        OrderBookResponse with bids/asks for YES and NO sides
    """
    try:
        kalshi_client = KalshiClient()
        orderbook_data = await kalshi_client.get_market_orderbook(ticker)

        # Handle case where API returns None or empty data
        if not orderbook_data:
            return OrderBookResponse(
                yes_bids=[],
                yes_asks=[],
                no_bids=[],
                no_asks=[],
                spread=0.0,
                mid_price=0.5,
            )

        # Extract orderbook structure from Kalshi response
        # Kalshi returns: {"orderbook": {"yes": [[price, qty], ...], "no": [[price, qty], ...]}}
        # These are BIDS ONLY - no asks returned
        # Each level is [price_in_cents, quantity]
        raw_orderbook = orderbook_data.get("orderbook", {}) if isinstance(orderbook_data, dict) else {}

        # Get YES and NO bids (arrays of [price, quantity])
        yes_bids_raw = raw_orderbook.get("yes", [])
        no_bids_raw = raw_orderbook.get("no", [])

        # In binary markets:
        # - YES bid at price P means someone wants to buy YES at P cents
        # - NO bid at price P means someone wants to buy NO at P cents
        # - YES ask = NO bid inverted (if someone bids 40¢ for NO, that's an ask at 60¢ for YES)
        # - NO ask = YES bid inverted (if someone bids 60¢ for YES, that's an ask at 40¢ for NO)

        # Process YES bids from yes array
        yes_bids = _process_bid_levels(yes_bids_raw)

        # YES asks come from NO bids (inverted)
        yes_asks = _process_ask_levels_from_opposite_bids(no_bids_raw)

        # Process NO bids from no array
        no_bids = _process_bid_levels(no_bids_raw)

        # NO asks come from YES bids (inverted)
        no_asks = _process_ask_levels_from_opposite_bids(yes_bids_raw)

        # Calculate spread and mid price
        best_yes_bid = yes_bids[0].price if yes_bids else 0.0
        best_yes_ask = yes_asks[0].price if yes_asks else 1.0
        spread = best_yes_ask - best_yes_bid
        mid_price = (best_yes_bid + best_yes_ask) / 2.0

        return OrderBookResponse(
            yes_bids=yes_bids,
            yes_asks=yes_asks,
            no_bids=no_bids,
            no_asks=no_asks,
            spread=spread,
            mid_price=mid_price,
        )

    except Exception as e:
        print(f"✗ ERROR in get_orderbook: {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


def _process_bid_levels(bid_levels: list[list[int]]) -> list[OrderBookLevel]:
    """
    Process raw bid levels from Kalshi API into OrderBookLevel objects.

    Args:
        bid_levels: Raw bid levels from Kalshi API [[price_cents, quantity], ...]

    Returns:
        List of OrderBookLevel with cumulative totals, sorted best to worst
    """
    if not bid_levels:
        return []

    # Sort bids by price descending (best bid = highest price)
    sorted_bids = sorted(bid_levels, key=lambda x: x[0], reverse=True)

    levels = []
    cumulative = 0

    for price_cents, quantity in sorted_bids:
        price = price_cents / 100.0  # Convert cents to dollars
        cumulative += quantity

        levels.append(
            OrderBookLevel(price=price, quantity=quantity, total=cumulative)
        )

    return levels


def _process_ask_levels_from_opposite_bids(
    opposite_bid_levels: list[list[int]],
) -> list[OrderBookLevel]:
    """
    Create ask levels by inverting the opposite side's bid levels.

    In binary markets:
    - If someone bids 40¢ for NO, that's equivalent to asking 60¢ for YES
    - If someone bids 60¢ for YES, that's equivalent to asking 40¢ for NO

    Args:
        opposite_bid_levels: Bid levels from opposite side [[price_cents, quantity], ...]

    Returns:
        List of OrderBookLevel representing asks, sorted best to worst (ascending price)
    """
    if not opposite_bid_levels:
        return []

    # Invert prices: ask_price = 1.00 - opposite_bid_price
    inverted_levels = []
    for price_cents, quantity in opposite_bid_levels:
        inverted_price_cents = 100 - price_cents
        inverted_levels.append([inverted_price_cents, quantity])

    # Sort asks by price ascending (best ask = lowest price)
    sorted_asks = sorted(inverted_levels, key=lambda x: x[0])

    levels = []
    cumulative = 0

    for price_cents, quantity in sorted_asks:
        price = price_cents / 100.0  # Convert cents to dollars
        cumulative += quantity

        levels.append(
            OrderBookLevel(price=price, quantity=quantity, total=cumulative)
        )

    return levels
