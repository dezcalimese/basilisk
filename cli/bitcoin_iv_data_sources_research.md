# Bitcoin Implied Volatility Data Sources - Research Report

**Date:** 2025-11-14
**Purpose:** Identify optimal sources for Bitcoin options implied volatility data for volatility regime detection

---

## Executive Summary

**Top 3 Recommended Sources:**

1. **Deribit API** (Primary Recommendation)
   - Market leader with ~90% of Bitcoin options trading volume
   - Free public API with DVOL (30-day IV index)
   - Comprehensive options data including Greeks and IV surfaces
   - No authentication required for public data

2. **CCXT Library** (Easiest Implementation)
   - Unified API wrapper for Deribit and other exchanges
   - Built-in `fetch_volatility_history()` method
   - Handles authentication and response parsing
   - Free and open source

3. **Amberdata API** (Premium Alternative)
   - Professional-grade derivatives analytics
   - Pre-calculated IV metrics and term structures
   - DVOL index access with additional analytics
   - Requires paid subscription

---

## 1. Deribit API (Primary Focus)

### Overview

**Why Deribit?**
- Nearly 9 out of 10 Bitcoin options are traded on Deribit
- Launched DVOL (Deribit Volatility Index) - analogous to VIX for stocks
- Provides both raw options data and calculated IV metrics
- Public API with no authentication required for market data

**DVOL Index:**
- 30-day annualized implied volatility gauge
- Forward-looking volatility expectation
- Uses implied volatility smile across relevant expiries
- Updated in real-time

### Key API Endpoints

#### 1. `/public/get_volatility_index_data`

**Description:** Retrieves DVOL index historical data

**Parameters:**
```python
{
    "currency": "BTC",           # Required: "BTC" or "ETH"
    "resolution": "1",           # Resolution in minutes (1, 5, 15, 30, 60, 1D)
    "start_timestamp": 1609459200000,  # Unix timestamp in milliseconds
    "end_timestamp": 1640995200000     # Unix timestamp in milliseconds
}
```

**Python Example (REST):**
```python
import requests

url = "https://www.deribit.com/api/v2/public/get_volatility_index_data"
params = {
    "currency": "BTC",
    "resolution": "60",  # 1-hour resolution
    "start_timestamp": 1609459200000,
    "end_timestamp": 1640995200000
}

response = requests.get(url, params=params)
data = response.json()

# Response structure:
# {
#     "jsonrpc": "2.0",
#     "result": [
#         [timestamp_ms, volatility_value],
#         [1640142000000, 63.82],
#         ...
#     ]
# }
```

**Python Example (WebSocket):**
```python
import asyncio
import websockets
import json

async def get_volatility_index():
    msg = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "public/get_volatility_index_data",
        "params": {
            "currency": "BTC",
            "resolution": "60",
            "start_timestamp": 1609459200000,
            "end_timestamp": 1640995200000
        }
    }

    async with websockets.connect('wss://www.deribit.com/ws/api/v2') as websocket:
        await websocket.send(json.dumps(msg))
        response = await websocket.recv()
        data = json.loads(response)
        return data['result']

# Run the async function
volatility_data = asyncio.run(get_volatility_index())
```

#### 2. `/public/get_historical_volatility`

**Description:** Returns annualized historical volatility (measured hourly over 15 days)

**Parameters:**
```python
{
    "currency": "BTC"  # Required: "BTC" or "ETH"
}
```

**Python Example:**
```python
import requests

url = "https://www.deribit.com/api/v2/public/get_historical_volatility"
params = {"currency": "BTC"}

response = requests.get(url, params=params)
data = response.json()

# Response format:
# {
#     "jsonrpc": "2.0",
#     "result": [
#         [timestamp_ms, historical_vol],
#         [1640142000000, 63.828320460740585],
#         ...
#     ]
# }
```

#### 3. `/public/get_book_summary_by_currency`

**Description:** Get all instruments for a currency with live IV data

**Parameters:**
```python
{
    "currency": "BTC",   # Required: "BTC", "ETH", etc.
    "kind": "option"     # Optional: "option", "future", or omit for all
}
```

**Python Example:**
```python
import requests

url = "https://www.deribit.com/api/v2/public/get_book_summary_by_currency"
params = {
    "currency": "BTC",
    "kind": "option"
}

response = requests.get(url, params=params)
data = response.json()

# Extract IV from options
for instrument in data['result']:
    print(f"Instrument: {instrument['instrument_name']}")
    print(f"Mark IV: {instrument['mark_iv']}")  # Implied volatility
    print(f"Mark Price: {instrument['mark_price']}")
    print(f"Underlying Price: {instrument['underlying_price']}")
    print(f"Volume: {instrument['volume']}")
    print("---")
```

**Example Response:**
```json
{
    "jsonrpc": "2.0",
    "result": [
        {
            "volume_usd": 12500,
            "underlying_price": 43250.50,
            "mark_price": 0.0234,
            "mark_iv": 67.5,  // <-- Implied Volatility (%)
            "instrument_name": "BTC-29DEC23-45000-C",
            "volume": 5.2,
            "open_interest": 125.8
        }
    ]
}
```

#### 4. WebSocket Subscription for Real-Time IV

**Channel:** `deribit_volatility_index.{index_name}`

**Python Example:**
```python
import asyncio
import websockets
import json

async def subscribe_to_dvol():
    msg = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "public/subscribe",
        "params": {
            "channels": ["deribit_volatility_index.btc_usd"]
        }
    }

    async with websockets.connect('wss://www.deribit.com/ws/api/v2') as websocket:
        await websocket.send(json.dumps(msg))

        # Receive subscription confirmation
        response = await websocket.recv()
        print(f"Subscription confirmed: {response}")

        # Listen for updates
        while True:
            message = await websocket.recv()
            data = json.loads(message)

            if 'params' in data:
                volatility_update = data['params']['data']
                print(f"DVOL Update: {volatility_update}")

# Run the subscription
asyncio.run(subscribe_to_dvol())
```

### Calculating ATM (At-The-Money) IV

**Approach 1: Filter options by strike near spot**
```python
import requests

def get_atm_iv(currency="BTC", expiry_days=30):
    # Get spot price
    url = "https://www.deribit.com/api/v2/public/get_index_price"
    spot_response = requests.get(url, params={"index_name": f"{currency}_usd"})
    spot_price = spot_response.json()['result']['index_price']

    # Get all options
    url = "https://www.deribit.com/api/v2/public/get_book_summary_by_currency"
    options_response = requests.get(url, params={"currency": currency, "kind": "option"})
    options = options_response.json()['result']

    # Filter for ATM options (strike within 5% of spot)
    atm_options = []
    for opt in options:
        # Parse instrument name: BTC-29DEC23-45000-C
        parts = opt['instrument_name'].split('-')
        strike = float(parts[2])

        if abs(strike - spot_price) / spot_price < 0.05:
            atm_options.append({
                'instrument': opt['instrument_name'],
                'strike': strike,
                'mark_iv': opt['mark_iv'],
                'volume': opt['volume']
            })

    # Weight by volume to get average ATM IV
    total_volume = sum(opt['volume'] for opt in atm_options)
    if total_volume > 0:
        weighted_iv = sum(opt['mark_iv'] * opt['volume'] for opt in atm_options) / total_volume
        return weighted_iv
    return None

atm_iv = get_atm_iv("BTC")
print(f"ATM IV: {atm_iv:.2f}%")
```

**Approach 2: Use DVOL directly (simplest)**
```python
import requests

def get_current_dvol(currency="BTC"):
    # DVOL already represents ATM 30-day IV
    url = "https://www.deribit.com/api/v2/public/ticker"
    params = {"instrument_name": f"{currency}_usd"}

    response = requests.get(url, params=params)
    # Alternative: query volatility index directly

    # For historical DVOL
    url = "https://www.deribit.com/api/v2/public/get_volatility_index_data"
    params = {
        "currency": currency,
        "resolution": "1",  # 1 minute for most recent
        "start_timestamp": int((time.time() - 3600) * 1000),  # Last hour
        "end_timestamp": int(time.time() * 1000)
    }

    response = requests.get(url, params=params)
    data = response.json()

    if data['result']:
        latest_dvol = data['result'][-1][1]  # Last value
        return latest_dvol
    return None

current_iv = get_current_dvol("BTC")
print(f"Current DVOL (30-day IV): {current_iv:.2f}%")
```

### Rate Limits and Authentication

**Public API:**
- No authentication required
- Rate limit: Not strictly enforced for public endpoints
- Recommended: Use WebSocket for real-time data to avoid rate limits

**Production Recommendations:**
- WebSocket for real-time subscriptions (more efficient)
- REST for historical data queries
- Implement exponential backoff for failed requests

---

## 2. CCXT Library (Unified API)

### Overview

**Advantages:**
- Single unified interface for multiple exchanges (Deribit, OKX, Binance, etc.)
- Handles authentication, rate limiting, and error handling
- Active maintenance and community support
- Built-in methods for volatility data

**Installation:**
```bash
pip install ccxt
```

### Fetch Volatility History

```python
import ccxt
import pandas as pd

# Initialize Deribit exchange
exchange = ccxt.deribit({
    'enableRateLimit': True,  # Enable built-in rate limiting
})

# Fetch historical volatility for BTC
try:
    volatility_history = exchange.fetch_volatility_history('BTC')

    # Convert to DataFrame for analysis
    df = pd.DataFrame(volatility_history)

    # DataFrame columns:
    # - timestamp: Unix timestamp in milliseconds
    # - datetime: ISO8601 formatted datetime string
    # - volatility: The volatility value (annualized %)
    # - info: Raw volatility value

    print(df.head())

    # Example output:
    #      timestamp                   datetime  volatility        info
    # 0  1640142000000  2021-12-22T01:00:00.000Z   63.828321   63.828321
    # 1  1640145600000  2021-12-22T02:00:00.000Z   64.038220   64.038220

except ccxt.NetworkError as e:
    print(f'Network error: {e}')
except ccxt.ExchangeError as e:
    print(f'Exchange error: {e}')
```

### Fetch Options Data

```python
import ccxt

exchange = ccxt.deribit()

# Get all BTC options
markets = exchange.load_markets()
btc_options = {k: v for k, v in markets.items() if v['type'] == 'option' and v['base'] == 'BTC'}

print(f"Found {len(btc_options)} BTC options")

# Fetch ticker data with IV for specific option
ticker = exchange.fetch_ticker('BTC-29DEC23-45000-C')

print(f"Option: {ticker['symbol']}")
print(f"Mark IV: {ticker.get('markImpliedVolatility', 'N/A')}")
print(f"Mark Price: {ticker['last']}")
print(f"Underlying: {ticker.get('underlyingPrice', 'N/A')}")
```

### Real-Time IV Monitoring

```python
import ccxt.async_support as ccxt
import asyncio

async def monitor_volatility():
    exchange = ccxt.deribit()

    while True:
        try:
            # Fetch latest volatility
            vol_data = await exchange.fetch_volatility_history('BTC')
            latest = vol_data[-1] if vol_data else None

            if latest:
                print(f"{latest['datetime']}: BTC IV = {latest['volatility']:.2f}%")

            await asyncio.sleep(60)  # Update every minute

        except Exception as e:
            print(f"Error: {e}")
            await asyncio.sleep(5)

# Run
asyncio.run(monitor_volatility())
```

### Pros and Cons

**Pros:**
- Clean, pythonic API
- Multi-exchange support (easy to add OKX, Binance as backups)
- Automatic error handling and retries
- Well-documented with large community
- Free and open source

**Cons:**
- Abstraction layer may hide some exchange-specific features
- Slightly slower than direct API calls
- May not support newest exchange features immediately

---

## 3. Amberdata API (Premium)

### Overview

**Professional-grade cryptocurrency derivatives analytics**

**Key Features:**
- Pre-calculated IV metrics (term structure, skew, surface)
- DVOL index with variance premium analysis
- Historical data with deep backtesting support
- Enterprise SLA and support

**Pricing:** Subscription-based (contact for pricing)

### Installation

```bash
pip install amberdata-derivatives
```

### Python Examples

```python
from amberdata_derivatives import AmberdataDerivatives
import os
from dotenv import load_dotenv

# Initialize client
load_dotenv()
client = AmberdataDerivatives(
    api_key=os.getenv('AMBERDATA_API_KEY'),
    time_format='iso'
)

# Get DVOL index data
dvol_data = client.get_volatility_index(
    exchange='deribit',
    instrument='DERIBIT_BTC_DVOL_INDEX'
)

print(dvol_data)
```

### Volatility Term Structure

```python
# Get full volatility term structure for BTC on Deribit
term_structure = client.get_volatility_term_structures_constant(
    currency='BTC',
    exchange='deribit'
)

# Returns IV at various maturities (7D, 14D, 30D, 60D, 90D, etc.)
for maturity in term_structure:
    print(f"{maturity['days']}D: {maturity['iv']:.2f}%")
```

### REST API (cURL example)

```bash
curl --request GET \
  --url 'https://api.amberdata.com/markets/derivatives/analytics/volatility/index?exchange=deribit&instrument=DERIBIT_BTC_DVOL_INDEX' \
  --header 'x-api-key: YOUR_API_KEY'
```

**Response:**
```json
{
    "exchangeTimestamp": 1699564800000,
    "exchange": "deribit",
    "instrument": "DERIBIT_BTC_DVOL_INDEX",
    "currency": "BTC",
    "open": 65.2,
    "high": 68.5,
    "low": 64.8,
    "close": 67.3
}
```

### Pros and Cons

**Pros:**
- Enterprise-grade reliability
- Pre-calculated complex metrics
- Historical data with high quality
- Professional support

**Cons:**
- Requires paid subscription
- May be overkill for individual traders
- Less flexibility than direct API access

---

## 4. Alternative Sources

### A. OKX API

**Overview:**
- Second-largest crypto options exchange
- Uses Black-Scholes for IV calculation
- Free public API

**Python SDK:**
```bash
pip install python-okx
```

**Example:**
```python
import okx.MarketData as MarketData

# Initialize
flag = "0"  # 0 = live trading, 1 = demo
market_api = MarketData.MarketAPI(flag=flag)

# Get options tickers (includes IV)
result = market_api.get_tickers(instType="OPTION", uly="BTC-USD")

for ticker in result['data']:
    print(f"Option: {ticker['instId']}")
    print(f"Mark IV: {ticker.get('markIv', 'N/A')}")
```

**Pros:**
- Good liquidity backup to Deribit
- Free API access
- Direct IV in ticker data

**Cons:**
- Less market share than Deribit
- Documentation less comprehensive

### B. CME Bitcoin Volatility Index (BVX)

**Overview:**
- Regulated, institutional-grade benchmark
- 30-day constant maturity implied volatility
- Based on CME Bitcoin options (CFTC regulated)
- Launched April 9, 2024

**Features:**
- BVX (Real-Time): Published 7am-4pm CT on CME trading days
- BVXS (Settlement): Daily settlement at 4pm London time

**Data Access:**
- CME DataMine (requires license)
- CF Benchmarks API (contact for access)
- Likely not free for API access

**Pros:**
- Regulatory compliance for institutions
- Highly reliable and audited
- Suitable for regulated entities

**Cons:**
- Requires licensing/subscription
- Less frequent than crypto-native exchanges
- Limited to CME trading hours

### C. BitMEX BVOL Index

**Overview:**
- Bitcoin Historical Volatility Index
- Annualized realized volatility
- Different from implied volatility (DVOL)

**Note:** BVOL measures historical (realized) volatility, not implied volatility from options. Not suitable for direct options IV comparison.

### D. Volmex Finance BVIV

**Overview:**
- Decentralized Bitcoin Implied Volatility Index
- 30-day annualized implied volatility
- On-chain and transparent

**Access:** Limited documentation for programmatic access

---

## 5. Comparison Matrix

| Source | Type | IV Metric | Cost | Ease of Use | Data Quality | Real-Time | Historical |
|--------|------|-----------|------|-------------|--------------|-----------|------------|
| **Deribit API** | Direct API | DVOL, mark_iv | Free | Medium | Excellent | Yes | Yes |
| **CCXT** | Wrapper | Via Deribit | Free | Easy | Excellent | Yes | Yes |
| **Amberdata** | Aggregator | DVOL + analytics | Paid | Easy | Excellent | Yes | Deep |
| **OKX API** | Direct API | mark_iv | Free | Medium | Good | Yes | Yes |
| **CME BVX** | Index | BVX | Paid | Hard | Excellent | Limited | Yes |
| **Kalshi** | Binary options | Estimated (~50%) | Free | Medium | Fair | Yes | Limited |

---

## 6. Recommended Implementation for Your Use Case

### Objective
Compare realized volatility vs implied volatility for Bitcoin volatility regime detection.

### Recommended Approach

**Primary Data Source: Deribit DVOL via CCXT**

```python
import ccxt
import pandas as pd
import numpy as np
from datetime import datetime, timedelta

class VolatilityRegimeDetector:
    def __init__(self):
        self.exchange = ccxt.deribit({'enableRateLimit': True})

    def get_implied_volatility(self):
        """Fetch current implied volatility (DVOL)"""
        vol_history = self.exchange.fetch_volatility_history('BTC')
        if vol_history:
            latest = vol_history[-1]
            return {
                'timestamp': latest['timestamp'],
                'datetime': latest['datetime'],
                'implied_vol': latest['volatility']  # Annualized %
            }
        return None

    def get_realized_volatility(self, window_days=30):
        """Calculate realized volatility from price history"""
        # Fetch OHLCV data
        since = self.exchange.parse8601(
            (datetime.now() - timedelta(days=window_days+10)).isoformat()
        )
        ohlcv = self.exchange.fetch_ohlcv('BTC/USD', '1d', since=since)

        df = pd.DataFrame(
            ohlcv,
            columns=['timestamp', 'open', 'high', 'low', 'close', 'volume']
        )
        df['datetime'] = pd.to_datetime(df['timestamp'], unit='ms')

        # Calculate log returns
        df['log_return'] = np.log(df['close'] / df['close'].shift(1))

        # Calculate annualized realized volatility
        realized_vol = df['log_return'].std() * np.sqrt(365) * 100

        return realized_vol

    def detect_regime(self):
        """Classify volatility regime"""
        iv_data = self.get_implied_volatility()
        rv = self.get_realized_volatility()

        if not iv_data:
            return None

        iv = iv_data['implied_vol']
        iv_rv_ratio = iv / rv

        # Regime classification
        regime = {
            'timestamp': iv_data['datetime'],
            'implied_vol': iv,
            'realized_vol': rv,
            'iv_rv_ratio': iv_rv_ratio,
            'regime': None
        }

        # Simple regime rules (customize based on your strategy)
        if iv_rv_ratio > 1.5:
            regime['regime'] = 'HIGH_FEAR'  # IV >> RV: market expects volatility
        elif iv_rv_ratio > 1.1:
            regime['regime'] = 'ELEVATED'  # IV > RV: slight premium
        elif iv_rv_ratio > 0.9:
            regime['regime'] = 'NORMAL'  # IV ≈ RV: balanced
        else:
            regime['regime'] = 'COMPLACENT'  # IV < RV: underpricing risk

        return regime

# Usage
detector = VolatilityRegimeDetector()
regime = detector.detect_regime()

print(f"Timestamp: {regime['timestamp']}")
print(f"Implied Vol (DVOL): {regime['implied_vol']:.2f}%")
print(f"Realized Vol (30D): {regime['realized_vol']:.2f}%")
print(f"IV/RV Ratio: {regime['iv_rv_ratio']:.2f}")
print(f"Regime: {regime['regime']}")
```

**Output Example:**
```
Timestamp: 2025-11-14T15:30:00.000Z
Implied Vol (DVOL): 68.50%
Realized Vol (30D): 52.30%
IV/RV Ratio: 1.31
Regime: ELEVATED
```

### Why This Approach?

1. **DVOL is purpose-built for your use case**
   - Already represents 30-day ATM implied volatility
   - No need to calculate weighted average across strikes
   - Updated frequently

2. **CCXT provides clean implementation**
   - Easy to fetch both IV and price data from same interface
   - Built-in error handling and rate limiting
   - Can easily add OKX as backup source

3. **Direct comparison is meaningful**
   - DVOL (30-day forward IV) vs 30-day realized vol
   - Both annualized percentages
   - Clean ratio for regime detection

### Production Enhancements

**1. Add redundancy:**
```python
def get_implied_volatility_with_fallback(self):
    """Try Deribit first, fallback to OKX"""
    try:
        # Primary: Deribit DVOL
        return self.get_deribit_dvol()
    except Exception as e:
        print(f"Deribit failed: {e}, trying OKX...")
        try:
            return self.get_okx_iv()
        except Exception as e2:
            print(f"OKX failed: {e2}")
            return None
```

**2. Add caching to reduce API calls:**
```python
from functools import lru_cache
from datetime import datetime

@lru_cache(maxsize=1)
def get_cached_iv(cache_key):
    """Cache IV for 5 minutes"""
    return detector.get_implied_volatility()

# Usage
cache_key = datetime.now().strftime("%Y%m%d%H%M")[:11]  # 5-min buckets
iv_data = get_cached_iv(cache_key)
```

**3. Store historical data:**
```python
import sqlite3
from datetime import datetime

def store_regime_data(regime):
    """Persist regime data for backtesting"""
    conn = sqlite3.connect('volatility_regimes.db')
    c = conn.cursor()

    c.execute('''
        CREATE TABLE IF NOT EXISTS regimes (
            timestamp TEXT PRIMARY KEY,
            implied_vol REAL,
            realized_vol REAL,
            iv_rv_ratio REAL,
            regime TEXT
        )
    ''')

    c.execute('''
        INSERT OR REPLACE INTO regimes VALUES (?, ?, ?, ?, ?)
    ''', (
        regime['timestamp'],
        regime['implied_vol'],
        regime['realized_vol'],
        regime['iv_rv_ratio'],
        regime['regime']
    ))

    conn.commit()
    conn.close()
```

---

## 7. Additional Resources

### Official Documentation
- Deribit API Docs: https://docs.deribit.com/
- CCXT Documentation: https://docs.ccxt.com/
- Amberdata Docs: https://docs.amberdata.io/

### GitHub Repositories
- Deribit Volatility Visualizer: https://github.com/nostoz/deribit_volatility_download_and_visualize
- Deribit Data Collector: https://github.com/schepal/deribit_data_collector
- Vol Surface Visualizer: https://github.com/dwasse/vol-surface-visualizer
- CCXT Library: https://github.com/ccxt/ccxt

### Learning Resources
- Deribit Insights (Dev Hub): https://insights.deribit.com/dev-hub/
- DVOL Explained: https://insights.deribit.com/exchange-updates/dvol-deribit-implied-volatility-index/
- Bitcoin IV Analysis: https://medium.com/coinmonks/bitcoin-implied-volatility-surface-from-deribit-70fba845102a

### Data Providers
- CryptoDataDownload: https://www.cryptodatadownload.com/data/deribit/
- CoinGlass Options Data: https://www.coinglass.com/options
- Tardis.dev (Historical): https://tardis.dev/deribit

---

## 8. Key Takeaways

### For Your Volatility Regime Detection Project:

1. **Use Deribit DVOL as your primary IV source**
   - Represents ~90% of BTC options market
   - Purpose-built 30-day IV index
   - Free, reliable, and well-documented

2. **Implement via CCXT for ease of use**
   - Clean Python interface
   - Built-in error handling
   - Easy to add backup sources

3. **Current IV estimate (~50% from Kalshi) can be replaced with:**
   - Live DVOL: Typically ranges 40-120% for BTC
   - More accurate market-implied forward volatility
   - Direct comparison to realized volatility

4. **Regime Detection Strategy:**
   - Calculate IV/RV ratio
   - IV > RV: Market expects higher volatility (fear premium)
   - IV < RV: Market complacent (realized vol exceeded expectations)
   - Historical mean reversion to IV/RV ≈ 1.0-1.2

5. **Production Considerations:**
   - Cache IV data (updates every 1-5 minutes sufficient)
   - Store historical regime data for backtesting
   - Add OKX as backup source for redundancy
   - Monitor DVOL term structure (not just 30D) for regime shifts

### Cost Summary
- **Deribit API:** Free ✓
- **CCXT:** Free ✓
- **Recommended approach:** $0/month

No need for paid data subscriptions for your use case!
