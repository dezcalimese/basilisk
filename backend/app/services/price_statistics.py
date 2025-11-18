"""Service for calculating hourly price movement statistics."""

from datetime import datetime
from typing import Any

import numpy as np
import pandas as pd
from scipy.stats import norm


class HourlyPriceStatistics:
    """
    Calculate historical hourly price movement statistics.
    This is CRITICAL for Kalshi hourly contracts.
    """

    def calculate_hourly_stats(
        self, candles: list[Any], lookback_hours: int = 720
    ) -> dict[str, Any]:
        """
        Analyze last 30 days (720 hours) of hourly movements.
        Returns distribution of hourly returns.

        Args:
            candles: List of OHLCV candles (either dicts or lists)
            lookback_hours: Number of hours to analyze (default 720 = 30 days)

        Returns:
            Dictionary containing statistical analysis of hourly price movements
        """
        if not candles or len(candles) < 2:
            return self._get_default_stats()

        hourly_returns = []

        # Calculate hourly returns
        for i in range(1, min(len(candles), lookback_hours)):
            prev_candle = candles[i - 1]
            curr_candle = candles[i]

            # Handle both dict and list formats
            if isinstance(curr_candle, dict):
                # Dictionary format from BitcoinPriceClient
                timestamp = curr_candle["timestamp"]
                prev_close = float(prev_candle["close"])
                curr_close = float(curr_candle["close"])
                curr_high = float(curr_candle["high"])
                curr_low = float(curr_candle["low"])
                curr_open = float(curr_candle["open"])
            else:
                # List format [[timestamp, open, high, low, close, volume], ...]
                timestamp = datetime.fromtimestamp(curr_candle[0] / 1000)  # Convert ms to datetime
                prev_close = float(prev_candle[4])
                curr_close = float(curr_candle[4])
                curr_high = float(curr_candle[2])
                curr_low = float(curr_candle[3])
                curr_open = float(curr_candle[1])

            if prev_close == 0 or curr_open == 0:
                continue

            return_pct = (curr_close / prev_close) - 1
            return_abs = curr_close - prev_close
            range_pct = (curr_high - curr_low) / curr_open if curr_open > 0 else 0

            hourly_returns.append(
                {
                    "timestamp": timestamp,
                    "return_pct": return_pct,
                    "return_abs": return_abs,
                    "hour_of_day": timestamp.hour,
                    "day_of_week": timestamp.weekday(),
                    "high": curr_high,
                    "low": curr_low,
                    "range_pct": range_pct,
                }
            )

        if not hourly_returns:
            return self._get_default_stats()

        df = pd.DataFrame(hourly_returns)

        # Calculate percentiles
        percentiles = {
            "percentile_1": float(df["return_pct"].quantile(0.01)),
            "percentile_5": float(df["return_pct"].quantile(0.05)),
            "percentile_10": float(df["return_pct"].quantile(0.10)),
            "percentile_25": float(df["return_pct"].quantile(0.25)),
            "percentile_50": float(df["return_pct"].quantile(0.50)),
            "percentile_75": float(df["return_pct"].quantile(0.75)),
            "percentile_90": float(df["return_pct"].quantile(0.90)),
            "percentile_95": float(df["return_pct"].quantile(0.95)),
            "percentile_99": float(df["return_pct"].quantile(0.99)),
        }

        # By-hour aggregation
        by_hour = {}
        for hour in range(24):
            hour_data = df[df["hour_of_day"] == hour]["return_pct"]
            if len(hour_data) > 0:
                by_hour[hour] = {
                    "mean": float(hour_data.mean()),
                    "std": float(hour_data.std()),
                    "count": int(len(hour_data)),
                }

        # By-day aggregation
        by_day = {}
        for day in range(7):
            day_data = df[df["day_of_week"] == day]["return_pct"]
            if len(day_data) > 0:
                by_day[day] = {
                    "mean": float(day_data.mean()),
                    "std": float(day_data.std()),
                    "count": int(len(day_data)),
                }

        return {
            # Overall statistics
            "mean_return": float(df["return_pct"].mean()),
            "std_return": float(df["return_pct"].std()),
            "median_return": float(df["return_pct"].median()),
            "skewness": float(df["return_pct"].skew()),
            "kurtosis": float(df["return_pct"].kurt()),
            # Percentiles (CRITICAL for strike selection)
            **percentiles,
            # Range statistics
            "avg_hourly_range": float(df["range_pct"].mean()),
            "max_hourly_move": float(df["return_pct"].abs().max()),
            "max_positive_move": float(df["return_pct"].max()),
            "max_negative_move": float(df["return_pct"].min()),
            # Time-of-day patterns
            "by_hour": by_hour,
            "by_day": by_day,
            # Distribution for visualization
            "return_distribution": df["return_pct"].tolist(),
            # Sample size
            "total_samples": len(hourly_returns),
        }

    def get_probability_of_move(
        self, current_price: float, target_price: float, hourly_stats: dict[str, Any]
    ) -> dict[str, Any]:
        """
        Given historical hourly statistics, what's the probability
        of moving from current_price to target_price in 1 hour?

        Uses normal distribution assumption for hourly returns.

        Args:
            current_price: Current spot price
            target_price: Target strike price
            hourly_stats: Statistics from calculate_hourly_stats()

        Returns:
            Dictionary with probability and analysis
        """
        required_move_pct = (target_price - current_price) / current_price
        required_move_abs = target_price - current_price

        # Get distribution parameters
        mean = hourly_stats["mean_return"]
        std = hourly_stats["std_return"]

        if std == 0:
            return {
                "strike": target_price,
                "current_price": current_price,
                "probability": 0.5,
                "move_required_pct": required_move_pct,
                "move_required_abs": required_move_abs,
                "z_score": 0.0,
                "historical_likelihood": "unknown",
                "error": "Insufficient volatility data",
            }

        # Calculate Z-score
        z_score = (required_move_pct - mean) / std

        # Probability of exceeding required move
        if required_move_pct > 0:
            # Probability of closing ABOVE target (need upward move)
            prob = 1 - norm.cdf(z_score)
        else:
            # Probability of closing BELOW target (need downward move)
            prob = norm.cdf(z_score)

        # Classify likelihood based on Z-score
        abs_z = abs(z_score)
        if abs_z < 0.5:
            likelihood = "very common"
        elif abs_z < 1.0:
            likelihood = "common"
        elif abs_z < 1.5:
            likelihood = "moderate"
        elif abs_z < 2.0:
            likelihood = "uncommon"
        elif abs_z < 3.0:
            likelihood = "rare"
        else:
            likelihood = "very rare"

        # Find which percentile this move represents
        percentile_rank = norm.cdf(z_score) * 100

        return {
            "strike": target_price,
            "current_price": current_price,
            "probability": float(prob),
            "move_required_pct": required_move_pct,
            "move_required_abs": required_move_abs,
            "z_score": float(z_score),
            "percentile_rank": float(percentile_rank),
            "historical_likelihood": likelihood,
            "mean_hourly_return": mean,
            "std_hourly_return": std,
        }

    def calculate_extreme_move_probabilities(
        self, candles: list[Any], lookback_hours: int = 720
    ) -> dict[str, Any]:
        """
        Calculate historical frequency of EXTREME hourly moves.
        Critical for high-volatility lottery ticket strategies.

        Returns probability of seeing moves >2%, >3%, >4%, >5%, >6%
        These are the "lottery ticket" strikes that pay 5x-10x.

        Args:
            candles: List of OHLCV candles
            lookback_hours: Number of hours to analyze

        Returns:
            Dictionary with extreme move probabilities and frequencies
        """
        if not candles or len(candles) < 2:
            return self._get_default_extreme_stats()

        hourly_returns = []

        # Calculate absolute hourly returns
        for i in range(1, min(len(candles), lookback_hours)):
            prev_candle = candles[i - 1]
            curr_candle = candles[i]

            # Handle both dict and list formats
            if isinstance(curr_candle, dict):
                prev_close = float(prev_candle["close"])
                curr_close = float(curr_candle["close"])
            else:
                prev_close = float(prev_candle[4])
                curr_close = float(curr_candle[4])

            if prev_close == 0:
                continue

            return_pct = abs((curr_close / prev_close) - 1)  # Absolute value
            hourly_returns.append(return_pct)

        if not hourly_returns:
            return self._get_default_extreme_stats()

        total_hours = len(hourly_returns)

        # Count extreme moves at different thresholds
        thresholds = [0.02, 0.03, 0.04, 0.05, 0.06, 0.07, 0.08]  # 2% through 8%
        extreme_probs = {}

        for threshold in thresholds:
            count = sum(1 for ret in hourly_returns if ret > threshold)
            probability = count / total_hours if total_hours > 0 else 0

            # Expected frequency over different timeframes
            per_100_hours = probability * 100
            per_week = probability * 168  # 168 hours in a week
            per_month = probability * 720  # ~30 days

            threshold_pct = int(threshold * 100)
            extreme_probs[f"move_{threshold_pct}pct"] = {
                "threshold": threshold,
                "probability": float(probability),
                "count": count,
                "per_100_hours": float(per_100_hours),
                "per_week": float(per_week),
                "per_month": float(per_month),
                "odds": f"1 in {int(1/probability) if probability > 0 else 999999}",
            }

        # Calculate volatility regime multiplier
        # If current realized vol is high, extreme moves are MORE likely
        recent_vol = np.std(hourly_returns[-24:]) if len(hourly_returns) >= 24 else np.std(hourly_returns)
        historical_vol = np.std(hourly_returns)
        vol_multiplier = recent_vol / historical_vol if historical_vol > 0 else 1.0

        return {
            "extreme_probabilities": extreme_probs,
            "total_hours_analyzed": total_hours,
            "recent_volatility": float(recent_vol),
            "historical_volatility": float(historical_vol),
            "volatility_multiplier": float(vol_multiplier),
            "regime": self._classify_extreme_regime(vol_multiplier),
        }

    def _classify_extreme_regime(self, vol_multiplier: float) -> str:
        """Classify current volatility regime for extreme moves."""
        if vol_multiplier >= 2.0:
            return "CRISIS"
        elif vol_multiplier >= 1.5:
            return "ELEVATED"
        elif vol_multiplier >= 1.2:
            return "NORMAL"
        else:
            return "CALM"

    def _get_default_extreme_stats(self) -> dict[str, Any]:
        """Return default extreme move statistics."""
        return {
            "extreme_probabilities": {},
            "total_hours_analyzed": 0,
            "recent_volatility": 0.01,
            "historical_volatility": 0.01,
            "volatility_multiplier": 1.0,
            "regime": "UNKNOWN",
            "error": "Insufficient data",
        }

    def _get_default_stats(self) -> dict[str, Any]:
        """Return default statistics when insufficient data."""
        return {
            "mean_return": 0.0,
            "std_return": 0.01,  # 1% default volatility
            "median_return": 0.0,
            "skewness": 0.0,
            "kurtosis": 0.0,
            "percentile_1": -0.02,
            "percentile_5": -0.015,
            "percentile_10": -0.01,
            "percentile_25": -0.005,
            "percentile_50": 0.0,
            "percentile_75": 0.005,
            "percentile_90": 0.01,
            "percentile_95": 0.015,
            "percentile_99": 0.02,
            "avg_hourly_range": 0.005,
            "max_hourly_move": 0.02,
            "max_positive_move": 0.02,
            "max_negative_move": -0.02,
            "by_hour": {},
            "by_day": {},
            "return_distribution": [],
            "total_samples": 0,
            "error": "Insufficient data",
        }
