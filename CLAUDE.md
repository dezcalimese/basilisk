# CLAUDE.md - AI Assistant Context

This file provides context for AI assistants (Claude, etc.) working on the Basilisk codebase.

## Project Overview

Basilisk is a full-stack trading platform for prediction market binary options. It's a **hybrid platform** supporting both:
- **Kalshi** (centralized prediction markets)
- **DFlow** (Solana-based tokenized prediction markets)

It identifies mispriced contracts by comparing professional options market volatility (Deribit DVOL) against prediction market prices, calculates expected value (EV), and enables trade execution.

## Tech Stack

### Backend (`/backend`)
- **Framework**: FastAPI (Python 3.12)
- **Package Manager**: uv
- **Database**: SQLAlchemy with SQLite (dev) / PostgreSQL (prod)
- **Cache**: Redis for price caching and rate limiting
- **Auth**: Privy JWT verification (ES256), extracts Solana wallet addresses
- **Resilience**: pybreaker circuit breakers, tenacity retry logic
- **Key Libraries**: httpx (async HTTP), pydantic-settings, cryptography, pyjwt, ccxt

### Frontend (`/frontend`)
- **Framework**: Next.js 16.0.8 with React 19.2.0
- **Styling**: Tailwind CSS 4 with glassmorphism design
- **State**: Zustand 5.0.8 stores (`realtime-store`, `analytical-store`, `multi-asset-store`)
- **Auth**: Privy (`@privy-io/react-auth`) with embedded Solana/Ethereum wallets
- **Blockchain**: `@solana/web3.js` for wallet signing and transaction submission
- **Data**: Server-Sent Events (SSE) for real-time streaming
- **Icons**: Iconify with Tailwind plugin (`@iconify/tailwind4`)
- **Charts**: Lightweight-charts, Recharts, Plotly 3D
- **Testing**: Vitest 3.2.4 with React Testing Library

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
- `app/core/privy_auth.py` - Privy JWT verification, user extraction
- `app/core/circuit_breakers.py` - Circuit breakers for external APIs
- `app/data/kalshi_client.py` - Kalshi API client with RSA-PSS auth
- `app/data/dflow_client.py` - DFlow API client for Solana prediction markets
- `app/data/dflow_types.py` - DFlow data models (events, markets, quotes, swaps)
- `app/data/bitcoin_client.py` - Coinbase price fetching
- `app/data/solana_client.py` - SOL price client (Coinbase + Binance.US)
- `app/services/market_service.py` - Contract processing and signal generation
- `app/models/volatility.py` - Yang-Zhang volatility, HAR-RV forecasting
- `app/db/models.py` - User model with privy_user_id and wallet_address

### Frontend
- `app/page.tsx` - Main dashboard
- `providers/privy-provider.tsx` - Privy authentication configuration
- `components/auth/wallet-button.tsx` - Wallet connection with USDC balance
- `components/dashboard/signal-list.tsx` - Trade signals with modal integration
- `components/trading/trade-modal.tsx` - Trading modal with DFlow integration
- `hooks/use-trade-execution.ts` - Trade execution workflow (quote → sign → submit)
- `lib/stores/multi-asset-store.ts` - Central state for BTC, ETH, XRP, SOL
- `lib/dflow/client.ts` - DFlow API client
- `lib/sse-multi-asset-manager.ts` - Multi-asset SSE connection manager

## Architecture Patterns

### Data Flow
1. Backend SSE streams price/contract data every 3s
2. Frontend SSE manager maintains connections with auto-reconnect
3. Zustand stores aggregate data for components
4. REST API for order placement and historical data

### Authentication
- **User Auth**: Privy JWT → User table → Per-user trading
- **Kalshi API**: RSA-PSS signed requests (timestamp + method + path)
- **DFlow API**: API key authentication for Solana markets

### Trading Flow (DFlow/Solana)
1. Get quote from DFlow API (USDC → YES/NO tokens)
2. User signs Solana VersionedTransaction in browser
3. Submit signed transaction to DFlow
4. Poll order status until filled/failed

### Circuit Breakers
- **Coinbase**: fail_max=5, reset_timeout=60s
- **Binance**: fail_max=5, reset_timeout=60s
- **Kraken**: fail_max=5, reset_timeout=60s
- **Kalshi**: fail_max=3, reset_timeout=30s (more conservative)
- **DFlow**: fail_max=5, reset_timeout=60s

### Rate Limiting
- 100ms minimum between Kalshi API requests
- Exponential backoff on 429 errors (1s → 2s → 4s → ... → 30s max)

## Development Commands

```bash
# Backend
cd backend && uv run uvicorn app.api.main:app --reload

# Frontend
cd frontend && bun dev

# Type check frontend
cd frontend && npx tsc --noEmit

# Run tests
cd frontend && bun test
```

## Environment Variables

### Backend (`.env`)
```
# Kalshi
KALSHI_KEY_ID=your-key-id
KALSHI_PRIVATE_KEY_PATH=/path/to/private-key.pem
KALSHI_USE_DEMO=false

# Privy Authentication
PRIVY_APP_ID=your-privy-app-id
PRIVY_VERIFICATION_KEY=your-verification-key

# DFlow (Solana Prediction Markets)
DFLOW_API_KEY=your-dflow-api-key
DFLOW_BASE_URL=https://pond.dflow.net/api/v1

# Solana
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com

# Infrastructure
REDIS_URL=redis://localhost:6379
ENCRYPTION_KEY=your-encryption-key
```

### Frontend (`.env.local`)
```
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_PRIVY_APP_ID=your-privy-app-id
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
```

## Recent Additions

1. **Privy Auth**: JWT-based authentication with Solana/Ethereum wallet support
2. **DFlow Integration**: Solana-based prediction markets with client-side signing
3. **SOL Support**: Multi-asset support now includes BTC, ETH, XRP, SOL
4. **Circuit Breakers**: pybreaker for API resilience (implemented)
5. **Iconify Icons**: 277K+ icons via Tailwind CSS 4 plugin (completed)

## Upcoming Features

1. **Kraken Fallback**: Multi-exchange price source for reliability
2. **Advanced Order Types**: Stop-loss, take-profit automation
3. **Portfolio Analytics**: Cross-asset performance tracking

## Code Style

- **Python**: ruff for linting/formatting, type hints everywhere
- **TypeScript**: Strict mode, prefer `type` over `interface`
- **Components**: Functional components with hooks, no class components
- **State**: Zustand over Redux, minimal prop drilling

## Testing

- **Frontend**: Vitest with React Testing Library
- **Backend**: pytest (structure exists, tests TBD)

## Common Tasks

### Adding a new API endpoint
1. Add route in `backend/app/api/routes/`
2. Register in `backend/app/api/main.py`
3. Add client method in `frontend/lib/api.ts`

### Adding a new dashboard widget
1. Create component in `frontend/components/dashboard/`
2. Connect to store using `useRealtimeStore` or `useAnalyticalStore`
3. Add to dashboard grid in `app/page.tsx`

### Modifying Kalshi integration
1. Update `backend/app/data/kalshi_client.py`
2. Test with demo API first (`KALSHI_USE_DEMO=true`)
3. Rate limiting is automatic via `rate_limited_request()`
