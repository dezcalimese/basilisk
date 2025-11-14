# Basilisk CLI 🐍⚡

Beautiful terminal interface for Bitcoin hourly contract trading on Kalshi.

## Features

✅ **Real-time Signal Display** - Live BTC hourly contract data
✅ **Color-Coded EV** - Quick visual scanning of opportunities
✅ **Auto-Refresh** - Configurable refresh intervals (default: 30s)
✅ **Connection Status** - Visual indicators for backend health
✅ **Keyboard Controls** - Fast navigation and manual refresh
✅ **Near-Expiry Alerts** - Highlights contracts expiring soon

## Prerequisites

- Rust 1.70+ installed
- Basilisk backend running at `http://localhost:8000`

## Installation

### From Source

```bash
cd cli
cargo build --release
```

The binary will be in `target/release/basilisk-cli`

### Install Globally

```bash
cargo install --path .
```

Now you can run `basilisk-cli` from anywhere!

## Usage

### Basic Usage

```bash
# Run with default settings (connects to localhost:8000)
./target/release/basilisk-cli

# Or if installed globally
basilisk-cli
```

### Custom Configuration

```bash
# Connect to remote backend
basilisk-cli --api-url http://192.168.1.100:8000

# Faster refresh for active trading (every 15 seconds)
basilisk-cli --refresh 15

# Slower refresh to save bandwidth
basilisk-cli --refresh 60
```

## Keyboard Controls

| Key | Action |
|-----|--------|
| `q` | Quit application |
| `r` | Manual refresh (fetch latest data) |
| `↑` | Scroll up (future feature) |
| `↓` | Scroll down (future feature) |

## UI Layout

```
┌─ BASILISK ─────────────────────────────────────────────────────────────┐
│ ● Live  │  BTC: $94,850 (+1.2%)  │  Update: 8s  │  Next: 22s           │
└────────────────────────────────────────────────────────────────────────┘

┌─ ACTIVE SIGNALS (Bitcoin Hourly Contracts) ────────────────────────────┐
│ Strike    Expiry        Left   Current   Dist         Imp%   Mod%    EV│
├────────────────────────────────────────────────────────────────────────┤
│ $95,000   02:00 PM UTC  45m    $94,850   -$150 (-0.16%) 45.0%  52.3% +5│
│ $94,500   02:00 PM UTC  45m    $94,850   +$350 (+0.37%) 72.0%  65.4% +3│
│ $95,500   03:00 PM UTC  1h45m  $94,850   -$650 (-0.68%) 28.0%  32.5% +3│
└────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────┐
│ [r] Refresh  [q] Quit  [↑↓] Navigate                                  │
└────────────────────────────────────────────────────────────────────────┘
```

## Color Coding

The CLI uses color to help you quickly identify trading opportunities:

- **Bright Green** - EV ≥ 5.0% (excellent opportunities)
- **Green** - EV 3.0-5.0% (good opportunities)
- **Yellow** - EV 1.0-3.0% (marginal opportunities)
- **Gray** - EV < 1.0% (low value)

### Additional Colors

- **Red text** - Current BTC price below strike (likely NO outcome)
- **Green text** - Current BTC price above strike (likely YES outcome)
- **Orange highlight** - Contract expiring in < 10 minutes

## Connection States

- **● Live** (Green) - Connected to backend, receiving data
- **● Connecting...** (Yellow) - Attempting to connect
- **● Offline** (Red) - Backend unreachable

## Data Columns

| Column | Description |
|--------|-------------|
| **Strike** | Strike price for the contract ($95,000) |
| **Expiry** | Expiry time in UTC (02:00 PM UTC) |
| **Left** | Time remaining until expiry (45m) |
| **Current** | Current BTC spot price ($94,850) |
| **Dist** | Distance from strike (+$350 / +0.37%) |
| **Imp%** | Implied probability from market prices (45.0%) |
| **Mod%** | Model's predicted probability (52.3%) |
| **EV** | Expected value after fees (+5.2%) |
| **Action** | Recommended trade (BUY YES / BUY NO / HOLD) |

## Troubleshooting

### "Failed to fetch data: Connection refused"

The backend isn't running. Start it:

```bash
cd ../backend
uv run python main.py
```

### "Failed to fetch data: 404 Not Found"

The `/api/v1/current` endpoint doesn't exist yet. This is expected if you haven't implemented it in the backend.

### Terminal rendering issues

Try resizing your terminal window or run:

```bash
reset
```

### Slow refresh rate

Reduce the refresh interval:

```bash
basilisk-cli --refresh 10
```

## Development

```bash
# Run in development mode
cargo run

# Run with custom arguments
cargo run -- --api-url http://localhost:8000 --refresh 15

# Run tests (when implemented)
cargo test

# Check code
cargo clippy

# Format code
cargo fmt
```

## Future Enhancements (Phase 2+)

- [ ] Table navigation (up/down arrows)
- [ ] Sorting (by EV, expiry, distance)
- [ ] Filtering (min EV threshold)
- [ ] Contract detail modal (Enter key)
- [ ] Multiple views (Stats, History, Logs)
- [ ] Configuration file support
- [ ] BTC volatility indicators
- [ ] Trade logging

## Architecture

```
cli/
├─ src/
│  ├─ main.rs          # Entry point, terminal setup
│  ├─ app.rs           # App state & event loop
│  ├─ api/
│  │  ├─ client.rs     # HTTP client for backend
│  │  └─ models.rs     # API response structs
│  └─ ui/
│     ├─ signals.rs    # Signals table view
│     └─ mod.rs        # UI module exports
└─ Cargo.toml
```

## Dependencies

- `ratatui` - TUI framework
- `crossterm` - Terminal control
- `tokio` - Async runtime
- `reqwest` - HTTP client
- `serde` - JSON serialization
- `chrono` - Date/time handling
- `clap` - CLI argument parsing

## License

MIT

---

**Basilisk CLI** - Real-time Bitcoin hourly contract signals in your terminal 🚀
