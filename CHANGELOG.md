# Changelog

All notable changes to Basilisk will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2025-11-17] - Branding Update

### Changed
- Updated slogan from "See the true odds" to "A serpent's eye for mispriced markets"
- Refreshed README feature list to reflect recent platform additions
- Updated frontend metadata and header with new slogan

## [2025-11-17] - Real-time Enhancements Merge

### Added
- **Phase 5: Comprehensive Test Suite**
  - Vitest testing framework integration
  - Unit tests for metric cards, indicators, and API clients
  - Test utilities and setup configuration
  - Tests for RSI, realtime store, and exchange API

- **Phase 4: 3D Volatility Surface**
  - Interactive 3D volatility surface visualization
  - Interpolated volatility calculations across strikes and times
  - Greeks profile component for visualizing option sensitivities
  - Probability ladder for distribution visualization

- **Phase 3: Technical Indicators & Multi-Exchange Support**
  - Technical indicators library (RSI, MACD, Stochastic Oscillator)
  - Multi-exchange candle proxy endpoint (`/api/v1/candles`)
  - Improved UI components and layouts
  - Enhanced connection status monitoring

- **Phase 2: Binary Options Greeks**
  - Delta, Gamma, Vega, Theta, Rho calculations for binary options
  - Greeks computation library with mathematical models
  - Integration with real-time data for dynamic Greeks updates

- **Phase 1: Real-time Data Streaming**
  - Server-Sent Events (SSE) implementation for live updates
  - Kraken API integration with WebSocket support
  - Binance WebSocket client for real-time price feeds
  - Real-time candlestick chart with live updates
  - Connection status indicators and error handling
  - Zustand stores for state management (realtime and analytical)
  - `useRealtimeData` hook for SSE consumption

## [2025-11-14] - Volatility Analysis

### Added
- DVOL-based volatility analysis
- Volatility regime detection (Low/Medium/High/Extreme)
- Bitcoin volatility regime detector Python script
- Comprehensive research documentation:
  - Bitcoin IV data sources research
  - Trading visualization research
  - Volatility quickstart guide

## [2025-11-13] - Initial Release

### Added
- **Backend (FastAPI/Python)**
  - FastAPI application structure
  - SQLAlchemy database models for contracts, prices, predictions
  - Core configuration and settings management
  - Health check endpoint
  - Trade signals API endpoints

- **Frontend (Next.js/TypeScript)**
  - Next.js 14 with App Router
  - shadcn/ui component library integration
  - Tailwind CSS styling
  - Basic dashboard layout
  - Signal list component
  - Metric cards for key statistics
  - Theme toggle (light/dark mode)
  - Help dialog

- **CLI (Rust/Ratatui)**
  - Terminal user interface for Bitcoin hourly contracts
  - Ratatui-based UI framework
  - Backend API client
  - Signal display view
  - Event loop and app state management

- **Documentation**
  - README with project overview and setup instructions
  - Architecture documentation
  - Kalshi API setup guide
  - CLI quickstart guide

- **Development Tools**
  - uv for Python package management
  - Bun for JavaScript runtime
  - ruff for Python linting and formatting
  - Git repository initialization

---

## Legend

- **Added** - New features
- **Changed** - Changes to existing functionality
- **Deprecated** - Soon-to-be removed features
- **Removed** - Removed features
- **Fixed** - Bug fixes
- **Security** - Vulnerability fixes
