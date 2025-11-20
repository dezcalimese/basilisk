"use client";

import { useEffect, useState } from "react";
import { MetricCard } from "@/components/dashboard/metric-card";
import { SignalList } from "@/components/dashboard/signal-list";
import { AnimatedPrice } from "@/components/dashboard/animated-price";
import { HelpDialog } from "@/components/help-dialog";
import { CalculatorDialog } from "@/components/calculator-dialog";
import { ThemeToggle } from "@/components/theme-toggle";
import { VolatilitySurface3D } from "@/components/dashboard/volatility-surface-3d";
import { PriceChart } from "@/components/dashboard/price-chart";
import { ConnectionStatus } from "@/components/connection-status";
import { HourlyStatsWidget } from "@/components/dashboard/hourly-stats-widget";
import { VolatilitySkewChart } from "@/components/dashboard/volatility-skew-chart";
import { ExtremeOpportunitiesWidget } from "@/components/dashboard/extreme-opportunities";
import { OrderBookDepth } from "@/components/dashboard/order-book-depth";
import { useRealtimeData } from "@/hooks/use-realtime-data";
import { useRealtimeStore } from "@/lib/stores/realtime-store";
import { useAnalyticalStore } from "@/lib/stores/analytical-store";

export default function Home() {
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);

  // Connect to SSE stream for real-time updates
  useRealtimeData({
    baseUrl: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000',
  });

  // Subscribe to stores
  const currentBtcPrice = useRealtimeStore((state) => state.currentPrice);
  const connectionState = useRealtimeStore((state) => state.connectionState);
  const signals = useAnalyticalStore((state) => state.signals);
  const volatility = useAnalyticalStore((state) => state.volatility);
  const signalsError = useAnalyticalStore((state) => state.signalsError);

  // Update time every second for countdown
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Auto-select first signal if none selected
  useEffect(() => {
    if (signals.length > 0 && !selectedTicker) {
      setSelectedTicker(signals[0].ticker);
    }
  }, [signals, selectedTicker]);

  const activeSignalsCount = signals.filter((s) => s.is_active).length;
  const avgEV =
    signals.length > 0
      ? signals.reduce((sum, s) => sum + s.expected_value, 0) / signals.length
      : 0;
  const highestEV =
    signals.length > 0
      ? Math.max(...signals.map((s) => s.expected_value))
      : 0;

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

  const isLoading = connectionState === 'connecting' && signals.length === 0;
  const hasError = connectionState === 'error' || signalsError !== null;

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="glass-header sticky top-0 z-40">
        <div className="container mx-auto px-4 py-3">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div>
                <h1 className="text-xl sm:text-2xl font-bold">Basilisk</h1>
                <p className="text-muted-foreground text-xs sm:text-sm hidden sm:block">A serpent's eye for mispriced markets</p>
              </div>
              <ConnectionStatus showLabel={false} showError={false} />
            </div>
            <div className="flex items-center gap-3 sm:gap-4 w-full sm:w-auto justify-between sm:justify-end">
              <ThemeToggle />
              <div className="text-right">
                <div className="text-xs sm:text-sm text-muted-foreground hidden sm:block">
                  Kalshi Trading Dashboard
                </div>
                {currentBtcPrice > 0 && (
                  <div className="flex items-center justify-end gap-2">
                    <AnimatedPrice price={currentBtcPrice} decimals={2} />
                    <span className="text-xs sm:text-sm text-muted-foreground">BTC</span>
                  </div>
                )}
                {nextExpiry && (
                  <div className="text-xs text-muted-foreground mt-1 font-mono">
                    {nextExpiry}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-2 sm:px-4 py-4">
        {isLoading && (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Connecting to data stream...</p>
          </div>
        )}

        {hasError && !isLoading && (
          <div className="bg-destructive/10 border border-destructive text-destructive px-4 py-3 rounded-lg mb-6">
            <p className="font-medium">Error loading data</p>
            <p className="text-sm mt-1">{signalsError || 'Connection error'}</p>
            <p className="text-xs mt-2">
              Make sure the backend is running at http://localhost:8000
            </p>
          </div>
        )}

        {!isLoading && (
          <>
            {/* All Metrics in One Row */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-3 sm:gap-4 mb-4">
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
              {volatility && (
                <>
                  <MetricCard
                    title="Realized Vol"
                    value={`${(volatility.realized_vol * 100).toFixed(1)}%`}
                    description="30-day historical"
                  />
                  <MetricCard
                    title="Implied Vol"
                    value={`${(volatility.implied_vol * 100).toFixed(1)}%`}
                    description="Market expectation"
                  />
                  <MetricCard
                    title="Vol Regime"
                    value={volatility.regime}
                    description={volatility.vol_signal}
                  />
                  <MetricCard
                    title="Vol Premium"
                    value={`${(volatility.vol_premium_pct * 100).toFixed(1)}%`}
                    description="IV over RV"
                  />
                </>
              )}
            </div>

            {/* Price Chart (1/2) + Order Book (1/4) + Active Signals (1/4) */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-4">
              <div className="lg:col-span-2 h-[500px]">
                <PriceChart signals={signals} height={400} />
              </div>
              <div className="lg:col-span-1 h-[500px]">
                <OrderBookDepth ticker={selectedTicker || undefined} />
              </div>
              <div className="lg:col-span-1 h-[500px]">
                <SignalList
                  signals={signals}
                  currentTime={currentTime}
                  selectedTicker={selectedTicker}
                  onSelectSignal={(ticker) => {
                    // Toggle: if clicking the same ticker, deselect it
                    setSelectedTicker(ticker === selectedTicker ? null : ticker);
                  }}
                />
              </div>
            </div>

            {/* Hourly Stats (2/3) + Extreme Opportunities (1/3) */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
              <div className="lg:col-span-2 h-[600px]">
                <HourlyStatsWidget />
              </div>
              <div className="lg:col-span-1 h-[600px]">
                <ExtremeOpportunitiesWidget />
              </div>
            </div>

            {/* Volatility Skew + 3D Volatility Surface */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
              <div className="lg:col-span-2">
                <VolatilitySkewChart />
              </div>
              <div className="lg:col-span-3">
                <VolatilitySurface3D
                  signals={signals}
                  currentBtcPrice={currentBtcPrice > 0 ? currentBtcPrice : null}
                />
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

      {/* Calculator Dialog */}
      <CalculatorDialog />
    </div>
  );
}
