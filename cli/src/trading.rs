use anyhow::Result;
use clap::Subcommand;

use crate::api::client::ApiClient;
use crate::api::models::TradeRequest;

#[derive(Subcommand, Debug)]
pub enum TradingCommands {
    /// Execute a trade from a signal
    #[command(name = "trade")]
    Trade {
        /// Signal ID to trade
        signal_id: i32,
        /// Number of contracts
        #[arg(short, long, default_value = "1")]
        size: i32,
    },

    /// Execute a manual trade
    #[command(name = "manual")]
    Manual {
        /// Asset (BTC, ETH, XRP)
        #[arg(short, long)]
        asset: String,
        /// Direction (YES or NO)
        #[arg(short, long)]
        direction: String,
        /// Strike price
        #[arg(long)]
        strike: f64,
        /// Market ticker
        #[arg(short, long)]
        ticker: String,
        /// Number of contracts
        #[arg(long, default_value = "1")]
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

pub async fn handle_trading_command(cmd: TradingCommands, api_url: &str) -> Result<()> {
    let client = ApiClient::new(api_url.to_string(), 30)?;

    match cmd {
        TradingCommands::Trade { signal_id, size } => {
            println!("Executing trade from signal #{}...", signal_id);
            println!("Contracts: {}", size);
            println!();

            let result = client.execute_from_signal(signal_id, size).await?;

            if result.success {
                println!("✅ Trade Executed Successfully!");
                println!("   Trade ID: {}", result.trade_id.unwrap_or(0));
                println!("   Filled: {} contracts", result.filled);
                if let Some(price) = result.price {
                    println!("   Price: ${:.2}", price);
                }
                if let Some(cost) = result.cost {
                    println!("   Cost: ${:.2}", cost);
                }
            } else {
                println!("❌ Trade Failed!");
                if let Some(error) = result.error {
                    println!("   Error: {}", error);
                }
            }
        }

        TradingCommands::Manual {
            asset,
            direction,
            strike,
            ticker,
            size,
        } => {
            println!("Executing manual trade...");
            println!("Asset: {}, Direction: {}, Strike: ${:.0}", asset, direction, strike);
            println!("Ticker: {}, Size: {}", ticker, size);
            println!();

            let request = TradeRequest {
                ticker,
                asset: asset.to_uppercase(),
                direction: direction.to_uppercase(),
                strike,
                contracts: size,
                order_type: "market".to_string(),
                limit_price: None,
                signal_id: None,
            };

            let result = client.execute_trade(request).await?;

            if result.success {
                println!("✅ Trade Executed Successfully!");
                println!("   Trade ID: {}", result.trade_id.unwrap_or(0));
                println!("   Filled: {} contracts", result.filled);
                if let Some(price) = result.price {
                    println!("   Price: ${:.2}", price);
                }
                if let Some(cost) = result.cost {
                    println!("   Cost: ${:.2}", cost);
                }
            } else {
                println!("❌ Trade Failed!");
                if let Some(error) = result.error {
                    println!("   Error: {}", error);
                }
            }
        }

        TradingCommands::Positions => {
            let positions = client.get_positions().await?;

            if positions.is_empty() {
                println!("📂 No open positions.");
                return Ok(());
            }

            println!("📊 Open Positions ({}):", positions.len());
            println!("{}", "─".repeat(80));
            println!(
                "{:<6} {:<6} {:<4} {:<10} {:<6} {:<10} {:<10} {:<12}",
                "ID", "Asset", "Dir", "Strike", "Qty", "Entry", "Current", "P&L"
            );
            println!("{}", "─".repeat(80));

            for pos in positions {
                let pnl_color = match pos.unrealized_pnl {
                    Some(pnl) if pnl > 0.0 => "\x1b[32m", // Green
                    Some(pnl) if pnl < 0.0 => "\x1b[31m", // Red
                    _ => "\x1b[0m",
                };

                println!(
                    "{:<6} {:<6} {:<4} ${:<9.0} {:<6} ${:<9.2} {:<10} {}{}{}",
                    pos.trade_id,
                    pos.asset,
                    pos.direction,
                    pos.strike,
                    pos.contracts,
                    pos.entry_price,
                    pos.current_price_display(),
                    pnl_color,
                    pos.pnl_display(),
                    "\x1b[0m"
                );
            }
            println!("{}", "─".repeat(80));
        }

        TradingCommands::Close { position_id } => {
            println!("Closing position #{}...", position_id);
            println!();

            let result = client.close_position(position_id).await?;

            if result.success {
                println!("✅ Position Closed!");
                println!("   Filled: {} contracts", result.filled);
                if let Some(price) = result.price {
                    println!("   Exit Price: ${:.2}", price);
                }
                if let Some(pnl) = result.cost {
                    let pnl_color = if pnl >= 0.0 { "\x1b[32m" } else { "\x1b[31m" };
                    println!("   P&L: {}${:+.2}\x1b[0m", pnl_color, pnl);
                }
            } else {
                println!("❌ Close Failed!");
                if let Some(error) = result.error {
                    println!("   Error: {}", error);
                }
            }
        }

        TradingCommands::Pnl { period } => {
            let summary = client.get_pnl_summary(&period).await?;

            let period_label = match period.as_str() {
                "today" => "Today",
                "week" => "This Week",
                "all" => "All Time",
                _ => &period,
            };

            let pnl_color = if summary.net_pnl >= 0.0 {
                "\x1b[32m"
            } else {
                "\x1b[31m"
            };

            println!("💰 P&L Summary - {}", period_label);
            println!("{}", "─".repeat(40));
            println!(
                "   Net P&L:    {}${:+.2}\x1b[0m",
                pnl_color, summary.net_pnl
            );
            println!("   Fees:       ${:.2}", summary.total_fees);
            println!();
            println!("   Trades:     {}", summary.trade_count);
            println!("   Wins:       {} ✅", summary.wins);
            println!("   Losses:     {} ❌", summary.losses);
            println!("   Win Rate:   {:.0}%", summary.win_rate * 100.0);
            println!("{}", "─".repeat(40));
        }

        TradingCommands::History { limit } => {
            let history = client.get_trade_history(limit).await?;

            if history.is_empty() {
                println!("📂 No trade history.");
                return Ok(());
            }

            println!("📜 Trade History (last {}):", history.len());
            println!("{}", "─".repeat(90));
            println!(
                "{:<6} {:<6} {:<4} {:<10} {:<6} {:<10} {:<10} {:<10} {:<8}",
                "ID", "Asset", "Dir", "Strike", "Qty", "Entry", "Exit", "P&L", "Status"
            );
            println!("{}", "─".repeat(90));

            for trade in history {
                let pnl_color = match trade.pnl {
                    Some(pnl) if pnl > 0.0 => "\x1b[32m",
                    Some(pnl) if pnl < 0.0 => "\x1b[31m",
                    _ => "\x1b[0m",
                };

                let exit_price = trade
                    .exit_price
                    .map(|p| format!("${:.2}", p))
                    .unwrap_or_else(|| "N/A".to_string());

                println!(
                    "{:<6} {:<6} {:<4} ${:<9.0} {:<6} ${:<9.2} {:<10} {}{:<10}\x1b[0m {:<8}",
                    trade.id,
                    trade.asset,
                    trade.direction,
                    trade.strike,
                    trade.contracts,
                    trade.entry_price,
                    exit_price,
                    pnl_color,
                    trade.pnl_display(),
                    trade.status
                );
            }
            println!("{}", "─".repeat(90));
        }
    }

    Ok(())
}
