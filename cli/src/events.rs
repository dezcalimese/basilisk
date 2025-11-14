use crate::api::Contract;
use crossterm::event::KeyCode;

/// Unified event type for all app events (keyboard, SSE, timers)
#[derive(Debug)]
pub enum AppEvent {
    /// Keyboard input event
    Keyboard(KeyCode),

    /// SSE connection established
    SseConnected,

    /// SSE connection lost
    SseDisconnected,

    /// BTC price update from SSE
    BtcPriceUpdate { price: f64, timestamp: String },

    /// Full contracts update from SSE
    ContractsUpdate { contracts: Vec<Contract>, timestamp: String },

    /// SSE error occurred
    SseError(String),

    /// Periodic tick for UI refresh
    Tick,

    /// Request app shutdown
    Quit,
}
