# Basilisk 🐍

> *"See the true odds"*

Basilisk is a single-user trading analytics dashboard for Kalshi digital options contracts. Named after the mythological creature whose gaze could see through to the truth, Basilisk reveals the true probabilities hidden in market prices.

## Overview

Basilisk ingests contract data from Kalshi, computes probabilistic models to identify positive expected value (EV) trades, and displays actionable insights through an interactive dashboard.

## Architecture

```
basilisk/
├── backend/          # FastAPI backend (Python)
│   ├── app/
│   │   ├── api/      # API routes and endpoints
│   │   ├── models/   # Probabilistic models
│   │   ├── data/     # Data ingestion clients
│   │   ├── db/       # Database models and operations
│   │   └── core/     # Core configuration
│   └── pyproject.toml
│
├── frontend/         # Next.js frontend (TypeScript)
│   ├── app/          # Next.js App Router
│   ├── components/   # React components
│   ├── lib/          # Utilities and API client
│   └── package.json
│
└── cli/              # Rust CLI (Ratatui TUI)
    ├── src/
    │   ├── api/      # Backend API client
    │   ├── ui/       # Terminal UI views
    │   ├── app.rs    # App state & event loop
    │   └── main.rs   # Entry point
    └── Cargo.toml
```

## Tech Stack

### Backend
- **FastAPI** - Modern async Python web framework
- **SQLAlchemy** - Database ORM with async support
- **SQLite** - Local database (migrate to PostgreSQL later)
- **uv** - Fast Python package manager
- **ruff** - Lightning-fast linter and formatter
- **Pydantic** - Data validation and settings management

### Frontend
- **Next.js 14** - React framework with App Router
- **Bun** - Fast JavaScript runtime and package manager
- **TypeScript** - Type-safe JavaScript
- **Tailwind CSS** - Utility-first CSS framework
- **shadcn/ui** - Beautiful, accessible UI components
- **Recharts** - Composable charting library

### CLI (NEW!)
- **Rust** - Fast, safe systems programming language
- **Ratatui** - Terminal user interface framework
- **Crossterm** - Cross-platform terminal manipulation
- **Tokio** - Async runtime for Rust
- **Reqwest** - HTTP client for API calls

## Quick Start

### Prerequisites

- Python 3.12+ with [uv](https://docs.astral.sh/uv/) installed
- [Bun](https://bun.sh/) installed
- Kalshi API credentials (optional for development)

### Backend Setup

```bash
cd backend

# Install dependencies
uv sync --all-extras

# Copy environment variables
cp .env.example .env

# Configure Kalshi API credentials (optional for development)
# See KALSHI_SETUP.md for detailed instructions
# nano .env

# Run the server
uv run python main.py
```

The API will be available at `http://localhost:8000`

**Note**: For Kalshi API integration, see [KALSHI_SETUP.md](KALSHI_SETUP.md) for detailed setup instructions.

### Frontend Setup

```bash
cd frontend

# Install dependencies
bun install

# Copy environment variables
cp .env.local.example .env.local

# Run the development server
bun dev
```

The dashboard will be available at `http://localhost:3000`

### CLI Setup (Optional - Bitcoin Hourly Contracts)

```bash
cd cli

# Build the CLI
cargo build --release

# Run the CLI
./target/release/basilisk-cli

# Or install globally
cargo install --path .
basilisk-cli
```

The CLI provides a real-time terminal interface for Bitcoin hourly contracts. See [cli/README.md](cli/README.md) for details.

## Development Workflow

### Backend Development

```bash
cd backend

# Run the server with hot reload
uv run python main.py

# Run linter
uv run ruff check .

# Format code
uv run ruff format .

# Run type checking
uv run mypy app/

# Run tests (when implemented)
uv run pytest
```

### Frontend Development

```bash
cd frontend

# Run development server
bun dev

# Build for production
bun run build

# Run production server
bun start

# Run linter
bun run lint
```

## API Endpoints

### Health Check
- `GET /api/v1/health` - Service health status

### Trade Signals
- `GET /api/v1/signals/current` - Get current active trade signals
- `GET /api/v1/signals/{signal_id}` - Get specific signal by ID

## Features

### Current
- ✅ Backend API with FastAPI
- ✅ Database models for contracts, prices, predictions
- ✅ Frontend dashboard with Next.js
- ✅ Real-time signal display
- ✅ Metric cards for key statistics
- ✅ Modern UI with shadcn/ui components

### Planned
- ⏳ Kalshi API integration
- ⏳ Bitcoin price ingestion
- ⏳ Probabilistic model implementation
- ⏳ Expected value calculation
- ⏳ Scheduled data fetching (hourly)
- ⏳ Historical charts (implied vs true probability)
- ⏳ Browser notifications for high-EV signals
- ⏳ Trade simulation/backtesting
- ⏳ Model calibration metrics

## Configuration

### Backend Configuration

Edit `backend/.env`:

```env
# Kalshi API
KALSHI_API_KEY=your_key
KALSHI_API_SECRET=your_secret

# Model parameters
MODEL_EV_THRESHOLD=0.02          # 2% minimum EV for signals
MODEL_CONFIDENCE_THRESHOLD=0.60  # 60% minimum confidence

# Trading fees
KALSHI_FEE_RATE=0.07            # 7% fee on profits
```

### Frontend Configuration

Edit `frontend/.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

## Project Philosophy

1. **Simple First** - Start with minimal features, add complexity only when needed
2. **Type Safety** - Leverage TypeScript and Python type hints throughout
3. **Fast Feedback** - Use fast tools (uv, bun, ruff) for rapid iteration
4. **Clear Data Flow** - Data flows from Kalshi → Model → Database → API → Dashboard
5. **Single User** - Optimized for personal use, no auth complexity

## Contributing

This is a personal project, but suggestions and issues are welcome!

## License

MIT

---

**Basilisk** - Revealing the hidden edge in prediction markets
