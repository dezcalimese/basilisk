# CLAUDE.md - AI Assistant Context

This file provides context for AI assistants (Claude, etc.) working on the Basilisk codebase.

## Project Overview

Basilisk is a full-stack prediction market analytics and trading platform. It identifies mispriced Kalshi binary options contracts by comparing professional options market volatility (Deribit DVOL / ATM IV) against prediction market prices, and enables on-chain trading via DFlow on Solana.

## Tech Stack

### Backend (`/backend`)
- **Framework**: FastAPI (Python 3.12)
- **Package Manager**: uv
- **Database**: SQLAlchemy with SQLite (dev) / PostgreSQL (prod)
- **Cache**: Redis for price caching and rate limiting
- **Key Libraries**: httpx (async HTTP), pydantic-settings, cryptography (RSA auth), websockets
- **Real-time**: Kalshi WebSocket for ticker/orderbook data, SSE for frontend streaming

### Frontend (`/frontend`)
- **Framework**: Next.js 16 with React 19
- **Port**: 3333 (dev)
- **Styling**: Tailwind CSS 4 with glassmorphism design
- **State**: Zustand stores (`realtime-store`, `analytical-store`, `multi-asset-store`)
- **Data**: Server-Sent Events (SSE) for real-time streaming
- **Icons**: Iconify with Tailwind plugin (`@iconify/tailwind4`)
- **Charts**: Liveline for real-time price charts
- **Wallet**: Privy (Solana embedded wallets, Phantom/Solflare)

### iOS (`/ios`)
- **Framework**: SwiftUI (iOS 17+)
- **Auth**: Biometric (Face ID/Touch ID), PIN, password
- **Push**: APNs integration

### CLI (`/cli`)
- **Language**: Rust
- **TUI**: Ratatui framework

## Key Files

### Backend
- `app/core/config.py` - Settings and environment variables
- `app/core/http_client.py` - Singleton HTTP client with rate limiting
- `app/data/kalshi_client.py` - Kalshi API client with RSA-PSS auth
- `app/data/kalshi_ws.py` - Kalshi WebSocket manager (ticker + orderbook_delta channels)
- `app/data/ws_data_bus.py` - In-process pub/sub for distributing WS data to SSE streams
- `app/data/dflow_client.py` - DFlow API client (Trade API + Metadata API)
- `app/data/dflow_types.py` - DFlow Pydantic models (OrderRequest, DFlowOrderResponse, etc.)
- `app/data/generic_price_client.py` - Generic Coinbase/Binance price client for any asset
- `app/services/market_service.py` - Contract processing and signal generation
- `app/models/volatility.py` - Yang-Zhang volatility, HAR-RV forecasting, Deribit IV

### Frontend
- `app/page.tsx` - Main dashboard with metrics strip, chart, orderbook, signals
- `components/dashboard/signal-list.tsx` - Trade signals with modal integration
- `components/dashboard/liveline-chart.tsx` - Liveline price chart with timeframe sync
- `components/dashboard/order-book-depth.tsx` - Order book (DFlow primary, Kalshi fallback)
- `components/trading/trade-modal.tsx` - DFlow trading modal
- `components/asset-selector.tsx` - Multi-asset selector (hourly + 15m-only assets)
- `components/timeframe-selector.tsx` - 1H / 15m timeframe toggle
- `components/connection-status.tsx` - Animated wifi indicator with hover tooltip
- `components/geo-gate.tsx` - Geoblocking gate for restricted jurisdictions
- `lib/dflow/client.ts` - DFlow API client (GET /order flow)
- `lib/geoblocking.ts` - Jurisdiction restriction checking
- `lib/stores/multi-asset-store.ts` - Zustand store with Asset + Timeframe types
- `lib/sse-multi-asset-manager.ts` - Multi-asset SSE connection manager
- `hooks/use-trade-execution.ts` - Trade execution hook (DFlow /order + Privy wallet signing)

## Supported Assets

### Hourly (1H) + 15-minute contracts
- BTC, ETH, SOL, XRP, DOGE

### 15-minute only
- HYPE, BNB

Series ticker pattern: `KXBTCD` (hourly), `KXBTC15M` (15-min)

## Architecture Patterns

### Data Flow
1. Kalshi WebSocket streams ticker/orderbook data in real-time
2. Backend publishes to in-process data bus (WSDataBus)
3. SSE streams consume from data bus + periodic REST metadata refreshes
4. Frontend SSE manager maintains per-asset connections with auto-reconnect
5. Zustand stores aggregate data for components

### Trading Flow (DFlow on Solana)
1. Frontend calls `POST /api/v1/trade/order` with input/output mints + amount
2. Backend proxies to DFlow's `GET /order` (required — DFlow has no CORS)
3. DFlow returns base64-encoded Solana transaction
4. Privy wallet signs transaction client-side
5. Frontend submits to Solana RPC
6. Poll `GET /order-status?signature=...` until filled

### Orderbook Data
- Primary: DFlow Metadata API (has CLP liquidity even when Kalshi books are empty)
- Secondary: Kalshi WebSocket state
- Tertiary: Kalshi REST API (cached)

### Volatility Sources
- BTC/ETH: Deribit DVOL index (direct)
- SOL/XRP: Deribit ATM options chain IV (derived)
- DOGE/HYPE/BNB: No Deribit coverage (Kalshi IV fallback)

### Authentication
- **Kalshi API**: RSA-PSS signed requests (timestamp + method + path)
- **DFlow**: API key via `x-api-key` header (dev endpoints work without key)
- **User Auth**: Privy (Solana embedded wallets) + Proof KYC for trading
- **Geoblocking**: Required for prediction markets (US + 50+ jurisdictions)

### Rate Limiting
- Kalshi REST: 100ms minimum between requests, 30s backend cache on candles
- Kalshi WebSocket: Real-time data eliminates most REST polling
- DFlow: Dev endpoints rate-limited, production requires API key
- Frontend candle polling: 30s interval

## Development Commands

```bash
# Both (via Overmind)
make dev

# Backend
cd backend && uv run uvicorn app.api.main:app --reload

# Frontend (port 3333)
cd frontend && bun dev

# Type check frontend
cd frontend && npx tsc --noEmit
```

## Environment Variables

### Backend (`.env`)
```
KALSHI_KEY_ID=your-key-id
KALSHI_PRIVATE_KEY_PATH=/path/to/private-key.pem
KALSHI_USE_DEMO=false
REDIS_URL=redis://localhost:6379
ENCRYPTION_KEY=your-encryption-key
PRIVY_APP_ID=your-privy-app-id
DFLOW_API_KEY=              # Optional — dev endpoints work without
DFLOW_TRADE_API_URL=https://dev-quote-api.dflow.net
DFLOW_METADATA_API_URL=https://dev-prediction-markets-api.dflow.net
```

### Frontend (`.env.local`)
```
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_PRIVY_APP_ID=your-privy-app-id
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
```

## Code Style

- **Python**: ruff for linting/formatting, type hints everywhere
- **TypeScript**: Strict mode, prefer `type` over `interface`
- **Components**: Functional components with hooks, no class components
- **State**: Zustand over Redux, minimal prop drilling

## Common Tasks

### Adding a new asset
1. Add to `Asset` type in `frontend/lib/stores/multi-asset-store.ts`
2. Add initial state entries for `assetData`, `assetAnalytics`, `assetConnections`
3. Add to `SHARED_ASSETS` or `FIFTEEN_MIN_ONLY` in `frontend/components/asset-selector.tsx`
4. Add exchange mappings in `backend/app/api/routes/candles.py`
5. Add price client mapping in `backend/app/api/routes/current.py` and `statistics.py`
6. Add series ticker in `backend/app/services/market_service.py` SERIES_TICKERS dict
7. Add token SVG in `frontend/public/tokens/`
8. Add symbol mapping in `frontend/lib/exchange-api.ts`

### Adding a new API endpoint
1. Add route in `backend/app/api/routes/`
2. Register in `backend/app/api/main.py`
3. Add client method in `frontend/lib/api.ts`
