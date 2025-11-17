use anyhow::{Context, Result};
use reqwest::Client;
use std::time::Duration;

use super::models::{BtcPriceResponse, CurrentResponse, HealthResponse};

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
}
