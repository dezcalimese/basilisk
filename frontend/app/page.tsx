"use client";

import { useEffect, useState } from "react";
import { api, type TradeSignal } from "@/lib/api";
import { MetricCard } from "@/components/dashboard/metric-card";
import { SignalList } from "@/components/dashboard/signal-list";
import { AnimatedPrice } from "@/components/dashboard/animated-price";
import { HelpDialog } from "@/components/help-dialog";
import { ThemeToggle } from "@/components/theme-toggle";
import { VolatilitySurface } from "@/components/dashboard/volatility-surface";

const SIGNAL_REFRESH_INTERVAL_MS = 5_000;
const BTC_PRICE_REFRESH_INTERVAL_MS = 5_000;

export default function Home() {
  const [signals, setSignals] = useState<TradeSignal[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [liveBtcPrice, setLiveBtcPrice] = useState<number | null>(null);

  // Update time every second for countdown
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch BTC price separately every 5 seconds (no rate limits from Coinbase)
  useEffect(() => {
    const fetchBtcPrice = async () => {
      try {
        const response = await fetch(
          "https://api.coinbase.com/v2/prices/BTC-USD/spot"
        );
        const data = await response.json();
        const price = parseFloat(data.data.amount);
        setLiveBtcPrice(price);
      } catch (err) {
        console.error("Failed to fetch BTC price:", err);
      }
    };

    fetchBtcPrice();
    const priceInterval = setInterval(
      fetchBtcPrice,
      BTC_PRICE_REFRESH_INTERVAL_MS
    );
    return () => clearInterval(priceInterval);
  }, []);

  // Fetch Kalshi signals every 30 seconds
  useEffect(() => {
    const fetchSignals = async () => {
      try {
        const data = await api.getCurrentSignals(10);
        setSignals(data);
        setError(null);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to fetch signals"
        );
      } finally {
        setInitialLoading(false);
      }
    };

    fetchSignals();
    const interval = setInterval(fetchSignals, SIGNAL_REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  const activeSignalsCount = signals.filter((s) => s.is_active).length;
  const avgEV =
    signals.length > 0
      ? signals.reduce((sum, s) => sum + s.expected_value, 0) / signals.length
      : 0;
  const highestEV =
    signals.length > 0
      ? Math.max(...signals.map((s) => s.expected_value))
      : 0;

  // Use live BTC price from Coinbase, fallback to signals data
  const currentBtcPrice = liveBtcPrice ||
    (signals.length > 0 && signals[0].current_btc_price
      ? signals[0].current_btc_price
      : null);

  // Calculate live time to expiry in detailed format
  const nextExpiry = signals.length > 0 && signals[0].expiry_time
    ? (() => {
        const expiryTime = new Date(signals[0].expiry_time).getTime();
        const msRemaining = Math.max(0, expiryTime - currentTime);
        const totalSeconds = Math.floor(msRemaining / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        if (hours > 0) {
          return `${hours}h ${minutes}m ${seconds}s`;
        } else if (minutes > 0) {
          return `${minutes}m ${seconds}s`;
        } else {
          return `${seconds}s`;
        }
      })()
    : null;

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="glass-header sticky top-0 z-40">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">Basilisk</h1>
              <p className="text-muted-foreground text-sm">See the true odds</p>
            </div>
            <div className="flex items-center gap-4">
              <ThemeToggle />
              <div className="text-right">
                <div className="text-sm text-muted-foreground">
                  Kalshi Trading Dashboard
                </div>
                {currentBtcPrice && (
                  <div className="mt-2 flex items-center justify-end gap-2">
                    <AnimatedPrice price={currentBtcPrice} decimals={2} />
                    <span className="text-sm text-muted-foreground">BTC</span>
                  </div>
                )}
                {nextExpiry && (
                  <div className="text-xs text-muted-foreground mt-1 font-mono">
                    Next expiry: {nextExpiry}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-4">
        {initialLoading && (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Loading signals...</p>
          </div>
        )}

        {error && !initialLoading && (
          <div className="bg-destructive/10 border border-destructive text-destructive px-4 py-3 rounded-lg mb-6">
            <p className="font-medium">Error loading data</p>
            <p className="text-sm mt-1">{error}</p>
            <p className="text-xs mt-2">
              Make sure the backend is running at http://localhost:8000
            </p>
          </div>
        )}

        {!initialLoading && (
          <>
            {/* Metrics Row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <MetricCard
                title="Active Signals"
                value={activeSignalsCount}
                description="High EV opportunities"
              />
              <MetricCard
                title="Average EV"
                value={`${(avgEV * 100).toFixed(1)}%`}
                description="Expected value"
              />
              <MetricCard
                title="Highest EV"
                value={`${(highestEV * 100).toFixed(1)}%`}
                description="Best opportunity"
              />
            </div>

            {/* Main Grid: Volatility Surface (2/3) + Active Signals List (1/3) */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Volatility Surface - 2/3 width */}
              <div className="lg:col-span-2">
                <VolatilitySurface
                  signals={signals}
                  currentBtcPrice={currentBtcPrice}
                />
              </div>

              {/* Active Signals List - 1/3 width */}
              <div className="lg:col-span-1">
                <SignalList signals={signals} currentTime={currentTime} />
              </div>
            </div>
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="glass-footer mt-6">
        <div className="container mx-auto px-4 py-3">
          <p className="text-center text-sm text-muted-foreground">
            Basilisk • Probabilistic trading analytics for Kalshi markets
          </p>
        </div>
      </footer>

      {/* Help Dialog */}
      <HelpDialog />
    </div>
  );
}
