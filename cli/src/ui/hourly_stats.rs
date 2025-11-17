use ratatui::{
    layout::{Constraint, Direction, Layout, Rect},
    style::{Color, Modifier, Style},
    text::{Line, Span},
    widgets::{Bar, BarChart, BarGroup, Block, Borders, Paragraph},
    Frame,
};

use crate::api::HourlyStats;

pub struct HourlyStatsView;

impl HourlyStatsView {
    pub fn new() -> Self {
        Self
    }

    pub fn render(&self, frame: &mut Frame, area: Rect, stats: &HourlyStats) {
        let chunks = Layout::default()
            .direction(Direction::Vertical)
            .constraints([
                Constraint::Length(3),   // Title
                Constraint::Length(8),   // Summary stats
                Constraint::Min(0),      // Distribution chart
            ])
            .split(area);

        // Title
        self.render_title(frame, chunks[0]);

        // Summary statistics
        self.render_summary(frame, chunks[1], stats);

        // Distribution chart
        self.render_distribution(frame, chunks[2], stats);
    }

    fn render_title(&self, frame: &mut Frame, area: Rect) {
        let title_text = Line::from(vec![
            Span::styled(
                "HOURLY PRICE MOVEMENT STATISTICS",
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

    fn render_summary(&self, frame: &mut Frame, area: Rect, stats: &HourlyStats) {
        let chunks = Layout::default()
            .direction(Direction::Horizontal)
            .constraints([
                Constraint::Percentage(25),
                Constraint::Percentage(25),
                Constraint::Percentage(25),
                Constraint::Percentage(25),
            ])
            .split(area);

        // Basic stats (left)
        let basic_stats = vec![
            Line::from(vec![
                Span::styled("Mean: ", Style::default().fg(Color::Gray)),
                Span::styled(
                    format!("{:+.2}%", stats.mean_return * 100.0),
                    Style::default().fg(Color::Yellow),
                ),
            ]),
            Line::from(vec![
                Span::styled("Median: ", Style::default().fg(Color::Gray)),
                Span::styled(
                    format!("{:+.2}%", stats.median_return * 100.0),
                    Style::default().fg(Color::Yellow),
                ),
            ]),
            Line::from(vec![
                Span::styled("Std Dev: ", Style::default().fg(Color::Gray)),
                Span::styled(
                    format!("{:.2}%", stats.std_return * 100.0),
                    Style::default().fg(Color::Cyan),
                ),
            ]),
            Line::from(vec![
                Span::styled("Samples: ", Style::default().fg(Color::Gray)),
                Span::styled(
                    format!("{}", stats.total_samples),
                    Style::default().fg(Color::Green),
                ),
            ]),
        ];

        let basic_para = Paragraph::new(basic_stats)
            .block(Block::default().borders(Borders::ALL).title(" Overview "));
        frame.render_widget(basic_para, chunks[0]);

        // Lower percentiles (middle-left)
        let lower_percentiles = vec![
            Line::from(vec![
                Span::styled("5th: ", Style::default().fg(Color::Gray)),
                Span::styled(
                    format!("{:+.2}%", stats.percentile_5 * 100.0),
                    Style::default().fg(Color::Red),
                ),
            ]),
            Line::from(vec![
                Span::styled("25th: ", Style::default().fg(Color::Gray)),
                Span::styled(
                    format!("{:+.2}%", stats.percentile_25 * 100.0),
                    Style::default().fg(Color::LightRed),
                ),
            ]),
            Line::from(vec![
                Span::styled("50th: ", Style::default().fg(Color::Gray)),
                Span::styled(
                    format!("{:+.2}%", stats.percentile_50 * 100.0),
                    Style::default().fg(Color::Yellow),
                ),
            ]),
        ];

        let lower_para = Paragraph::new(lower_percentiles)
            .block(
                Block::default()
                    .borders(Borders::ALL)
                    .title(" Downside Risk "),
            );
        frame.render_widget(lower_para, chunks[1]);

        // Upper percentiles (middle-right)
        let upper_percentiles = vec![
            Line::from(vec![
                Span::styled("75th: ", Style::default().fg(Color::Gray)),
                Span::styled(
                    format!("{:+.2}%", stats.percentile_75 * 100.0),
                    Style::default().fg(Color::LightGreen),
                ),
            ]),
            Line::from(vec![
                Span::styled("95th: ", Style::default().fg(Color::Gray)),
                Span::styled(
                    format!("{:+.2}%", stats.percentile_95 * 100.0),
                    Style::default().fg(Color::Green),
                ),
            ]),
            Line::from(vec![
                Span::styled("Max: ", Style::default().fg(Color::Gray)),
                Span::styled(
                    format!("{:+.2}%", stats.max_hourly_move * 100.0),
                    Style::default().fg(Color::Cyan),
                ),
            ]),
        ];

        let upper_para = Paragraph::new(upper_percentiles)
            .block(
                Block::default()
                    .borders(Borders::ALL)
                    .title(" Upside Potential "),
            );
        frame.render_widget(upper_para, chunks[2]);

        // Interpretation (right)
        let vol_level = if stats.std_return * 100.0 < 0.5 {
            ("LOW", Color::Green)
        } else if stats.std_return * 100.0 < 1.0 {
            ("MODERATE", Color::Yellow)
        } else if stats.std_return * 100.0 < 2.0 {
            ("HIGH", Color::LightRed)
        } else {
            ("EXTREME", Color::Red)
        };

        let interpretation = vec![
            Line::from(vec![
                Span::styled("Volatility:", Style::default().fg(Color::Gray)),
            ]),
            Line::from(vec![Span::styled(
                vol_level.0,
                Style::default()
                    .fg(vol_level.1)
                    .add_modifier(Modifier::BOLD),
            )]),
            Line::from(""),
            Line::from(vec![Span::styled(
                format!("±{:.2}%/hr", stats.std_return * 100.0),
                Style::default().fg(Color::Cyan),
            )]),
        ];

        let interp_para = Paragraph::new(interpretation)
            .block(Block::default().borders(Borders::ALL).title(" Status "))
            .alignment(ratatui::layout::Alignment::Center);
        frame.render_widget(interp_para, chunks[3]);
    }

    fn render_distribution(&self, frame: &mut Frame, area: Rect, stats: &HourlyStats) {
        // Create a visual distribution using the percentiles
        let percentile_data = vec![
            ("5%", (stats.percentile_5 * 100.0).abs() as u64),
            ("25%", (stats.percentile_25 * 100.0).abs() as u64),
            ("50%", (stats.percentile_50 * 100.0).abs() as u64),
            ("75%", (stats.percentile_75 * 100.0).abs() as u64),
            ("95%", (stats.percentile_95 * 100.0).abs() as u64),
            ("Max", (stats.max_hourly_move * 100.0).abs() as u64),
        ];

        // Create bar groups with colors based on magnitude
        let bars: Vec<Bar> = percentile_data
            .iter()
            .enumerate()
            .map(|(i, (label, value))| {
                let color = match i {
                    0 => Color::Red,
                    1 => Color::LightRed,
                    2 => Color::Yellow,
                    3 => Color::LightGreen,
                    4 => Color::Green,
                    5 => Color::Cyan,
                    _ => Color::White,
                };
                Bar::default()
                    .value(*value)
                    .label(label.to_string().into())
                    .style(Style::default().fg(color))
                    .value_style(Style::default().fg(color).add_modifier(Modifier::BOLD))
            })
            .collect();

        let bar_group = BarGroup::default().bars(&bars);

        let chart = BarChart::default()
            .block(
                Block::default()
                    .borders(Borders::ALL)
                    .title(" Hourly Move Distribution (%) "),
            )
            .data(bar_group)
            .bar_width(9)
            .bar_gap(2)
            .direction(Direction::Horizontal);

        frame.render_widget(chart, area);
    }
}
