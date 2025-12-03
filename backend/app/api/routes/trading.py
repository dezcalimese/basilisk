"""Trading API routes for executing trades and managing positions."""

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.db.models import Trade
from app.services.trade_executor import TradeExecutor, TradeRequest

router = APIRouter(prefix="/trade", tags=["trading"])


class ExecuteTradeRequest(BaseModel):
    """Request to execute a trade."""

    ticker: str = Field(..., description="Market ticker symbol")
    asset: str = Field(..., pattern="^(BTC|ETH|XRP)$", description="Asset type")
    direction: str = Field(..., pattern="^(YES|NO)$", description="Trade direction")
    strike: float = Field(..., description="Strike price")
    contracts: int = Field(..., ge=1, le=1000, description="Number of contracts")
    order_type: str = Field(default="market", pattern="^(market|limit)$")
    limit_price: Optional[int] = Field(
        default=None, ge=1, le=99, description="Limit price in cents (1-99)"
    )
    signal_id: Optional[str] = Field(default=None, description="Associated signal ID")


class ExecuteFromSignalRequest(BaseModel):
    """Request to execute a trade from a signal."""

    signal_id: int = Field(..., description="Signal ID to trade")
    contracts: int = Field(..., ge=1, le=1000, description="Number of contracts")


class TradeResponseModel(BaseModel):
    """Response from trade execution."""

    success: bool
    trade_id: Optional[int] = None
    order_id: Optional[str] = None
    client_order_id: Optional[str] = None
    filled: int = 0
    price: Optional[float] = None
    cost: Optional[float] = None
    error: Optional[str] = None


class PositionModel(BaseModel):
    """Position summary model."""

    trade_id: int
    ticker: str
    asset: str
    direction: str
    strike: float
    contracts: int
    entry_price: float
    current_price: Optional[float]
    unrealized_pnl: Optional[float]
    status: str
    expiry_at: Optional[datetime]
    opened_at: datetime


class TradeHistoryModel(BaseModel):
    """Trade history item."""

    id: int
    ticker: str
    asset: str
    direction: str
    strike: float
    contracts: int
    entry_price: float
    exit_price: Optional[float]
    fees: Optional[float]
    pnl: Optional[float]
    status: str
    opened_at: datetime
    closed_at: Optional[datetime]


class PnLSummaryModel(BaseModel):
    """P&L summary model."""

    period: str
    total_pnl: float
    total_fees: float
    net_pnl: float
    trade_count: int
    wins: int
    losses: int
    win_rate: float


@router.post("", response_model=TradeResponseModel)
async def execute_trade(
    request: ExecuteTradeRequest,
    db: AsyncSession = Depends(get_db),
) -> TradeResponseModel:
    """
    Execute a trade on Kalshi.

    Places an order with the configured Builder Code for revenue sharing.
    """
    executor = TradeExecutor(db)

    trade_request = TradeRequest(
        ticker=request.ticker,
        asset=request.asset,
        direction=request.direction,
        strike=request.strike,
        contracts=request.contracts,
        order_type=request.order_type,
        limit_price=request.limit_price,
        signal_id=request.signal_id,
    )

    result = await executor.execute_trade(trade_request)

    return TradeResponseModel(
        success=result.success,
        trade_id=result.trade_id,
        order_id=result.order_id,
        client_order_id=result.client_order_id,
        filled=result.filled,
        price=result.price,
        cost=result.cost,
        error=result.error,
    )


@router.post("/signal", response_model=TradeResponseModel)
async def execute_from_signal(
    request: ExecuteFromSignalRequest,
    db: AsyncSession = Depends(get_db),
) -> TradeResponseModel:
    """
    Execute a trade from an existing signal.

    Looks up the signal and places an order based on its parameters.
    """
    executor = TradeExecutor(db)
    result = await executor.execute_from_signal(
        signal_id=request.signal_id,
        contracts=request.contracts,
    )

    return TradeResponseModel(
        success=result.success,
        trade_id=result.trade_id,
        order_id=result.order_id,
        client_order_id=result.client_order_id,
        filled=result.filled,
        price=result.price,
        cost=result.cost,
        error=result.error,
    )


@router.get("/positions", response_model=list[PositionModel])
async def get_positions(
    db: AsyncSession = Depends(get_db),
) -> list[PositionModel]:
    """
    Get all open positions with live P&L.

    Returns current market prices and unrealized profit/loss for each position.
    """
    executor = TradeExecutor(db)
    positions = await executor.get_open_positions()

    return [
        PositionModel(
            trade_id=p.trade_id,
            ticker=p.ticker,
            asset=p.asset,
            direction=p.direction,
            strike=p.strike,
            contracts=p.contracts,
            entry_price=p.entry_price,
            current_price=p.current_price,
            unrealized_pnl=p.unrealized_pnl,
            status=p.status,
            expiry_at=p.expiry_at,
            opened_at=p.opened_at,
        )
        for p in positions
    ]


@router.get("/positions/{trade_id}", response_model=PositionModel)
async def get_position(
    trade_id: int,
    db: AsyncSession = Depends(get_db),
) -> PositionModel:
    """
    Get details of a specific position.
    """
    result = await db.execute(
        select(Trade).where(Trade.id == trade_id)
    )
    trade = result.scalar_one_or_none()

    if not trade:
        raise HTTPException(status_code=404, detail="Position not found")

    # Get live price
    executor = TradeExecutor(db)
    positions = await executor.get_open_positions()
    position = next((p for p in positions if p.trade_id == trade_id), None)

    if position:
        return PositionModel(
            trade_id=position.trade_id,
            ticker=position.ticker,
            asset=position.asset,
            direction=position.direction,
            strike=position.strike,
            contracts=position.contracts,
            entry_price=position.entry_price,
            current_price=position.current_price,
            unrealized_pnl=position.unrealized_pnl,
            status=position.status,
            expiry_at=position.expiry_at,
            opened_at=position.opened_at,
        )

    # Return without live data if not in open positions
    return PositionModel(
        trade_id=trade.id,
        ticker=trade.ticker,
        asset=trade.asset,
        direction=trade.direction,
        strike=trade.strike,
        contracts=trade.contracts,
        entry_price=trade.entry_price,
        current_price=None,
        unrealized_pnl=None,
        status=trade.status,
        expiry_at=trade.expiry_at,
        opened_at=trade.opened_at,
    )


@router.delete("/positions/{trade_id}", response_model=TradeResponseModel)
async def close_position(
    trade_id: int,
    db: AsyncSession = Depends(get_db),
) -> TradeResponseModel:
    """
    Close an open position.

    Places a market sell order to close the position.
    """
    executor = TradeExecutor(db)
    result = await executor.close_position(trade_id)

    return TradeResponseModel(
        success=result.success,
        trade_id=result.trade_id,
        order_id=result.order_id,
        filled=result.filled,
        price=result.price,
        cost=result.cost,  # Contains P&L for closes
        error=result.error,
    )


@router.get("/history", response_model=list[TradeHistoryModel])
async def get_trade_history(
    limit: int = 50,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
) -> list[TradeHistoryModel]:
    """
    Get trade history.

    Returns completed trades with P&L information.
    """
    executor = TradeExecutor(db)
    trades = await executor.get_trade_history(limit=limit, offset=offset)

    return [
        TradeHistoryModel(
            id=t.id,
            ticker=t.ticker,
            asset=t.asset,
            direction=t.direction,
            strike=t.strike,
            contracts=t.contracts,
            entry_price=t.entry_price,
            exit_price=t.exit_price,
            fees=t.fees,
            pnl=t.pnl,
            status=t.status,
            opened_at=t.opened_at,
            closed_at=t.closed_at,
        )
        for t in trades
    ]


@router.get("/pnl/{period}", response_model=PnLSummaryModel)
async def get_pnl_summary(
    period: str = "today",
    db: AsyncSession = Depends(get_db),
) -> PnLSummaryModel:
    """
    Get P&L summary for a period.

    Period can be: "today", "week", or "all"
    """
    if period not in ("today", "week", "all"):
        raise HTTPException(
            status_code=400,
            detail="Period must be 'today', 'week', or 'all'",
        )

    executor = TradeExecutor(db)
    summary = await executor.get_pnl_summary(period=period)

    return PnLSummaryModel(**summary)


@router.get("/balance")
async def get_balance(
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Get Kalshi account balance.
    """
    executor = TradeExecutor(db)
    try:
        balance = await executor.kalshi.get_balance()
        return balance
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
