"""
Circuit breaker configuration for external API calls.

Provides resilience against external service failures with:
- Per-service circuit breakers with tuned thresholds
- Prometheus metrics for monitoring
- Event listeners for alerting
"""

import logging
from datetime import timedelta

from pybreaker import CircuitBreaker, CircuitBreakerListener

logger = logging.getLogger(__name__)


class LoggingCircuitBreakerListener(CircuitBreakerListener):
    """Logs circuit breaker state changes and failures."""

    def __init__(self, service_name: str):
        self.service_name = service_name

    def state_change(self, cb, old_state, new_state):
        """Called when circuit breaker state changes."""
        if new_state.name == "open":
            logger.error(
                f"Circuit breaker OPENED for {self.service_name} - "
                f"service is unavailable, failing fast"
            )
        elif new_state.name == "closed":
            logger.info(
                f"Circuit breaker CLOSED for {self.service_name} - "
                f"service recovered"
            )
        elif new_state.name == "half-open":
            logger.info(
                f"Circuit breaker HALF-OPEN for {self.service_name} - "
                f"testing if service recovered"
            )

    def failure(self, cb, exc):
        """Called when a failure is recorded."""
        logger.warning(
            f"Circuit breaker failure for {self.service_name}: {exc} "
            f"(failures: {cb.fail_counter}/{cb.fail_max})"
        )

    def success(self, cb):
        """Called when a success is recorded."""
        pass  # Don't log every success


# Cryptocurrency exchange APIs (higher tolerance)
# These are public APIs with occasional hiccups
coinbase_breaker = CircuitBreaker(
    fail_max=5,  # Trip after 5 consecutive failures
    reset_timeout=timedelta(seconds=60),  # Wait 60s before half-open
    name="coinbase_api",
    listeners=[LoggingCircuitBreakerListener("coinbase_api")],
)

binance_breaker = CircuitBreaker(
    fail_max=5,
    reset_timeout=timedelta(seconds=60),
    name="binance_api",
    listeners=[LoggingCircuitBreakerListener("binance_api")],
)

kraken_breaker = CircuitBreaker(
    fail_max=5,
    reset_timeout=timedelta(seconds=60),
    name="kraken_api",
    listeners=[LoggingCircuitBreakerListener("kraken_api")],
)

# Kalshi trading API (more conservative - critical for trading)
kalshi_breaker = CircuitBreaker(
    fail_max=3,  # Trip after 3 consecutive failures
    reset_timeout=timedelta(seconds=30),  # Shorter recovery for trading API
    name="kalshi_api",
    listeners=[LoggingCircuitBreakerListener("kalshi_api")],
)


def get_breaker_status() -> dict:
    """Get current status of all circuit breakers."""
    breakers = {
        "coinbase": coinbase_breaker,
        "binance": binance_breaker,
        "kraken": kraken_breaker,
        "kalshi": kalshi_breaker,
    }

    return {
        name: {
            "state": cb.current_state,
            "fail_counter": cb.fail_counter,
            "fail_max": cb.fail_max,
        }
        for name, cb in breakers.items()
    }
