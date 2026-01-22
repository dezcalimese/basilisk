"""Pydantic types for DFlow API responses."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class DFlowEvent(BaseModel):
    """DFlow event (e.g., KXBTCD Bitcoin daily contracts)."""

    ticker: str = Field(description="Event ticker (e.g., KXBTCD-25JAN22)")
    series_ticker: str = Field(description="Series ticker (e.g., KXBTCD)")
    title: str
    subtitle: Optional[str] = None
    status: str = Field(description="Event status: active, closed, settled")
    expiration_time: datetime
    settlement_time: Optional[datetime] = None


class DFlowMarket(BaseModel):
    """DFlow market (individual strike within an event)."""

    ticker: str = Field(description="Market ticker (e.g., KXBTCD-25JAN22-T105000)")
    event_ticker: str
    title: str
    subtitle: Optional[str] = None
    status: str

    # Strike information
    strike_price: float = Field(description="Strike price in USD")
    strike_type: str = Field(description="Strike type: above, below, range")

    # Token mints (Solana SPL tokens)
    yes_mint: str = Field(description="Solana mint address for YES tokens")
    no_mint: str = Field(description="Solana mint address for NO tokens")

    # Market data
    yes_bid: Optional[float] = None
    yes_ask: Optional[float] = None
    no_bid: Optional[float] = None
    no_ask: Optional[float] = None
    last_price: Optional[float] = None
    volume_24h: Optional[float] = None
    open_interest: Optional[int] = None

    # Times
    expiration_time: datetime
    close_time: Optional[datetime] = None


class DFlowOrderbookLevel(BaseModel):
    """Single level in the orderbook."""

    price: float = Field(description="Price in cents (1-99)")
    quantity: int = Field(description="Number of contracts")


class DFlowOrderbook(BaseModel):
    """DFlow orderbook for a market."""

    ticker: str
    yes_bids: list[DFlowOrderbookLevel] = []
    yes_asks: list[DFlowOrderbookLevel] = []
    no_bids: list[DFlowOrderbookLevel] = []
    no_asks: list[DFlowOrderbookLevel] = []
    timestamp: datetime


class DFlowQuote(BaseModel):
    """Quote for a swap transaction."""

    quote_id: str = Field(description="Unique quote identifier")
    input_mint: str = Field(description="Input token mint (e.g., USDC)")
    output_mint: str = Field(description="Output token mint (e.g., YES/NO token)")
    input_amount: int = Field(description="Input amount in token units")
    output_amount: int = Field(description="Expected output amount")
    price: float = Field(description="Effective price per contract")
    price_impact: float = Field(description="Price impact percentage")
    fee: float = Field(description="Fee amount in USD")
    expires_at: datetime = Field(description="Quote expiration time")
    slippage_bps: int = Field(default=50, description="Slippage tolerance in basis points")


class DFlowSwapTransaction(BaseModel):
    """Unsigned Solana transaction for executing a swap."""

    quote_id: str
    transaction: str = Field(description="Base64-encoded unsigned transaction")
    order_id: str = Field(description="Order ID for tracking")
    expires_at: datetime


class DFlowOrderStatus(BaseModel):
    """Status of a DFlow order."""

    order_id: str
    quote_id: str
    status: str = Field(description="pending, filling, filled, cancelled, expired")
    input_mint: str
    output_mint: str
    input_amount: int
    output_amount: int
    filled_amount: int = Field(default=0)
    average_price: Optional[float] = None
    transaction_signature: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    filled_at: Optional[datetime] = None


# Request models


class QuoteRequest(BaseModel):
    """Request for a swap quote."""

    input_mint: str = Field(description="Input token mint address")
    output_mint: str = Field(description="Output token mint address")
    amount: int = Field(description="Amount in token units")
    side: str = Field(default="buy", description="buy or sell")
    slippage_bps: int = Field(default=50, description="Slippage tolerance in basis points")


class SwapRequest(BaseModel):
    """Request to create a swap transaction."""

    quote_id: str
    user_wallet: str = Field(description="User's Solana wallet address")


# Mapped types for internal use


class TradeSignalWithMints(BaseModel):
    """Trade signal with DFlow token mints for trading."""

    ticker: str
    event_ticker: str
    strike_price: float
    time_to_expiry_hours: float
    expiry_time: datetime

    # Signal data
    signal_type: str = Field(description="BUY_YES, BUY_NO, SELL_YES, SELL_NO")
    expected_value: float
    model_probability: float
    implied_probability: float
    edge: float

    # Prices
    yes_price: float
    no_price: float
    yes_bid: Optional[float] = None
    yes_ask: Optional[float] = None
    no_bid: Optional[float] = None
    no_ask: Optional[float] = None

    # DFlow token mints
    yes_mint: str
    no_mint: str

    # Status
    is_active: bool = True
    is_high_ev: bool = False
