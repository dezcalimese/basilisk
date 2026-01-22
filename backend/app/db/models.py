"""Database models for Basilisk."""

from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, Float, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


class User(Base):
    """User authenticated via Privy with Solana wallet."""

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    privy_user_id: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    wallet_address: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)
    email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        default=datetime.utcnow, onupdate=datetime.utcnow
    )
    last_login_at: Mapped[Optional[datetime]] = mapped_column(nullable=True)


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


class Trade(Base):
    """Trade history with P&L tracking."""

    __tablename__ = "trades"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    signal_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, index=True)

    # Trade details
    asset: Mapped[str] = mapped_column(String(10))  # BTC, ETH, XRP
    ticker: Mapped[str] = mapped_column(String(100), index=True)
    direction: Mapped[str] = mapped_column(String(10))  # YES or NO
    strike: Mapped[float] = mapped_column(Float)
    contracts: Mapped[int] = mapped_column(Integer)

    # Pricing
    entry_price: Mapped[float] = mapped_column(Float)
    exit_price: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    fees: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    pnl: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # Status: PENDING, OPEN, CLOSED, EXPIRED, CANCELLED
    status: Mapped[str] = mapped_column(String(20), default="PENDING", index=True)

    # Kalshi order tracking
    kalshi_order_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, unique=True)
    client_order_id: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    builder_code_used: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    # Fill information
    filled_contracts: Mapped[int] = mapped_column(Integer, default=0)
    avg_fill_price: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # Timestamps
    opened_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
    closed_at: Mapped[Optional[datetime]] = mapped_column(nullable=True)
    expiry_at: Mapped[Optional[datetime]] = mapped_column(nullable=True)


class UserPreferences(Base):
    """User preferences and notification settings (single user for now)."""

    __tablename__ = "user_preferences"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    # Notification channels
    telegram_chat_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    apns_device_token: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    # Kalshi credentials (encrypted)
    kalshi_api_key_encrypted: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Alert settings
    min_ev_threshold: Mapped[float] = mapped_column(Float, default=0.05)  # 5% minimum EV
    alert_assets: Mapped[str] = mapped_column(String(100), default='["BTC","ETH","XRP"]')
    alerts_enabled: Mapped[bool] = mapped_column(Boolean, default=True)

    # Quiet hours (store as HH:MM strings)
    quiet_hours_start: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    quiet_hours_end: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)

    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        default=datetime.utcnow, onupdate=datetime.utcnow
    )


class PushLog(Base):
    """Push notification log for debugging."""

    __tablename__ = "push_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    channel: Mapped[str] = mapped_column(String(20))  # apns, telegram
    alert_type: Mapped[str] = mapped_column(String(50))  # signal, fill, expiry, etc.
    payload: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    sent_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
    delivered: Mapped[bool] = mapped_column(Boolean, default=False)
