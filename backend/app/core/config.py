"""Configuration management using pydantic-settings."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # Application
    app_name: str = "Basilisk"
    app_version: str = "0.1.0"
    debug: bool = False

    # Database
    database_url: str = "sqlite:///./basilisk.db"

    # API
    api_v1_prefix: str = "/api/v1"
    cors_origins: list[str] = [
        "http://localhost:3000",
        "http://localhost:3001",  # Next.js alternate port
        "http://localhost:5173",  # Vite default
    ]

    # Kalshi API
    kalshi_api_base_url: str = "https://api.elections.kalshi.com/trade-api/v2"
    kalshi_demo_base_url: str = "https://demo-api.kalshi.co/trade-api/v2"
    kalshi_key_id: str = ""  # Your Kalshi API Key ID
    kalshi_private_key_path: str = ""  # Path to your RSA private key PEM file
    kalshi_use_demo: bool = True  # Use demo environment by default

    # Data ingestion
    data_fetch_interval_minutes: int = 60
    bitcoin_price_api_url: str = "https://api.coinbase.com/v2/prices/BTC-USD/spot"

    # Model parameters
    model_ev_threshold: float = 0.02  # 2% minimum expected value to trigger signal
    model_confidence_threshold: float = 0.60  # Minimum confidence for predictions

    # Trading fees (Kalshi)
    kalshi_fee_rate: float = 0.07  # 7% fee on profits


settings = Settings()
