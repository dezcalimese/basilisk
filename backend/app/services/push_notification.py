"""Push notification service for APNs and Telegram alerts."""

import json
import logging
from datetime import datetime, time
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.models import PushLog, UserPreferences

logger = logging.getLogger(__name__)


class AlertPusher:
    """Service for sending push notifications via APNs and Telegram."""

    def __init__(
        self,
        db: AsyncSession,
        telegram_bot=None,
    ) -> None:
        """
        Initialize the alert pusher.

        Args:
            db: Database session
            telegram_bot: BasiliskBot instance for Telegram notifications
        """
        self.db = db
        self.telegram = telegram_bot
        self.apns_client = None

        # Initialize APNs if configured
        if settings.apns_key_path and settings.apns_key_id:
            self._init_apns()

    def _init_apns(self) -> None:
        """Initialize APNs client."""
        try:
            from aioapns import APNs, NotificationRequest

            self.apns_client = APNs(
                key=settings.apns_key_path,
                key_id=settings.apns_key_id,
                team_id=settings.apns_team_id,
                topic=settings.apns_bundle_id,
                use_sandbox=settings.debug,
            )
            self._NotificationRequest = NotificationRequest
            logger.info("APNs client initialized")
        except Exception as e:
            logger.warning(f"Failed to initialize APNs: {e}")

    async def get_user_preferences(self) -> Optional[UserPreferences]:
        """Get user preferences (single user for now)."""
        result = await self.db.execute(
            select(UserPreferences).limit(1)
        )
        return result.scalar_one_or_none()

    def _is_quiet_hours(self, prefs: UserPreferences) -> bool:
        """Check if current time is within quiet hours."""
        if not prefs.quiet_hours_start or not prefs.quiet_hours_end:
            return False

        try:
            now = datetime.now().time()
            start = time.fromisoformat(prefs.quiet_hours_start)
            end = time.fromisoformat(prefs.quiet_hours_end)

            # Handle overnight quiet hours (e.g., 22:00 - 07:00)
            if start > end:
                return now >= start or now <= end
            return start <= now <= end
        except (ValueError, TypeError):
            return False

    async def _log_push(
        self,
        channel: str,
        alert_type: str,
        payload: dict,
        delivered: bool,
    ) -> None:
        """Log push notification for debugging."""
        log = PushLog(
            channel=channel,
            alert_type=alert_type,
            payload=json.dumps(payload),
            delivered=delivered,
        )
        self.db.add(log)
        await self.db.commit()

    async def push_signal(self, signal) -> dict[str, bool]:
        """
        Push a signal alert to all configured channels.

        Args:
            signal: Signal object with EV, asset, direction, etc.

        Returns:
            Dict of channel -> success status
        """
        prefs = await self.get_user_preferences()
        results = {"telegram": False, "apns": False}

        if not prefs or not prefs.alerts_enabled:
            return results

        # Check quiet hours
        if self._is_quiet_hours(prefs):
            logger.info("Skipping alert during quiet hours")
            return results

        # Check EV threshold
        if signal.ev < prefs.min_ev_threshold:
            logger.info(f"Signal EV {signal.ev:.1%} below threshold {prefs.min_ev_threshold:.1%}")
            return results

        # Check asset filter
        try:
            allowed_assets = json.loads(prefs.alert_assets)
            if signal.asset not in allowed_assets:
                logger.info(f"Signal asset {signal.asset} not in allowed list")
                return results
        except (json.JSONDecodeError, TypeError):
            pass

        # Send Telegram notification
        if prefs.telegram_chat_id and self.telegram:
            try:
                success = await self.telegram.send_signal_alert(
                    chat_id=prefs.telegram_chat_id,
                    signal=signal,
                )
                results["telegram"] = success
                await self._log_push(
                    channel="telegram",
                    alert_type="signal",
                    payload={
                        "chat_id": prefs.telegram_chat_id,
                        "signal_id": signal.id,
                        "asset": signal.asset,
                        "ev": signal.ev,
                    },
                    delivered=success,
                )
            except Exception as e:
                logger.error(f"Telegram push failed: {e}")

        # Send APNs notification
        if prefs.apns_device_token and self.apns_client:
            try:
                success = await self._send_apns(
                    device_token=prefs.apns_device_token,
                    title=f"{signal.asset} Signal",
                    body=f"{signal.direction} @ ${signal.strike:,.0f} | {signal.ev:.0%} EV",
                    data={"signal_id": str(signal.id), "type": "signal"},
                )
                results["apns"] = success
                await self._log_push(
                    channel="apns",
                    alert_type="signal",
                    payload={
                        "signal_id": signal.id,
                        "asset": signal.asset,
                    },
                    delivered=success,
                )
            except Exception as e:
                logger.error(f"APNs push failed: {e}")

        return results

    async def push_fill(self, trade) -> dict[str, bool]:
        """
        Push a trade fill notification.

        Args:
            trade: Trade object

        Returns:
            Dict of channel -> success status
        """
        prefs = await self.get_user_preferences()
        results = {"telegram": False, "apns": False}

        if not prefs or not prefs.alerts_enabled:
            return results

        # Send Telegram notification
        if prefs.telegram_chat_id and self.telegram:
            try:
                success = await self.telegram.send_fill_alert(
                    chat_id=prefs.telegram_chat_id,
                    trade=trade,
                )
                results["telegram"] = success
            except Exception as e:
                logger.error(f"Telegram fill alert failed: {e}")

        # Send APNs notification
        if prefs.apns_device_token and self.apns_client:
            try:
                success = await self._send_apns(
                    device_token=prefs.apns_device_token,
                    title="Trade Filled",
                    body=f"{trade.asset} {trade.direction} - {trade.filled_contracts} @ ${trade.entry_price:.2f}",
                    data={"trade_id": str(trade.id), "type": "fill"},
                )
                results["apns"] = success
            except Exception as e:
                logger.error(f"APNs fill alert failed: {e}")

        return results

    async def push_expiry_warning(self, trade, minutes_remaining: int = 5) -> dict[str, bool]:
        """
        Push position expiry warning.

        Args:
            trade: Trade object
            minutes_remaining: Minutes until expiry

        Returns:
            Dict of channel -> success status
        """
        prefs = await self.get_user_preferences()
        results = {"telegram": False, "apns": False}

        if not prefs or not prefs.alerts_enabled:
            return results

        message = f"{trade.asset} position expires in {minutes_remaining} min!"

        # Send Telegram notification
        if prefs.telegram_chat_id and self.telegram:
            try:
                await self.telegram.app.bot.send_message(
                    chat_id=prefs.telegram_chat_id,
                    text=f"⏰ *Expiry Warning*\n\n{message}",
                    parse_mode="Markdown",
                )
                results["telegram"] = True
            except Exception as e:
                logger.error(f"Telegram expiry alert failed: {e}")

        # Send APNs notification
        if prefs.apns_device_token and self.apns_client:
            try:
                success = await self._send_apns(
                    device_token=prefs.apns_device_token,
                    title="Position Expiring",
                    body=message,
                    data={"trade_id": str(trade.id), "type": "expiry"},
                    sound="default",
                )
                results["apns"] = success
            except Exception as e:
                logger.error(f"APNs expiry alert failed: {e}")

        return results

    async def push_settlement(self, trade, won: bool) -> dict[str, bool]:
        """
        Push settlement result notification.

        Args:
            trade: Trade object with P&L
            won: Whether the trade was profitable

        Returns:
            Dict of channel -> success status
        """
        prefs = await self.get_user_preferences()
        results = {"telegram": False, "apns": False}

        if not prefs or not prefs.alerts_enabled:
            return results

        # Send Telegram notification
        if prefs.telegram_chat_id and self.telegram:
            try:
                success = await self.telegram.send_settlement_alert(
                    chat_id=prefs.telegram_chat_id,
                    trade=trade,
                    won=won,
                )
                results["telegram"] = success
            except Exception as e:
                logger.error(f"Telegram settlement alert failed: {e}")

        # Send APNs notification
        if prefs.apns_device_token and self.apns_client:
            try:
                emoji = "🎉" if won else "😔"
                result_text = "Won" if won else "Lost"
                success = await self._send_apns(
                    device_token=prefs.apns_device_token,
                    title=f"{emoji} Settlement: {result_text}",
                    body=f"{trade.asset} {trade.direction} | P&L: ${trade.pnl:+.2f}",
                    data={"trade_id": str(trade.id), "type": "settlement"},
                )
                results["apns"] = success
            except Exception as e:
                logger.error(f"APNs settlement alert failed: {e}")

        return results

    async def push_volatility_regime_change(
        self,
        asset: str,
        old_regime: str,
        new_regime: str,
    ) -> dict[str, bool]:
        """
        Push volatility regime change notification.

        Args:
            asset: Asset symbol
            old_regime: Previous regime (CALM, NORMAL, ELEVATED, CRISIS)
            new_regime: New regime

        Returns:
            Dict of channel -> success status
        """
        prefs = await self.get_user_preferences()
        results = {"telegram": False, "apns": False}

        if not prefs or not prefs.alerts_enabled:
            return results

        # Only alert on significant changes
        regime_levels = {"CALM": 0, "NORMAL": 1, "ELEVATED": 2, "CRISIS": 3}
        old_level = regime_levels.get(old_regime, 1)
        new_level = regime_levels.get(new_regime, 1)

        if abs(new_level - old_level) < 1:
            return results

        emoji = "📈" if new_level > old_level else "📉"
        message = f"{asset} volatility: {old_regime} → {new_regime}"

        # Send Telegram notification
        if prefs.telegram_chat_id and self.telegram:
            try:
                await self.telegram.app.bot.send_message(
                    chat_id=prefs.telegram_chat_id,
                    text=f"{emoji} *Volatility Change*\n\n{message}",
                    parse_mode="Markdown",
                )
                results["telegram"] = True
            except Exception as e:
                logger.error(f"Telegram volatility alert failed: {e}")

        # Send APNs notification
        if prefs.apns_device_token and self.apns_client:
            try:
                success = await self._send_apns(
                    device_token=prefs.apns_device_token,
                    title="Volatility Regime Change",
                    body=message,
                    data={"asset": asset, "regime": new_regime, "type": "volatility"},
                )
                results["apns"] = success
            except Exception as e:
                logger.error(f"APNs volatility alert failed: {e}")

        return results

    async def _send_apns(
        self,
        device_token: str,
        title: str,
        body: str,
        data: Optional[dict] = None,
        sound: str = "default",
        badge: Optional[int] = None,
    ) -> bool:
        """
        Send an APNs notification.

        Args:
            device_token: APNs device token
            title: Notification title
            body: Notification body
            data: Custom data payload
            sound: Sound name
            badge: Badge count

        Returns:
            True if sent successfully
        """
        if not self.apns_client:
            return False

        try:
            request = self._NotificationRequest(
                device_token=device_token,
                message={
                    "aps": {
                        "alert": {
                            "title": title,
                            "body": body,
                        },
                        "sound": sound,
                        **({"badge": badge} if badge is not None else {}),
                    },
                    **(data or {}),
                },
            )

            response = await self.apns_client.send_notification(request)
            return response.is_successful

        except Exception as e:
            logger.error(f"APNs send failed: {e}")
            return False


class SignalService:
    """Service adapter for fetching signals (used by Telegram bot)."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_active_signals(self, limit: int = 5):
        """Get active trade signals."""
        from app.db.models import TradeSignal

        result = await self.db.execute(
            select(TradeSignal)
            .where(TradeSignal.is_active == True)  # noqa: E712
            .order_by(TradeSignal.expected_value.desc())
            .limit(limit)
        )
        signals = result.scalars().all()

        # Convert to signal-like objects with expected attributes
        class SignalWrapper:
            def __init__(self, s):
                self.id = s.id
                self.ticker = s.ticker
                self.direction = s.signal_type
                self.ev = s.expected_value
                self.edge = s.edge_percentage
                self.confidence = s.confidence_score
                self.time_to_expiry_hours = s.time_to_expiry_hours
                self.market_price = s.recommended_price
                self.model_price = s.recommended_price  # Simplified
                # Extract asset and strike from ticker
                self.asset = "BTC"
                if "KXETH" in s.ticker:
                    self.asset = "ETH"
                elif "KXXRP" in s.ticker:
                    self.asset = "XRP"
                # Try to extract strike from ticker (e.g., KXBTCD-25DEC02-B98000)
                self.strike = 0
                try:
                    parts = s.ticker.split("-")
                    for part in parts:
                        if part.startswith("B") or part.startswith("A"):
                            self.strike = float(part[1:])
                except (ValueError, IndexError):
                    pass

        return [SignalWrapper(s) for s in signals]

    async def get_signal(self, signal_id: int):
        """Get a specific signal by ID."""
        from app.db.models import TradeSignal

        result = await self.db.execute(
            select(TradeSignal).where(TradeSignal.id == signal_id)
        )
        signal = result.scalar_one_or_none()

        if not signal:
            return None

        class SignalWrapper:
            def __init__(self, s):
                self.id = s.id
                self.ticker = s.ticker
                self.direction = s.signal_type
                self.ev = s.expected_value
                self.edge = s.edge_percentage
                self.confidence = s.confidence_score
                self.time_to_expiry_hours = s.time_to_expiry_hours
                self.market_price = s.recommended_price
                self.model_price = s.recommended_price
                self.asset = "BTC"
                if "KXETH" in s.ticker:
                    self.asset = "ETH"
                elif "KXXRP" in s.ticker:
                    self.asset = "XRP"
                self.strike = 0
                try:
                    parts = s.ticker.split("-")
                    for part in parts:
                        if part.startswith("B") or part.startswith("A"):
                            self.strike = float(part[1:])
                except (ValueError, IndexError):
                    pass

        return SignalWrapper(signal)
