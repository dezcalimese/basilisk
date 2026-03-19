"""Kalshi WebSocket manager for real-time market data.

Maintains a persistent WebSocket connection to Kalshi and distributes
ticker and orderbook updates via the in-process data bus.

Replaces REST polling for:
- Contract prices (ticker channel)
- Order book depth (orderbook_delta channel)

Docs: https://docs.kalshi.com/websockets/websocket-connection
"""

import asyncio
import base64
import json
import logging
import time
from dataclasses import dataclass, field
from typing import Any, Optional

import websockets
from websockets.asyncio.client import connect

from app.core.config import settings
from app.data.ws_data_bus import get_data_bus

logger = logging.getLogger(__name__)


@dataclass
class TickerSnapshot:
    """Real-time price snapshot from the ticker channel."""

    ticker: str
    yes_bid: float | None = None
    yes_ask: float | None = None
    no_bid: float | None = None
    no_ask: float | None = None
    volume: int = 0
    open_interest: int = 0
    timestamp: float = 0.0


@dataclass
class OrderBookState:
    """In-memory order book state assembled from snapshots + deltas."""

    ticker: str
    yes_bids: dict[int, int] = field(default_factory=dict)  # price_cents -> qty
    no_bids: dict[int, int] = field(default_factory=dict)
    seq: int = 0
    last_updated: float = 0.0


class KalshiWebSocketManager:
    """
    Manages a persistent WebSocket connection to Kalshi.

    Subscribes to ticker and orderbook_delta channels for specified
    market tickers and distributes updates via the data bus.
    """

    def __init__(self) -> None:
        # Connection
        self._ws: Any = None
        self._task: asyncio.Task | None = None
        self._running = False
        self._connected = False

        # Auth (reuse from KalshiClient)
        self._key_id = settings.kalshi_key_id
        self._private_key = self._load_private_key()

        # URL
        self._ws_url = (
            settings.kalshi_ws_demo_url
            if settings.kalshi_use_demo
            else settings.kalshi_ws_url
        )

        # Subscriptions
        self._subscribed_tickers: set[str] = set()
        self._pending_channels: list[str] = ["ticker"]
        self._cmd_id = 0

        # State
        self._ticker_data: dict[str, TickerSnapshot] = {}
        self._orderbooks: dict[str, OrderBookState] = {}

        # Data bus
        self._bus = get_data_bus()

    def _load_private_key(self) -> Any:
        """Load RSA private key for WebSocket auth."""
        key_path = settings.kalshi_private_key_path
        if not key_path:
            return None
        try:
            from cryptography.hazmat.primitives.serialization import load_pem_private_key

            with open(key_path, "rb") as f:
                return load_pem_private_key(f.read(), password=None)
        except Exception as e:
            logger.warning(f"Failed to load Kalshi private key: {e}")
            return None

    def _sign_message(self, message: str) -> str:
        """Sign a message using RSA-PSS (same as KalshiClient)."""
        if not self._private_key:
            return ""
        from cryptography.hazmat.primitives import hashes
        from cryptography.hazmat.primitives.asymmetric import padding

        sig = self._private_key.sign(
            message.encode("utf-8"),
            padding.PSS(
                mgf=padding.MGF1(hashes.SHA256()),
                salt_length=padding.PSS.DIGEST_LENGTH,
            ),
            hashes.SHA256(),
        )
        return base64.b64encode(sig).decode("utf-8")

    def _get_ws_headers(self) -> dict[str, str]:
        """Generate auth headers for WebSocket handshake."""
        if not self._key_id or not self._private_key:
            return {}

        timestamp = str(int(time.time() * 1000))
        # Kalshi WS signs: timestamp + "GET" + ws_path
        ws_path = "/trade-api/ws/v2"
        message = timestamp + "GET" + ws_path
        signature = self._sign_message(message)

        return {
            "KALSHI-ACCESS-KEY": self._key_id,
            "KALSHI-ACCESS-SIGNATURE": signature,
            "KALSHI-ACCESS-TIMESTAMP": timestamp,
        }

    @property
    def is_connected(self) -> bool:
        return self._connected

    # ============================================================
    # Lifecycle
    # ============================================================

    async def start(self) -> None:
        """Start the WebSocket connection in a background task."""
        if self._running:
            return

        if not self._key_id or not self._private_key:
            logger.warning("Kalshi WS: No API credentials configured, skipping")
            return

        self._running = True
        self._task = asyncio.create_task(self._connection_loop())
        logger.info("Kalshi WS: Manager started")

    async def stop(self) -> None:
        """Stop the WebSocket connection."""
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None

        if self._ws:
            await self._ws.close()
            self._ws = None

        self._connected = False
        logger.info("Kalshi WS: Manager stopped")

    async def _connection_loop(self) -> None:
        """Outer loop: reconnect with exponential backoff."""
        delay = 1.0
        max_delay = settings.kalshi_ws_reconnect_max_delay

        while self._running:
            try:
                headers = self._get_ws_headers()
                logger.info(f"Kalshi WS: Connecting to {self._ws_url}...")

                async with connect(
                    self._ws_url,
                    additional_headers=headers,
                    ping_interval=settings.kalshi_ws_ping_interval,
                    ping_timeout=5,
                    close_timeout=5,
                ) as ws:
                    self._ws = ws
                    self._connected = True
                    delay = 1.0  # Reset backoff on successful connect
                    logger.info("Kalshi WS: Connected")

                    # Re-subscribe to all tracked tickers
                    if self._subscribed_tickers:
                        await self._send_subscribe(
                            self._pending_channels,
                            list(self._subscribed_tickers),
                        )

                    await self._run_session(ws)

            except websockets.ConnectionClosed as e:
                logger.warning(f"Kalshi WS: Connection closed: {e}")
            except Exception as e:
                logger.error(f"Kalshi WS: Connection error: {e}")
            finally:
                self._connected = False
                self._ws = None

            if not self._running:
                break

            logger.info(f"Kalshi WS: Reconnecting in {delay:.0f}s...")
            await asyncio.sleep(delay)
            delay = min(delay * 2, max_delay)

    async def _run_session(self, ws: Any) -> None:
        """Inner loop: read and dispatch messages."""
        async for raw_msg in ws:
            try:
                msg = json.loads(raw_msg)
                await self._dispatch(msg)
            except json.JSONDecodeError:
                logger.warning(f"Kalshi WS: Invalid JSON: {raw_msg[:100]}")
            except Exception as e:
                logger.error(f"Kalshi WS: Error processing message: {e}")

    # ============================================================
    # Subscription management
    # ============================================================

    async def subscribe(
        self,
        channels: list[str],
        market_tickers: list[str],
    ) -> None:
        """Subscribe to channels for specific market tickers."""
        new_tickers = set(market_tickers) - self._subscribed_tickers
        self._subscribed_tickers.update(market_tickers)

        # Store channels for reconnect replay
        for ch in channels:
            if ch not in self._pending_channels:
                self._pending_channels.append(ch)

        if self._connected and self._ws and new_tickers:
            await self._send_subscribe(channels, list(new_tickers))

    async def unsubscribe(
        self,
        channels: list[str],
        market_tickers: list[str],
    ) -> None:
        """Unsubscribe from channels for specific market tickers."""
        self._subscribed_tickers -= set(market_tickers)

        if self._connected and self._ws:
            await self._send_unsubscribe(channels, market_tickers)

    def ensure_subscribed(
        self, channels: list[str], market_tickers: list[str]
    ) -> None:
        """
        Ensure tickers are subscribed (fire-and-forget).
        Safe to call from sync context — schedules the subscribe.
        """
        new_tickers = set(market_tickers) - self._subscribed_tickers
        if not new_tickers:
            return

        self._subscribed_tickers.update(market_tickers)
        for ch in channels:
            if ch not in self._pending_channels:
                self._pending_channels.append(ch)

        if self._connected and self._ws:
            asyncio.create_task(
                self._send_subscribe(channels, list(new_tickers))
            )

    async def _send_subscribe(
        self, channels: list[str], tickers: list[str]
    ) -> None:
        """Send subscribe command to WebSocket."""
        if not self._ws or not tickers:
            return

        self._cmd_id += 1
        cmd = {
            "id": self._cmd_id,
            "cmd": "subscribe",
            "params": {
                "channels": channels,
                "market_tickers": tickers,
            },
        }
        try:
            await self._ws.send(json.dumps(cmd))
            logger.info(
                f"Kalshi WS: Subscribed to {channels} for {len(tickers)} tickers"
            )
        except Exception as e:
            logger.error(f"Kalshi WS: Failed to subscribe: {e}")

    async def _send_unsubscribe(
        self, channels: list[str], tickers: list[str]
    ) -> None:
        """Send unsubscribe command."""
        if not self._ws or not tickers:
            return

        self._cmd_id += 1
        cmd = {
            "id": self._cmd_id,
            "cmd": "unsubscribe",
            "params": {
                "channels": channels,
                "market_tickers": tickers,
            },
        }
        try:
            await self._ws.send(json.dumps(cmd))
        except Exception as e:
            logger.error(f"Kalshi WS: Failed to unsubscribe: {e}")

    # ============================================================
    # Message dispatch
    # ============================================================

    async def _dispatch(self, msg: dict) -> None:
        """Route incoming WebSocket messages to handlers."""
        msg_type = msg.get("type")

        if msg_type == "ticker":
            self._handle_ticker(msg)
        elif msg_type == "orderbook_snapshot":
            self._handle_orderbook_snapshot(msg)
        elif msg_type == "orderbook_delta":
            self._handle_orderbook_delta(msg)
        elif msg_type == "trade":
            pass  # Could add trade feed later
        elif msg_type == "subscribed":
            logger.debug(f"Kalshi WS: Subscription confirmed: {msg}")
        elif msg_type == "error":
            logger.error(f"Kalshi WS: Server error: {msg}")

    def _handle_ticker(self, msg: dict) -> None:
        """Handle a ticker price update."""
        ticker = msg.get("msg", {}).get("market_ticker", "")
        if not ticker:
            return

        data = msg.get("msg", {})
        snapshot = TickerSnapshot(
            ticker=ticker,
            yes_bid=_safe_float(data.get("yes_bid")),
            yes_ask=_safe_float(data.get("yes_ask")),
            no_bid=_safe_float(data.get("no_bid")),
            no_ask=_safe_float(data.get("no_ask")),
            volume=data.get("volume", 0),
            open_interest=data.get("open_interest", 0),
            timestamp=time.time(),
        )

        self._ticker_data[ticker] = snapshot

        # Determine asset from ticker (e.g., KXBTCD-... -> BTC)
        asset = _ticker_to_asset(ticker)

        # Publish to data bus
        self._bus.publish(f"ticker:{asset}", {
            "ticker": ticker,
            "yes_bid": snapshot.yes_bid,
            "yes_ask": snapshot.yes_ask,
            "no_bid": snapshot.no_bid,
            "no_ask": snapshot.no_ask,
            "volume": snapshot.volume,
            "open_interest": snapshot.open_interest,
        })

    def _handle_orderbook_snapshot(self, msg: dict) -> None:
        """Handle a full orderbook snapshot."""
        data = msg.get("msg", {})
        ticker = data.get("market_ticker", "")
        if not ticker:
            return

        yes_bids = {}
        no_bids = {}

        for price, qty in data.get("yes", []):
            yes_bids[int(price)] = int(qty)
        for price, qty in data.get("no", []):
            no_bids[int(price)] = int(qty)

        state = OrderBookState(
            ticker=ticker,
            yes_bids=yes_bids,
            no_bids=no_bids,
            seq=data.get("seq", 0),
            last_updated=time.time(),
        )
        self._orderbooks[ticker] = state

        self._publish_orderbook(ticker, state)

    def _handle_orderbook_delta(self, msg: dict) -> None:
        """Handle an incremental orderbook update."""
        data = msg.get("msg", {})
        ticker = data.get("market_ticker", "")
        if not ticker:
            return

        state = self._orderbooks.get(ticker)
        if not state:
            # No snapshot yet — can't apply delta
            logger.debug(f"Kalshi WS: Orderbook delta for {ticker} but no snapshot")
            return

        incoming_seq = data.get("seq", 0)
        if incoming_seq != state.seq + 1:
            # Sequence gap — need to re-fetch snapshot
            logger.warning(
                f"Kalshi WS: Orderbook seq gap for {ticker}: "
                f"expected {state.seq + 1}, got {incoming_seq}"
            )
            # Clear stale state; will get new snapshot on next message
            del self._orderbooks[ticker]
            return

        # Apply delta
        for price, qty in data.get("yes", []):
            p = int(price)
            q = int(qty)
            if q == 0:
                state.yes_bids.pop(p, None)
            else:
                state.yes_bids[p] = q

        for price, qty in data.get("no", []):
            p = int(price)
            q = int(qty)
            if q == 0:
                state.no_bids.pop(p, None)
            else:
                state.no_bids[p] = q

        state.seq = incoming_seq
        state.last_updated = time.time()

        self._publish_orderbook(ticker, state)

    def _publish_orderbook(self, ticker: str, state: OrderBookState) -> None:
        """Publish assembled orderbook to the data bus."""
        asset = _ticker_to_asset(ticker)

        # Convert to the format the frontend expects
        yes_bids_sorted = sorted(state.yes_bids.items(), key=lambda x: x[0], reverse=True)
        no_bids_sorted = sorted(state.no_bids.items(), key=lambda x: x[0], reverse=True)

        self._bus.publish(f"orderbook:{asset}", {
            "ticker": ticker,
            "yes_bids": [[p, q] for p, q in yes_bids_sorted],
            "no_bids": [[p, q] for p, q in no_bids_sorted],
            "seq": state.seq,
        })

    # ============================================================
    # State access (for REST fallback)
    # ============================================================

    def get_ticker(self, ticker: str) -> TickerSnapshot | None:
        """Get cached ticker data."""
        return self._ticker_data.get(ticker)

    def get_orderbook(self, ticker: str) -> OrderBookState | None:
        """Get cached orderbook state."""
        state = self._orderbooks.get(ticker)
        if state and (time.time() - state.last_updated) < 30:
            return state
        return None

    def get_all_tickers_for_asset(self, asset: str) -> list[TickerSnapshot]:
        """Get all cached ticker snapshots for an asset."""
        prefix = _asset_to_prefix(asset)
        return [
            snap
            for ticker, snap in self._ticker_data.items()
            if ticker.startswith(prefix)
        ]


# ============================================================
# Helpers
# ============================================================


def _safe_float(v: Any) -> float | None:
    """Safely convert to float, returning None for missing values."""
    if v is None:
        return None
    try:
        return float(v)
    except (ValueError, TypeError):
        return None


def _ticker_to_asset(ticker: str) -> str:
    """Extract asset symbol from a Kalshi ticker (e.g., KXBTCD-... -> BTC)."""
    t = ticker.upper()
    prefixes = [
        ("KXBTC", "BTC"),
        ("KXETH", "ETH"),
        ("KXXRP", "XRP"),
        ("KXSOL", "SOL"),
        ("KXDOGE", "DOGE"),
        ("KXHYPE", "HYPE"),
        ("KXBNB", "BNB"),
    ]
    for prefix, asset in prefixes:
        if t.startswith(prefix):
            return asset
    return "UNKNOWN"


def _asset_to_prefix(asset: str) -> str:
    """Get Kalshi ticker prefix for an asset."""
    return {
        "BTC": "KXBTC",
        "ETH": "KXETH",
        "XRP": "KXXRP",
        "SOL": "KXSOL",
        "DOGE": "KXDOGE",
        "HYPE": "KXHYPE",
        "BNB": "KXBNB",
    }.get(asset.upper(), "KX")


# Singleton
_ws_manager: KalshiWebSocketManager | None = None


def get_ws_manager() -> KalshiWebSocketManager:
    """Get or create the WebSocket manager singleton."""
    global _ws_manager
    if _ws_manager is None:
        _ws_manager = KalshiWebSocketManager()
    return _ws_manager
