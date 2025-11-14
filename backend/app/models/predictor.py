"""Probabilistic prediction model for Kalshi contracts."""

from typing import Any

import numpy as np
from sklearn.linear_model import LogisticRegression

from app.core.config import settings


class ProbabilityPredictor:
    """Model for predicting true probabilities of contract outcomes."""

    def __init__(self, model_version: str = "v1") -> None:
        """Initialize predictor model."""
        self.model_version = model_version
        self.model: LogisticRegression | None = None
        self.fee_rate = settings.kalshi_fee_rate

    def predict_probability(self, features: dict[str, Any]) -> float:
        """
        Predict true probability using simple volatility-based model.

        Args:
            features: Dictionary with strike_price, current_price,
                     time_to_expiry_hours, implied_probability

        Returns:
            Predicted probability (0-1)
        """
        strike = features.get("strike_price", 0)
        current = features.get("current_price", 0)
        time_hours = features.get("time_to_expiry_hours", 1.0)
        implied_prob = features.get("implied_probability", 0.5)

        if not strike or not current or time_hours <= 0:
            return float(implied_prob)

        # Simple volatility model for Bitcoin (historically ~50% annual vol)
        # Hourly volatility ~= 2.5% (50% / sqrt(252 * 24))
        hourly_vol = 0.025

        # Expected price movement over time horizon
        expected_std_move = current * hourly_vol * (time_hours**0.5)

        # Distance from current price to strike
        distance = strike - current
        distance_pct = abs(distance / current)

        # Number of standard deviations away
        std_devs = abs(distance) / expected_std_move if expected_std_move > 0 else 0

        # Probability based on normal distribution (simplified)
        # For strikes far from current price with little time, market often overprices
        if strike > current:
            # Strike is above current price
            # Market might overprice low-probability events
            if std_devs > 1.5:  # Far OTM
                # Market tends to overprice tail events
                true_prob = implied_prob * 0.7  # Reduce by 30%
            else:
                true_prob = implied_prob * 0.95  # Slight reduction
        else:
            # Strike is below current price
            # Market might underprice high-probability events
            if std_devs > 1.5:  # Far ITM
                # Market tends to underprice very high probability events
                true_prob = min(0.98, implied_prob * 1.1)  # Increase by 10%
            else:
                true_prob = implied_prob * 1.05  # Slight increase

        return float(np.clip(true_prob, 0.01, 0.99))

    def calculate_expected_value(
        self,
        true_prob: float,
        yes_bid: float,
        yes_ask: float,
        position: str = "YES",
    ) -> float:
        """
        Calculate expected value using BID/ASK prices (not mid price).

        Key insight: You BUY at ASK prices, not mid prices.
        Fees are only charged on PROFIT if you win.

        Args:
            true_prob: Model's predicted probability
            yes_bid: Current YES bid price (0-1)
            yes_ask: Current YES ask price (0-1)
            position: "YES" or "NO"

        Returns:
            Expected value as decimal (0.02 = 2% EV)
        """
        if position == "YES":
            # You pay the ASK to buy YES
            entry_price = yes_ask
            exit_price = 1.0  # Wins pay $1

            # Fee only charged on profit if you win
            gross_profit = exit_price - entry_price
            fee = self.fee_rate * gross_profit if gross_profit > 0 else 0
            net_profit = gross_profit - fee

            # Expected value
            ev = (true_prob * net_profit) - ((1 - true_prob) * entry_price)

        else:  # NO position
            # Ask price for NO = 1 - yes_bid
            no_ask = 1 - yes_bid
            entry_price = no_ask
            exit_price = 1.0

            gross_profit = exit_price - entry_price
            fee = self.fee_rate * gross_profit if gross_profit > 0 else 0
            net_profit = gross_profit - fee

            ev = ((1 - true_prob) * net_profit) - (true_prob * entry_price)

        return float(ev)

    def is_signal(self, expected_value: float, confidence: float | None = None) -> bool:
        """
        Determine if prediction qualifies as a trade signal.

        Args:
            expected_value: Calculated EV
            confidence: Optional confidence score

        Returns:
            True if this qualifies as a signal
        """
        if expected_value < settings.model_ev_threshold:
            return False

        if confidence and confidence < settings.model_confidence_threshold:
            return False

        return True

    def train(self, features: np.ndarray, labels: np.ndarray) -> None:
        """
        Train the prediction model.

        Args:
            features: Training features
            labels: Training labels (0 or 1)

        TODO: Implement model training
        """
        self.model = LogisticRegression(random_state=42)
        self.model.fit(features, labels)
