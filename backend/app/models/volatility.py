"""Volatility regime detection and analysis."""

from datetime import datetime
from typing import Any

import httpx
import numpy as np
from scipy.stats import norm


class VolatilityRegime:
    """
    Track and classify current volatility regime.
    Critical for position sizing and strategy selection.
    """

    def __init__(self) -> None:
        """Initialize volatility regime tracker."""
        self.regimes = {
            "CALM": {"rv_threshold": 0.30, "iv_threshold": 0.40},
            "NORMAL": {"rv_threshold": 0.50, "iv_threshold": 0.60},
            "ELEVATED": {"rv_threshold": 0.75, "iv_threshold": 0.90},
            "CRISIS": {"rv_threshold": 1.00, "iv_threshold": 1.20},
        }
        # Use direct HTTP client for Deribit API (simpler than CCXT for this use case)
        self.deribit_api = "https://www.deribit.com/api/v2"

    async def fetch_deribit_dvol(self, currency: str = "BTC") -> float | None:
        """
        Fetch Deribit Volatility Index (DVOL) - the 30-day ATM implied volatility.

        DVOL is similar to VIX for stocks - it represents market's expectation
        of future volatility based on Bitcoin options prices.

        Args:
            currency: Cryptocurrency (default "BTC")

        Returns:
            Current DVOL value as decimal (e.g., 0.68 = 68% annualized volatility)
            None if fetch fails
        """
        try:
            # Use Deribit's public API to get the volatility index
            # DVOL endpoint: /public/get_index?currency=BTC
            url = f"{self.deribit_api}/public/get_index"
            params = {"currency": currency}

            async with httpx.AsyncClient() as client:
                response = await client.get(url, params=params, timeout=10.0)
                response.raise_for_status()
                data = response.json()

                # Extract the DVOL value from the indices
                # The response contains various indices, we want the DVOL one
                if "result" in data:
                    # DVOL is typically labeled as {currency}_DVOL
                    dvol_key = f"{currency}_DVOL"

                    # Try to find DVOL in the result
                    # Different API responses may structure this differently
                    result = data["result"]

                    # If result is a dict with the DVOL key
                    if isinstance(result, dict) and dvol_key in result:
                        dvol_value = float(result[dvol_key])
                        # DVOL is typically expressed as percentage, convert to decimal
                        return dvol_value / 100.0 if dvol_value > 2 else dvol_value

                    # Alternative: fetch from volatility index data endpoint
                    # This endpoint gives us historical DVOL values
                    vol_url = f"{self.deribit_api}/public/get_volatility_index_data"
                    vol_params = {
                        "currency": currency,
                        "resolution": "60",  # 1 hour resolution
                        "start_timestamp": int(datetime.now().timestamp() * 1000) - 3600000,  # 1 hour ago
                        "end_timestamp": int(datetime.now().timestamp() * 1000),
                    }

                    vol_response = await client.get(vol_url, params=vol_params, timeout=10.0)
                    vol_response.raise_for_status()
                    vol_data = vol_response.json()

                    if "result" in vol_data and "data" in vol_data["result"]:
                        # Get the most recent DVOL value
                        dvol_points = vol_data["result"]["data"]
                        if dvol_points:
                            # Last data point: [timestamp, dvol_value]
                            latest_dvol = dvol_points[-1][1]
                            # DVOL is expressed as percentage
                            return float(latest_dvol) / 100.0

                print(f"⚠️  Deribit response doesn't contain expected DVOL data")
                return None

        except Exception as e:
            print(f"⚠️  Failed to fetch Deribit DVOL: {e}")
            # Return None to indicate failure (caller should handle)
            return None

    def calculate_binary_option_probability(
        self,
        current_price: float,
        strike_price: float,
        time_to_expiry_hours: float,
        volatility: float,
        option_type: str = "CALL",
    ) -> float:
        """
        Calculate theoretical probability for binary/digital option using Black-Scholes.

        For Kalshi BTC hourly contracts, this gives the true probability that
        BTC will be above (CALL) or below (PUT) the strike at expiry.

        Args:
            current_price: Current BTC spot price
            strike_price: Strike price of the binary option
            time_to_expiry_hours: Hours until expiry
            volatility: Implied volatility (from DVOL)
            option_type: "CALL" (BTC > K) or "PUT" (BTC < K)

        Returns:
            Probability (0.0 to 1.0) that option expires in the money
        """
        if time_to_expiry_hours <= 0:
            # Already expired - binary outcome
            if option_type == "CALL":
                return 1.0 if current_price > strike_price else 0.0
            else:  # PUT
                return 1.0 if current_price < strike_price else 0.0

        # Convert time to years (Black-Scholes uses annual time)
        T = time_to_expiry_hours / (24 * 365)

        # Risk-free rate (assume 0 for crypto, or use small value like 0.05)
        r = 0.0

        # Avoid division by zero
        if volatility <= 0 or T <= 0:
            # Fall back to simple binary outcome
            if option_type == "CALL":
                return 1.0 if current_price > strike_price else 0.0
            else:
                return 1.0 if current_price < strike_price else 0.0

        # Black-Scholes d1 and d2 calculations
        # d1 = (ln(S/K) + (r + σ²/2)T) / (σ√T)
        # d2 = d1 - σ√T

        sigma_sqrt_T = volatility * np.sqrt(T)

        # Avoid log of zero or negative
        if current_price <= 0 or strike_price <= 0:
            return 0.5  # Neutral if invalid prices

        ln_S_K = np.log(current_price / strike_price)

        d1 = (ln_S_K + (r + 0.5 * volatility**2) * T) / sigma_sqrt_T
        d2 = d1 - sigma_sqrt_T

        # For a binary CALL option (pays $1 if S > K at expiry):
        # Probability = N(d2)
        # For a binary PUT option (pays $1 if S < K at expiry):
        # Probability = N(-d2) = 1 - N(d2)

        if option_type == "CALL":
            probability = norm.cdf(d2)
        else:  # PUT
            probability = norm.cdf(-d2)

        return float(probability)

    def calculate_realized_volatility(
        self, candles: list[dict[str, Any]], window: int = 24
    ) -> float:
        """
        Calculate realized volatility using close-to-close returns.

        Uses recent hourly price data to estimate annualized volatility.

        Args:
            candles: List of OHLCV candles with 'close' prices
            window: Number of periods to use (default 24 hours)

        Returns:
            Annualized realized volatility (e.g., 0.50 = 50%)
        """
        if len(candles) < window + 1:
            # Not enough data, return default moderate volatility
            return 0.50

        # Extract close prices
        closes = [candle["close"] for candle in candles[-(window + 1) :]]

        # Calculate returns
        returns = []
        for i in range(1, len(closes)):
            ret = (closes[i] / closes[i - 1]) - 1
            returns.append(ret)

        # Calculate standard deviation of returns
        std_returns = np.std(returns, ddof=1)

        # Annualize: hourly vol * sqrt(hours per year)
        # 24 hours/day * 365 days/year = 8760 hours/year
        annualized_vol = std_returns * np.sqrt(24 * 365)

        return float(annualized_vol)

    def calculate_parkinson_volatility(
        self, candles: list[dict[str, Any]], window: int = 24
    ) -> float:
        """
        Calculate Parkinson (high-low) volatility estimator.

        More efficient than close-to-close for capturing intrabar volatility.

        Args:
            candles: List of OHLCV candles with 'high' and 'low'
            window: Number of periods to use

        Returns:
            Annualized Parkinson volatility
        """
        if len(candles) < window:
            return 0.50

        recent_candles = candles[-window:]

        hl_ratios_squared = []
        for candle in recent_candles:
            high = candle["high"]
            low = candle["low"]

            if low > 0:  # Avoid division by zero
                hl_ratio = np.log(high / low)
                hl_ratios_squared.append(hl_ratio**2)

        if not hl_ratios_squared:
            return 0.50

        # Parkinson estimator formula
        parkinson_vol = np.sqrt(
            (1 / (4 * np.log(2))) * np.mean(hl_ratios_squared)
        ) * np.sqrt(24 * 365)

        return float(parkinson_vol)

    def calculate_implied_volatility(
        self,
        contracts: list[dict[str, Any]],
        current_price: float,
    ) -> float:
        """
        Estimate implied volatility from market prices.

        Uses ATM (at-the-money) contracts to infer market's volatility expectation.

        Args:
            contracts: List of Kalshi contracts with strikes and prices
            current_price: Current BTC spot price

        Returns:
            Implied volatility estimate
        """
        if not contracts:
            return 0.50

        # Find contracts closest to ATM (strike near current price)
        atm_contracts = []
        for contract in contracts:
            strike = contract.get("strike_price", 0)
            if not strike:
                continue

            distance_pct = abs(strike - current_price) / current_price

            # Consider contracts within 2% of current price as "ATM"
            if distance_pct < 0.02:
                atm_contracts.append(contract)

        if not atm_contracts:
            # No ATM contracts, use broader sample
            atm_contracts = contracts[:5]  # Just use first few contracts

        # Extract implied probabilities
        implied_probs = []
        for contract in atm_contracts:
            yes_bid = contract.get("yes_bid", 0)
            yes_ask = contract.get("yes_ask", 0)

            if yes_bid and yes_ask:
                mid_price = (yes_bid + yes_ask) / 2
                implied_probs.append(mid_price)

        if not implied_probs:
            return 0.50

        # Simple heuristic: higher variance in implied probs = higher IV
        # For more accurate IV, we'd need time to expiry and use Black-Scholes
        # For now, use spread as a proxy
        avg_prob = np.mean(implied_probs)

        # Rough mapping: probability spread to IV
        # Wider spreads indicate more uncertainty = higher vol
        prob_std = np.std(implied_probs) if len(implied_probs) > 1 else 0.1

        # Map to reasonable IV range (30% - 100%)
        # This is a simplification; proper IV requires option pricing model
        implied_vol = 0.30 + (prob_std * 2.0)
        implied_vol = min(max(implied_vol, 0.20), 1.20)

        return float(implied_vol)

    def get_current_regime(self, realized_vol: float, implied_vol: float) -> str:
        """
        Classify current market regime based on volatility levels.

        Args:
            realized_vol: Recent realized volatility
            implied_vol: Market's implied volatility

        Returns:
            Regime name: CALM, NORMAL, ELEVATED, or CRISIS
        """
        # Check against thresholds in order
        if (
            realized_vol <= self.regimes["CALM"]["rv_threshold"]
            and implied_vol <= self.regimes["CALM"]["iv_threshold"]
        ):
            return "CALM"

        if (
            realized_vol <= self.regimes["NORMAL"]["rv_threshold"]
            and implied_vol <= self.regimes["NORMAL"]["iv_threshold"]
        ):
            return "NORMAL"

        if (
            realized_vol <= self.regimes["ELEVATED"]["rv_threshold"]
            and implied_vol <= self.regimes["ELEVATED"]["iv_threshold"]
        ):
            return "ELEVATED"

        return "CRISIS"

    def calculate_vol_risk_premium(
        self, implied_vol: float, realized_vol: float
    ) -> dict[str, Any]:
        """
        Calculate volatility risk premium (IV - RV spread).

        Positive premium = market overpricing volatility (bullish signal for selling vol)
        Negative premium = market underpricing volatility (bullish signal for buying vol)

        Args:
            implied_vol: Market's implied volatility
            realized_vol: Recent realized volatility

        Returns:
            Dictionary with premium metrics and trading signal
        """
        premium = implied_vol - realized_vol
        premium_pct = premium / realized_vol if realized_vol > 0 else 0

        # Generate trading signal based on premium
        if premium_pct > 0.30:  # IV > RV by 30%+
            signal = "SELL_VOL"
        elif premium_pct < -0.10:  # IV < RV by 10%+
            signal = "BUY_VOL"
        else:
            signal = "NEUTRAL"

        return {
            "premium_absolute": float(premium),
            "premium_pct": float(premium_pct),
            "signal": signal,
        }

    async def analyze_volatility(
        self,
        candles: list[dict[str, Any]],
        contracts: list[dict[str, Any]],
        current_price: float,
    ) -> dict[str, Any]:
        """
        Complete volatility analysis with dual IV sources for mispricing detection.

        Compares:
        - Deribit DVOL (professional options market IV)
        - Kalshi IV (prediction market IV from binary options)

        Divergence between the two can signal arbitrage opportunities.

        Args:
            candles: Historical price candles
            contracts: Kalshi contracts for IV calculation
            current_price: Current BTC spot price

        Returns:
            Comprehensive volatility metrics including mispricing detection
        """
        # Calculate realized volatility (multiple methods)
        rv_close = self.calculate_realized_volatility(candles, window=24)
        rv_parkinson = self.calculate_parkinson_volatility(candles, window=24)

        # Use Parkinson as primary (more efficient estimator)
        realized_vol = rv_parkinson

        # Fetch Deribit DVOL (market IV from options market)
        deribit_iv = await self.fetch_deribit_dvol("BTC")

        # Calculate Kalshi IV (prediction market IV)
        kalshi_iv = self.calculate_implied_volatility(contracts, current_price)

        # Determine primary IV to use for regime detection
        # Prefer Deribit DVOL if available (more accurate), fallback to Kalshi
        if deribit_iv is not None:
            primary_iv = deribit_iv
        else:
            primary_iv = kalshi_iv

        # Classify regime using primary IV
        regime = self.get_current_regime(realized_vol, primary_iv)

        # Calculate vol risk premium (IV - RV)
        vol_premium = self.calculate_vol_risk_premium(primary_iv, realized_vol)

        # Detect mispricing between Deribit and Kalshi
        mispricing = self.detect_iv_mispricing(deribit_iv, kalshi_iv)

        return {
            "realized_vol": realized_vol,
            "realized_vol_close": rv_close,
            "realized_vol_parkinson": rv_parkinson,
            "implied_vol": primary_iv,  # Primary IV used for regime detection
            "deribit_iv": deribit_iv,  # Options market IV
            "kalshi_iv": kalshi_iv,  # Prediction market IV
            "regime": regime,
            "vol_premium": vol_premium["premium_absolute"],
            "vol_premium_pct": vol_premium["premium_pct"],
            "vol_signal": vol_premium["signal"],
            # Mispricing metrics
            "iv_spread": mispricing["spread"],
            "iv_spread_pct": mispricing["spread_pct"],
            "mispricing_signal": mispricing["signal"],
            "mispricing_opportunity": mispricing["opportunity"],
        }

    def detect_iv_mispricing(
        self, deribit_iv: float | None, kalshi_iv: float | None
    ) -> dict[str, Any]:
        """
        Detect mispricing between Deribit (options market) and Kalshi (prediction market) IV.

        Args:
            deribit_iv: DVOL from Deribit options market
            kalshi_iv: Estimated IV from Kalshi binary options

        Returns:
            Dictionary with mispricing metrics and trading signals
        """
        if deribit_iv is None or kalshi_iv is None:
            return {
                "spread": 0.0,
                "spread_pct": 0.0,
                "signal": "NO_DATA",
                "opportunity": None,
            }

        # Calculate spread (Kalshi IV - Deribit IV)
        spread = kalshi_iv - deribit_iv
        spread_pct = spread / deribit_iv if deribit_iv > 0 else 0

        # Interpret mispricing
        # Positive spread: Kalshi overpricing vol vs Deribit
        # Negative spread: Kalshi underpricing vol vs Deribit

        signal = "NEUTRAL"
        opportunity = None

        if spread_pct > 0.15:  # Kalshi IV > Deribit by 15%+
            signal = "KALSHI_EXPENSIVE"
            opportunity = "Consider selling Kalshi vol, buying Deribit options"
        elif spread_pct < -0.15:  # Kalshi IV < Deribit by 15%+
            signal = "KALSHI_CHEAP"
            opportunity = "Consider buying Kalshi vol, selling Deribit options"
        elif abs(spread_pct) < 0.05:  # Within 5%
            signal = "ALIGNED"
            opportunity = "Markets in agreement - no arbitrage opportunity"

        return {
            "spread": float(spread),
            "spread_pct": float(spread_pct),
            "signal": signal,
            "opportunity": opportunity,
        }
