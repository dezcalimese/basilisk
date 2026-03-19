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
    expiration_time: Optional[datetime] = None
    settlement_time: Optional[datetime] = None


class DFlowMarketAccountInfo(BaseModel):
    """Account info for a specific settlement mint within a market."""

    market_ledger: str = Field(description="Market ledger mint")
    yes_mint: str = Field(description="YES outcome mint address")
    no_mint: str = Field(description="NO outcome mint address")
    is_initialized: bool = False
    redemption_status: Optional[str] = None
    scalar_outcome_pct: Optional[int] = None


class DFlowMarket(BaseModel):
    """DFlow market (individual strike within an event)."""

    ticker: str = Field(description="Market ticker (e.g., KXBTCD-25JAN22-T105000)")
    event_ticker: str
    title: str
    subtitle: Optional[str] = None
    status: str
    market_type: Optional[str] = None

    # YES/NO subtitles
    yes_sub_title: Optional[str] = None
    no_sub_title: Optional[str] = None

    # Market data
    yes_bid: Optional[str] = None
    yes_ask: Optional[str] = None
    no_bid: Optional[str] = None
    no_ask: Optional[str] = None
    volume: Optional[int] = None
    open_interest: Optional[int] = None

    # Times
    open_time: Optional[int] = None
    close_time: Optional[int] = None
    expiration_time: Optional[int] = None

    # Accounts keyed by settlement mint
    accounts: dict[str, DFlowMarketAccountInfo] = Field(default_factory=dict)

    # Resolution
    result: Optional[str] = None
    can_close_early: bool = False

    @property
    def yes_mint(self) -> Optional[str]:
        """Get YES mint from first account entry."""
        for acct in self.accounts.values():
            return acct.yes_mint
        return None

    @property
    def no_mint(self) -> Optional[str]:
        """Get NO mint from first account entry."""
        for acct in self.accounts.values():
            return acct.no_mint
        return None

    @property
    def is_initialized(self) -> bool:
        """Check if market is initialized on-chain."""
        for acct in self.accounts.values():
            return acct.is_initialized
        return False


class DFlowOrderbookLevel(BaseModel):
    """Single level in the orderbook."""

    price: str = Field(description="Price as string (4-decimal probability)")
    quantity: int = Field(description="Number of contracts")


class DFlowOrderbook(BaseModel):
    """DFlow orderbook for a market."""

    ticker: str
    yes_bids: dict[str, int] = Field(default_factory=dict)
    no_bids: dict[str, int] = Field(default_factory=dict)
    sequence: Optional[int] = None


# ============================================================
# Trade API types (GET /order flow)
# ============================================================


class OrderRequest(BaseModel):
    """Request parameters for GET /order."""

    input_mint: str = Field(description="Input token mint address")
    output_mint: str = Field(description="Output token mint address")
    amount: int = Field(description="Amount in atomic units (scaled by decimals)")
    user_public_key: Optional[str] = Field(
        default=None,
        description="User's Solana wallet address. If provided, response includes transaction.",
    )
    slippage_bps: int | str = Field(
        default="auto", description="Slippage tolerance in bps or 'auto'"
    )
    prediction_market_slippage_bps: Optional[int | str] = Field(
        default=None, description="Slippage for prediction market leg"
    )


class DFlowOrderResponse(BaseModel):
    """Response from GET /order."""

    input_mint: str
    in_amount: str = Field(description="Max input amount (scaled integer as string)")
    output_mint: str
    out_amount: str = Field(description="Expected output amount (scaled integer as string)")
    other_amount_threshold: Optional[str] = Field(
        default=None, description="Min output after fees"
    )
    slippage_bps: Optional[int] = None
    price_impact_pct: Optional[str] = None
    execution_mode: str = Field(description="'sync' or 'async'")
    transaction: Optional[str] = Field(
        default=None, description="Base64-encoded transaction to sign"
    )
    last_valid_block_height: Optional[int] = None
    revert_mint: Optional[str] = None


class DFlowFill(BaseModel):
    """A single fill within an order."""

    qty_in: Optional[int] = None
    qty_out: Optional[int] = None


class DFlowOrderStatus(BaseModel):
    """Status of a DFlow order (polled by tx signature)."""

    status: str = Field(
        description="pending, open, pendingClose, closed, expired, failed"
    )
    fills: list[DFlowFill] = Field(default_factory=list)


# Legacy request models (kept for backward compatibility during migration)


class QuoteRequest(BaseModel):
    """Legacy: Request for a swap quote. Use OrderRequest instead."""

    input_mint: str
    output_mint: str
    amount: int
    side: str = "buy"
    slippage_bps: int = 50


class SwapRequest(BaseModel):
    """Legacy: Request to create a swap transaction. Use OrderRequest instead."""

    quote_id: str
    user_wallet: str


# ============================================================
# Internal types
# ============================================================


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
