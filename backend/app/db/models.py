"""Database models for Basilisk."""

from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, Float, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


class Contract(Base):
    """Kalshi contract information."""

    __tablename__ = "contracts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ticker: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    title: Mapped[str] = mapped_column(String(500))
    category: Mapped[str] = mapped_column(String(100))
    close_time: Mapped[datetime] = mapped_column()
    expiration_time: Mapped[datetime] = mapped_column()
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        default=datetime.utcnow, onupdate=datetime.utcnow
    )


class MarketPrice(Base):
    """Market price snapshot for contracts."""

    __tablename__ = "market_prices"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    contract_id: Mapped[int] = mapped_column(Integer, index=True)
    ticker: Mapped[str] = mapped_column(String(100), index=True)

    # Price data
    yes_bid: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    yes_ask: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    no_bid: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    no_ask: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    last_price: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # Implied probability from market prices
    implied_probability: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # Volume data
    volume: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    open_interest: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    timestamp: Mapped[datetime] = mapped_column(default=datetime.utcnow, index=True)


class BitcoinPrice(Base):
    """Bitcoin spot price snapshots."""

    __tablename__ = "bitcoin_prices"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    price_usd: Mapped[float] = mapped_column(Float)
    source: Mapped[str] = mapped_column(String(50), default="coinbase")
    timestamp: Mapped[datetime] = mapped_column(default=datetime.utcnow, index=True)


class ModelPrediction(Base):
    """Model probability predictions."""

    __tablename__ = "model_predictions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    contract_id: Mapped[int] = mapped_column(Integer, index=True)
    ticker: Mapped[str] = mapped_column(String(100), index=True)

    # Model outputs
    model_version: Mapped[str] = mapped_column(String(50), default="v1")
    predicted_probability: Mapped[float] = mapped_column(Float)
    confidence_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # Features used
    features_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Market data at prediction time
    market_price_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    implied_probability: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # Expected value calculation
    expected_value: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    edge_percentage: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # Signal flag
    is_signal: Mapped[bool] = mapped_column(Boolean, default=False, index=True)

    timestamp: Mapped[datetime] = mapped_column(default=datetime.utcnow, index=True)


class TradeSignal(Base):
    """High expected value trade signals."""

    __tablename__ = "trade_signals"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    prediction_id: Mapped[int] = mapped_column(Integer, index=True)
    ticker: Mapped[str] = mapped_column(String(100), index=True)

    # Signal details
    signal_type: Mapped[str] = mapped_column(String(20))  # "YES" or "NO"
    expected_value: Mapped[float] = mapped_column(Float)
    edge_percentage: Mapped[float] = mapped_column(Float)
    recommended_price: Mapped[float] = mapped_column(Float)

    # Risk assessment
    confidence_score: Mapped[float] = mapped_column(Float)
    time_to_expiry_hours: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # Status
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    dismissed_at: Mapped[Optional[datetime]] = mapped_column(nullable=True)

    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow, index=True)
