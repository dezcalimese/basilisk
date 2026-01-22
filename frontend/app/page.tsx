"use client";

import { useEffect, useState } from "react";
import { MetricCard } from "@/components/dashboard/metric-card";
import { SignalList } from "@/components/dashboard/signal-list";
import { AnimatedPrice } from "@/components/dashboard/animated-price";
import { HelpDialog } from "@/components/help-dialog";
import { CalculatorDialog } from "@/components/calculator-dialog";
import { ThemeToggle } from "@/components/theme-toggle";
import { AssetSelector } from "@/components/asset-selector";
// import { VolatilitySurface3D } from "@/components/dashboard/volatility-surface-3d";
import { PriceChart } from "@/components/dashboard/price-chart";
import { ConnectionStatus } from "@/components/connection-status";
import { HourlyStatsWidget } from "@/components/dashboard/hourly-stats-widget";
import { VolatilitySkewChart } from "@/components/dashboard/volatility-skew-chart";
import { ExtremeOpportunitiesWidget } from "@/components/dashboard/extreme-opportunities";
import { OrderBookDepth } from "@/components/dashboard/order-book-depth";
import { useRealtimeData } from "@/hooks/use-realtime-data";
import { useMultiAssetStore, useRealtimeStore, useAnalyticalStore } from "@/lib/stores/multi-asset-store";

export default function Home() {
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);

  // Connect to SSE stream for real-time updates
  useRealtimeData({
    baseUrl: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000',
  });

  // Subscribe to stores
  const selectedAsset = useMultiAssetStore((state) => state.selectedAsset);
  const currentBtcPrice = useRealtimeStore().currentPrice;
  const connectionState = useRealtimeStore().connectionState;
  const signals = useAnalyticalStore().signals;
  const volatility = useAnalyticalStore().volatility;
  const signalsError = useAnalyticalStore().signalsError;

  // Update time every second for countdown
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // No auto-select - let users click to expand signals

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
    <div className="h-full flex flex-col">
      {/* Header */}
      <header className="glass-header flex-none z-40">
        <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex items-center justify-between">
            {/* Left: Logo + Asset Selector */}
            <div className="flex items-center gap-4 sm:gap-6">
              <div className="flex items-center gap-3">
                {/* Basilisk Logo Mark */}
                <div className="relative w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-sky-500 flex items-center justify-center glow-cyan">
                  <svg viewBox="0 0 24 24" className="w-6 h-6 text-white" fill="currentColor">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
                  </svg>
                </div>
                <div>
                  <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
                    <span className="text-primary">Basilisk</span>
                  </h1>
                  <p className="text-muted-foreground text-xs hidden sm:block">
                    Prediction Market Analytics
                  </p>
                </div>
              </div>

              <div className="hidden sm:block h-8 w-px bg-border" />

              <AssetSelector />
              <ConnectionStatus showLabel={false} showError={false} />
            </div>

            {/* Right: Price + Controls */}
            <div className="flex items-center gap-4 sm:gap-6">
              {/* Live Price Display */}
              {currentBtcPrice > 0 && (
                <div className="hidden md:flex items-center gap-3 glass-metric px-4 py-2 rounded-xl">
                  <div className="flex flex-col items-end">
                    <span className="text-xs text-muted-foreground">{selectedAsset}/USD</span>
                    <AnimatedPrice price={currentBtcPrice} decimals={2} className="text-lg font-bold text-primary" />
                  </div>
                  {nextExpiry && (
                    <div className="flex flex-col items-center border-l border-border pl-3">
                      <span className="text-xs text-muted-foreground">Next Expiry</span>
                      <span className="text-sm font-mono text-cyan-500">{nextExpiry}</span>
                    </div>
                  )}
                </div>
              )}

              <ThemeToggle />
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-4">
        {isLoading && (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <div className="w-12 h-12 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            <p className="text-muted-foreground">Connecting to data stream...</p>
          </div>
        )}

        {hasError && !isLoading && (
          <div className="glass-card rounded-2xl p-6 mb-6 border-destructive/50">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center flex-shrink-0">
                <i className="icon-[lucide--alert-circle] w-5 h-5 text-destructive" />
              </div>
              <div>
                <h3 className="font-semibold text-destructive">Connection Error</h3>
                <p className="text-sm text-muted-foreground mt-1">{signalsError || 'Unable to connect to data stream'}</p>
                <p className="text-xs text-muted-foreground mt-2">
                  Ensure the backend is running at {process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}
                </p>
              </div>
            </div>
          </div>
        )}

        {!isLoading && (
          <>
            {/* Metrics Row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 mb-3">
              <div className="fade-in stagger-1">
                <MetricCard
                  title="Active Signals"
                  value={activeSignalsCount}
                  description="High EV opportunities"
                  icon="lucide--zap"
                />
              </div>
              <div className="fade-in stagger-2">
                <MetricCard
                  title="Average EV"
                  value={`${(avgEV * 100).toFixed(1)}%`}
                  description="Expected value"
                  icon="lucide--trending-up"
                  valueColor={avgEV >= 0 ? "positive" : "negative"}
                />
              </div>
              <div className="fade-in stagger-3">
                <MetricCard
                  title="Best Signal"
                  value={`${(highestEV * 100).toFixed(1)}%`}
                  description="Highest EV"
                  icon="lucide--star"
                  valueColor="positive"
                />
              </div>
              {volatility && (
                <>
                  <div className="fade-in stagger-4">
                    <MetricCard
                      title="Realized Vol"
                      value={`${(volatility.realized_vol * 100).toFixed(1)}%`}
                      description="30-day historical"
                      icon="lucide--activity"
                    />
                  </div>
                  <div className="fade-in stagger-5">
                    <MetricCard
                      title="Implied Vol"
                      value={`${(volatility.implied_vol * 100).toFixed(1)}%`}
                      description="Market expectation"
                      icon="lucide--gauge"
                    />
                  </div>
                  <div className="fade-in stagger-6">
                    <MetricCard
                      title="Vol Regime"
                      value={volatility.regime}
                      description={volatility.vol_signal}
                      icon="lucide--layers"
                    />
                  </div>
                  <div className="fade-in stagger-7">
                    <MetricCard
                      title="Vol Premium"
                      value={`${(volatility.vol_premium_pct * 100).toFixed(1)}%`}
                      description="IV over RV"
                      icon="lucide--percent"
                      valueColor={volatility.vol_premium_pct > 0 ? "positive" : "negative"}
                    />
                  </div>
                </>
              )}
            </div>

            {/* Main Grid: Chart + OrderBook + Signals */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 mb-4">
              {/* Price Chart - 6 cols */}
              <div className="lg:col-span-6 h-[380px] fade-in">
                <PriceChart signals={signals} height={320} />
              </div>

              {/* Order Book - 3 cols */}
              <div className="lg:col-span-3 h-[380px] fade-in stagger-1">
                <OrderBookDepth ticker={selectedTicker || undefined} />
              </div>

              {/* Active Signals - 3 cols */}
              <div className="lg:col-span-3 h-[380px] fade-in stagger-2">
                <SignalList
                  signals={signals}
                  currentTime={currentTime}
                  selectedTicker={selectedTicker}
                  onSelectSignal={(ticker) => {
                    setSelectedTicker(ticker === selectedTicker ? null : ticker);
                  }}
                />
              </div>
            </div>

            {/* Secondary Row: Hourly Stats + Volatility */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
              {/* Hourly Stats - 5 cols */}
              <div className="lg:col-span-5 h-[320px] fade-in">
                <HourlyStatsWidget />
              </div>

              {/* Opportunities - 3 cols */}
              <div className="lg:col-span-3 h-[320px] fade-in stagger-1">
                <ExtremeOpportunitiesWidget />
              </div>

              {/* Volatility Skew - 4 cols */}
              <div className="lg:col-span-4 h-[320px] fade-in stagger-2">
                <VolatilitySkewChart />
              </div>
            </div>
          </>
        )}
        </div>
      </main>

      {/* Footer - Compact */}
      <footer className="glass-footer flex-none">
        <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-gradient-to-br from-cyan-500 to-sky-500 flex items-center justify-center">
                <svg viewBox="0 0 24 24" className="w-3 h-3 text-white" fill="currentColor">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
                </svg>
              </div>
              <span className="font-medium">Basilisk</span>
            </div>
            <span>Kalshi Prediction Markets</span>
          </div>
        </div>
      </footer>

      {/* Dialogs */}
      <HelpDialog />
      <CalculatorDialog />
    </div>
  );
}
