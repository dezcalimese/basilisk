# Basilisk 🐍

> *"A serpent's eye for mispriced markets."*

Basilisk is a full-stack trading platform for Kalshi digital options contracts. It identifies mispriced binary options by comparing professional options market volatility (Deribit DVOL) against prediction market prices to calculate expected value (EV), then enables trade execution across web, mobile, Telegram, and CLI interfaces.

## What It Does

1. **Fetches** real-time contract data from Kalshi (BTC, ETH, XRP hourly contracts)
2. **Calculates** true probability using Black-Scholes with Deribit DVOL
3. **Identifies** mispriced contracts where market price diverges from model price
4. **Signals** high-EV opportunities (>2% expected value)
5. **Executes** trades via Kalshi API with Builder Code revenue sharing
6. **Notifies** via Telegram bot and iOS push notifications

## Architecture

```
basilisk/
├── backend/          # FastAPI (Python 3.12)
│   ├── app/
│   │   ├── api/routes/    # REST endpoints + SSE streams
│   │   ├── services/      # Trade executor, Telegram bot, push notifications
│   │   ├── models/        # EV calculator, Black-Scholes, volatility
│   │   ├── data/          # Kalshi, Coinbase, Binance, Kraken clients
│   │   └── db/            # SQLAlchemy models
│   └── pyproject.toml
│
├── frontend/         # Next.js 16 + React 19
│   ├── app/               # Dashboard pages
│   ├── components/        # Widgets, charts, 3D surfaces
│   └── lib/               # SSE managers, Zustand stores
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
- [Rust](https://rustup.rs/) for CLI (optional)
- Redis (optional, for caching)

### Backend

```bash
cd backend
uv sync --all-extras
cp .env.example .env
# Edit .env with your credentials (see Configuration below)
uv run uvicorn app.api.main:app --reload
```

API available at `http://localhost:8000`

### Frontend

```bash
cd frontend
bun install
cp .env.local.example .env.local
bun dev
```

Dashboard available at `http://localhost:3000`

### CLI

```bash
cd cli
cargo build --release

# Launch TUI dashboard
./target/release/basilisk-cli

# Or use trading commands directly
./target/release/basilisk-cli trade 42 --size 5
./target/release/basilisk-cli positions
./target/release/basilisk-cli pnl today
```

## Features

### Analytics Dashboard
- Real-time SSE streaming for prices and contracts
- Multi-asset support (BTC, ETH, XRP)
- **Trading modal** with Kalshi-style UI (Buy/Sell, Yes/No, Limit orders)
- 3D volatility surface visualization
- Binary options Greeks (Delta, Gamma, Vega, Theta, Rho)
- Volatility regime detection (CALM/NORMAL/ELEVATED/CRISIS)
- Order book depth charts
- Probability ladder
- **Iconify icons** (277K+ icons via Tailwind CSS 4 plugin)

### Trade Execution
- Market and limit orders via Kalshi API
- Builder Code integration for revenue sharing
- Position tracking with live P&L
- Trade history and performance analytics

### Notifications
- Telegram bot with inline trading
- iOS push notifications (APNs)
- Configurable EV thresholds and quiet hours
- Alerts for signals, fills, expiry warnings, settlements

### Multi-Platform Access
| Platform | Interface |
|----------|-----------|
| Web | Next.js dashboard with real-time charts |
| iOS | SwiftUI app with biometric/PIN/password auth |
| Telegram | Bot commands: `/signals`, `/trade`, `/positions`, `/pnl` |
| CLI | Rust TUI + trading subcommands |

## API Endpoints

### Signals & Data
```
GET  /api/v1/health              # Health check
GET  /api/v1/contracts/{asset}   # Hourly contracts (BTC/ETH/XRP)
GET  /api/v1/stream/{asset}      # SSE stream (prices + contracts)
GET  /api/v1/signals/current     # Active trade signals
GET  /api/v1/orderbook/{ticker}  # Order book depth
```

### Trading
```
POST   /api/v1/trade             # Execute trade
POST   /api/v1/trade/signal      # Trade from signal ID
GET    /api/v1/trade/positions   # Open positions with live P&L
DELETE /api/v1/trade/positions/{id}  # Close position
GET    /api/v1/trade/history     # Trade history
GET    /api/v1/trade/pnl/{period}    # P&L summary (today/week/all)
GET    /api/v1/trade/balance     # Kalshi account balance
```

### Mobile & Notifications
```
POST  /api/v1/mobile/register-push   # Register APNs token
GET   /api/v1/mobile/preferences     # Get alert settings
PATCH /api/v1/mobile/preferences     # Update alert settings
GET   /api/v1/mobile/signals         # Lightweight signal payload
POST  /api/v1/webhooks/telegram      # Telegram bot webhook
```

## Configuration

### Backend `.env`

```bash
# ===================
# KALSHI (Required for trading)
# ===================
KALSHI_KEY_ID=your_api_key_id
KALSHI_PRIVATE_KEY_PATH=/path/to/private_key.pem
KALSHI_USE_DEMO=true                    # Set false for live trading
KALSHI_BUILDER_CODE=your_builder_code   # Revenue sharing (apply at kalshi.com/builders)

# ===================
# TELEGRAM BOT (Optional)
# ===================
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHI...
TELEGRAM_WEBHOOK_SECRET=random_secret_string

# ===================
# APPLE PUSH NOTIFICATIONS (Optional)
# ===================
APNS_KEY_ID=ABC123DEFG
APNS_TEAM_ID=TEAM123456
APNS_KEY_PATH=/path/to/AuthKey.p8
APNS_BUNDLE_ID=com.yourname.basilisk

# ===================
# MODEL PARAMETERS
# ===================
MODEL_EV_THRESHOLD=0.02          # 2% minimum EV for signals
MODEL_CONFIDENCE_THRESHOLD=0.60  # 60% minimum confidence
KALSHI_FEE_RATE=0.07             # 7% fee on profits

# ===================
# INFRASTRUCTURE
# ===================
DATABASE_URL=sqlite:///./basilisk.db
REDIS_URL=redis://localhost:6379
ENCRYPTION_KEY=                  # For encrypting stored API keys (openssl rand -hex 32)
```

### Frontend `.env.local`

```bash
NEXT_PUBLIC_API_URL=http://localhost:8000
```

## CLI Commands

```bash
# TUI Dashboard (default)
basilisk                    # Launch interactive dashboard
basilisk dashboard          # Same as above

# Trading
basilisk trade <signal_id> --size <contracts>   # Execute from signal
basilisk positions                               # List open positions
basilisk close <position_id>                     # Close a position
basilisk pnl [today|week|all]                   # P&L summary
basilisk history --limit 20                      # Trade history
```

## Telegram Bot Commands

```
/start      - Welcome message and setup
/signals    - Current high-EV opportunities (top 5)
/signal <id> - Detailed signal view
/trade <id> <size> - Execute trade with confirmation
/positions  - Open positions with live P&L
/pnl        - Today's P&L summary
/settings   - View alert thresholds
/alerts on|off - Toggle notifications
/help       - Command reference
```

## How EV is Calculated

1. **Fetch Deribit DVOL** - 30-day implied volatility from professional options market
2. **Black-Scholes Probability** - Calculate P(BTC > strike at expiry) using DVOL
3. **Compare to Market** - Kalshi implied probability = market price
4. **Calculate EV**:
   ```
   mispricing = model_probability - market_probability
   EV = (model_prob × net_profit) - ((1 - model_prob) × entry_cost)
   ```
5. **Signal if EV > 2%** and mispricing > 10%

## Tech Stack

| Layer | Technology |
|-------|------------|
| Backend | FastAPI, SQLAlchemy, Pydantic, httpx, Redis |
| Frontend | Next.js 16, React 19, Zustand, Recharts, Plotly 3D |
| iOS | SwiftUI, async/await, Keychain, LocalAuthentication |
| CLI | Rust, Ratatui, Tokio, Reqwest, Clap |
| Data | Kalshi API, Deribit API, Binance WebSocket, Coinbase, Kraken |

## Project Philosophy

1. **EV-Driven** - Every trade decision backed by expected value calculation
2. **Multi-Platform** - Trade from wherever you are
3. **Single User** - No auth complexity, optimized for personal use
4. **Real-Time** - SSE streaming, not polling
5. **Revenue Sharing** - Builder Code integration for sustainable development

## License

MIT

---

**Basilisk** - Revealing the hidden edge in prediction markets
