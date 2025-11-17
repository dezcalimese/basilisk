"use client";

import { useEffect, useState } from "react";
import { MetricCard } from "@/components/dashboard/metric-card";
import { SignalList } from "@/components/dashboard/signal-list";
import { AnimatedPrice } from "@/components/dashboard/animated-price";
import { HelpDialog } from "@/components/help-dialog";
import { ThemeToggle } from "@/components/theme-toggle";
import { VolatilitySurface3D } from "@/components/dashboard/volatility-surface-3d";
import { PriceChart } from "@/components/dashboard/price-chart";
import { ConnectionStatus } from "@/components/connection-status";
import { useRealtimeData } from "@/hooks/use-realtime-data";
import { useRealtimeStore } from "@/lib/stores/realtime-store";
import { useAnalyticalStore } from "@/lib/stores/analytical-store";

export default function Home() {
  const [currentTime, setCurrentTime] = useState(Date.now());

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
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div>
                <h1 className="text-2xl font-bold">Basilisk</h1>
                <p className="text-muted-foreground text-sm">See the true odds</p>
              </div>
              <ConnectionStatus showLabel={true} showError={false} />
            </div>
            <div className="flex items-center gap-4">
              <ThemeToggle />
              <div className="text-right">
                <div className="text-sm text-muted-foreground">
                  Kalshi Trading Dashboard
                </div>
                {currentBtcPrice > 0 && (
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
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-7 gap-4 mb-4">
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

            {/* Price Chart - Full Width */}
            <div className="mb-4">
              <PriceChart signals={signals} height={400} />
            </div>

            {/* Main Grid: Volatility Surface (2/3) + Active Signals List (1/3) */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
              {/* Volatility Surface - 2/3 width */}
              <div className="lg:col-span-2 h-full">
                <VolatilitySurface3D
                  signals={signals}
                  currentBtcPrice={currentBtcPrice > 0 ? currentBtcPrice : null}
                />
              </div>

              {/* Active Signals List - 1/3 width */}
              <div className="lg:col-span-1 h-full">
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
