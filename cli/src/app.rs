use anyhow::Result;
use crossterm::event::{self, Event, KeyCode, KeyEventKind};
use eventsource_client as es;
use futures::StreamExt;
use ratatui::{
    layout::{Constraint, Direction, Layout, Rect},
    style::{Color, Modifier, Style},
    text::{Line, Span},
    widgets::{Block, Borders, Paragraph, Sparkline},
    Frame,
};
use std::time::{Duration, Instant};
use tokio::sync::mpsc;

use crate::api::{ApiClient, Contract, VolatilityData};
use crate::events::AppEvent;
use crate::ui::SignalsView;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ConnectionState {
    Connected,
    Disconnected,
    Connecting,
}

pub struct App {
    api_client: ApiClient,
    api_url: String,
    signals_view: SignalsView,
    contracts: Vec<Contract>,
    current_btc_price: f64,
    connection_state: ConnectionState,
    last_update: Option<Instant>,
    refresh_interval_secs: u64,
    should_quit: bool,
    error_message: Option<String>,
    show_help: bool,
    help_scroll: u16,
    volatility_data: VolatilityData,
    // Sparkline data (last 50 data points for visualization)
    btc_price_history: Vec<u64>,        // BTC price history for sparkline
    realized_vol_history: Vec<u64>,     // RV history for sparkline
    implied_vol_history: Vec<u64>,      // IV history for sparkline
}

impl App {
    pub fn new(api_url: String, refresh_interval_secs: u64) -> Result<Self> {
        let api_client = ApiClient::new(api_url.clone(), 10)?;

        Ok(Self {
            api_client,
            api_url,
            signals_view: SignalsView::new(),
            contracts: Vec::new(),
            current_btc_price: 0.0,
            connection_state: ConnectionState::Connecting,
            last_update: None,
            refresh_interval_secs,
            should_quit: false,
            error_message: None,
            show_help: false,
            help_scroll: 0,
            volatility_data: VolatilityData::default(),
            btc_price_history: Vec::new(),
            realized_vol_history: Vec::new(),
            implied_vol_history: Vec::new(),
        })
    }

    pub async fn run(&mut self, terminal: &mut ratatui::Terminal<impl ratatui::backend::Backend>) -> Result<()> {
        // Initial data fetch (fallback if SSE fails)
        self.fetch_data().await;

        // Create event channel for SSE messages
        let (event_tx, mut event_rx) = mpsc::unbounded_channel::<AppEvent>();

        // Spawn SSE background task
        Self::spawn_sse_task(self.api_url.clone(), event_tx);

        // Track polling fallback (every 30 seconds in case SSE fails)
        let mut last_fallback_update = Instant::now();
        let fallback_interval = Duration::from_secs(30);

        loop {
            // Draw UI
            terminal.draw(|frame| self.render(frame))?;

            // Process all pending SSE events (non-blocking)
            while let Ok(event) = event_rx.try_recv() {
                self.handle_sse_event(event);
            }

            // Handle keyboard events with short timeout
            let timeout = Duration::from_millis(50);
            if event::poll(timeout)? {
                if let Event::Key(key) = event::read()? {
                    if key.kind == KeyEventKind::Press {
                        self.handle_key(key.code).await;
                    }
                }
            }

            // Fallback polling: Only if SSE hasn't updated in 30 seconds
            if self.connection_state == ConnectionState::Disconnected
                && last_fallback_update.elapsed() >= fallback_interval
            {
                self.fetch_data().await;
                last_fallback_update = Instant::now();
            }

            if self.should_quit {
                break;
            }
        }

        Ok(())
    }

    async fn handle_key(&mut self, key: KeyCode) {
        match key {
            KeyCode::Char('q') | KeyCode::Char('Q') => {
                self.should_quit = true;
            }
            KeyCode::Char('r') | KeyCode::Char('R') => {
                self.fetch_data().await;
            }
            KeyCode::Char('h') | KeyCode::Char('H') | KeyCode::Char('?') => {
                self.show_help = !self.show_help;
                self.help_scroll = 0; // Reset scroll when toggling help
            }
            KeyCode::Esc => {
                self.show_help = false;
                self.help_scroll = 0;
            }
            KeyCode::Up => {
                if self.show_help {
                    self.help_scroll = self.help_scroll.saturating_sub(1);
                } else {
                    // TODO: Implement table navigation
                }
            }
            KeyCode::Down => {
                if self.show_help {
                    self.help_scroll = self.help_scroll.saturating_add(1);
                } else {
                    // TODO: Implement table navigation
                }
            }
            _ => {}
        }
    }

    #[allow(dead_code)]
    async fn fetch_btc_price(&mut self) {
        // Lightweight BTC price update (doesn't change connection state)
        match self.api_client.get_btc_price().await {
            Ok(response) => {
                self.current_btc_price = response.price;
                // Update BTC price in all contracts for real-time distance calculations
                for contract in &mut self.contracts {
                    contract.current_btc_price = Some(response.price);
                }
            }
            Err(_) => {
                // Silently fail - don't change connection state for BTC price failures
                // Full data fetch will update connection state
            }
        }
    }

    async fn fetch_data(&mut self) {
        self.connection_state = ConnectionState::Connecting;
        self.error_message = None;

        match self.api_client.get_current_signals().await {
            Ok(response) => {
                self.contracts = response.contracts;
                self.volatility_data = response.volatility;

                if let Some(first_contract) = self.contracts.first() {
                    if let Some(price) = first_contract.current_btc_price {
                        self.current_btc_price = price;
                        // Update BTC price history for sparkline (keep last 50 points)
                        Self::update_sparkline_history(&mut self.btc_price_history, price as u64);
                    }
                }

                // Update volatility history for sparklines
                Self::update_sparkline_history(&mut self.realized_vol_history, (self.volatility_data.realized_vol * 100.0) as u64);
                Self::update_sparkline_history(&mut self.implied_vol_history, (self.volatility_data.implied_vol * 100.0) as u64);

                self.connection_state = ConnectionState::Connected;
                self.last_update = Some(Instant::now());
            }
            Err(e) => {
                self.connection_state = ConnectionState::Disconnected;
                self.error_message = Some(format!("Failed to fetch data: {}", e));
            }
        }
    }

    /// Update sparkline history, keeping last 50 data points
    fn update_sparkline_history(history: &mut Vec<u64>, new_value: u64) {
        history.push(new_value);
        if history.len() > 50 {
            history.remove(0);
        }
    }

    fn render(&mut self, frame: &mut Frame) {
        let chunks = Layout::default()
            .direction(Direction::Vertical)
            .constraints([
                Constraint::Length(3), // Status bar
                Constraint::Length(3), // Volatility regime banner
                Constraint::Min(0),    // Main content
                Constraint::Length(3), // Footer
            ])
            .split(frame.size());

        // Render status bar
        self.render_status_bar(frame, chunks[0]);

        // Render volatility regime banner
        self.render_vol_regime(frame, chunks[1]);

        // Render signals table
        self.signals_view.render(frame, chunks[2], &self.contracts);

        // Render footer
        self.render_footer(frame, chunks[3]);

        // Render help overlay if active
        if self.show_help {
            self.render_help(frame);
        }
    }

    fn render_status_bar(&self, frame: &mut Frame, area: Rect) {
        // Split status bar: left for info, right for BTC price sparkline
        let chunks = Layout::default()
            .direction(Direction::Horizontal)
            .constraints([
                Constraint::Percentage(70),  // Status info
                Constraint::Percentage(30),  // BTC sparkline
            ])
            .split(area);

        // Left side: Connection status and info
        let connection_indicator = match self.connection_state {
            ConnectionState::Connected => Span::styled("● Live", Style::default().fg(Color::Green)),
            ConnectionState::Disconnected => Span::styled("● Offline", Style::default().fg(Color::Red)),
            ConnectionState::Connecting => Span::styled("● Connecting...", Style::default().fg(Color::Yellow)),
        };

        let btc_price = if self.current_btc_price > 0.0 {
            format!("BTC: ${:.0}", self.current_btc_price)
        } else {
            "BTC: --".to_string()
        };

        let update_time = if let Some(last) = self.last_update {
            let elapsed = last.elapsed().as_secs();
            format!("Update: {}s", elapsed)
        } else {
            "Update: --".to_string()
        };

        let next_refresh = if let Some(last) = self.last_update {
            let elapsed = last.elapsed().as_secs();
            let remaining = self.refresh_interval_secs.saturating_sub(elapsed);
            format!("Next: {}s", remaining)
        } else {
            "Next: --".to_string()
        };

        let line = Line::from(vec![
            connection_indicator,
            Span::raw("  │  "),
            Span::styled(btc_price, Style::default().fg(Color::Cyan).add_modifier(Modifier::BOLD)),
            Span::raw("  │  "),
            Span::raw(update_time),
            Span::raw("  │  "),
            Span::raw(next_refresh),
        ]);

        let paragraph = Paragraph::new(line)
            .block(Block::default().borders(Borders::ALL).title(" BASILISK "));

        frame.render_widget(paragraph, chunks[0]);

        // Right side: BTC price sparkline
        if !self.btc_price_history.is_empty() {
            let sparkline = Sparkline::default()
                .block(Block::default().borders(Borders::ALL).title(" BTC Trend "))
                .data(&self.btc_price_history)
                .style(Style::default().fg(Color::Cyan));

            frame.render_widget(sparkline, chunks[1]);
        }
    }

    fn render_footer(&self, frame: &mut Frame, area: Rect) {
        let footer_text = if let Some(ref error) = self.error_message {
            Line::from(vec![
                Span::styled("ERROR: ", Style::default().fg(Color::Red).add_modifier(Modifier::BOLD)),
                Span::styled(error, Style::default().fg(Color::Red)),
            ])
        } else {
            Line::from(vec![
                Span::styled("[r] ", Style::default().fg(Color::Yellow)),
                Span::raw("Refresh  "),
                Span::styled("[h/?] ", Style::default().fg(Color::Yellow)),
                Span::raw("Help  "),
                Span::styled("[q] ", Style::default().fg(Color::Yellow)),
                Span::raw("Quit  "),
                Span::styled("[↑↓] ", Style::default().fg(Color::Yellow)),
                Span::raw("Navigate"),
            ])
        };

        let paragraph = Paragraph::new(footer_text)
            .block(Block::default().borders(Borders::ALL));

        frame.render_widget(paragraph, area);
    }

    fn render_vol_regime(&self, frame: &mut Frame, area: Rect) {
        // Split volatility banner: left for info, middle for RV sparkline, right for IV sparkline
        let chunks = Layout::default()
            .direction(Direction::Horizontal)
            .constraints([
                Constraint::Percentage(50),  // Volatility info
                Constraint::Percentage(25),  // RV sparkline
                Constraint::Percentage(25),  // IV sparkline
            ])
            .split(area);

        // Left side: Volatility regime and stats
        let (regime_color, regime_text) = if self.volatility_data.regime.is_empty() {
            (Color::Gray, "UNKNOWN")
        } else {
            match self.volatility_data.regime.as_str() {
                "CALM" => (Color::Green, "CALM"),
                "NORMAL" => (Color::Yellow, "NORMAL"),
                "ELEVATED" => (Color::LightRed, "ELEVATED"),
                "CRISIS" => (Color::Red, "CRISIS"),
                _ => (Color::White, self.volatility_data.regime.as_str()),
            }
        };

        let rv_pct = format!("{:.0}%", self.volatility_data.realized_vol * 100.0);
        let iv_pct = format!("{:.0}%", self.volatility_data.implied_vol * 100.0);
        let premium_pct = format!("{:.1}%", self.volatility_data.vol_premium_pct * 100.0);

        let text = vec![
            Line::from(vec![
                Span::raw("Regime: "),
                Span::styled(regime_text, Style::default().fg(regime_color).add_modifier(Modifier::BOLD)),
                Span::raw(" │ "),
                Span::raw(format!("RV: {}", rv_pct)),
                Span::raw(" │ "),
                Span::raw(format!("IV: {}", iv_pct)),
                Span::raw(" │ "),
                Span::raw(format!("Premium: {}", premium_pct)),
            ]),
        ];

        let paragraph = Paragraph::new(text)
            .block(Block::default().borders(Borders::ALL).title(" VOLATILITY "))
            .alignment(ratatui::layout::Alignment::Center);

        frame.render_widget(paragraph, chunks[0]);

        // Middle: RV sparkline
        if !self.realized_vol_history.is_empty() {
            let rv_sparkline = Sparkline::default()
                .block(Block::default().borders(Borders::ALL).title(" RV Trend "))
                .data(&self.realized_vol_history)
                .style(Style::default().fg(Color::LightRed));

            frame.render_widget(rv_sparkline, chunks[1]);
        }

        // Right: IV sparkline
        if !self.implied_vol_history.is_empty() {
            let iv_sparkline = Sparkline::default()
                .block(Block::default().borders(Borders::ALL).title(" IV Trend "))
                .data(&self.implied_vol_history)
                .style(Style::default().fg(Color::LightBlue));

            frame.render_widget(iv_sparkline, chunks[2]);
        }
    }

    fn render_help(&self, frame: &mut Frame) {
        use ratatui::widgets::{Clear, Wrap};

        // Create centered popup area (80% width, 90% height)
        let area = frame.size();
        let popup_width = (area.width * 80) / 100;
        let popup_height = (area.height * 90) / 100;
        let popup_x = (area.width - popup_width) / 2;
        let popup_y = (area.height - popup_height) / 2;

        let popup_area = Rect {
            x: popup_x,
            y: popup_y,
            width: popup_width,
            height: popup_height,
        };

        // Clear the area
        frame.render_widget(Clear, popup_area);

        // Help content
        let help_text = vec![
            Line::from(vec![
                Span::styled("HELP & METRICS GUIDE", Style::default().fg(Color::Cyan).add_modifier(Modifier::BOLD)),
            ]),
            Line::from(""),
            Line::from(vec![
                Span::styled("═".repeat(popup_width as usize - 4), Style::default().fg(Color::DarkGray)),
            ]),
            Line::from(""),
            Line::from(vec![
                Span::styled("COLUMN EXPLANATIONS", Style::default().fg(Color::Yellow).add_modifier(Modifier::BOLD)),
            ]),
            Line::from(""),
            Line::from(vec![
                Span::styled("Imp% ", Style::default().fg(Color::Green).add_modifier(Modifier::BOLD)),
                Span::raw("(Implied Probability)"),
            ]),
            Line::from("  Market's implied probability of the contract winning"),
            Line::from(vec![
                Span::raw("  "),
                Span::styled("↑ Higher", Style::default().fg(Color::Green)),
                Span::raw(" = Market thinks it's more likely to happen"),
            ]),
            Line::from(vec![
                Span::raw("  "),
                Span::styled("↓ Lower", Style::default().fg(Color::Red)),
                Span::raw("  = Market thinks it's less likely to happen"),
            ]),
            Line::from(""),
            Line::from(vec![
                Span::styled("Mod% ", Style::default().fg(Color::Green).add_modifier(Modifier::BOLD)),
                Span::raw("(Model Probability)"),
            ]),
            Line::from("  Our model's calculated probability of the contract winning"),
            Line::from(vec![
                Span::raw("  "),
                Span::styled("↑ Higher", Style::default().fg(Color::Green)),
                Span::raw(" = Our model thinks it's more likely"),
            ]),
            Line::from(vec![
                Span::raw("  "),
                Span::styled("↓ Lower", Style::default().fg(Color::Red)),
                Span::raw("  = Our model thinks it's less likely"),
            ]),
            Line::from(""),
            Line::from(vec![
                Span::styled("EV ", Style::default().fg(Color::Green).add_modifier(Modifier::BOLD)),
                Span::raw("(Expected Value)"),
            ]),
            Line::from("  The edge we have over the market"),
            Line::from(vec![
                Span::raw("  "),
                Span::styled("↑ Higher Positive EV", Style::default().fg(Color::Green)),
                Span::raw(" = Better trading opportunity"),
            ]),
            Line::from(vec![
                Span::raw("  "),
                Span::styled("↓ Lower/Negative EV", Style::default().fg(Color::Red)),
                Span::raw(" = Worse trading opportunity"),
            ]),
            Line::from(vec![
                Span::raw("  "),
                Span::styled("KEY: ", Style::default().fg(Color::Cyan).add_modifier(Modifier::BOLD)),
                Span::raw("When Mod% > Imp%, you have positive EV (market underpricing)"),
            ]),
            Line::from(""),
            Line::from(vec![
                Span::styled("Action", Style::default().fg(Color::Green).add_modifier(Modifier::BOLD)),
            ]),
            Line::from("  Trading recommendation based on EV"),
            Line::from(vec![
                Span::raw("  "),
                Span::styled("BUY YES", Style::default().fg(Color::Green)),
                Span::raw(" = Market underpriced YES - buy the YES side"),
            ]),
            Line::from(vec![
                Span::raw("  "),
                Span::styled("BUY NO", Style::default().fg(Color::Red)),
                Span::raw("  = Market overpriced YES - buy the NO side"),
            ]),
            Line::from(vec![
                Span::raw("  "),
                Span::styled("HOLD", Style::default().fg(Color::Yellow)),
                Span::raw("    = No edge or insufficient edge to trade"),
            ]),
            Line::from(""),
            Line::from(vec![
                Span::styled("─".repeat(popup_width as usize - 4), Style::default().fg(Color::DarkGray)),
            ]),
            Line::from(""),
            Line::from(vec![
                Span::styled("KEYBOARD SHORTCUTS", Style::default().fg(Color::Yellow).add_modifier(Modifier::BOLD)),
            ]),
            Line::from(""),
            Line::from(vec![
                Span::styled("  [h/?] ", Style::default().fg(Color::Cyan)),
                Span::raw("Toggle this help screen"),
            ]),
            Line::from(vec![
                Span::styled("  [r]   ", Style::default().fg(Color::Cyan)),
                Span::raw("Refresh data manually"),
            ]),
            Line::from(vec![
                Span::styled("  [q]   ", Style::default().fg(Color::Cyan)),
                Span::raw("Quit application"),
            ]),
            Line::from(vec![
                Span::styled("  [ESC] ", Style::default().fg(Color::Cyan)),
                Span::raw("Close help screen"),
            ]),
            Line::from(""),
            Line::from(vec![
                Span::styled("─".repeat(popup_width as usize - 4), Style::default().fg(Color::DarkGray)),
            ]),
            Line::from(""),
            Line::from(vec![
                Span::styled("VOLATILITY BANNER METRICS", Style::default().fg(Color::Yellow).add_modifier(Modifier::BOLD)),
            ]),
            Line::from(""),
            Line::from(vec![
                Span::styled("Regime ", Style::default().fg(Color::Green).add_modifier(Modifier::BOLD)),
                Span::raw("(Market Volatility Classification)"),
            ]),
            Line::from("  Current volatility level based on realized movement"),
            Line::from(vec![
                Span::raw("  "),
                Span::styled("CALM", Style::default().fg(Color::Green)),
                Span::raw(" (<30% RV) = Very quiet market"),
            ]),
            Line::from(vec![
                Span::raw("  "),
                Span::styled("NORMAL", Style::default().fg(Color::Yellow)),
                Span::raw(" (30-50% RV) = Typical Bitcoin volatility"),
            ]),
            Line::from(vec![
                Span::raw("  "),
                Span::styled("ELEVATED", Style::default().fg(Color::LightRed)),
                Span::raw(" (50-75% RV) = Higher than normal movement"),
            ]),
            Line::from(vec![
                Span::raw("  "),
                Span::styled("CRISIS", Style::default().fg(Color::Red)),
                Span::raw(" (>75% RV) = Extreme volatility"),
            ]),
            Line::from(""),
            Line::from(vec![
                Span::styled("RV ", Style::default().fg(Color::Green).add_modifier(Modifier::BOLD)),
                Span::raw("(Realized Volatility)"),
            ]),
            Line::from("  How much BTC has ACTUALLY moved in the past 24 hours (annualized)"),
            Line::from(vec![
                Span::raw("  "),
                Span::styled("Example: ", Style::default().fg(Color::Cyan)),
                Span::raw("RV: 70% = BTC swinging ±70% annualized rate"),
            ]),
            Line::from(vec![
                Span::raw("  "),
                Span::styled("This is REALITY", Style::default().fg(Color::Yellow).add_modifier(Modifier::BOLD)),
                Span::raw(" - what's happening right now"),
            ]),
            Line::from(""),
            Line::from(vec![
                Span::styled("IV ", Style::default().fg(Color::Green).add_modifier(Modifier::BOLD)),
                Span::raw("(Implied Volatility from Deribit DVOL)"),
            ]),
            Line::from("  What the OPTIONS MARKET expects volatility to be (next 30 days)"),
            Line::from(vec![
                Span::raw("  "),
                Span::styled("Example: ", Style::default().fg(Color::Cyan)),
                Span::raw("IV: 49% = Traders pricing 49% annualized volatility"),
            ]),
            Line::from(vec![
                Span::raw("  "),
                Span::styled("This is EXPECTATION", Style::default().fg(Color::Yellow).add_modifier(Modifier::BOLD)),
                Span::raw(" - what market thinks will happen"),
            ]),
            Line::from(""),
            Line::from(vec![
                Span::styled("Premium ", Style::default().fg(Color::Green).add_modifier(Modifier::BOLD)),
                Span::raw("(Volatility Risk Premium)"),
            ]),
            Line::from("  Difference between expected (IV) vs actual (RV) volatility"),
            Line::from(vec![
                Span::raw("  "),
                Span::styled("Formula: ", Style::default().fg(Color::Cyan)),
                Span::raw("(IV - RV) / RV"),
            ]),
            Line::from(vec![
                Span::raw("  "),
                Span::styled("Positive ", Style::default().fg(Color::Green)),
                Span::raw("(IV > RV) = Vol is EXPENSIVE → Sell volatility"),
            ]),
            Line::from(vec![
                Span::raw("  "),
                Span::styled("Negative ", Style::default().fg(Color::Red)),
                Span::raw("(IV < RV) = Vol is CHEAP → Buy volatility"),
            ]),
            Line::from(vec![
                Span::raw("  "),
                Span::styled("Example: ", Style::default().fg(Color::Cyan)),
                Span::raw("Premium: -30% = Market underpricing risk by 30%!"),
            ]),
            Line::from(""),
            Line::from(vec![
                Span::styled("─".repeat(popup_width as usize - 4), Style::default().fg(Color::DarkGray)),
            ]),
            Line::from(""),
            Line::from(vec![
                Span::styled("HOW IT WORKS", Style::default().fg(Color::Yellow).add_modifier(Modifier::BOLD)),
            ]),
            Line::from(""),
            Line::from("  Basilisk analyzes Bitcoin hourly contracts on Kalshi to find mispriced"),
            Line::from("  opportunities. We use Deribit DVOL (professional options market volatility)"),
            Line::from("  with Black-Scholes to calculate the TRUE probability of each outcome."),
            Line::from(""),
            Line::from("  When Kalshi market prices differ from our DVOL-based probabilities,"),
            Line::from("  we've found an edge. Higher mispricing = better trading opportunity."),
            Line::from(""),
            Line::from(vec![
                Span::styled("─".repeat(popup_width as usize - 4), Style::default().fg(Color::DarkGray)),
            ]),
            Line::from(""),
            Line::from(vec![
                Span::styled("SETTLEMENT RULE", Style::default().fg(Color::Yellow).add_modifier(Modifier::BOLD)),
            ]),
            Line::from(""),
            Line::from("  • Settlement begins 1 minute before expiration"),
            Line::from("  • Final price = Average BTC price during the last 60 seconds"),
            Line::from("  • Contract resolves YES if final price is above strike, NO if below"),
            Line::from(""),
            Line::from(vec![
                Span::styled("Press [ESC] or [h] to close", Style::default().fg(Color::DarkGray)),
            ]),
        ];

        let paragraph = Paragraph::new(help_text)
            .block(
                Block::default()
                    .borders(Borders::ALL)
                    .border_style(Style::default().fg(Color::Cyan))
                    .title(" HELP (Use ↑↓ to scroll) ")
                    .title_style(Style::default().fg(Color::Cyan).add_modifier(Modifier::BOLD))
            )
            .wrap(Wrap { trim: false })
            .scroll((self.help_scroll, 0));

        frame.render_widget(paragraph, popup_area);
    }

    /// Spawn SSE background task that streams trading data
    fn spawn_sse_task(api_url: String, tx: mpsc::UnboundedSender<AppEvent>) {
        tokio::spawn(async move {
            loop {
                if let Err(e) = Self::run_sse_client(&api_url, &tx).await {
                    eprintln!("SSE error: {}, reconnecting in 5s...", e);
                    tx.send(AppEvent::SseError(e.to_string())).ok();
                    tokio::time::sleep(Duration::from_secs(5)).await;
                } else {
                    // Connection closed gracefully
                    tx.send(AppEvent::SseDisconnected).ok();
                    tokio::time::sleep(Duration::from_secs(2)).await;
                }
            }
        });
    }

    /// Run the SSE client connection
    async fn run_sse_client(
        api_url: &str,
        tx: &mpsc::UnboundedSender<AppEvent>,
    ) -> Result<()> {
        use es::Client;

        let stream_url = format!("{}/api/v1/stream/trading", api_url);

        let client = es::ClientBuilder::for_url(&stream_url)?
            .header("Accept", "text/event-stream")?
            .build();

        tx.send(AppEvent::SseConnected).ok();

        let mut stream = Box::pin(client.stream());

        while let Some(event) = stream.next().await {
            match event {
                Ok(es::SSE::Connected(_)) => {
                    // Connection established
                }
                Ok(es::SSE::Event(event)) => {
                    match event.event_type.as_str() {
                        "connected" => {
                            // Initial connection confirmation
                        }
                        "btc_price" => {
                            if let Ok(data) = serde_json::from_str::<serde_json::Value>(&event.data) {
                                if let (Some(price), Some(timestamp)) = (
                                    data.get("price").and_then(|v| v.as_f64()),
                                    data.get("timestamp").and_then(|v| v.as_str()),
                                ) {
                                    tx.send(AppEvent::BtcPriceUpdate {
                                        price,
                                        _timestamp: timestamp.to_string(),
                                    }).ok();
                                }
                            }
                        }
                        "contracts_update" => {
                            if let Ok(data) = serde_json::from_str::<serde_json::Value>(&event.data) {
                                if let (Some(contracts_json), Some(timestamp)) = (
                                    data.get("contracts"),
                                    data.get("timestamp").and_then(|v| v.as_str()),
                                ) {
                                    if let Ok(contracts) = serde_json::from_value::<Vec<Contract>>(contracts_json.clone()) {
                                        // Extract volatility data if present
                                        let volatility = data.get("volatility")
                                            .and_then(|v| serde_json::from_value::<VolatilityData>(v.clone()).ok())
                                            .unwrap_or_default();

                                        tx.send(AppEvent::ContractsUpdate {
                                            contracts,
                                            volatility,
                                            _timestamp: timestamp.to_string(),
                                        }).ok();
                                    }
                                }
                            }
                        }
                        _ => {}
                    }
                }
                Ok(es::SSE::Comment(_)) => {
                    // Ignore comments (used for keep-alive pings)
                }
                Err(e) => {
                    return Err(anyhow::anyhow!("SSE stream error: {}", e));
                }
            }
        }

        Ok(())
    }

    /// Handle SSE events
    fn handle_sse_event(&mut self, event: AppEvent) {
        match event {
            AppEvent::SseConnected => {
                self.connection_state = ConnectionState::Connected;
                self.error_message = None;
            }
            AppEvent::SseDisconnected => {
                self.connection_state = ConnectionState::Disconnected;
                self.error_message = Some("SSE disconnected, reconnecting...".to_string());
            }
            AppEvent::BtcPriceUpdate { price, .. } => {
                self.current_btc_price = price;
                // Update price in all contracts for real-time distance calculations
                for contract in &mut self.contracts {
                    contract.current_btc_price = Some(price);
                }
            }
            AppEvent::ContractsUpdate {
                contracts,
                volatility,
                ..
            } => {
                self.contracts = contracts;
                self.volatility_data = volatility;

                if let Some(first) = self.contracts.first() {
                    if let Some(price) = first.current_btc_price {
                        self.current_btc_price = price;
                    }
                }
                self.last_update = Some(Instant::now());
            }
            AppEvent::SseError(err) => {
                self.connection_state = ConnectionState::Disconnected;
                self.error_message = Some(format!("SSE Error: {}", err));
            }
            AppEvent::Keyboard(_key) => {
                // Handle in main loop
            }
            AppEvent::Tick | AppEvent::Quit => {
                // Handle in main loop
            }
        }
    }
}
