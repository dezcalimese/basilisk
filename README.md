# Basilisk 🐍

> *"A serpent's eye for mispriced markets."*

Basilisk is a prediction market analytics and trading platform for Kalshi binary options. It identifies mispriced contracts by comparing professional options market volatility (Deribit DVOL) against prediction market prices, and enables on-chain trading via DFlow on Solana.

## What It Does

1. **Fetches** real-time contract data from Kalshi (BTC, ETH, SOL, XRP, DOGE — hourly and 15-min)
2. **Calculates** true probability using Black-Scholes with Deribit DVOL / ATM options chain IV
3. **Identifies** mispriced contracts where market price diverges from model price
4. **Signals** high-EV opportunities (>2% expected value)
5. **Trades** on-chain via DFlow on Solana (Privy wallet integration)
6. **Streams** real-time data via Kalshi WebSocket + SSE

## Architecture

```
basilisk/
├── backend/          # FastAPI (Python 3.12)
│   ├── app/
│   │   ├── api/routes/    # REST endpoints + SSE streams
│   │   ├── services/      # Market service, trade executor
│   │   ├── models/        # Volatility (Yang-Zhang, HAR-RV, Black-Scholes)
│   │   ├── data/          # Kalshi (REST + WS), DFlow, exchange clients
│   │   └── db/            # SQLAlchemy models
│   └── pyproject.toml
│
├── frontend/         # Next.js 16 + React 19 (port 3333)
│   ├── app/               # Dashboard
│   ├── components/        # Charts, signals, orderbook, trading modal
│   ├── hooks/             # Trade execution, realtime data
│   └── lib/               # DFlow client, SSE manager, Zustand stores
│
├── ios/              # SwiftUI (iOS 17+)
│   └── Basilisk/
│       ├── Features/      # Signals, Trading, Positions, Settings
│       └── Services/      # Auth (biometric/PIN/password), haptics
│
└── cli/              # Rust + Ratatui
    └── src/               # TUI dashboard + trading commands
```

## Quick Start

### Prerequisites

- Python 3.12+ with [uv](https://docs.astral.sh/uv/)
- [Bun](https://bun.sh/) for frontend
- Redis (optional, for caching)
- Kalshi API credentials (RSA key pair)

### Using Overmind

```bash
make dev     # Start backend + frontend in parallel
```

### Manual Setup

```bash
# Backend
cd backend
uv sync --all-extras
cp .env.example .env
# Edit .env with your Kalshi credentials
uv run uvicorn app.api.main:app --reload
```

API available at `http://localhost:8000`

```bash
# Frontend
cd frontend
bun install
bun dev
```

Dashboard available at `http://localhost:3333`

## Supported Assets

| Asset | Hourly (1H) | 15-min | Deribit IV Source |
|-------|:-----------:|:------:|-------------------|
| BTC | ✅ 318 mkts | ✅ | DVOL index |
| ETH | ✅ 165 mkts | ✅ | DVOL index |
| SOL | ✅ 200 mkts | ✅ | ATM options chain |
| XRP | ✅ 165 mkts | ✅ | ATM options chain |
| DOGE | ✅ 137 mkts | ✅ | Kalshi IV only |
| HYPE | — | ✅ | No coverage |
| BNB | — | ✅ | No coverage |

Market counts reflect DFlow CLP liquidity (contracts with active bids).

## Features

### Analytics Dashboard
- Real-time price charts (Liveline) with 1H/15m default windows synced to timeframe
- Multi-asset support with timeframe-aware asset selector
- Inline metrics strip with hover tooltips (Signals, EV, RV, IV, Regime, Premium)
- Order book depth from DFlow (CLP liquidity)
- Volatility regime detection (CALM/NORMAL/ELEVATED/CRISIS)
- Binary options Greeks (Delta, Gamma, Vega, Theta)
- Hourly movement statistics and extreme opportunities
- Volatility skew analysis
- Animated connection indicator with status tooltip
- Light/dark theme

### Trading (via DFlow on Solana)
- On-chain execution via DFlow's `GET /order` endpoint
- Privy wallet integration (embedded Solana wallets + Phantom/Solflare)
- Proof KYC verification before buying outcome tokens
- Geoblocking for restricted jurisdictions
- Kalshi maintenance window detection (Thu 3-5am ET)
- Real-time order status polling

### Data Pipeline
- Kalshi WebSocket (ticker + orderbook_delta channels) for real-time market data
- In-process pub/sub data bus (WSDataBus) for distributing WS updates to SSE streams
- Multi-exchange candle fallback via CCXT (Kraken, Coinbase, Bitfinex, Bybit)
- DFlow Metadata API for orderbook depth (CLP liquidity)
- 30s candle cache to minimize exchange rate limits

## API Endpoints

### Signals & Data
```
GET  /api/v1/health                    # Health check
GET  /api/v1/contracts/{asset}         # Hourly contracts
GET  /api/v1/stream/{asset}?timeframe= # SSE stream (prices + contracts + orderbook)
GET  /api/v1/orderbook/{ticker}        # Order book (DFlow → Kalshi WS → Kalshi REST)
GET  /api/v1/candles/{symbol}          # OHLCV candles
GET  /api/v1/statistics/hourly-movements # Hourly price statistics
GET  /api/v1/volatility/skew           # IV skew analysis
```

### Trading (DFlow)
```
POST /api/v1/trade/order               # Get order with Solana transaction
GET  /api/v1/trade/order-status        # Poll order status by tx signature
GET  /api/v1/trade/verify/{address}    # Check Proof KYC status
GET  /api/v1/trade/markets/{ticker}/mints  # YES/NO token mints
```

### Legacy Trading (Kalshi Direct)
```
POST   /api/v1/trade                   # Execute trade
GET    /api/v1/trade/positions         # Open positions
GET    /api/v1/trade/history           # Trade history
GET    /api/v1/trade/balance           # Account balance
```

## Configuration

### Backend `.env`

```bash
# Kalshi API (Required)
KALSHI_KEY_ID=your_api_key_id
KALSHI_PRIVATE_KEY_PATH=/path/to/private_key.pem
KALSHI_USE_DEMO=true

# DFlow (Optional — dev endpoints work without key)
DFLOW_API_KEY=
DFLOW_TRADE_API_URL=https://dev-quote-api.dflow.net
DFLOW_METADATA_API_URL=https://dev-prediction-markets-api.dflow.net

# Privy Auth
PRIVY_APP_ID=your_privy_app_id

# Infrastructure
DATABASE_URL=sqlite:///./basilisk.db
REDIS_URL=redis://localhost:6379
```

### Frontend `.env.local`

```bash
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_PRIVY_APP_ID=your_privy_app_id
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
```

## How EV is Calculated

1. **Fetch Deribit IV** — DVOL index for BTC/ETH, ATM options chain IV for SOL/XRP
2. **Black-Scholes Probability** — Calculate P(asset > strike at expiry) using IV
3. **Compare to Market** — Kalshi implied probability = market price
4. **Calculate EV**:
   ```
   mispricing = model_probability - market_probability
   EV = (model_prob × net_profit) - ((1 - model_prob) × entry_cost)
   ```
5. **Signal if EV > 2%** and mispricing > 10%

## Tech Stack

| Layer | Technology |
|-------|------------|
| Backend | FastAPI, SQLAlchemy, Pydantic, httpx, websockets, Redis |
| Frontend | Next.js 16, React 19, Zustand, Liveline, Recharts, Privy |
| Trading | DFlow API (Solana), Privy wallets, Proof KYC |
| Data | Kalshi (REST + WebSocket), Deribit, DFlow Metadata, CCXT |
| iOS | SwiftUI, async/await, Keychain, LocalAuthentication |
| CLI | Rust, Ratatui, Tokio, Reqwest, Clap |

## License

MIT

---

**Basilisk** — Revealing the hidden edge in prediction markets
