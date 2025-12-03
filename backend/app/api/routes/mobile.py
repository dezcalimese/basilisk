"""Mobile API routes for push notifications and lightweight endpoints."""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.db.models import UserPreferences

router = APIRouter(prefix="/mobile", tags=["mobile"])


class RegisterPushRequest(BaseModel):
    """Request to register a push notification token."""

    device_token: str = Field(..., description="APNs device token")
    platform: str = Field(default="ios", pattern="^(ios|android)$")


class UpdatePreferencesRequest(BaseModel):
    """Request to update user preferences."""

    telegram_chat_id: Optional[str] = None
    min_ev_threshold: Optional[float] = Field(default=None, ge=0.01, le=0.50)
    alert_assets: Optional[list[str]] = None
    alerts_enabled: Optional[bool] = None
    quiet_hours_start: Optional[str] = Field(
        default=None, pattern="^([01]?[0-9]|2[0-3]):[0-5][0-9]$"
    )
    quiet_hours_end: Optional[str] = Field(
        default=None, pattern="^([01]?[0-9]|2[0-3]):[0-5][0-9]$"
    )


class PreferencesResponse(BaseModel):
    """User preferences response."""

    telegram_chat_id: Optional[str]
    apns_device_token: Optional[str]
    min_ev_threshold: float
    alert_assets: list[str]
    alerts_enabled: bool
    quiet_hours_start: Optional[str]
    quiet_hours_end: Optional[str]


class LightweightSignal(BaseModel):
    """Lightweight signal payload for mobile."""

    id: int
    ticker: str
    asset: str
    direction: str
    strike: float
    ev: float
    confidence: float
    time_to_expiry_minutes: int


async def get_or_create_preferences(db: AsyncSession) -> UserPreferences:
    """Get or create user preferences (single user for now)."""
    result = await db.execute(select(UserPreferences).limit(1))
    prefs = result.scalar_one_or_none()

    if not prefs:
        prefs = UserPreferences()
        db.add(prefs)
        await db.commit()
        await db.refresh(prefs)

    return prefs


@router.post("/register-push")
async def register_push_token(
    request: RegisterPushRequest,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Register APNs device token for push notifications.

    Call this on app launch and whenever the token changes.
    """
    prefs = await get_or_create_preferences(db)
    prefs.apns_device_token = request.device_token
    await db.commit()

    return {"success": True, "message": "Push token registered"}


@router.delete("/register-push")
async def unregister_push_token(
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Unregister push notifications (e.g., on logout).
    """
    prefs = await get_or_create_preferences(db)
    prefs.apns_device_token = None
    await db.commit()

    return {"success": True, "message": "Push token removed"}


@router.get("/preferences", response_model=PreferencesResponse)
async def get_preferences(
    db: AsyncSession = Depends(get_db),
) -> PreferencesResponse:
    """
    Get current user preferences.
    """
    import json

    prefs = await get_or_create_preferences(db)

    try:
        alert_assets = json.loads(prefs.alert_assets)
    except (json.JSONDecodeError, TypeError):
        alert_assets = ["BTC", "ETH", "XRP"]

    return PreferencesResponse(
        telegram_chat_id=prefs.telegram_chat_id,
        apns_device_token=prefs.apns_device_token,
        min_ev_threshold=prefs.min_ev_threshold,
        alert_assets=alert_assets,
        alerts_enabled=prefs.alerts_enabled,
        quiet_hours_start=prefs.quiet_hours_start,
        quiet_hours_end=prefs.quiet_hours_end,
    )


@router.patch("/preferences", response_model=PreferencesResponse)
async def update_preferences(
    request: UpdatePreferencesRequest,
    db: AsyncSession = Depends(get_db),
) -> PreferencesResponse:
    """
    Update user preferences.
    """
    import json

    prefs = await get_or_create_preferences(db)

    if request.telegram_chat_id is not None:
        prefs.telegram_chat_id = request.telegram_chat_id

    if request.min_ev_threshold is not None:
        prefs.min_ev_threshold = request.min_ev_threshold

    if request.alert_assets is not None:
        prefs.alert_assets = json.dumps(request.alert_assets)

    if request.alerts_enabled is not None:
        prefs.alerts_enabled = request.alerts_enabled

    if request.quiet_hours_start is not None:
        prefs.quiet_hours_start = request.quiet_hours_start

    if request.quiet_hours_end is not None:
        prefs.quiet_hours_end = request.quiet_hours_end

    await db.commit()

    try:
        alert_assets = json.loads(prefs.alert_assets)
    except (json.JSONDecodeError, TypeError):
        alert_assets = ["BTC", "ETH", "XRP"]

    return PreferencesResponse(
        telegram_chat_id=prefs.telegram_chat_id,
        apns_device_token=prefs.apns_device_token,
        min_ev_threshold=prefs.min_ev_threshold,
        alert_assets=alert_assets,
        alerts_enabled=prefs.alerts_enabled,
        quiet_hours_start=prefs.quiet_hours_start,
        quiet_hours_end=prefs.quiet_hours_end,
    )


@router.get("/signals", response_model=list[LightweightSignal])
async def get_mobile_signals(
    limit: int = 10,
    db: AsyncSession = Depends(get_db),
) -> list[LightweightSignal]:
    """
    Get lightweight signal payload optimized for mobile.

    Returns minimal data to reduce bandwidth and parsing time.
    """
    from app.db.models import TradeSignal

    result = await db.execute(
        select(TradeSignal)
        .where(TradeSignal.is_active == True)  # noqa: E712
        .order_by(TradeSignal.expected_value.desc())
        .limit(limit)
    )
    signals = result.scalars().all()

    lightweight = []
    for s in signals:
        # Extract asset from ticker
        asset = "BTC"
        if "KXETH" in s.ticker:
            asset = "ETH"
        elif "KXXRP" in s.ticker:
            asset = "XRP"

        # Extract strike from ticker
        strike = 0.0
        try:
            parts = s.ticker.split("-")
            for part in parts:
                if part.startswith("B") or part.startswith("A"):
                    strike = float(part[1:])
        except (ValueError, IndexError):
            pass

        # Convert hours to minutes
        minutes = int((s.time_to_expiry_hours or 0) * 60)

        lightweight.append(
            LightweightSignal(
                id=s.id,
                ticker=s.ticker,
                asset=asset,
                direction=s.signal_type,
                strike=strike,
                ev=s.expected_value,
                confidence=s.confidence_score,
                time_to_expiry_minutes=minutes,
            )
        )

    return lightweight
