# Quick Start Guide: Bitcoin Volatility Regime Detection

## Installation

```bash
# Install dependencies
pip install -r requirements_volatility.txt
```

## Basic Usage

### 1. Run the Detector

```bash
python btc_volatility_regime_detector.py
```

**Expected Output:**
```
============================================================
BITCOIN VOLATILITY REGIME REPORT
============================================================
Timestamp:        2025-11-14T15:30:00.000Z
Currency:         BTC
------------------------------------------------------------
Implied Vol:      68.50%  (30-day forward)
Realized Vol:     52.30%  (30-day historical)
IV/RV Ratio:      1.310
IV-RV Spread:     +16.20%
------------------------------------------------------------
REGIME:           ELEVATED
Signal:           IV premium - moderate fear or hedging demand
============================================================

TRADING INSIGHT: Consider volatility selling strategies (e.g., short straddles)
                 High IV premium suggests options may be expensive
```

### 2. Use as a Library

```python
from btc_volatility_regime_detector import VolatilityRegimeDetector

# Initialize
detector = VolatilityRegimeDetector()

# Get current regime
regime = detector.detect_regime(currency='BTC')

# Access metrics
print(f"IV: {regime['implied_vol']}%")
print(f"RV: {regime['realized_vol']}%")
print(f"Regime: {regime['regime']}")
```

### 3. Customize Parameters

```python
# Use different lookback window
regime = detector.detect_regime(
    currency='BTC',
    window_days=60,  # 60-day realized vol instead of 30
    iv_method='atm'  # Calculate ATM IV from options instead of DVOL
)

# Available iv_method options:
# - 'dvol': Use Deribit DVOL index (fastest, recommended)
# - 'direct': Fetch DVOL via direct API call
# - 'atm': Calculate volume-weighted ATM IV from options
```

## Integration Examples

### Scheduled Monitoring

```python
import time
from btc_volatility_regime_detector import VolatilityRegimeDetector

detector = VolatilityRegimeDetector()

while True:
    regime = detector.detect_regime(currency='BTC')

    if regime:
        print(f"{regime['timestamp']}: {regime['regime']} (IV/RV: {regime['iv_rv_ratio']:.2f})")

        # Add your trading logic here
        if regime['regime'] == 'HIGH_FEAR':
            print("Alert: High volatility premium detected!")

    time.sleep(300)  # Check every 5 minutes
```

### Store Historical Data

```python
import sqlite3
from datetime import datetime
from btc_volatility_regime_detector import VolatilityRegimeDetector

def store_regime(regime):
    conn = sqlite3.connect('volatility_history.db')
    c = conn.cursor()

    c.execute('''
        CREATE TABLE IF NOT EXISTS regimes (
            timestamp TEXT PRIMARY KEY,
            currency TEXT,
            implied_vol REAL,
            realized_vol REAL,
            iv_rv_ratio REAL,
            regime TEXT
        )
    ''')

    c.execute('''
        INSERT OR REPLACE INTO regimes VALUES (?, ?, ?, ?, ?, ?)
    ''', (
        regime['timestamp'],
        regime['currency'],
        regime['implied_vol'],
        regime['realized_vol'],
        regime['iv_rv_ratio'],
        regime['regime']
    ))

    conn.commit()
    conn.close()

# Usage
detector = VolatilityRegimeDetector()
regime = detector.detect_regime(currency='BTC')
if regime:
    store_regime(regime)
```

### Multi-Currency Monitoring

```python
from btc_volatility_regime_detector import VolatilityRegimeDetector

detector = VolatilityRegimeDetector()

currencies = ['BTC', 'ETH']

for currency in currencies:
    regime = detector.detect_regime(currency=currency)
    if regime:
        print(f"{currency}: {regime['regime']} (IV={regime['implied_vol']:.1f}%, RV={regime['realized_vol']:.1f}%)")
```

## Understanding the Output

### Regime Classifications

| Regime | IV/RV Ratio | Interpretation | Trading Signal |
|--------|-------------|----------------|----------------|
| EXTREME_COMPLACENCY | < 0.7 | IV very low | Consider buying vol (long straddles) |
| COMPLACENT | 0.7 - 0.9 | IV discount | Options relatively cheap |
| NORMAL | 0.9 - 1.2 | IV fairly priced | Neutral positioning |
| ELEVATED | 1.2 - 1.5 | IV premium | Options getting expensive |
| HIGH_FEAR | > 1.5 | IV significantly elevated | Consider selling vol (short straddles) |

### Key Metrics

- **Implied Vol (IV)**: Market's expectation of future 30-day volatility
- **Realized Vol (RV)**: Actual historical 30-day volatility
- **IV/RV Ratio**: Primary regime indicator
  - Ratio > 1: Market expects higher volatility than recently realized
  - Ratio < 1: Market expects lower volatility than recently realized
- **IV-RV Spread**: Absolute difference in percentage points

## Troubleshooting

### Error: "Could not determine regime"

**Possible causes:**
1. API connection issue
2. Rate limit exceeded
3. Exchange downtime

**Solutions:**
```python
# Enable debug logging
import logging
logging.basicConfig(level=logging.DEBUG)

# Check API connectivity
detector = VolatilityRegimeDetector()
iv = detector.get_implied_volatility('BTC')
print(f"IV fetch successful: {iv is not None}")
```

### Error: "fetch_volatility_history not supported"

This means CCXT may not have the latest features for Deribit. Use alternative method:

```python
regime = detector.detect_regime(
    currency='BTC',
    iv_method='direct'  # Use direct API call instead
)
```

### Rate Limiting

Deribit public API is generous, but if you're making many requests:

```python
# CCXT has built-in rate limiting enabled by default
detector = VolatilityRegimeDetector()

# Add delay between requests manually if needed
import time
time.sleep(1)  # Wait 1 second between calls
```

## Advanced Features

### Custom Regime Thresholds

Edit the `detect_regime()` method to customize regime boundaries:

```python
# In btc_volatility_regime_detector.py, modify these lines:

if iv_rv_ratio > 1.8:  # Changed from 1.5
    regime['regime'] = 'HIGH_FEAR'
elif iv_rv_ratio > 1.3:  # Changed from 1.2
    regime['regime'] = 'ELEVATED'
# ... etc
```

### Fetch IV Surface Data

```python
import requests

def get_iv_surface():
    url = "https://www.deribit.com/api/v2/public/get_book_summary_by_currency"
    params = {'currency': 'BTC', 'kind': 'option'}

    response = requests.get(url, params=params)
    options = response.json()['result']

    # Filter and organize by strike/expiry
    for opt in options:
        print(f"{opt['instrument_name']}: IV={opt['mark_iv']:.1f}%")
```

### Compare to VIX-style Calculation

The DVOL calculation methodology mirrors the VIX:
- Uses ATM and OTM options
- Weights by time to expiration
- Interpolates to constant 30-day maturity

You can access the live DVOL chart at: https://www.deribit.com/statistics/BTC/volatility-index/

## Resources

- **Full Research Report**: See `bitcoin_iv_data_sources_research.md`
- **Deribit API Docs**: https://docs.deribit.com/
- **CCXT Documentation**: https://docs.ccxt.com/
- **DVOL Methodology**: https://insights.deribit.com/exchange-updates/dvol-deribit-implied-volatility-index/

## Next Steps

1. Run the basic detector to confirm it works
2. Customize regime thresholds for your strategy
3. Set up scheduled monitoring (cron job or systemd timer)
4. Build historical database for backtesting
5. Integrate with your trading system

## Support

For issues with:
- **Deribit API**: https://docs.deribit.com/ or Deribit support
- **CCXT Library**: https://github.com/ccxt/ccxt/issues
- **This implementation**: Check the code comments or modify as needed

---

**Note:** This tool provides market data analysis only. Trading cryptocurrencies and derivatives involves substantial risk. Always do your own research and risk management.
