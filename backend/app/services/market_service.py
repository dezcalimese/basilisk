"""Service for fetching and processing market data."""

from datetime import UTC, datetime
from typing import Any
from zoneinfo import ZoneInfo

from app.data.bitcoin_client import BitcoinPriceClient
from app.data.kalshi_client import KalshiClient
from app.models.predictor import ProbabilityPredictor


class MarketService:
    """Service for fetching and processing market data."""

    def __init__(self) -> None:
        """Initialize market service."""
        self.kalshi_client = KalshiClient()
        self.btc_client = BitcoinPriceClient()
        self.predictor = ProbabilityPredictor()

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

        now_utc = datetime.now(UTC)
        est = ZoneInfo("America/New_York")
        now_est = now_utc.astimezone(est)

        # Fetch KXBTCD markets from Kalshi (timed contracts)
        try:
            print("Fetching KXBTCD Bitcoin markets from Kalshi...")
            markets: list[dict[str, Any]] = []
            cursor: str | None = None
            max_pages = 5
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

                if self._has_active_same_day_contracts(
                    page_markets, now_utc, est
                ):
                    found_today = True
                    break

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

        # Get contracts for the next top-of-hour expiry
        btc_contracts = []
        selected_expiry: datetime | None = None
        if sorted_expiries:
            # Find the next top-of-hour contract (where minutes = 0)
            # Prefer contracts expiring at the top of the hour
            next_hour_contracts = [
                (expiry_utc, market_list)
                for expiry_utc, market_list in sorted_expiries
                if expiry_utc.minute == 0  # Top of hour in UTC
            ]

            if next_hour_contracts:
                selected_expiry, selected_markets = next_hour_contracts[0]
            elif sorted_expiries:
                # Fallback to earliest available
                selected_expiry, selected_markets = sorted_expiries[0]

            btc_contracts = selected_markets if selected_expiry else []

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

        # Process each contract
        processed_contracts = []
        for idx, market in enumerate(btc_contracts):
            try:
                contract_data = await self._process_contract(
                    market, current_btc_price, idx + 1
                )
                if contract_data:
                    processed_contracts.append(contract_data)
            except Exception as e:
                print(f"✗ Error processing contract {market.get('ticker')}: {e}")
                continue

        # Sort by expected value (highest first) and take top 10
        processed_contracts.sort(key=lambda x: x["expected_value"], reverse=True)
        top_contracts = processed_contracts[:10]

        print(f"✓ Processed {len(processed_contracts)} contracts, returning top {len(top_contracts)} by EV")

        return top_contracts

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
        self, market: dict[str, Any], current_btc_price: float, contract_id: int
    ) -> dict[str, Any] | None:
        """Process a single contract."""
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

        # Implied probability (from YES price)
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

        # Model prediction (for now, just use implied probability as baseline)
        features = {
            "implied_probability": implied_probability,
            "strike_price": strike_price,
            "current_price": current_btc_price,
            "time_to_expiry_hours": time_to_expiry_hours,
        }
        model_probability = self.predictor.predict_probability(features)

        # Calculate expected value for both YES and NO positions
        ev_yes = self.predictor.calculate_expected_value(
            model_probability, yes_bid, yes_ask, "YES"
        )
        ev_no = self.predictor.calculate_expected_value(
            model_probability, yes_bid, yes_ask, "NO"
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

        # Calculate edge
        edge = abs(model_probability - implied_probability)

        # Calculate confidence (simplified)
        confidence = min(0.5 + (edge * 2), 0.95)

        return {
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
            "implied_probability": implied_probability,
            "model_probability": model_probability,
        }

    def _get_mock_contracts(self, current_btc_price: float) -> list[dict[str, Any]]:
        """Return mock contracts for demo purposes."""
        from datetime import UTC, datetime, timedelta

        now = datetime.now(UTC)

        return [
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
            },
        ]

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
