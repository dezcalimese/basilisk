"""Service for fetching and processing market data."""

from datetime import UTC, datetime
from typing import Any
from zoneinfo import ZoneInfo

from app.core.cache import cached
from app.core.config import settings
from app.data.bitcoin_client import BitcoinPriceClient
from app.data.dflow_client import DFlowClient, get_dflow_client
from app.data.ethereum_client import EthereumPriceClient
from app.data.kalshi_client import KalshiClient
from app.data.ripple_client import RipplePriceClient
from app.models.order_flow import OrderFlowAnalyzer
from app.models.predictor import ProbabilityPredictor
from app.models.volatility import VolatilityRegime


class MarketService:
    """Service for fetching and processing market data."""

    def __init__(self) -> None:
        """Initialize market service."""
        self.kalshi_client = KalshiClient()
        self.btc_client = BitcoinPriceClient()
        self.eth_client = EthereumPriceClient()
        self.xrp_client = RipplePriceClient()
        self.predictor = ProbabilityPredictor()
        self.vol_regime = VolatilityRegime()
        self.order_flow = OrderFlowAnalyzer()

        # DFlow client for Solana token mints (optional - degrades gracefully)
        self.dflow_client: DFlowClient | None = None
        if settings.dflow_api_key:
            self.dflow_client = get_dflow_client()

        # Cache for DFlow market mints
        self._mint_cache: dict[str, dict[str, str]] = {}

    @cached(ttl=120, key_prefix="contracts:btc")
    async def get_bitcoin_hourly_contracts(self) -> list[dict[str, Any]]:
        """
        Fetch Bitcoin hourly contracts from Kalshi and process them.

        Returns:
            List of processed contract data with signals
        """
        # Get current BTC price
        try:
            current_btc_price = await self.btc_client.get_spot_price()
            print(f"✓ Successfully fetched BTC price: ${current_btc_price:,.2f}")
        except Exception as e:
            print(f"✗ Failed to fetch BTC price: {e}")
            current_btc_price = 95000.0  # Fallback price

        # Fetch historical candles for volatility analysis
        try:
            print("Fetching historical BTC candles for volatility analysis...")
            candles = await self.btc_client.get_historical_candles(hours=168)  # 1 week
            print(f"✓ Fetched {len(candles)} hourly candles")
        except Exception as e:
            print(f"✗ Failed to fetch historical candles: {e}")
            candles = []

        now_utc = datetime.now(UTC)
        est = ZoneInfo("America/New_York")
        now_est = now_utc.astimezone(est)

        # Fetch KXBTCD markets from Kalshi (timed contracts)
        try:
            print("Fetching KXBTCD Bitcoin markets from Kalshi...")
            markets: list[dict[str, Any]] = []
            cursor: str | None = None
            max_pages = 10  # Increased to ensure we get all contracts
            page = 0

            found_today = False
            while page < max_pages:
                page += 1
                markets_response = await self.kalshi_client.get_markets(
                    series_ticker="KXBTCD", limit=1000, cursor=cursor
                )
                page_markets = markets_response.get("markets", [])
                markets.extend(page_markets)
                cursor = markets_response.get("cursor")

                page_label = (
                    cursor[:6] + "..."
                    if cursor and len(cursor) > 6
                    else (cursor or "<none>")
                )
                print(
                    f"  Page {page}: {len(page_markets)} markets (next cursor: {page_label})"
                )

                # Track if we found today's contracts, but don't break early
                # We need to fetch ALL pages to get all hourly contracts
                if self._has_active_same_day_contracts(
                    page_markets, now_utc, est
                ):
                    found_today = True

                if not cursor:
                    break

            print(
                f"✓ Received {len(markets)} KXBTCD markets from Kalshi across {page} page(s)"
            )

            if not found_today:
                print(
                    "  ⚠️  Still no active same-day contracts after pagination; will fall back to earliest future expiry."
                )

            # Debug: Check market statuses
            status_counts = {}
            for m in markets[:20]:
                status = m.get("status", "unknown")
                status_counts[status] = status_counts.get(status, 0) + 1
            print(f"  Market statuses in first 20: {status_counts}")
        except Exception as e:
            print(f"✗ Failed to fetch Kalshi markets: {e}")
            print("  Tip: Set up Kalshi API credentials (see KALSHI_SETUP.md)")
            print("  Returning mock data for now...")
            return self._get_mock_contracts(current_btc_price)

        # Analyze all contracts - no filters yet

        print(f"\n🔍 Current time (UTC): {now_utc.strftime('%Y-%m-%d %H:%M:%S %Z')}")
        print(f"🔍 Current time (EST): {now_est.strftime('%Y-%m-%d %I:%M %p %Z')}")
        print(f"🔍 Current BTC price: ${current_btc_price:,.2f}")

        # Group contracts by expiry time
        from collections import defaultdict

        contracts_by_expiry = defaultdict(list)
        expired_count = 0
        active_count = 0

        # Debug: Look for today's contracts (including closed ones)
        today_label = now_est.strftime("%b %d")
        print(
            f"\n🔍 Searching for today's contracts ({today_label}) in all {len(markets)} KXBTCD markets..."
        )
        today_est = now_est.date()
        today_contracts = []

        for market in markets:
            ticker = market.get("ticker")
            status = market.get("status", "unknown")
            expiry_time_str = market.get("close_time") or market.get("expiration_time")
            if expiry_time_str:
                expiry_utc = datetime.fromisoformat(expiry_time_str.replace("Z", "+00:00"))
                expiry_est = expiry_utc.astimezone(est)

                # Check if this expires today (EST date), even if expired/closed
                if expiry_est.date() == today_est:
                    is_future = expiry_utc > now_utc
                    today_contracts.append((expiry_est, ticker, status, is_future))

        # Show today's contracts
        if today_contracts:
            today_contracts.sort(key=lambda x: x[0])
            print(
                f"\n📅 Found {len(today_contracts)} contracts for TODAY ({today_label}):"
            )
            for expiry_est, ticker, status, is_future in today_contracts[:15]:
                future_mark = "✓" if is_future else "✗ PAST"
                print(
                    f"  {future_mark} {expiry_est.strftime('%I%p %Z')} - {ticker} [{status}]"
                )
        else:
            print(f"  ⚠️  No contracts found for today ({today_label})!")

        for market in markets:
            expiry_time_str = market.get("close_time") or market.get("expiration_time")
            if not expiry_time_str:
                continue

            expiry_utc = datetime.fromisoformat(expiry_time_str.replace("Z", "+00:00"))

            # Skip expired/finalized only
            if expiry_utc < now_utc:
                expired_count += 1
                continue

            # Include all non-expired markets (active, open, initialized)
            # Only skip settled/finalized contracts
            status = market.get("status", "").lower()
            if status in ["finalized", "settled", "closed"]:
                continue

            active_count += 1
            # Group by exact expiry time
            contracts_by_expiry[expiry_utc].append(market)

        print(f"\n📊 Contracts: {expired_count} expired, {active_count} active")

        # Show upcoming expiry times
        print("\n📅 Upcoming expiry times (next 10):")
        sorted_expiries = sorted(contracts_by_expiry.items(), key=lambda x: x[0])

        # Debug: Check for 11AM contracts specifically
        current_hour_est = now_est.hour
        next_hour_est = (current_hour_est + 1) % 24
        print(f"  🔍 Current hour (EST): {current_hour_est} (looking for {next_hour_est}:00 contracts)")

        eleven_am_contracts = [
            (exp, markets) for exp, markets in sorted_expiries
            if exp.astimezone(est).hour == 11 and exp.astimezone(est).date() == today_est
        ]
        if eleven_am_contracts:
            print(f"  ✓ Found {len(eleven_am_contracts)} groups of 11AM EST contracts")
        else:
            print(f"  ⚠️  No 11AM EST contracts found in data")

        for expiry_utc, contract_list in sorted_expiries[:10]:
            expiry_est = expiry_utc.astimezone(est)
            hours_away = (expiry_utc - now_utc).total_seconds() / 3600

            print(
                f"  {expiry_est.strftime('%I%p %Z')} ({expiry_utc.strftime('%H:%M UTC')}) - {hours_away:.1f}h away - {len(contract_list)} contracts"
            )

        # Get contracts for the next available expiry
        btc_contracts = []
        selected_expiry: datetime | None = None
        if sorted_expiries:
            # Simply use the earliest available contract
            # Kalshi contracts already expire at EST hour boundaries
            selected_expiry, selected_markets = sorted_expiries[0]
            btc_contracts = selected_markets

            if selected_expiry:
                expiry_est = selected_expiry.astimezone(est)
                expiry_label = expiry_est.strftime('%b %d %I%p %Z')
                expiry_utc_label = selected_expiry.strftime('%H:%M UTC')
                print(
                    f"\n✓ Using {len(btc_contracts)} contracts expiring {expiry_label} ({expiry_utc_label})"
                )

        # Show strikes for next expiry
        if btc_contracts:
            print("\n💰 Strikes available:")
            for i, market in enumerate(btc_contracts[:20]):
                ticker = market.get("ticker")
                strike = self._extract_strike_price(ticker, market.get("title", ""))
                distance = strike - current_btc_price if strike else 0
                symbol = "↑" if distance > 0 else "↓"

                # Debug: Show actual expiry time from API
                expiry_str = market.get("close_time") or market.get("expiration_time")
                if expiry_str and i < 3:  # Only show first 3
                    expiry_dt = datetime.fromisoformat(expiry_str.replace("Z", "+00:00"))
                    expiry_est = expiry_dt.astimezone(est)
                    print(
                        f"  {i+1}. {ticker} | ${strike:,.0f} ({symbol} ${abs(distance):,.0f})"
                    )
                    print(f"      API expiry: {expiry_est.strftime('%b %d %I%p %Z')} (UTC: {expiry_dt.strftime('%H:%M')})")
                else:
                    print(
                        f"  {i+1}. {ticker} | ${strike:,.0f} ({symbol} ${abs(distance):,.0f})"
                    )
            print()

        if not btc_contracts:
            print("  ⚠️  No active Bitcoin contracts found")
            return []

        # Fetch DVOL FIRST (before processing contracts) to use for probability calculations
        print("\n📊 Fetching Deribit DVOL for accurate probability calculations...")
        dvol = await self.vol_regime.fetch_deribit_dvol("BTC")
        if dvol is not None:
            print(f"✓ Deribit DVOL: {dvol:.1%} (using for Black-Scholes)")
        else:
            print("⚠️  Deribit DVOL unavailable, falling back to heuristic model")

        # Process each contract WITH DVOL (skip order book initially for speed)
        processed_contracts = []
        for idx, market in enumerate(btc_contracts):
            try:
                contract_data = await self._process_contract(
                    market, current_btc_price, idx + 1, dvol=dvol, fetch_orderbook=False
                )
                if contract_data:
                    processed_contracts.append(contract_data)
            except Exception as e:
                print(f"✗ Error processing contract {market.get('ticker')}: {e}")
                continue

        # Run full volatility analysis after contracts processed
        volatility_data = {}
        if candles and processed_contracts:
            try:
                print("\n📊 Running volatility analysis...")
                volatility_data = await self.vol_regime.analyze_volatility(
                    candles, processed_contracts, current_btc_price
                )
                print(f"✓ Volatility Regime: {volatility_data.get('regime', 'UNKNOWN')}")

                # Display dual IV sources
                deribit_iv = volatility_data.get('deribit_iv')
                kalshi_iv = volatility_data.get('kalshi_iv')
                mispricing = volatility_data.get('mispricing_signal', 'UNKNOWN')

                print(
                    f"  RV: {volatility_data.get('realized_vol', 0):.1%} | "
                    f"IV (Primary): {volatility_data.get('implied_vol', 0):.1%} | "
                    f"Premium: {volatility_data.get('vol_premium_pct', 0):.1%}"
                )

                if deribit_iv is not None and kalshi_iv is not None:
                    print(
                        f"  Deribit DVOL: {deribit_iv:.1%} | "
                        f"Kalshi IV: {kalshi_iv:.1%} | "
                        f"Mispricing: {mispricing}"
                    )
            except Exception as e:
                print(f"✗ Failed to calculate volatility: {e}")
                # Provide default values if analysis fails
                volatility_data = {
                    "realized_vol": 0.50,
                    "implied_vol": 0.50,
                    "regime": "NORMAL",
                    "vol_premium": 0.0,
                    "vol_premium_pct": 0.0,
                    "vol_signal": "NEUTRAL",
                }

        # Sort by expected value (highest first) and take top 10
        processed_contracts.sort(key=lambda x: x["expected_value"], reverse=True)
        top_contracts = processed_contracts[:10]

        print(
            f"\n✓ Processed {len(processed_contracts)} contracts, returning top {len(top_contracts)} by EV"
        )

        # Return both contracts and volatility data
        return {
            "contracts": top_contracts,
            "volatility": volatility_data,
        }

    def _has_active_same_day_contracts(
        self,
        markets: list[dict[str, Any]],
        now_utc: datetime,
        est: ZoneInfo,
    ) -> bool:
        """Return True if any market still expires today (EST) in the future."""

        today_est = now_utc.astimezone(est).date()
        for market in markets:
            expiry_time_str = market.get("close_time") or market.get("expiration_time")
            if not expiry_time_str:
                continue

            expiry_utc = datetime.fromisoformat(expiry_time_str.replace("Z", "+00:00"))
            if expiry_utc <= now_utc:
                continue

            if expiry_utc.astimezone(est).date() == today_est:
                return True

        return False

    async def _process_contract(
        self, market: dict[str, Any], current_btc_price: float, contract_id: int,
        dvol: float | None = None, fetch_orderbook: bool = True
    ) -> dict[str, Any] | None:
        """
        Process a single contract using DVOL and order flow for probability calculations.

        Combines:
        - Black-Scholes probability from DVOL
        - Order Book Imbalance (OBI) adjustment (if fetch_orderbook=True)

        Args:
            market: Kalshi market data
            current_btc_price: Current BTC spot price
            contract_id: Unique contract ID
            dvol: Deribit volatility index (if available)
            fetch_orderbook: Whether to fetch order book for OBI (False = faster)

        Returns:
            Processed contract data with theoretical probabilities and mispricing analysis
        """
        ticker = market.get("ticker", "")
        title = market.get("title", "")

        # Extract strike price from title or ticker
        strike_price = self._extract_strike_price(ticker, title)
        if not strike_price:
            return None

        # Get market prices
        yes_bid = market.get("yes_bid", 0) / 100 if market.get("yes_bid") else 0
        yes_ask = market.get("yes_ask", 0) / 100 if market.get("yes_ask") else 0
        no_bid = market.get("no_bid", 0) / 100 if market.get("no_bid") else 0
        no_ask = market.get("no_ask", 0) / 100 if market.get("no_ask") else 0

        # Calculate mid prices
        yes_price = (yes_bid + yes_ask) / 2 if yes_bid and yes_ask else 0.5
        no_price = (no_bid + no_ask) / 2 if no_bid and no_ask else 0.5

        # Implied probability (from Kalshi YES price - what market thinks)
        implied_probability = yes_price

        # Get expiry time
        expiry_time_str = market.get("close_time") or market.get("expiration_time")
        if expiry_time_str:
            expiry_time = datetime.fromisoformat(expiry_time_str.replace("Z", "+00:00"))
        else:
            expiry_time = datetime.now(UTC)

        # Calculate time to expiry
        time_to_expiry = expiry_time - datetime.now(UTC)
        time_to_expiry_hours = time_to_expiry.total_seconds() / 3600

        # Skip if already expired
        if time_to_expiry_hours < 0:
            return None

        # Calculate THEORETICAL probability using Black-Scholes with DVOL
        # This is the TRUE probability based on options market volatility
        if dvol is not None and dvol > 0:
            # Use Black-Scholes to get theoretical probability
            # Kalshi contracts are CALL options (BTC > strike pays YES)
            theoretical_probability = self.vol_regime.calculate_binary_option_probability(
                current_price=current_btc_price,
                strike_price=strike_price,
                time_to_expiry_hours=time_to_expiry_hours,
                volatility=dvol,
                option_type="CALL",
            )
            model_probability = theoretical_probability
        else:
            # Fallback to old model if DVOL unavailable
            features = {
                "implied_probability": implied_probability,
                "strike_price": strike_price,
                "current_price": current_btc_price,
                "time_to_expiry_hours": time_to_expiry_hours,
            }
            model_probability = self.predictor.predict_probability(features)
            theoretical_probability = model_probability

        # Fetch order book and calculate OBI for probability adjustment (if enabled)
        obi_data = None
        flow_adjusted_probability = model_probability
        if fetch_orderbook:
            try:
                orderbook = await self.kalshi_client.get_market_orderbook(ticker)
                if orderbook:
                    obi_signal = self.order_flow.calculate_order_book_imbalance(orderbook)
                    obi_data = {
                        "obi": obi_signal.obi,
                        "obi_signal": obi_signal.obi_signal,
                        "bid_volume": obi_signal.bid_volume,
                        "ask_volume": obi_signal.ask_volume,
                        "imbalance_pct": obi_signal.imbalance_pct,
                        "prob_adjustment": obi_signal.prob_adjustment,
                        "confidence": obi_signal.confidence,
                    }

                    # Adjust probability based on order flow
                    # OBI > 0 (bullish) -> increase probability for CALL
                    # OBI < 0 (bearish) -> decrease probability for CALL
                    flow_adjustment = self.order_flow.adjust_probability_for_flow(
                        model_probability, obi_signal
                    )
                    flow_adjusted_probability = flow_adjustment["adjusted_probability"]
            except Exception:
                # Order book fetch failed, continue without OBI
                pass

        # Use flow-adjusted probability for EV calculation
        final_probability = flow_adjusted_probability

        # Calculate expected value for both YES and NO positions
        ev_yes = self.predictor.calculate_expected_value(
            final_probability, yes_bid, yes_ask, "YES"
        )
        ev_no = self.predictor.calculate_expected_value(
            final_probability, yes_bid, yes_ask, "NO"
        )

        # Determine recommended action - choose best EV
        if ev_yes > 0.02 and ev_yes > ev_no:  # > 2% EV
            signal_type = "BUY YES"
            ev = ev_yes
        elif ev_no > 0.02 and ev_no > ev_yes:
            signal_type = "BUY NO"
            ev = ev_no
        else:
            signal_type = "HOLD"
            ev = max(ev_yes, ev_no)

        # Calculate MISPRICING: theoretical_probability vs implied_probability
        # This is the EDGE - how much Kalshi is mis-pricing the contract
        mispricing = final_probability - implied_probability
        mispricing_pct = mispricing / implied_probability if implied_probability > 0 else 0

        # Absolute edge for ranking
        edge = abs(mispricing)

        # Determine mispricing signal
        if mispricing > 0.10:  # Theoretical prob 10%+ higher than market
            mispricing_signal = "KALSHI_UNDERPRICED"  # BUY YES
            mispricing_opportunity = f"Market prices YES at {implied_probability:.1%}, should be {final_probability:.1%}. BUY YES"
        elif mispricing < -0.10:  # Theoretical prob 10%+ lower than market
            mispricing_signal = "KALSHI_OVERPRICED"  # BUY NO
            mispricing_opportunity = f"Market prices YES at {implied_probability:.1%}, should be {final_probability:.1%}. BUY NO"
        else:
            mispricing_signal = "FAIR_PRICED"
            mispricing_opportunity = None

        # Calculate confidence based on edge size and OBI confirmation
        confidence = min(0.5 + (edge * 2), 0.95)

        # Boost confidence if OBI confirms the signal direction
        if obi_data and obi_data["confidence"] in ["medium", "high"]:
            if (signal_type == "BUY YES" and obi_data["obi_signal"] == "BULLISH") or \
               (signal_type == "BUY NO" and obi_data["obi_signal"] == "BEARISH"):
                confidence = min(confidence + 0.05, 0.95)

        result = {
            "id": contract_id,
            "ticker": ticker,
            "signal_type": signal_type,
            "expected_value": ev,
            "edge_percentage": edge,
            "recommended_price": yes_price if signal_type == "BUY YES" else no_price,
            "confidence_score": confidence,
            "time_to_expiry_hours": time_to_expiry_hours,
            "is_active": True,
            "strike_price": strike_price,
            "expiry_time": expiry_time.isoformat(),
            "current_btc_price": current_btc_price,
            "yes_price": yes_price,
            "no_price": no_price,
            "implied_probability": implied_probability,  # What Kalshi market prices
            "model_probability": model_probability,  # What DVOL+BS calculates
            "theoretical_probability": theoretical_probability,  # Same as model (for clarity)
            "flow_adjusted_probability": flow_adjusted_probability,  # OBI adjusted
            "mispricing": mispricing,  # Difference (final - implied)
            "mispricing_pct": mispricing_pct,  # Percentage mispricing
            "mispricing_signal": mispricing_signal,  # Trading signal
            "mispricing_opportunity": mispricing_opportunity,  # Human-readable explanation
        }

        # Add OBI data if available
        if obi_data:
            result["order_flow"] = obi_data

        # Add DFlow token mints if available (for Solana trading)
        dflow_mints = await self._get_dflow_mints(ticker)
        if dflow_mints:
            result["yes_mint"] = dflow_mints["yes_mint"]
            result["no_mint"] = dflow_mints["no_mint"]

        return result

    def _get_mock_contracts(self, current_btc_price: float) -> dict[str, Any]:
        """Return mock contracts for demo purposes."""
        from datetime import UTC, datetime, timedelta

        now = datetime.now(UTC)

        # Demo mints (fake addresses for UI testing)
        demo_yes_mint = "DeMoYeSMiNt1111111111111111111111111111111111"
        demo_no_mint = "DeMoNoMiNt11111111111111111111111111111111111"

        contracts = [
            {
                "id": 1,
                "ticker": "DEMO-BTC-95K",
                "signal_type": "BUY YES",
                "expected_value": 0.052,
                "edge_percentage": 0.073,
                "recommended_price": 0.45,
                "confidence_score": 0.78,
                "time_to_expiry_hours": 0.75,
                "is_active": True,
                "strike_price": 95000.0,
                "expiry_time": (now + timedelta(minutes=45)).isoformat(),
                "current_btc_price": current_btc_price,
                "yes_price": 0.45,
                "no_price": 0.55,
                "implied_probability": 0.45,
                "model_probability": 0.523,
                "yes_mint": demo_yes_mint,
                "no_mint": demo_no_mint,
            },
            {
                "id": 2,
                "ticker": "DEMO-BTC-94.5K",
                "signal_type": "BUY NO",
                "expected_value": 0.038,
                "edge_percentage": 0.066,
                "recommended_price": 0.28,
                "confidence_score": 0.72,
                "time_to_expiry_hours": 0.75,
                "is_active": True,
                "strike_price": 94500.0,
                "expiry_time": (now + timedelta(minutes=45)).isoformat(),
                "current_btc_price": current_btc_price,
                "yes_price": 0.72,
                "no_price": 0.28,
                "implied_probability": 0.72,
                "model_probability": 0.654,
                "yes_mint": demo_yes_mint,
                "no_mint": demo_no_mint,
            },
            {
                "id": 3,
                "ticker": "DEMO-BTC-96K",
                "signal_type": "BUY YES",
                "expected_value": 0.031,
                "edge_percentage": 0.045,
                "recommended_price": 0.28,
                "confidence_score": 0.68,
                "time_to_expiry_hours": 1.75,
                "is_active": True,
                "strike_price": 96000.0,
                "expiry_time": (now + timedelta(hours=1, minutes=45)).isoformat(),
                "current_btc_price": current_btc_price,
                "yes_price": 0.28,
                "no_price": 0.72,
                "implied_probability": 0.28,
                "model_probability": 0.325,
                "yes_mint": demo_yes_mint,
                "no_mint": demo_no_mint,
            },
        ]

        # Mock volatility data (includes Yang-Zhang and HAR-RV)
        volatility_data = {
            "realized_vol": 0.45,
            "realized_vol_close": 0.45,
            "realized_vol_parkinson": 0.45,
            "realized_vol_yang_zhang": 0.45,
            "implied_vol": 0.50,
            "regime": "NORMAL",
            "vol_premium": 0.05,
            "vol_premium_pct": 0.11,
            "vol_signal": "NEUTRAL",
            "forecast_vol": 0.48,
            "forecast_confidence": "high",
            "rv_ratio": 1.1,
        }

        return {
            "contracts": contracts,
            "volatility": volatility_data,
        }

    def _extract_strike_price(self, ticker: str, title: str) -> float | None:
        """Extract strike price from ticker or title."""
        import re

        # Try to find price in ticker
        # Format: KXBTCD-25NOV1312-T99999.99 or KXBTCD-25NOV1312-B96000
        # Extract after T, A, or B prefix
        ticker_match = re.search(r"[TAB]([\d.]+)", ticker)
        if ticker_match:
            price_str = ticker_match.group(1)
            # Round to nearest dollar for clean display (99999.99 -> 100000)
            return round(float(price_str))

        # Try to find price in title (e.g., "Will Bitcoin be above $95,000?")
        title_match = re.search(r"\$?([\d,]+)", title)
        if title_match:
            price_str = title_match.group(1).replace(",", "")
            return round(float(price_str))

        return None

    @cached(ttl=120, key_prefix="contracts:eth")
    async def get_ethereum_hourly_contracts(self) -> dict[str, Any]:
        """
        Fetch Ethereum hourly contracts from Kalshi and process them.

        Returns:
            Dict with contracts list and volatility data
        """
        # Get current ETH price
        try:
            current_eth_price = await self.eth_client.get_spot_price()
            print(f"✓ Successfully fetched ETH price: ${current_eth_price:,.2f}")
        except Exception as e:
            print(f"✗ Failed to fetch ETH price: {e}")
            current_eth_price = 3500.0  # Fallback price

        # Fetch historical candles for volatility analysis
        try:
            print("Fetching historical ETH candles for volatility analysis...")
            candles = await self.eth_client.get_historical_candles(hours=168)  # 1 week
            print(f"✓ Fetched {len(candles)} hourly candles")
        except Exception as e:
            print(f"✗ Failed to fetch historical candles: {e}")
            candles = []

        now_utc = datetime.now(UTC)
        est = ZoneInfo("America/New_York")

        # Fetch KXETHD markets from Kalshi (Ethereum hourly contracts)
        try:
            print("Fetching KXETHD Ethereum markets from Kalshi...")
            markets: list[dict[str, Any]] = []
            cursor: str | None = None
            max_pages = 10
            page = 0

            while page < max_pages:
                page += 1
                markets_response = await self.kalshi_client.get_markets(
                    series_ticker="KXETHD", limit=1000, cursor=cursor
                )
                page_markets = markets_response.get("markets", [])
                markets.extend(page_markets)
                cursor = markets_response.get("cursor")

                print(f"  Page {page}: {len(page_markets)} markets")

                if not cursor:
                    break

            print(f"✓ Received {len(markets)} KXETHD markets from Kalshi")

        except Exception as e:
            print(f"✗ Failed to fetch Ethereum markets: {e}")
            return {
                "contracts": [],
                "volatility": self._get_default_volatility()
            }

        # Process markets following Bitcoin pattern
        from collections import defaultdict

        contracts_by_expiry: dict[datetime, list[dict[str, Any]]] = defaultdict(list)
        expired_count = 0
        active_count = 0

        # Filter and group contracts by expiry time
        for market in markets:
            expiry_time_str = market.get("close_time") or market.get("expiration_time")
            if not expiry_time_str:
                continue

            expiry_utc = datetime.fromisoformat(expiry_time_str.replace("Z", "+00:00"))

            # Skip expired contracts
            if expiry_utc < now_utc:
                expired_count += 1
                continue

            # Skip finalized/settled contracts
            status = market.get("status", "").lower()
            if status in ["finalized", "settled", "closed"]:
                continue

            active_count += 1
            contracts_by_expiry[expiry_utc].append(market)

        print(f"📊 Contracts: {expired_count} expired, {active_count} active")

        # Get contracts for the next available expiry
        asset_contracts = []
        if contracts_by_expiry:
            sorted_expiries = sorted(contracts_by_expiry.items(), key=lambda x: x[0])
            selected_expiry, selected_markets = sorted_expiries[0]
            asset_contracts = selected_markets

            expiry_est = selected_expiry.astimezone(est)
            print(f"✓ Using {len(asset_contracts)} contracts expiring {expiry_est.strftime('%b %d %I%p %Z')}")

        # Calculate volatility from historical candles
        volatility_data = self._get_default_volatility()
        if candles:
            try:
                realized_vol = self.vol_regime.calculate_realized_volatility(candles)
                volatility_data["realized_vol"] = realized_vol
                volatility_data["realized_vol_close"] = realized_vol
                volatility_data["realized_vol_parkinson"] = realized_vol
            except Exception as e:
                print(f"✗ Failed to calculate volatility: {e}")

        # Process contracts (simplified - no DVOL yet)
        processed_contracts = []
        for contract_id, market in enumerate(asset_contracts, start=1):
            try:
                contract_data = await self._process_contract(market, current_eth_price, contract_id, dvol=None)
                if contract_data:
                    processed_contracts.append(contract_data)
            except Exception as e:
                print(f"✗ Error processing contract: {e}")

        # Sort by expected value and take top 10
        processed_contracts.sort(key=lambda x: x["expected_value"], reverse=True)
        top_contracts = processed_contracts[:10]

        print(f"✓ Processed {len(processed_contracts)} contracts, returning top {len(top_contracts)} by EV")

        return {
            "contracts": top_contracts,
            "volatility": volatility_data
        }

    @cached(ttl=120, key_prefix="contracts:xrp")
    async def get_ripple_hourly_contracts(self) -> dict[str, Any]:
        """
        Fetch Ripple (XRP) hourly contracts from Kalshi and process them.

        Returns:
            Dict with contracts list and volatility data
        """
        # Get current XRP price
        try:
            current_xrp_price = await self.xrp_client.get_spot_price()
            print(f"✓ Successfully fetched XRP price: ${current_xrp_price:,.4f}")
        except Exception as e:
            print(f"✗ Failed to fetch XRP price: {e}")
            current_xrp_price = 0.62  # Fallback price

        # Fetch historical candles for volatility analysis
        try:
            print("Fetching historical XRP candles for volatility analysis...")
            candles = await self.xrp_client.get_historical_candles(hours=168)  # 1 week
            print(f"✓ Fetched {len(candles)} hourly candles")
        except Exception as e:
            print(f"✗ Failed to fetch historical candles: {e}")
            candles = []

        now_utc = datetime.now(UTC)
        est = ZoneInfo("America/New_York")

        # Fetch KXXRPD markets from Kalshi (XRP hourly contracts)
        try:
            print("Fetching KXXRPD Ripple markets from Kalshi...")
            markets: list[dict[str, Any]] = []
            cursor: str | None = None
            max_pages = 10
            page = 0

            while page < max_pages:
                page += 1
                markets_response = await self.kalshi_client.get_markets(
                    series_ticker="KXXRPD", limit=1000, cursor=cursor
                )
                page_markets = markets_response.get("markets", [])
                markets.extend(page_markets)
                cursor = markets_response.get("cursor")

                print(f"  Page {page}: {len(page_markets)} markets")

                if not cursor:
                    break

            print(f"✓ Received {len(markets)} KXXRPD markets from Kalshi")

        except Exception as e:
            print(f"✗ Failed to fetch Ripple markets: {e}")
            return {
                "contracts": [],
                "volatility": self._get_default_volatility()
            }

        # Process markets following Bitcoin pattern
        from collections import defaultdict

        contracts_by_expiry: dict[datetime, list[dict[str, Any]]] = defaultdict(list)
        expired_count = 0
        active_count = 0

        # Filter and group contracts by expiry time
        for market in markets:
            expiry_time_str = market.get("close_time") or market.get("expiration_time")
            if not expiry_time_str:
                continue

            expiry_utc = datetime.fromisoformat(expiry_time_str.replace("Z", "+00:00"))

            # Skip expired contracts
            if expiry_utc < now_utc:
                expired_count += 1
                continue

            # Skip finalized/settled contracts
            status = market.get("status", "").lower()
            if status in ["finalized", "settled", "closed"]:
                continue

            active_count += 1
            contracts_by_expiry[expiry_utc].append(market)

        print(f"📊 Contracts: {expired_count} expired, {active_count} active")

        # Get contracts for the next available expiry
        asset_contracts = []
        if contracts_by_expiry:
            sorted_expiries = sorted(contracts_by_expiry.items(), key=lambda x: x[0])
            selected_expiry, selected_markets = sorted_expiries[0]
            asset_contracts = selected_markets

            expiry_est = selected_expiry.astimezone(est)
            print(f"✓ Using {len(asset_contracts)} contracts expiring {expiry_est.strftime('%b %d %I%p %Z')}")

        # Calculate volatility from historical candles
        volatility_data = self._get_default_volatility()
        if candles:
            try:
                realized_vol = self.vol_regime.calculate_realized_volatility(candles)
                volatility_data["realized_vol"] = realized_vol
                volatility_data["realized_vol_close"] = realized_vol
                volatility_data["realized_vol_parkinson"] = realized_vol
            except Exception as e:
                print(f"✗ Failed to calculate volatility: {e}")

        # Process contracts (simplified - no DVOL yet)
        processed_contracts = []
        for contract_id, market in enumerate(asset_contracts, start=1):
            try:
                contract_data = await self._process_contract(market, current_xrp_price, contract_id, dvol=None)
                if contract_data:
                    processed_contracts.append(contract_data)
            except Exception as e:
                print(f"✗ Error processing contract: {e}")

        # Sort by expected value and take top 10
        processed_contracts.sort(key=lambda x: x["expected_value"], reverse=True)
        top_contracts = processed_contracts[:10]

        print(f"✓ Processed {len(processed_contracts)} contracts, returning top {len(top_contracts)} by EV")

        return {
            "contracts": top_contracts,
            "volatility": volatility_data
        }

    def _get_default_volatility(self) -> dict[str, Any]:
        """Return default volatility data structure."""
        return {
            "realized_vol": 0.45,
            "realized_vol_close": 0.45,
            "realized_vol_parkinson": 0.45,
            "realized_vol_yang_zhang": 0.45,
            "implied_vol": 0.50,
            "regime": "NORMAL",
            "vol_premium": 0.05,
            "vol_premium_pct": 0.11,
            "vol_signal": "NEUTRAL",
            "forecast_vol": 0.48,
            "forecast_confidence": "medium",
            "rv_ratio": 1.0,
        }

    async def _get_dflow_mints(self, ticker: str) -> dict[str, str] | None:
        """
        Get DFlow token mints for a market ticker.

        Returns dict with yes_mint and no_mint, or None if unavailable.
        """
        # Check cache first
        if ticker in self._mint_cache:
            return self._mint_cache[ticker]

        # No DFlow client configured
        if not self.dflow_client:
            return None

        try:
            mints = await self.dflow_client.get_market_mints(ticker)
            if mints:
                self._mint_cache[ticker] = {
                    "yes_mint": mints["yes_mint"],
                    "no_mint": mints["no_mint"],
                }
                return self._mint_cache[ticker]
        except Exception as e:
            # DFlow not available for this market - graceful degradation
            pass

        return None
