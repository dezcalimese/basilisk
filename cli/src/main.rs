mod api;
mod app;
mod events;
mod trading;
mod ui;

use anyhow::Result;
use clap::{Parser, Subcommand};
use crossterm::{
    execute,
    terminal::{disable_raw_mode, enable_raw_mode, EnterAlternateScreen, LeaveAlternateScreen},
};
use ratatui::{backend::CrosstermBackend, Terminal};
use std::io;

use app::App;
use trading::{handle_trading_command, TradingCommands};

#[derive(Parser, Debug)]
#[command(name = "basilisk")]
#[command(about = "Terminal interface for Kalshi Bitcoin hourly contract trading", long_about = None)]
struct Args {
    /// Backend API URL
    #[arg(long, default_value = "http://localhost:8000", global = true)]
    api_url: String,

    /// Refresh interval in seconds (for TUI mode)
    #[arg(long, default_value = "30", global = true)]
    refresh: u64,

    #[command(subcommand)]
    command: Option<Commands>,
}

#[derive(Subcommand, Debug)]
enum Commands {
    /// Launch interactive TUI dashboard
    #[command(name = "dashboard", alias = "tui")]
    Dashboard,

    /// Execute a trade from a signal
    #[command(name = "trade")]
    Trade {
        /// Signal ID to trade
        signal_id: i32,
        /// Number of contracts
        #[arg(short, long, default_value = "1")]
        size: i32,
    },

    /// List open positions
    #[command(name = "positions")]
    Positions,

    /// Close a position
    #[command(name = "close")]
    Close {
        /// Position/trade ID to close
        position_id: i32,
    },

    /// Show P&L summary
    #[command(name = "pnl")]
    Pnl {
        /// Period: today, week, or all
        #[arg(default_value = "today")]
        period: String,
    },

    /// Show trade history
    #[command(name = "history")]
    History {
        /// Number of trades to show
        #[arg(short, long, default_value = "20")]
        limit: i32,
    },
}

#[tokio::main]
async fn main() -> Result<()> {
    let args = Args::parse();

    match args.command {
        // Trading commands (non-TUI)
        Some(Commands::Trade { signal_id, size }) => {
            handle_trading_command(
                TradingCommands::Trade { signal_id, size },
                &args.api_url,
            )
            .await?;
        }

        Some(Commands::Positions) => {
            handle_trading_command(TradingCommands::Positions, &args.api_url).await?;
        }

        Some(Commands::Close { position_id }) => {
            handle_trading_command(
                TradingCommands::Close { position_id },
                &args.api_url,
            )
            .await?;
        }

        Some(Commands::Pnl { period }) => {
            handle_trading_command(TradingCommands::Pnl { period }, &args.api_url).await?;
        }

        Some(Commands::History { limit }) => {
            handle_trading_command(TradingCommands::History { limit }, &args.api_url).await?;
        }

        // Dashboard/TUI mode (default)
        Some(Commands::Dashboard) | None => {
            run_tui(args.api_url, args.refresh).await?;
        }
    }

    Ok(())
}

async fn run_tui(api_url: String, refresh: u64) -> Result<()> {
    // Initialize terminal
    enable_raw_mode()?;
    let mut stdout = io::stdout();
    execute!(stdout, EnterAlternateScreen)?;
    let backend = CrosstermBackend::new(stdout);
    let mut terminal = Terminal::new(backend)?;

    // Create and run app
    let mut app = App::new(api_url, refresh)?;
    let res = app.run(&mut terminal).await;

    // Restore terminal
    disable_raw_mode()?;
    execute!(terminal.backend_mut(), LeaveAlternateScreen)?;
    terminal.show_cursor()?;

    if let Err(err) = res {
        eprintln!("Error: {:?}", err);
    }

    Ok(())
}
