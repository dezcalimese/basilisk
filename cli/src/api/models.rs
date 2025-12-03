use chrono::DateTime;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BtcPriceResponse {
    pub price: f64,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Contract {
    pub id: i32,
    pub ticker: String,
    pub signal_type: String, // "BUY YES", "BUY NO", "HOLD"
    pub expected_value: f64,
    pub edge_percentage: f64,
    pub recommended_price: f64,
    pub confidence_score: f64,
    pub time_to_expiry_hours: Option<f64>,
    pub is_active: bool,
    // Bitcoin contract fields
    pub strike_price: Option<f64>,
    pub expiry_time: Option<String>, // ISO datetime string
    pub current_btc_price: Option<f64>,
    pub yes_price: Option<f64>,
    pub no_price: Option<f64>,
    pub implied_probability: Option<f64>,
    pub model_probability: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct VolatilityData {
    #[serde(default)]
    pub realized_vol: f64,
    #[serde(default)]
    pub implied_vol: f64,
    #[serde(default)]
    pub regime: String,
    #[serde(default)]
    pub vol_premium: f64,
    #[serde(default)]
    pub vol_premium_pct: f64,
    #[serde(default)]
    pub vol_signal: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CurrentResponse {
    pub contracts: Vec<Contract>,
    #[serde(default)]
    pub volatility: VolatilityData,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HealthResponse {
    pub status: String,
    pub service: String,
}

/// Hourly price movement statistics
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct HourlyStats {
    pub mean_return: f64,
    pub std_return: f64,
    pub median_return: f64,
    pub percentile_5: f64,
    pub percentile_25: f64,
    pub percentile_50: f64,
    pub percentile_75: f64,
    pub percentile_95: f64,
    pub max_hourly_move: f64,
    pub total_samples: i64,
}

/// Volatility skew data
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct VolatilitySkew {
    pub atm_iv: f64,
    pub otm_call_iv: f64,
    pub otm_put_iv: f64,
    pub skew: f64,
    pub skew_interpretation: String,
}

impl Contract {
    /// Calculate distance from current BTC price to strike price
    pub fn distance_dollars(&self) -> f64 {
        match (self.current_btc_price, self.strike_price) {
            (Some(current), Some(strike)) => current - strike,
            _ => 0.0,
        }
    }

    /// Calculate distance as percentage
    pub fn distance_percent(&self) -> f64 {
        match (self.current_btc_price, self.strike_price) {
            (Some(current), Some(strike)) if strike != 0.0 => {
                (current - strike) / strike * 100.0
            }
            _ => 0.0,
        }
    }

    /// Is current price above strike (more likely to expire YES)?
    pub fn is_above_strike(&self) -> bool {
        match (self.current_btc_price, self.strike_price) {
            (Some(current), Some(strike)) => current > strike,
            _ => false,
        }
    }

    /// Is contract expiring soon (< 10 minutes)?
    pub fn is_near_expiry(&self) -> bool {
        match self.time_to_expiry_hours {
            Some(hours) => hours * 60.0 < 10.0,
            None => false,
        }
    }

    /// Format time to expiry as human-readable string
    pub fn time_left_display(&self) -> String {
        match self.time_to_expiry_hours {
            Some(hours) if hours < 0.0 => "EXPIRED".to_string(),
            Some(hours) if hours < 1.0 => {
                let minutes = (hours * 60.0) as i64;
                format!("{}m", minutes)
            }
            Some(hours) => {
                let h = hours as i64;
                let m = ((hours - h as f64) * 60.0) as i64;
                if m > 0 {
                    format!("{}h{}m", h, m)
                } else {
                    format!("{}h", h)
                }
            }
            None => "N/A".to_string(),
        }
    }

    /// Format expiry time showing both UTC and EST
    pub fn expiry_display(&self) -> String {
        match &self.expiry_time {
            Some(time_str) => {
                if let Ok(dt) = DateTime::parse_from_rfc3339(time_str) {
                    // Show both UTC and EST
                    let utc_time = dt.format("%H:%M UTC").to_string();
                    // Approximate EST by subtracting 5 hours (good enough for display)
                    let est_dt = dt - chrono::Duration::hours(5);
                    let est_time = est_dt.format("%I%p EST").to_string();
                    format!("{} / {}", utc_time, est_time)
                } else {
                    "N/A".to_string()
                }
            }
            None => "N/A".to_string(),
        }
    }

    /// Get EV as formatted percentage string
    pub fn ev_display(&self) -> String {
        format!("{:+.1}%", self.expected_value * 100.0)
    }

    /// Get strike price formatted
    pub fn strike_display(&self) -> String {
        match self.strike_price {
            Some(price) => format!("${:.0}", price),
            None => "N/A".to_string(),
        }
    }

    /// Get current BTC price formatted
    pub fn btc_price_display(&self) -> String {
        match self.current_btc_price {
            Some(price) => format!("${:.0}", price),
            None => "N/A".to_string(),
        }
    }
}

// ============================================
// Trading Models
// ============================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TradeRequest {
    pub ticker: String,
    pub asset: String,
    pub direction: String,
    pub strike: f64,
    pub contracts: i32,
    pub order_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub limit_price: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub signal_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SignalTradeRequest {
    pub signal_id: i32,
    pub contracts: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TradeResponse {
    pub success: bool,
    pub trade_id: Option<i32>,
    pub order_id: Option<String>,
    pub client_order_id: Option<String>,
    pub filled: i32,
    pub price: Option<f64>,
    pub cost: Option<f64>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Position {
    pub trade_id: i32,
    pub ticker: String,
    pub asset: String,
    pub direction: String,
    pub strike: f64,
    pub contracts: i32,
    pub entry_price: f64,
    pub current_price: Option<f64>,
    pub unrealized_pnl: Option<f64>,
    pub status: String,
    pub expiry_at: Option<String>,
    pub opened_at: String,
}

impl Position {
    pub fn pnl_display(&self) -> String {
        match self.unrealized_pnl {
            Some(pnl) => format!("${:+.2}", pnl),
            None => "N/A".to_string(),
        }
    }

    pub fn current_price_display(&self) -> String {
        match self.current_price {
            Some(price) => format!("${:.2}", price),
            None => "N/A".to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TradeHistory {
    pub id: i32,
    pub ticker: String,
    pub asset: String,
    pub direction: String,
    pub strike: f64,
    pub contracts: i32,
    pub entry_price: f64,
    pub exit_price: Option<f64>,
    pub fees: Option<f64>,
    pub pnl: Option<f64>,
    pub status: String,
    pub opened_at: String,
    pub closed_at: Option<String>,
}

impl TradeHistory {
    pub fn pnl_display(&self) -> String {
        match self.pnl {
            Some(pnl) => format!("${:+.2}", pnl),
            None => "N/A".to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PnLSummary {
    pub period: String,
    pub total_pnl: f64,
    pub total_fees: f64,
    pub net_pnl: f64,
    pub trade_count: i32,
    pub wins: i32,
    pub losses: i32,
    pub win_rate: f64,
}
