"""In-process pub/sub for distributing WebSocket data to SSE streams.

Avoids requiring Redis for intra-process communication. Each SSE stream
subscribes to channels (e.g., "ticker:BTC", "orderbook:KXBTCD-...")
and receives updates via asyncio.Queue.
"""

import asyncio
import logging
from typing import Any

logger = logging.getLogger(__name__)


class WSDataBus:
    """Lightweight in-process pub/sub using asyncio queues."""

    def __init__(self) -> None:
        self._subscribers: dict[str, list[asyncio.Queue]] = {}
        self._lock = asyncio.Lock()

    def publish(self, channel: str, data: Any) -> None:
        """Publish data to all subscribers of a channel (non-blocking)."""
        queues = self._subscribers.get(channel, [])
        for q in queues:
            try:
                q.put_nowait(data)
            except asyncio.QueueFull:
                # Drop oldest message if queue is full (backpressure)
                try:
                    q.get_nowait()
                    q.put_nowait(data)
                except asyncio.QueueEmpty:
                    pass

    async def subscribe(self, channel: str, maxsize: int = 100) -> asyncio.Queue:
        """Subscribe to a channel. Returns a queue to read from."""
        async with self._lock:
            if channel not in self._subscribers:
                self._subscribers[channel] = []
            q: asyncio.Queue = asyncio.Queue(maxsize=maxsize)
            self._subscribers[channel].append(q)
            return q

    async def unsubscribe(self, channel: str, queue: asyncio.Queue) -> None:
        """Remove a queue from a channel's subscriber list."""
        async with self._lock:
            if channel in self._subscribers:
                try:
                    self._subscribers[channel].remove(queue)
                except ValueError:
                    pass
                if not self._subscribers[channel]:
                    del self._subscribers[channel]

    def get_subscriber_count(self, channel: str) -> int:
        """Get number of subscribers for a channel."""
        return len(self._subscribers.get(channel, []))


# Singleton
_data_bus: WSDataBus | None = None


def get_data_bus() -> WSDataBus:
    """Get or create the global data bus singleton."""
    global _data_bus
    if _data_bus is None:
        _data_bus = WSDataBus()
    return _data_bus
