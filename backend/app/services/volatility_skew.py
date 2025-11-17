"""Service for calculating volatility skew from contract prices."""

from typing import Any

import numpy as np


class VolatilitySkew:
    """
    Calculate and analyze volatility skew from Kalshi contract prices.

    For digital options, skew tells you if market prices OTM calls
    vs OTM puts differently.
    """

    def calculate_skew(
        self, contracts: list[dict[str, Any]], current_price: float
    ) -> dict[str, Any]:
        """
        Calculate volatility skew from contract prices.

        Skew = (OTM Put IV - OTM Call IV) / ATM IV
        Positive skew = puts more expensive (fear)
        Negative skew = calls more expensive (greed)

        Args:
            contracts: List of contract data dictionaries
            current_price: Current BTC spot price

        Returns:
            Dictionary with skew analysis and IV curve
        """
        if not contracts or current_price <= 0:
            return self._get_default_skew()

        # Group contracts by moneyness
        atm_contracts = []
        otm_calls = []  # Strikes above current
        otm_puts = []  # Strikes below current

        for contract in contracts:
            strike = contract.get("strike_price")
            if not strike:
                continue

            distance_pct = abs(strike - current_price) / current_price

            if distance_pct < 0.02:  # Within 2% = ATM
                atm_contracts.append(contract)
            elif strike > current_price:
                if 0.02 <= distance_pct <= 0.10:  # 2-10% OTM
                    otm_calls.append(contract)
            else:
                if 0.02 <= distance_pct <= 0.10:
                    otm_puts.append(contract)

        # Calculate implied vol for each group
        # For digital options, use contract price as IV proxy
        atm_iv = self._avg_implied_vol(atm_contracts) if atm_contracts else 0.50
        call_iv = self._avg_implied_vol(otm_calls) if otm_calls else atm_iv
        put_iv = self._avg_implied_vol(otm_puts) if otm_puts else atm_iv

        # Skew metric
        if atm_iv > 0:
            skew = (put_iv - call_iv) / atm_iv
        else:
            skew = 0.0

        # Build full IV curve for visualization
        strike_iv_pairs = []
        for contract in contracts:
            strike = contract.get("strike_price")
            if not strike:
                continue

            moneyness = strike / current_price
            implied_vol = self._contract_to_iv(contract)
            contract_type = "call" if strike > current_price else "put"

            strike_iv_pairs.append(
                {
                    "strike": strike,
                    "moneyness": moneyness,
                    "implied_vol": implied_vol,
                    "type": contract_type,
                    "yes_price": contract.get("yes_price", 0.5),
                    "ticker": contract.get("ticker", ""),
                }
            )

        # Sort by moneyness for clean plotting
        strike_iv_pairs.sort(key=lambda x: x["moneyness"])

        return {
            "atm_iv": float(atm_iv),
            "otm_call_iv": float(call_iv),
            "otm_put_iv": float(put_iv),
            "skew": float(skew),
            "skew_interpretation": self._interpret_skew(skew),
            "contracts_analyzed": {
                "atm": len(atm_contracts),
                "otm_calls": len(otm_calls),
                "otm_puts": len(otm_puts),
                "total": len(contracts),
            },
            # Full curve for visualization
            "strike_iv_pairs": strike_iv_pairs,
            "current_price": current_price,
        }

    def _avg_implied_vol(self, contracts: list[dict[str, Any]]) -> float:
        """
        Rough IV estimate from digital option prices.

        For digital options, deviation from 0.50 indicates vol.
        Higher prices = higher IV.
        """
        if not contracts:
            return 0.50

        # Extract YES prices
        prices = []
        for c in contracts:
            yes_price = c.get("yes_price")
            if yes_price is not None:
                prices.append(yes_price)

        if not prices:
            return 0.50

        avg_price = np.mean(prices)

        # Very rough conversion (would need proper calibration)
        # Maps YES price 0-1 to IV range 0.30-0.70
        # Contracts far OTM or far ITM = lower IV
        # Contracts near 0.50 probability = higher IV
        distance_from_50 = abs(avg_price - 0.50)
        iv_estimate = 0.30 + (1 - distance_from_50 * 2) * 0.40

        # Clamp to reasonable range
        return max(0.20, min(0.80, iv_estimate))

    def _contract_to_iv(self, contract: dict[str, Any]) -> float:
        """Convert single contract price to IV estimate."""
        yes_price = contract.get("yes_price", 0.5)

        # Same conversion as average
        distance_from_50 = abs(yes_price - 0.50)
        iv_estimate = 0.30 + (1 - distance_from_50 * 2) * 0.40

        return max(0.20, min(0.80, iv_estimate))

    def _interpret_skew(self, skew: float) -> str:
        """Human-readable skew interpretation."""
        if skew > 0.15:
            return "Strong Put Skew (Market fears downside)"
        elif skew > 0.05:
            return "Moderate Put Skew"
        elif skew < -0.15:
            return "Strong Call Skew (Market expects upside)"
        elif skew < -0.05:
            return "Moderate Call Skew"
        else:
            return "Flat Skew (Symmetric expectations)"

    def _get_default_skew(self) -> dict[str, Any]:
        """Return default skew data when insufficient data."""
        return {
            "atm_iv": 0.50,
            "otm_call_iv": 0.50,
            "otm_put_iv": 0.50,
            "skew": 0.0,
            "skew_interpretation": "Insufficient data",
            "contracts_analyzed": {
                "atm": 0,
                "otm_calls": 0,
                "otm_puts": 0,
                "total": 0,
            },
            "strike_iv_pairs": [],
            "current_price": 0.0,
            "error": "Insufficient contract data",
        }
