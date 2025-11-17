use ratatui::{
    layout::{Constraint, Rect},
    style::{Color, Modifier, Style},
    widgets::{Block, Borders, Row, Table, TableState},
    Frame,
};

use crate::api::Contract;

pub struct SignalsView {
    pub table_state: TableState,
}

impl SignalsView {
    pub fn new() -> Self {
        Self {
            table_state: TableState::default(),
        }
    }

    pub fn render(&mut self, frame: &mut Frame, area: Rect, contracts: &[Contract]) {
        let header_cells = [
            "Strike",
            "Expiry",
            "Left",
            "Current",
            "Dist",
            "Imp%",
            "Mod%",
            "EV",
            "Action",
        ];

        let header = Row::new(header_cells)
            .style(Style::default().fg(Color::Yellow).add_modifier(Modifier::BOLD))
            .bottom_margin(1);

        let rows: Vec<Row> = contracts
            .iter()
            .map(|contract| {
                let _ev_color = get_ev_color(contract.expected_value);
                let _dist_color = if contract.is_above_strike() {
                    Color::Green
                } else {
                    Color::Red
                };

                let _time_left_color = if contract.is_near_expiry() {
                    Color::LightRed
                } else {
                    Color::White
                };

                Row::new(vec![
                    contract.strike_display(),
                    contract.expiry_display(),
                    contract.time_left_display(),
                    contract.btc_price_display(),
                    format_distance(contract.distance_dollars(), contract.distance_percent()),
                    format_opt_percent(contract.implied_probability),
                    format_opt_percent(contract.model_probability),
                    contract.ev_display(),
                    contract.signal_type.clone(),
                ])
                .style(Style::default().fg(Color::White))
                .height(1)
            })
            .collect();

        let widths = [
            Constraint::Length(10), // Strike
            Constraint::Length(22), // Expiry (now shows UTC + EST)
            Constraint::Length(8),  // Left
            Constraint::Length(10), // Current
            Constraint::Length(15), // Dist
            Constraint::Length(7),  // Imp%
            Constraint::Length(7),  // Mod%
            Constraint::Length(8),  // EV
            Constraint::Length(10), // Action
        ];

        let table = Table::new(rows, widths)
            .header(header)
            .block(
                Block::default()
                    .borders(Borders::ALL)
                    .title(" ACTIVE SIGNALS (Bitcoin Hourly Contracts) "),
            )
            .highlight_style(Style::default().bg(Color::DarkGray))
            .highlight_symbol("▶ ");

        frame.render_stateful_widget(table, area, &mut self.table_state);
    }
}

fn get_ev_color(ev: f64) -> Color {
    let ev_percent = ev * 100.0;
    if ev_percent >= 5.0 {
        Color::LightGreen
    } else if ev_percent >= 3.0 {
        Color::Green
    } else if ev_percent >= 1.0 {
        Color::Yellow
    } else {
        Color::Gray
    }
}

fn format_distance(dollars: f64, percent: f64) -> String {
    if dollars == 0.0 && percent == 0.0 {
        return "N/A".to_string();
    }
    let sign = if dollars >= 0.0 { "+" } else { "" };
    format!("{}{:.0} ({}{:.2}%)", sign, dollars, sign, percent)
}

fn format_opt_percent(prob: Option<f64>) -> String {
    match prob {
        Some(p) => format!("{:.1}%", p * 100.0),
        None => "N/A".to_string(),
    }
}
