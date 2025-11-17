"""Statistics API routes for hourly movements and volatility analysis."""

from fastapi import APIRouter, HTTPException, Query
from typing import Any

from app.services.price_statistics import HourlyPriceStatistics
from app.services.volatility_skew import VolatilitySkew
from app.services.market_service import MarketService
from app.data.bitcoin_client import BitcoinPriceClient

router = APIRouter()


@router.get("/statistics/hourly-movements")
async def get_hourly_movement_stats(
    hours: int = Query(default=720, ge=24, le=2160, description="Hours of history to analyze (default 720 = 30 days)")
) -> dict[str, Any]:
    """
    Return hourly price movement statistics.
    Critical for understanding Kalshi contract probabilities.

    Args:
        hours: Number of hours of historical data to analyze

    Returns:
        Statistical analysis of hourly BTC price movements
    """
    try:
        # Fetch historical candles
        btc_client = BitcoinPriceClient()
        candles = await btc_client.get_historical_candles(hours=hours)

        if not candles:
            raise HTTPException(
                status_code=503,
                detail="Unable to fetch historical candle data"
            )

        # Calculate statistics
        stats_service = HourlyPriceStatistics()
        stats = stats_service.calculate_hourly_stats(candles, lookback_hours=hours)

        return stats

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error calculating hourly statistics: {str(e)}"
        )


@router.get("/probability/next-hour/{strike}")
async def get_next_hour_probability(
    strike: float,
    lookback_hours: int = Query(default=720, ge=24, le=2160)
) -> dict[str, Any]:
    """
    Probability that next hourly close will be above strike.

    Uses historical hourly return distribution to estimate probability.

    Args:
        strike: Strike price to analyze
        lookback_hours: Hours of historical data to use for probability calculation

    Returns:
        Probability analysis and move requirements
    """
    try:
        # Get current BTC price
        btc_client = BitcoinPriceClient()
        current_price = await btc_client.get_spot_price()

        # Get historical candles
        candles = await btc_client.get_historical_candles(hours=lookback_hours)

        if not candles:
            raise HTTPException(
                status_code=503,
                detail="Unable to fetch historical data"
            )

        # Calculate statistics
        stats_service = HourlyPriceStatistics()
        stats = stats_service.calculate_hourly_stats(candles, lookback_hours=lookback_hours)

        # Get probability of move
        prob_data = stats_service.get_probability_of_move(
            current_price=current_price,
            target_price=strike,
            hourly_stats=stats
        )

        return prob_data

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error calculating probability: {str(e)}"
        )


@router.get("/volatility/skew")
async def get_volatility_skew() -> dict[str, Any]:
    """
    Calculate volatility skew from current contract prices.

    Analyzes implied volatility across different strike prices
    to identify market sentiment (fear vs greed).

    Returns:
        Volatility skew analysis with IV curve data
    """
    try:
        # Get current contracts and BTC price
        market_service = MarketService()
        btc_client = BitcoinPriceClient()

        # Fetch market data
        market_data = await market_service.get_bitcoin_hourly_contracts()

        # Extract contracts and current price
        if isinstance(market_data, dict):
            contracts = market_data.get("contracts", [])
        else:
            contracts = market_data

        if not contracts:
            raise HTTPException(
                status_code=404,
                detail="No active contracts available for skew calculation"
            )

        current_price = await btc_client.get_spot_price()

        # Calculate skew
        skew_service = VolatilitySkew()
        skew_data = skew_service.calculate_skew(contracts, current_price)

        return skew_data

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error calculating volatility skew: {str(e)}"
        )


@router.get("/statistics/summary")
async def get_statistics_summary() -> dict[str, Any]:
    """
    Get a comprehensive summary of statistics including:
    - Hourly movement statistics
    - Volatility skew
    - Current market metrics

    Returns:
        Comprehensive statistics summary
    """
    try:
        btc_client = BitcoinPriceClient()
        market_service = MarketService()
        stats_service = HourlyPriceStatistics()
        skew_service = VolatilitySkew()

        # Fetch all data in parallel
        current_price = await btc_client.get_spot_price()
        candles = await btc_client.get_historical_candles(hours=720)
        market_data = await market_service.get_bitcoin_hourly_contracts()

        # Calculate statistics
        hourly_stats = stats_service.calculate_hourly_stats(candles, lookback_hours=720)

        # Extract contracts
        if isinstance(market_data, dict):
            contracts = market_data.get("contracts", [])
        else:
            contracts = market_data

        skew_data = skew_service.calculate_skew(contracts, current_price) if contracts else {}

        return {
            "current_price": current_price,
            "hourly_statistics": {
                "mean_return": hourly_stats.get("mean_return"),
                "std_return": hourly_stats.get("std_return"),
                "max_hourly_move": hourly_stats.get("max_hourly_move"),
                "percentiles": {
                    "p5": hourly_stats.get("percentile_5"),
                    "p25": hourly_stats.get("percentile_25"),
                    "p50": hourly_stats.get("percentile_50"),
                    "p75": hourly_stats.get("percentile_75"),
                    "p95": hourly_stats.get("percentile_95"),
                },
                "total_samples": hourly_stats.get("total_samples"),
            },
            "volatility_skew": {
                "atm_iv": skew_data.get("atm_iv"),
                "skew": skew_data.get("skew"),
                "interpretation": skew_data.get("skew_interpretation"),
                "contracts_analyzed": skew_data.get("contracts_analyzed"),
            },
        }

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error generating statistics summary: {str(e)}"
        )
