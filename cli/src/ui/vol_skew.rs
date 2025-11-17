use ratatui::{
    layout::{Constraint, Direction, Layout, Rect},
    style::{Color, Modifier, Style},
    text::{Line, Span},
    widgets::{Block, Borders, Paragraph, Sparkline},
    Frame,
};

use crate::api::VolatilitySkew;

pub struct VolSkewView;

impl VolSkewView {
    pub fn new() -> Self {
        Self
    }

    pub fn render(&self, frame: &mut Frame, area: Rect, skew: &VolatilitySkew) {
        let chunks = Layout::default()
            .direction(Direction::Vertical)
            .constraints([
                Constraint::Length(3),   // Title
                Constraint::Length(10),  // Metrics cards
                Constraint::Min(0),      // Interpretation & visual
            ])
            .split(area);

        // Title
        self.render_title(frame, chunks[0]);

        // Metrics
        self.render_metrics(frame, chunks[1], skew);

        // Interpretation
        self.render_interpretation(frame, chunks[2], skew);
    }

    fn render_title(&self, frame: &mut Frame, area: Rect) {
        let title_text = Line::from(vec![
            Span::styled(
                "VOLATILITY SKEW ANALYSIS",
                Style::default()
                    .fg(Color::Cyan)
                    .add_modifier(Modifier::BOLD),
            ),
        ]);

        let paragraph = Paragraph::new(title_text)
            .block(Block::default().borders(Borders::ALL))
            .alignment(ratatui::layout::Alignment::Center);

        frame.render_widget(paragraph, area);
    }

    fn render_metrics(&self, frame: &mut Frame, area: Rect, skew: &VolatilitySkew) {
        let chunks = Layout::default()
            .direction(Direction::Horizontal)
            .constraints([
                Constraint::Percentage(25),
                Constraint::Percentage(25),
                Constraint::Percentage(25),
                Constraint::Percentage(25),
            ])
            .split(area);

        // ATM IV
        let atm_text = vec![
            Line::from(vec![Span::styled(
                "At-The-Money",
                Style::default()
                    .fg(Color::Gray)
                    .add_modifier(Modifier::BOLD),
            )]),
            Line::from(""),
            Line::from(vec![Span::styled(
                "Implied Vol:",
                Style::default().fg(Color::Gray),
            )]),
            Line::from(vec![Span::styled(
                format!("{:.1}%", skew.atm_iv * 100.0),
                Style::default()
                    .fg(Color::Yellow)
                    .add_modifier(Modifier::BOLD),
            )]),
            Line::from(""),
            Line::from(vec![Span::styled(
                "(Neutral strike)",
                Style::default().fg(Color::DarkGray),
            )]),
        ];

        let atm_para = Paragraph::new(atm_text)
            .block(Block::default().borders(Borders::ALL).title(" ATM "))
            .alignment(ratatui::layout::Alignment::Center);
        frame.render_widget(atm_para, chunks[0]);

        // OTM Call IV
        let call_text = vec![
            Line::from(vec![Span::styled(
                "Out-of-Money Call",
                Style::default()
                    .fg(Color::Gray)
                    .add_modifier(Modifier::BOLD),
            )]),
            Line::from(""),
            Line::from(vec![Span::styled(
                "Implied Vol:",
                Style::default().fg(Color::Gray),
            )]),
            Line::from(vec![Span::styled(
                format!("{:.1}%", skew.otm_call_iv * 100.0),
                Style::default()
                    .fg(Color::Green)
                    .add_modifier(Modifier::BOLD),
            )]),
            Line::from(""),
            Line::from(vec![Span::styled(
                "(Upside bets)",
                Style::default().fg(Color::DarkGray),
            )]),
        ];

        let call_para = Paragraph::new(call_text)
            .block(
                Block::default()
                    .borders(Borders::ALL)
                    .title(" OTM Calls "),
            )
            .alignment(ratatui::layout::Alignment::Center);
        frame.render_widget(call_para, chunks[1]);

        // OTM Put IV
        let put_text = vec![
            Line::from(vec![Span::styled(
                "Out-of-Money Put",
                Style::default()
                    .fg(Color::Gray)
                    .add_modifier(Modifier::BOLD),
            )]),
            Line::from(""),
            Line::from(vec![Span::styled(
                "Implied Vol:",
                Style::default().fg(Color::Gray),
            )]),
            Line::from(vec![Span::styled(
                format!("{:.1}%", skew.otm_put_iv * 100.0),
                Style::default()
                    .fg(Color::Red)
                    .add_modifier(Modifier::BOLD),
            )]),
            Line::from(""),
            Line::from(vec![Span::styled(
                "(Downside protection)",
                Style::default().fg(Color::DarkGray),
            )]),
        ];

        let put_para = Paragraph::new(put_text)
            .block(Block::default().borders(Borders::ALL).title(" OTM Puts "))
            .alignment(ratatui::layout::Alignment::Center);
        frame.render_widget(put_para, chunks[2]);

        // Skew metric
        let (skew_color, skew_arrow) = if skew.skew > 0.1 {
            (Color::Red, "↑ PUT SKEW")
        } else if skew.skew < -0.1 {
            (Color::Green, "↓ CALL SKEW")
        } else {
            (Color::Yellow, "→ NEUTRAL")
        };

        let skew_text = vec![
            Line::from(vec![Span::styled(
                "Skew Metric",
                Style::default()
                    .fg(Color::Gray)
                    .add_modifier(Modifier::BOLD),
            )]),
            Line::from(""),
            Line::from(vec![Span::styled(
                format!("{:+.3}", skew.skew),
                Style::default()
                    .fg(skew_color)
                    .add_modifier(Modifier::BOLD),
            )]),
            Line::from(""),
            Line::from(vec![Span::styled(
                skew_arrow,
                Style::default()
                    .fg(skew_color)
                    .add_modifier(Modifier::BOLD),
            )]),
        ];

        let skew_para = Paragraph::new(skew_text)
            .block(Block::default().borders(Borders::ALL).title(" Skew "))
            .alignment(ratatui::layout::Alignment::Center);
        frame.render_widget(skew_para, chunks[3]);
    }

    fn render_interpretation(&self, frame: &mut Frame, area: Rect, skew: &VolatilitySkew) {
        let chunks = Layout::default()
            .direction(Direction::Horizontal)
            .constraints([Constraint::Percentage(60), Constraint::Percentage(40)])
            .split(area);

        // Left: Interpretation text
        let (sentiment_color, sentiment_text, description) = if skew.skew > 0.1 {
            (
                Color::Red,
                "PUT SKEW - FEAR DOMINANT",
                vec![
                    "Market is pricing higher downside volatility than upside.",
                    "",
                    "This indicates:",
                    "  • Traders are buying downside protection",
                    "  • Fear of price drops > excitement for rallies",
                    "  • Defensive positioning in the market",
                    "",
                    "Strategy:",
                    "  • Consider selling overpriced puts",
                    "  • Look for cheap call opportunities",
                    "  • Market expects downside risk",
                ],
            )
        } else if skew.skew < -0.1 {
            (
                Color::Green,
                "CALL SKEW - GREED DOMINANT",
                vec![
                    "Market is pricing higher upside volatility than downside.",
                    "",
                    "This indicates:",
                    "  • Traders are chasing upside exposure",
                    "  • Optimism > fear in the market",
                    "  • Aggressive bullish positioning",
                    "",
                    "Strategy:",
                    "  • Consider selling overpriced calls",
                    "  • Look for cheap put opportunities",
                    "  • Market expects upside potential",
                ],
            )
        } else {
            (
                Color::Yellow,
                "NEUTRAL - BALANCED MARKET",
                vec![
                    "Market is pricing similar volatility for both directions.",
                    "",
                    "This indicates:",
                    "  • Balanced sentiment in the market",
                    "  • No strong directional bias",
                    "  • Symmetric risk expectations",
                    "",
                    "Strategy:",
                    "  • Look for directional mispricings",
                    "  • Monitor for skew development",
                    "  • Neutral volatility strategies",
                ],
            )
        };

        let mut interpretation_lines = vec![
            Line::from(vec![Span::styled(
                sentiment_text,
                Style::default()
                    .fg(sentiment_color)
                    .add_modifier(Modifier::BOLD),
            )]),
            Line::from(""),
            Line::from(vec![Span::styled(
                "─".repeat(area.width.saturating_sub(4) as usize),
                Style::default().fg(Color::DarkGray),
            )]),
            Line::from(""),
        ];

        for line in description {
            interpretation_lines.push(Line::from(line));
        }

        interpretation_lines.push(Line::from(""));
        interpretation_lines.push(Line::from(vec![
            Span::styled("Raw Interpretation: ", Style::default().fg(Color::Gray)),
            Span::styled(
                &skew.skew_interpretation,
                Style::default().fg(Color::Cyan),
            ),
        ]));

        let interp_para = Paragraph::new(interpretation_lines)
            .block(
                Block::default()
                    .borders(Borders::ALL)
                    .title(" Market Sentiment "),
            );
        frame.render_widget(interp_para, chunks[0]);

        // Right: Visual representation
        self.render_skew_visual(frame, chunks[1], skew);
    }

    fn render_skew_visual(&self, frame: &mut Frame, area: Rect, skew: &VolatilitySkew) {
        // Create a simple visual representation of the IV curve
        // Generate mock data points for visualization (in real implementation, would use actual curve)
        let num_points = 20;
        let mut curve_data = Vec::new();

        for i in 0..num_points {
            let t = i as f64 / (num_points - 1) as f64; // 0 to 1

            // Simple approximation: interpolate between put, atm, and call
            let iv = if t < 0.5 {
                // Left side: puts
                skew.otm_put_iv * (1.0 - 2.0 * t) + skew.atm_iv * (2.0 * t)
            } else {
                // Right side: calls
                skew.atm_iv * (2.0 - 2.0 * t) + skew.otm_call_iv * (2.0 * t - 1.0)
            };

            curve_data.push((iv * 100.0) as u64);
        }

        let sparkline = Sparkline::default()
            .block(
                Block::default()
                    .borders(Borders::ALL)
                    .title(" IV Smile Curve "),
            )
            .data(&curve_data)
            .style(Style::default().fg(Color::Magenta));

        frame.render_widget(sparkline, area);
    }
}
