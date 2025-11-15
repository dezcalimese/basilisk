"""Trade signals API endpoints."""

from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.db.models import TradeSignal

router = APIRouter()


class SignalResponse(BaseModel):
    """Trade signal response model."""

    id: int
    ticker: str
    signal_type: str
    expected_value: float
    edge_percentage: float
    recommended_price: float
    confidence_score: float
    time_to_expiry_hours: Optional[float]
    is_active: bool

    # Additional fields for Bitcoin contracts
    strike_price: Optional[float] = None
    expiry_time: Optional[str] = None
    current_btc_price: Optional[float] = None
    yes_price: Optional[float] = None
    no_price: Optional[float] = None
    implied_probability: Optional[float] = None  # Kalshi market price
    model_probability: Optional[float] = None  # DVOL+BS theoretical probability

    # Mispricing detection fields (DVOL-based edge detection)
    theoretical_probability: Optional[float] = None  # Same as model_probability (clarity)
    mispricing: Optional[float] = None  # theoretical - implied (absolute)
    mispricing_pct: Optional[float] = None  # Percentage mispricing
    mispricing_signal: Optional[str] = None  # Trading signal
    mispricing_opportunity: Optional[str] = None  # Human-readable explanation

    class Config:
        from_attributes = True


@router.get("/signals/current", response_model=list[SignalResponse])
async def get_current_signals(
    db: AsyncSession = Depends(get_db), limit: int = 10
) -> list[TradeSignal]:
    """Get current active trade signals."""
    result = await db.execute(
        select(TradeSignal)
        .where(TradeSignal.is_active == True)  # noqa: E712
        .order_by(TradeSignal.expected_value.desc())
        .limit(limit)
    )
    return list(result.scalars().all())


@router.get("/signals/{signal_id}", response_model=SignalResponse)
async def get_signal(signal_id: int, db: AsyncSession = Depends(get_db)) -> Optional[TradeSignal]:
    """Get a specific trade signal by ID."""
    result = await db.execute(select(TradeSignal).where(TradeSignal.id == signal_id))
    return result.scalar_one_or_none()
