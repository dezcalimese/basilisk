use crate::api::{Contract, VolatilityData};
use crossterm::event::KeyCode;

/// Unified event type for all app events (keyboard, SSE, timers)
#[derive(Debug)]
#[allow(dead_code)]
pub enum AppEvent {
    /// Keyboard input event
    Keyboard(KeyCode),

    /// SSE connection established
    SseConnected,

    /// SSE connection lost
    SseDisconnected,

    /// BTC price update from SSE
    BtcPriceUpdate { price: f64, _timestamp: String },

    /// Full contracts update from SSE
    ContractsUpdate {
        contracts: Vec<Contract>,
        volatility: VolatilityData,
        _timestamp: String,
    },

    /// SSE error occurred
    SseError(String),

    /// Periodic tick for UI refresh
    Tick,

    /// Request app shutdown
    Quit,
}
