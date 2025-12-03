use anyhow::{Context, Result};
use reqwest::Client;
use std::time::Duration;

use super::models::{
    BtcPriceResponse, CurrentResponse, HealthResponse, HourlyStats, PnLSummary,
    Position, SignalTradeRequest, TradeHistory, TradeRequest, TradeResponse, VolatilitySkew,
};

pub struct ApiClient {
    client: Client,
    base_url: String,
}

impl ApiClient {
    pub fn new(base_url: String, timeout_seconds: u64) -> Result<Self> {
        let client = Client::builder()
            .timeout(Duration::from_secs(timeout_seconds))
            .build()
            .context("Failed to create HTTP client")?;

        Ok(Self { client, base_url })
    }

    #[allow(dead_code)]
    pub async fn health_check(&self) -> Result<HealthResponse> {
        let url = format!("{}/api/v1/health", self.base_url);
        let response = self
            .client
            .get(&url)
            .send()
            .await
            .context("Failed to send health check request")?;

        let health = response
            .json::<HealthResponse>()
            .await
            .context("Failed to parse health response")?;

        Ok(health)
    }

    pub async fn get_current_signals(&self) -> Result<CurrentResponse> {
        let url = format!("{}/api/v1/current", self.base_url);
        let response = self
            .client
            .get(&url)
            .send()
            .await
            .context("Failed to send current signals request")?;

        let current = response
            .json::<CurrentResponse>()
            .await
            .context("Failed to parse current signals response")?;

        Ok(current)
    }

    #[allow(dead_code)]
    pub async fn get_btc_price(&self) -> Result<BtcPriceResponse> {
        let url = format!("{}/api/v1/btc-price", self.base_url);
        let response = self
            .client
            .get(&url)
            .send()
            .await
            .context("Failed to send BTC price request")?;

        let price = response
            .json::<BtcPriceResponse>()
            .await
            .context("Failed to parse BTC price response")?;

        Ok(price)
    }

    pub async fn get_hourly_stats(&self) -> Result<HourlyStats> {
        let url = format!("{}/api/v1/statistics/hourly-movements?hours=720", self.base_url);
        let response = self
            .client
            .get(&url)
            .send()
            .await
            .context("Failed to send hourly stats request")?;

        let stats = response
            .json::<HourlyStats>()
            .await
            .context("Failed to parse hourly stats response")?;

        Ok(stats)
    }

    pub async fn get_volatility_skew(&self) -> Result<VolatilitySkew> {
        let url = format!("{}/api/v1/volatility/skew", self.base_url);
        let response = self
            .client
            .get(&url)
            .send()
            .await
            .context("Failed to send volatility skew request")?;

        let skew = response
            .json::<VolatilitySkew>()
            .await
            .context("Failed to parse volatility skew response")?;

        Ok(skew)
    }

    // ============================================
    // Trading API Methods
    // ============================================

    /// Execute a trade
    pub async fn execute_trade(&self, request: TradeRequest) -> Result<TradeResponse> {
        let url = format!("{}/api/v1/trade", self.base_url);
        let response = self
            .client
            .post(&url)
            .json(&request)
            .send()
            .await
            .context("Failed to send trade request")?;

        let result = response
            .json::<TradeResponse>()
            .await
            .context("Failed to parse trade response")?;

        Ok(result)
    }

    /// Execute a trade from a signal
    pub async fn execute_from_signal(&self, signal_id: i32, contracts: i32) -> Result<TradeResponse> {
        let url = format!("{}/api/v1/trade/signal", self.base_url);
        let request = SignalTradeRequest { signal_id, contracts };

        let response = self
            .client
            .post(&url)
            .json(&request)
            .send()
            .await
            .context("Failed to send signal trade request")?;

        let result = response
            .json::<TradeResponse>()
            .await
            .context("Failed to parse trade response")?;

        Ok(result)
    }

    /// Get open positions
    pub async fn get_positions(&self) -> Result<Vec<Position>> {
        let url = format!("{}/api/v1/trade/positions", self.base_url);
        let response = self
            .client
            .get(&url)
            .send()
            .await
            .context("Failed to send positions request")?;

        let positions = response
            .json::<Vec<Position>>()
            .await
            .context("Failed to parse positions response")?;

        Ok(positions)
    }

    /// Close a position
    pub async fn close_position(&self, trade_id: i32) -> Result<TradeResponse> {
        let url = format!("{}/api/v1/trade/positions/{}", self.base_url, trade_id);
        let response = self
            .client
            .delete(&url)
            .send()
            .await
            .context("Failed to send close position request")?;

        let result = response
            .json::<TradeResponse>()
            .await
            .context("Failed to parse close response")?;

        Ok(result)
    }

    /// Get trade history
    pub async fn get_trade_history(&self, limit: i32) -> Result<Vec<TradeHistory>> {
        let url = format!("{}/api/v1/trade/history?limit={}", self.base_url, limit);
        let response = self
            .client
            .get(&url)
            .send()
            .await
            .context("Failed to send history request")?;

        let history = response
            .json::<Vec<TradeHistory>>()
            .await
            .context("Failed to parse history response")?;

        Ok(history)
    }

    /// Get P&L summary
    pub async fn get_pnl_summary(&self, period: &str) -> Result<PnLSummary> {
        let url = format!("{}/api/v1/trade/pnl/{}", self.base_url, period);
        let response = self
            .client
            .get(&url)
            .send()
            .await
            .context("Failed to send P&L request")?;

        let summary = response
            .json::<PnLSummary>()
            .await
            .context("Failed to parse P&L response")?;

        Ok(summary)
    }
}
