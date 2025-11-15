"""
Bitcoin Volatility Regime Detector

Fetches implied volatility from Deribit and compares to realized volatility
to classify market regime for trading strategy.

Usage:
    python btc_volatility_regime_detector.py

Requirements:
    pip install ccxt pandas numpy
"""

import ccxt
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import time
from typing import Dict, Optional


class VolatilityRegimeDetector:
    """Detects Bitcoin volatility regimes using IV vs RV comparison"""

    def __init__(self, use_testnet: bool = False):
        """
        Initialize detector with exchange connection

        Args:
            use_testnet: If True, use Deribit testnet (for development)
        """
        self.exchange = ccxt.deribit({
            'enableRateLimit': True,
            'options': {
                'defaultType': 'option',
            }
        })

        if use_testnet:
            self.exchange.urls['api'] = self.exchange.urls['test']

    def get_implied_volatility(self, currency: str = 'BTC') -> Optional[Dict]:
        """
        Fetch current implied volatility from Deribit DVOL

        Args:
            currency: Cryptocurrency symbol (BTC or ETH)

        Returns:
            Dictionary with timestamp, datetime, and implied_vol
        """
        try:
            vol_history = self.exchange.fetch_volatility_history(currency)

            if vol_history:
                latest = vol_history[-1]
                return {
                    'timestamp': latest['timestamp'],
                    'datetime': latest['datetime'],
                    'implied_vol': latest['volatility']  # Annualized %
                }
        except Exception as e:
            print(f"Error fetching implied volatility: {e}")
            return None

        return None

    def get_implied_volatility_direct(self, currency: str = 'BTC') -> Optional[float]:
        """
        Alternative method: Fetch DVOL using direct API call

        Args:
            currency: Cryptocurrency symbol (BTC or ETH)

        Returns:
            Current DVOL value (annualized %)
        """
        try:
            import requests

            url = f"{self.exchange.urls['api']}/public/get_volatility_index_data"

            # Get data from last hour
            end_ts = int(time.time() * 1000)
            start_ts = end_ts - (3600 * 1000)

            params = {
                'currency': currency,
                'resolution': '1',  # 1 minute
                'start_timestamp': start_ts,
                'end_timestamp': end_ts
            }

            response = requests.get(url, params=params)
            data = response.json()

            if 'result' in data and data['result']:
                # Return most recent value
                latest_dvol = data['result'][-1][1]
                return latest_dvol

        except Exception as e:
            print(f"Error fetching DVOL directly: {e}")
            return None

        return None

    def get_atm_implied_volatility(self, currency: str = 'BTC') -> Optional[float]:
        """
        Calculate weighted average ATM implied volatility from options

        Args:
            currency: Cryptocurrency symbol (BTC or ETH)

        Returns:
            Volume-weighted ATM implied volatility (annualized %)
        """
        try:
            import requests

            # Get current spot price
            index_url = f"{self.exchange.urls['api']}/public/get_index_price"
            index_response = requests.get(index_url, params={'index_name': f'{currency.lower()}_usd'})
            spot_price = index_response.json()['result']['index_price']

            # Get all options
            book_url = f"{self.exchange.urls['api']}/public/get_book_summary_by_currency"
            book_response = requests.get(book_url, params={'currency': currency, 'kind': 'option'})
            options = book_response.json()['result']

            # Filter for ATM options (strike within 5% of spot, with volume)
            atm_options = []
            for opt in options:
                if opt.get('mark_iv') and opt.get('volume', 0) > 0:
                    # Parse strike from instrument name: BTC-29DEC23-45000-C
                    parts = opt['instrument_name'].split('-')
                    if len(parts) >= 4:
                        try:
                            strike = float(parts[2])
                            strike_diff = abs(strike - spot_price) / spot_price

                            if strike_diff < 0.05:  # Within 5% of spot
                                atm_options.append({
                                    'mark_iv': opt['mark_iv'],
                                    'volume': opt['volume']
                                })
                        except (ValueError, IndexError):
                            continue

            # Calculate volume-weighted average
            if atm_options:
                total_volume = sum(opt['volume'] for opt in atm_options)
                if total_volume > 0:
                    weighted_iv = sum(
                        opt['mark_iv'] * opt['volume'] for opt in atm_options
                    ) / total_volume
                    return weighted_iv

        except Exception as e:
            print(f"Error calculating ATM IV: {e}")
            return None

        return None

    def get_realized_volatility(
        self,
        currency: str = 'BTC',
        window_days: int = 30,
        symbol: str = 'BTC/USDC'
    ) -> Optional[float]:
        """
        Calculate realized volatility from historical price data

        Args:
            currency: Cryptocurrency symbol
            window_days: Lookback period in days
            symbol: Trading pair symbol (default: BTC/USDC for Deribit)

        Returns:
            Annualized realized volatility (%)
        """
        try:
            # Fetch OHLCV data
            since = self.exchange.parse8601(
                (datetime.now() - timedelta(days=window_days + 10)).isoformat()
            )
            ohlcv = self.exchange.fetch_ohlcv(symbol, '1d', since=since, limit=window_days + 10)

            df = pd.DataFrame(
                ohlcv,
                columns=['timestamp', 'open', 'high', 'low', 'close', 'volume']
            )
            df['datetime'] = pd.to_datetime(df['timestamp'], unit='ms')

            # Calculate log returns
            df['log_return'] = np.log(df['close'] / df['close'].shift(1))

            # Calculate annualized realized volatility (using last N days)
            recent_returns = df['log_return'].tail(window_days)
            realized_vol = recent_returns.std() * np.sqrt(365) * 100

            return realized_vol

        except Exception as e:
            print(f"Error calculating realized volatility: {e}")
            return None

    def detect_regime(
        self,
        currency: str = 'BTC',
        window_days: int = 30,
        iv_method: str = 'dvol'
    ) -> Optional[Dict]:
        """
        Classify current volatility regime

        Args:
            currency: Cryptocurrency symbol
            window_days: Realized vol lookback window
            iv_method: Method to get IV ('dvol', 'direct', or 'atm')

        Returns:
            Dictionary with regime classification and metrics
        """
        # Get implied volatility
        if iv_method == 'dvol':
            iv_data = self.get_implied_volatility(currency)
            if not iv_data:
                return None
            iv = iv_data['implied_vol']
            timestamp = iv_data['datetime']
        elif iv_method == 'direct':
            iv = self.get_implied_volatility_direct(currency)
            if iv is None:
                return None
            timestamp = datetime.now().isoformat()
        elif iv_method == 'atm':
            iv = self.get_atm_implied_volatility(currency)
            if iv is None:
                return None
            timestamp = datetime.now().isoformat()
        else:
            raise ValueError(f"Unknown iv_method: {iv_method}")

        # Get realized volatility
        symbol = f'{currency}/USDC'
        rv = self.get_realized_volatility(currency, window_days, symbol)

        if rv is None:
            return None

        # Calculate ratio
        iv_rv_ratio = iv / rv if rv != 0 else None

        # Regime classification
        regime = {
            'timestamp': timestamp,
            'currency': currency,
            'implied_vol': round(iv, 2),
            'realized_vol': round(rv, 2),
            'iv_rv_ratio': round(iv_rv_ratio, 3) if iv_rv_ratio else None,
            'iv_rv_spread': round(iv - rv, 2),
            'regime': None,
            'signal': None
        }

        if iv_rv_ratio is None:
            return regime

        # Regime classification rules
        # These thresholds should be calibrated to your strategy
        if iv_rv_ratio > 1.5:
            regime['regime'] = 'HIGH_FEAR'
            regime['signal'] = 'IV significantly elevated - market expects volatility increase'
        elif iv_rv_ratio > 1.2:
            regime['regime'] = 'ELEVATED'
            regime['signal'] = 'IV premium - moderate fear or hedging demand'
        elif iv_rv_ratio > 0.9:
            regime['regime'] = 'NORMAL'
            regime['signal'] = 'IV fairly priced relative to realized vol'
        elif iv_rv_ratio > 0.7:
            regime['regime'] = 'COMPLACENT'
            regime['signal'] = 'IV discount - market may be underpricing risk'
        else:
            regime['regime'] = 'EXTREME_COMPLACENCY'
            regime['signal'] = 'IV very low - potential volatility surprise risk'

        return regime

    def print_regime_report(self, regime: Dict) -> None:
        """
        Print formatted regime report

        Args:
            regime: Regime dictionary from detect_regime()
        """
        print("\n" + "="*60)
        print(f"BITCOIN VOLATILITY REGIME REPORT")
        print("="*60)
        print(f"Timestamp:        {regime['timestamp']}")
        print(f"Currency:         {regime['currency']}")
        print("-"*60)
        print(f"Implied Vol:      {regime['implied_vol']:.2f}%  (30-day forward)")
        print(f"Realized Vol:     {regime['realized_vol']:.2f}%  (30-day historical)")
        print(f"IV/RV Ratio:      {regime['iv_rv_ratio']:.3f}")
        print(f"IV-RV Spread:     {regime['iv_rv_spread']:+.2f}%")
        print("-"*60)
        print(f"REGIME:           {regime['regime']}")
        print(f"Signal:           {regime['signal']}")
        print("="*60 + "\n")


def main():
    """Main execution function"""
    print("Initializing Bitcoin Volatility Regime Detector...")

    # Initialize detector
    detector = VolatilityRegimeDetector(use_testnet=False)

    # Detect current regime
    print("Fetching data and analyzing regime...")
    regime = detector.detect_regime(
        currency='BTC',
        window_days=30,
        iv_method='dvol'  # Use DVOL (fastest and most reliable)
    )

    if regime:
        detector.print_regime_report(regime)

        # Additional analysis
        if regime['iv_rv_ratio']:
            if regime['iv_rv_ratio'] > 1.3:
                print("TRADING INSIGHT: Consider volatility selling strategies (e.g., short straddles)")
                print("                 High IV premium suggests options may be expensive")
            elif regime['iv_rv_ratio'] < 0.8:
                print("TRADING INSIGHT: Consider volatility buying strategies (e.g., long straddles)")
                print("                 Low IV suggests options may be cheap relative to potential movement")
            else:
                print("TRADING INSIGHT: Neutral regime - IV fairly valued")

    else:
        print("Error: Could not determine regime. Check API connection.")


if __name__ == "__main__":
    main()
