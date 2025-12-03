"""Trade execution service with Kalshi Builder Code integration."""

import uuid
from dataclasses import dataclass
from datetime import datetime
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.data.kalshi_client import KalshiClient, OrderAction, OrderResult, OrderSide, OrderType
from app.db.models import Trade, TradeSignal


@dataclass
class TradeRequest:
    """Request to execute a trade."""

    ticker: str
    asset: str  # BTC, ETH, XRP
    direction: str  # YES or NO
    strike: float
    contracts: int
    order_type: str = "market"  # market or limit
    limit_price: Optional[int] = None  # Price in cents for limit orders
    signal_id: Optional[str] = None


@dataclass
class TradeResponse:
    """Response from trade execution."""

    success: bool
    trade_id: Optional[int] = None
    order_id: Optional[str] = None
    client_order_id: Optional[str] = None
    filled: int = 0
    price: Optional[float] = None
    cost: Optional[float] = None
    error: Optional[str] = None


@dataclass
class PositionSummary:
    """Summary of a position with live P&L."""

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


class TradeExecutor:
    """Service for executing trades on Kalshi with Builder Code."""

    def __init__(self, db: AsyncSession) -> None:
        """Initialize trade executor."""
        self.db = db
        self.kalshi = KalshiClient()
        self.builder_code = settings.kalshi_builder_code

    async def execute_trade(self, request: TradeRequest) -> TradeResponse:
        """
        Execute a trade on Kalshi.

        Args:
            request: Trade request details

        Returns:
            TradeResponse with execution results
        """
        # Generate client order ID for idempotency
        client_order_id = f"basilisk_{uuid.uuid4().hex[:16]}"

        # Map direction to OrderSide
        side = OrderSide.YES if request.direction.upper() == "YES" else OrderSide.NO
        order_type = OrderType.LIMIT if request.order_type == "limit" else OrderType.MARKET

        # Create trade record in PENDING status
        trade = Trade(
            signal_id=request.signal_id,
            asset=request.asset.upper(),
            ticker=request.ticker,
            direction=request.direction.upper(),
            strike=request.strike,
            contracts=request.contracts,
            entry_price=0.0,  # Will be updated after fill
            status="PENDING",
            client_order_id=client_order_id,
            builder_code_used=self.builder_code if self.builder_code else None,
        )
        self.db.add(trade)
        await self.db.flush()  # Get the trade ID

        # Place order on Kalshi
        result = await self.kalshi.place_order(
            ticker=request.ticker,
            side=side,
            action=OrderAction.BUY,
            count=request.contracts,
            order_type=order_type,
            limit_price=request.limit_price,
            client_order_id=client_order_id,
            builder_code=self.builder_code if self.builder_code else None,
        )

        if result.success:
            # Update trade with order details
            trade.kalshi_order_id = result.order_id
            trade.filled_contracts = result.filled_count
            trade.avg_fill_price = result.avg_price

            # Calculate entry price (convert from cents to dollars)
            if result.avg_price:
                trade.entry_price = result.avg_price / 100.0

            # Update status based on fill
            if result.filled_count >= request.contracts:
                trade.status = "OPEN"
            elif result.filled_count > 0:
                trade.status = "PARTIAL"
            else:
                trade.status = "PENDING"

            await self.db.commit()

            # Calculate cost
            cost = None
            if result.avg_price and result.filled_count:
                cost = (result.avg_price / 100.0) * result.filled_count

            return TradeResponse(
                success=True,
                trade_id=trade.id,
                order_id=result.order_id,
                client_order_id=client_order_id,
                filled=result.filled_count,
                price=result.avg_price / 100.0 if result.avg_price else None,
                cost=cost,
            )
        else:
            # Mark trade as failed
            trade.status = "CANCELLED"
            await self.db.commit()

            return TradeResponse(
                success=False,
                trade_id=trade.id,
                client_order_id=client_order_id,
                error=result.error,
            )

    async def execute_from_signal(
        self,
        signal_id: int,
        contracts: int,
    ) -> TradeResponse:
        """
        Execute a trade from a signal.

        Args:
            signal_id: ID of the TradeSignal
            contracts: Number of contracts to trade

        Returns:
            TradeResponse with execution results
        """
        # Fetch signal
        result = await self.db.execute(
            select(TradeSignal).where(TradeSignal.id == signal_id)
        )
        signal = result.scalar_one_or_none()

        if not signal:
            return TradeResponse(success=False, error=f"Signal {signal_id} not found")

        if not signal.is_active:
            return TradeResponse(success=False, error="Signal is no longer active")

        # Extract asset from ticker (e.g., KXBTCD-25DEC02-B98000 -> BTC)
        asset = "BTC"  # Default
        if "KXBTC" in signal.ticker:
            asset = "BTC"
        elif "KXETH" in signal.ticker:
            asset = "ETH"
        elif "KXXRP" in signal.ticker:
            asset = "XRP"

        # Extract strike from ticker or use recommended price
        strike = signal.recommended_price * 100  # Convert to strike format

        request = TradeRequest(
            ticker=signal.ticker,
            asset=asset,
            direction=signal.signal_type,
            strike=strike,
            contracts=contracts,
            signal_id=str(signal_id),
        )

        return await self.execute_trade(request)

    async def close_position(self, trade_id: int) -> TradeResponse:
        """
        Close an open position by selling.

        Args:
            trade_id: ID of the Trade to close

        Returns:
            TradeResponse with close results
        """
        # Fetch trade
        result = await self.db.execute(
            select(Trade).where(Trade.id == trade_id)
        )
        trade = result.scalar_one_or_none()

        if not trade:
            return TradeResponse(success=False, error=f"Trade {trade_id} not found")

        if trade.status != "OPEN":
            return TradeResponse(
                success=False,
                error=f"Trade is not open (status: {trade.status})",
            )

        # Place sell order
        side = OrderSide.YES if trade.direction == "YES" else OrderSide.NO
        client_order_id = f"basilisk_close_{uuid.uuid4().hex[:12]}"

        close_result = await self.kalshi.place_order(
            ticker=trade.ticker,
            side=side,
            action=OrderAction.SELL,
            count=trade.filled_contracts,
            order_type=OrderType.MARKET,
            client_order_id=client_order_id,
        )

        if close_result.success and close_result.filled_count > 0:
            # Calculate P&L
            exit_price = close_result.avg_price / 100.0 if close_result.avg_price else 0
            trade.exit_price = exit_price
            trade.status = "CLOSED"
            trade.closed_at = datetime.utcnow()

            # P&L calculation
            gross_pnl = (exit_price - trade.entry_price) * trade.filled_contracts
            if gross_pnl > 0:
                # Apply 7% fee on profits
                fee = gross_pnl * settings.kalshi_fee_rate
                trade.fees = fee
                trade.pnl = gross_pnl - fee
            else:
                trade.fees = 0
                trade.pnl = gross_pnl

            await self.db.commit()

            return TradeResponse(
                success=True,
                trade_id=trade.id,
                order_id=close_result.order_id,
                filled=close_result.filled_count,
                price=exit_price,
                cost=trade.pnl,  # Using cost field for P&L in close
            )
        else:
            return TradeResponse(
                success=False,
                trade_id=trade.id,
                error=close_result.error or "Failed to close position",
            )

    async def get_open_positions(self) -> list[PositionSummary]:
        """
        Get all open positions with live data.

        Returns:
            List of PositionSummary with current prices and P&L
        """
        result = await self.db.execute(
            select(Trade).where(Trade.status == "OPEN")
        )
        trades = result.scalars().all()

        positions = []
        for trade in trades:
            # Fetch current market price for this ticker
            current_price = None
            unrealized_pnl = None

            try:
                orderbook = await self.kalshi.get_market_orderbook(trade.ticker)
                if trade.direction == "YES":
                    # To sell YES, we look at the bid
                    current_price = orderbook.get("yes", {}).get("bid", 0) / 100.0
                else:
                    # To sell NO, we look at the no bid
                    current_price = orderbook.get("no", {}).get("bid", 0) / 100.0

                if current_price:
                    gross_pnl = (current_price - trade.entry_price) * trade.filled_contracts
                    if gross_pnl > 0:
                        unrealized_pnl = gross_pnl * (1 - settings.kalshi_fee_rate)
                    else:
                        unrealized_pnl = gross_pnl
            except Exception:
                pass

            positions.append(
                PositionSummary(
                    trade_id=trade.id,
                    ticker=trade.ticker,
                    asset=trade.asset,
                    direction=trade.direction,
                    strike=trade.strike,
                    contracts=trade.filled_contracts,
                    entry_price=trade.entry_price,
                    current_price=current_price,
                    unrealized_pnl=unrealized_pnl,
                    status=trade.status,
                    expiry_at=trade.expiry_at,
                    opened_at=trade.opened_at,
                )
            )

        return positions

    async def get_trade_history(
        self,
        limit: int = 50,
        offset: int = 0,
    ) -> list[Trade]:
        """
        Get trade history.

        Args:
            limit: Number of trades to return
            offset: Offset for pagination

        Returns:
            List of Trade objects
        """
        result = await self.db.execute(
            select(Trade)
            .order_by(Trade.opened_at.desc())
            .limit(limit)
            .offset(offset)
        )
        return list(result.scalars().all())

    async def get_pnl_summary(self, period: str = "today") -> dict:
        """
        Get P&L summary for a period.

        Args:
            period: "today", "week", or "all"

        Returns:
            P&L summary dict
        """
        from datetime import timedelta

        # Build date filter
        now = datetime.utcnow()
        if period == "today":
            start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        elif period == "week":
            start = now - timedelta(days=7)
        else:
            start = datetime.min

        result = await self.db.execute(
            select(Trade).where(
                Trade.status == "CLOSED",
                Trade.closed_at >= start,
            )
        )
        trades = result.scalars().all()

        total_pnl = sum(t.pnl or 0 for t in trades)
        total_fees = sum(t.fees or 0 for t in trades)
        wins = sum(1 for t in trades if (t.pnl or 0) > 0)
        losses = sum(1 for t in trades if (t.pnl or 0) < 0)

        return {
            "period": period,
            "total_pnl": total_pnl,
            "total_fees": total_fees,
            "net_pnl": total_pnl,
            "trade_count": len(trades),
            "wins": wins,
            "losses": losses,
            "win_rate": wins / len(trades) if trades else 0,
        }
