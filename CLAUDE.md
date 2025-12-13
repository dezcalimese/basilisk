# CLAUDE.md - AI Assistant Context

This file provides context for AI assistants (Claude, etc.) working on the Basilisk codebase.

## Project Overview

Basilisk is a full-stack trading platform for Kalshi prediction market binary options. It identifies mispriced contracts by comparing professional options market volatility (Deribit DVOL) against prediction market prices.

## Tech Stack

### Backend (`/backend`)
- **Framework**: FastAPI (Python 3.12)
- **Package Manager**: uv
- **Database**: SQLAlchemy with SQLite (dev) / PostgreSQL (prod)
- **Cache**: Redis for price caching and rate limiting
- **Key Libraries**: httpx (async HTTP), pydantic-settings, cryptography (RSA auth)

### Frontend (`/frontend`)
- **Framework**: Next.js 16 with React 19
- **Styling**: Tailwind CSS 4 with glassmorphism design
- **State**: Zustand stores (`realtime-store`, `analytical-store`, `multi-asset-store`)
- **Data**: Server-Sent Events (SSE) for real-time streaming
- **Icons**: Iconify with Tailwind plugin (`@iconify/tailwind4`)
- **Charts**: Lightweight-charts for candlesticks

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
- `app/data/bitcoin_client.py` - Coinbase price fetching
- `app/services/market_service.py` - Contract processing and signal generation
- `app/models/volatility.py` - Yang-Zhang volatility, HAR-RV forecasting

### Frontend
- `app/page.tsx` - Main dashboard
- `components/dashboard/signal-list.tsx` - Trade signals with modal integration
- `components/trading/trade-modal.tsx` - Kalshi-style trading modal
- `lib/stores/realtime-store.ts` - SSE data management
- `lib/sse-multi-asset-manager.ts` - Multi-asset connection manager

## Architecture Patterns

### Data Flow
1. Backend SSE streams price/contract data every 3s
2. Frontend SSE manager maintains connections with auto-reconnect
3. Zustand stores aggregate data for components
4. REST API for order placement and historical data

### Authentication
- **Kalshi API**: RSA-PSS signed requests (timestamp + method + path)
- **User Auth** (planned): Encrypted storage of user API keys in database

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
KALSHI_KEY_ID=your-key-id
KALSHI_PRIVATE_KEY_PATH=/path/to/private-key.pem
KALSHI_USE_DEMO=false
REDIS_URL=redis://localhost:6379
ENCRYPTION_KEY=your-encryption-key
```

### Frontend (`.env.local`)
```
NEXT_PUBLIC_API_URL=http://localhost:8000
```

## Upcoming Features

1. **Kalshi User Auth**: Multi-user credential storage with encryption
2. **Circuit Breaker**: pybreaker for API resilience
3. **Kraken Fallback**: Multi-exchange price source for reliability
4. **Iconify Migration**: Replace Lucide icons with Iconify Tailwind plugin

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
