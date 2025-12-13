"""Order flow analysis for market microstructure signals.

Implements:
- Order Book Imbalance (OBI): Measures buying vs selling pressure
- Cumulative Volume Delta (CVD): Tracks aggressive buyer/seller behavior
- Expected Move from Flow: Adjusts probability based on order flow

Research shows OBI > 0.3 predicts short-term price direction with ~55-60% accuracy.
"""

from dataclasses import dataclass
from typing import Any


@dataclass
class OrderFlowSignal:
    """Order flow analysis result."""

    obi: float  # Order Book Imbalance (-1 to 1)
    obi_signal: str  # BULLISH, BEARISH, or NEUTRAL
    bid_volume: float  # Total bid liquidity
    ask_volume: float  # Total ask liquidity
    imbalance_pct: float  # Absolute imbalance percentage
    prob_adjustment: float  # Suggested probability adjustment
    confidence: str  # Signal confidence level


class OrderFlowAnalyzer:
    """
    Analyze order flow for market microstructure signals.

    Uses Kalshi order book data to identify:
    - Directional pressure from bid/ask imbalance
    - Liquidity clustering that suggests support/resistance
    - Flow-implied probability adjustments
    """

    def __init__(self) -> None:
        """Initialize order flow analyzer."""
        # OBI thresholds for signal generation
        self.obi_bullish_threshold = 0.30  # Strong bid dominance
        self.obi_bearish_threshold = -0.30  # Strong ask dominance
        # Probability adjustment per 0.1 OBI (research-based)
        self.obi_prob_factor = 0.02  # 2% adjustment per 0.1 OBI

    def calculate_order_book_imbalance(
        self, orderbook: dict[str, Any]
    ) -> OrderFlowSignal:
        """
        Calculate Order Book Imbalance (OBI) from order book data.

        OBI = (Bid Volume - Ask Volume) / (Bid Volume + Ask Volume)

        Range: -1 (all asks) to +1 (all bids)
        - OBI > 0.3: Bullish pressure (buyers dominating)
        - OBI < -0.3: Bearish pressure (sellers dominating)
        - |OBI| < 0.3: Neutral/balanced

        Args:
            orderbook: Order book data with yes_bids, yes_asks, no_bids, no_asks

        Returns:
            OrderFlowSignal with OBI metrics and trading signal
        """
        # Extract bid and ask levels
        yes_bids = orderbook.get("yes_bids", [])
        yes_asks = orderbook.get("yes_asks", [])

        # Calculate total volume at each side
        bid_volume = sum(level.get("quantity", 0) for level in yes_bids)
        ask_volume = sum(level.get("quantity", 0) for level in yes_asks)

        # Handle edge case of empty book
        if bid_volume == 0 and ask_volume == 0:
            return OrderFlowSignal(
                obi=0.0,
                obi_signal="NO_DATA",
                bid_volume=0.0,
                ask_volume=0.0,
                imbalance_pct=0.0,
                prob_adjustment=0.0,
                confidence="none",
            )

        # Calculate OBI
        total_volume = bid_volume + ask_volume
        obi = (bid_volume - ask_volume) / total_volume

        # Determine signal and confidence
        if obi >= self.obi_bullish_threshold:
            signal = "BULLISH"
            if obi >= 0.5:
                confidence = "high"
            else:
                confidence = "medium"
        elif obi <= self.obi_bearish_threshold:
            signal = "BEARISH"
            if obi <= -0.5:
                confidence = "high"
            else:
                confidence = "medium"
        else:
            signal = "NEUTRAL"
            confidence = "low"

        # Calculate probability adjustment
        # Positive OBI -> increase probability (price likely to go up)
        # Negative OBI -> decrease probability (price likely to go down)
        prob_adjustment = obi * self.obi_prob_factor * 10  # Scale to percentage

        return OrderFlowSignal(
            obi=float(obi),
            obi_signal=signal,
            bid_volume=float(bid_volume),
            ask_volume=float(ask_volume),
            imbalance_pct=float(abs(obi) * 100),
            prob_adjustment=float(prob_adjustment),
            confidence=confidence,
        )

    def calculate_depth_weighted_obi(
        self, orderbook: dict[str, Any], depth_levels: int = 5
    ) -> OrderFlowSignal:
        """
        Calculate depth-weighted OBI giving more weight to near-market liquidity.

        Closer levels (to mid-price) are weighted more heavily as they
        represent more aggressive orders.

        Args:
            orderbook: Order book data
            depth_levels: Number of levels to consider

        Returns:
            OrderFlowSignal with weighted OBI
        """
        yes_bids = orderbook.get("yes_bids", [])[:depth_levels]
        yes_asks = orderbook.get("yes_asks", [])[:depth_levels]

        # Weight levels by inverse distance from top of book
        # Level 0 (best) gets weight 5, level 4 gets weight 1
        def weighted_volume(levels: list[dict]) -> float:
            total = 0.0
            for i, level in enumerate(levels):
                weight = depth_levels - i
                total += level.get("quantity", 0) * weight
            return total

        bid_volume = weighted_volume(yes_bids)
        ask_volume = weighted_volume(yes_asks)

        if bid_volume == 0 and ask_volume == 0:
            return OrderFlowSignal(
                obi=0.0,
                obi_signal="NO_DATA",
                bid_volume=0.0,
                ask_volume=0.0,
                imbalance_pct=0.0,
                prob_adjustment=0.0,
                confidence="none",
            )

        total = bid_volume + ask_volume
        obi = (bid_volume - ask_volume) / total

        # Same signal logic as regular OBI
        if obi >= self.obi_bullish_threshold:
            signal = "BULLISH"
            confidence = "high" if obi >= 0.5 else "medium"
        elif obi <= self.obi_bearish_threshold:
            signal = "BEARISH"
            confidence = "high" if obi <= -0.5 else "medium"
        else:
            signal = "NEUTRAL"
            confidence = "low"

        prob_adjustment = obi * self.obi_prob_factor * 10

        return OrderFlowSignal(
            obi=float(obi),
            obi_signal=signal,
            bid_volume=float(bid_volume),
            ask_volume=float(ask_volume),
            imbalance_pct=float(abs(obi) * 100),
            prob_adjustment=float(prob_adjustment),
            confidence=confidence,
        )

    def analyze_liquidity_clustering(
        self, orderbook: dict[str, Any], current_price: float, strike_price: float
    ) -> dict[str, Any]:
        """
        Analyze liquidity clustering around strike price.

        High liquidity near strike suggests market expects that level to be
        important (support/resistance).

        Args:
            orderbook: Order book data
            current_price: Current asset price
            strike_price: Contract strike price

        Returns:
            Dictionary with liquidity analysis
        """
        yes_bids = orderbook.get("yes_bids", [])
        yes_asks = orderbook.get("yes_asks", [])

        # Calculate liquidity concentration near ATM
        atm_bid_volume = 0.0
        atm_ask_volume = 0.0
        otm_bid_volume = 0.0
        otm_ask_volume = 0.0

        # ATM zone: within 3% of current price
        atm_threshold = 0.03

        for level in yes_bids:
            price = level.get("price", 0)
            quantity = level.get("quantity", 0)
            # Kalshi YES prices near 0.5 are ATM
            if abs(price - 0.5) < atm_threshold:
                atm_bid_volume += quantity
            else:
                otm_bid_volume += quantity

        for level in yes_asks:
            price = level.get("price", 0)
            quantity = level.get("quantity", 0)
            if abs(price - 0.5) < atm_threshold:
                atm_ask_volume += quantity
            else:
                otm_ask_volume += quantity

        total_volume = atm_bid_volume + atm_ask_volume + otm_bid_volume + otm_ask_volume

        if total_volume == 0:
            return {
                "atm_concentration": 0.0,
                "liquidity_signal": "NO_DATA",
                "strike_support": False,
            }

        atm_concentration = (atm_bid_volume + atm_ask_volume) / total_volume

        # High ATM concentration suggests uncertainty around strike
        if atm_concentration > 0.6:
            signal = "HIGH_UNCERTAINTY"
            strike_support = True
        elif atm_concentration > 0.4:
            signal = "MODERATE_UNCERTAINTY"
            strike_support = True
        else:
            signal = "LOW_UNCERTAINTY"
            strike_support = False

        return {
            "atm_concentration": float(atm_concentration),
            "atm_bid_volume": float(atm_bid_volume),
            "atm_ask_volume": float(atm_ask_volume),
            "otm_bid_volume": float(otm_bid_volume),
            "otm_ask_volume": float(otm_ask_volume),
            "liquidity_signal": signal,
            "strike_support": strike_support,
        }

    def adjust_probability_for_flow(
        self, base_probability: float, obi_signal: OrderFlowSignal
    ) -> dict[str, Any]:
        """
        Adjust model probability based on order flow signals.

        Combines Black-Scholes probability with order flow for
        enhanced accuracy.

        Args:
            base_probability: Probability from volatility model (0 to 1)
            obi_signal: Order flow signal from OBI calculation

        Returns:
            Dictionary with adjusted probability and explanation
        """
        adjustment = obi_signal.prob_adjustment

        # Apply adjustment with bounds
        adjusted_prob = base_probability + adjustment
        adjusted_prob = max(0.01, min(0.99, adjusted_prob))  # Keep in valid range

        # Determine if adjustment is significant
        adjustment_pct = abs(adjustment / base_probability) * 100 if base_probability > 0 else 0

        return {
            "base_probability": float(base_probability),
            "adjusted_probability": float(adjusted_prob),
            "adjustment": float(adjustment),
            "adjustment_pct": float(adjustment_pct),
            "obi": obi_signal.obi,
            "obi_signal": obi_signal.obi_signal,
            "confidence": obi_signal.confidence,
            "significant": adjustment_pct > 3.0,  # >3% is significant
        }
