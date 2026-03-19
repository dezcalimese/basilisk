"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { MetricCard } from "@/components/dashboard/metric-card";
import { SignalList } from "@/components/dashboard/signal-list";
import { AnimatedPrice } from "@/components/dashboard/animated-price";
import { HelpDialog } from "@/components/help-dialog";
import { CalculatorDialog } from "@/components/calculator-dialog";
import { ThemeToggle } from "@/components/theme-toggle";
import { AssetSelector } from "@/components/asset-selector";
import { TimeframeSelector } from "@/components/timeframe-selector";
import { WalletButton } from "@/components/auth/wallet-button";
import { LivelineChart } from "@/components/dashboard/liveline-chart";
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
  const [hasAutoSelected, setHasAutoSelected] = useState(false);

  useRealtimeData({
    baseUrl: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000',
  });

  const selectedAsset = useMultiAssetStore((state) => state.selectedAsset);
  const currentBtcPrice = useRealtimeStore().currentPrice;
  const connectionState = useRealtimeStore().connectionState;
  const signals = useAnalyticalStore().signals;

  useEffect(() => {
    if (!hasAutoSelected && !selectedTicker && signals.length > 0 && signals[0].ticker) {
      setSelectedTicker(signals[0].ticker);
      setHasAutoSelected(true);
    }
  }, [signals, selectedTicker, hasAutoSelected]);

  useEffect(() => {
    setSelectedTicker(null);
    setHasAutoSelected(false);
  }, [selectedAsset]);

  const volatility = useAnalyticalStore().volatility;
  const signalsError = useAnalyticalStore().signalsError;

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

  const isLoading = connectionState === 'connecting' && signals.length === 0;
  const hasError = connectionState === 'error' || signalsError !== null;

  return (
    <div className="h-full flex flex-col">
      {/* ── Header ── */}
      <header className="flex-none border-b border-border bg-background z-40">
        <div className="max-w-[1920px] mx-auto px-3 lg:px-4 h-12 flex items-center justify-between">
          {/* Left: Logo + Nav */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="relative w-7 h-7 rounded-md overflow-hidden">
                <Image
                  src="/basilisk-logo.png"
                  alt="Basilisk"
                  width={56}
                  height={56}
                  className="object-cover"
                  priority
                />
              </div>
              <span className="text-sm font-semibold tracking-tight hidden sm:block">
                Basilisk
              </span>
            </div>

            <div className="h-4 w-px bg-border" />

            <AssetSelector />
            <TimeframeSelector />
          </div>

          {/* Right: Controls */}
          <div className="flex items-center gap-2">
            <ConnectionStatus />
            <WalletButton />
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* ── Main Content ── */}
      <main className="flex-1 min-h-0 overflow-hidden">
        <div className="max-w-[1920px] mx-auto px-3 lg:px-4 py-2 h-full flex flex-col gap-2">

          {isLoading && (
            <div className="flex flex-col items-center justify-center py-24 gap-3">
              <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
              <p className="text-sm text-muted-foreground">Connecting...</p>
            </div>
          )}

          {hasError && !isLoading && (
            <div className="panel p-4 border-destructive/50">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-md bg-destructive/10 flex items-center justify-center flex-shrink-0">
                  <i className="icon-[lucide--alert-circle] w-4 h-4 text-destructive" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-destructive">Connection Error</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {signalsError || 'Unable to connect to data stream'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {!isLoading && (
            <>
              {/* ── Metrics Strip ── */}
              <div className="flex items-center gap-2 flex-none">
                <Metric label="Signals" value={activeSignalsCount} icon="zap"
                  tooltip="Number of active high-EV trading opportunities detected"
                />
                <Metric
                  label="Avg EV"
                  value={`${(avgEV * 100).toFixed(1)}%`}
                  color={avgEV >= 0 ? "positive" : "negative"}
                  icon={avgEV >= 0 ? "up" : "down"}
                  tooltip="Average expected value across all active signals. Higher = more profitable on average."
                />
                <Metric
                  label="Best"
                  value={`${(highestEV * 100).toFixed(1)}%`}
                  color="positive"
                  icon="up"
                  tooltip="Highest expected value signal available right now"
                />
                {volatility && (
                  <>
                    <div className="h-4 w-px bg-border flex-shrink-0" />
                    <Metric
                      label="RV"
                      value={`${(volatility.realized_vol * 100).toFixed(1)}%`}
                      icon="chart"
                      tooltip="Realized Volatility — actual price movement over the past 30 days (Yang-Zhang estimator)"
                    />
                    <Metric
                      label="IV"
                      value={
                        volatility.implied_vol > 0
                          ? `${(volatility.implied_vol * 100).toFixed(1)}%`
                          : "—"
                      }
                      sublabel={
                        volatility.deribit_iv != null && volatility.deribit_iv > 0
                          ? "DVOL"
                          : volatility.kalshi_iv != null && volatility.kalshi_iv > 0
                          ? "Kalshi"
                          : undefined
                      }
                      icon="chart"
                      tooltip="Implied Volatility — market's expectation of future volatility from options/prediction market prices"
                    />
                    <Metric label="Regime" value={volatility.regime} icon="shield"
                      tooltip="Volatility regime: CALM (<30%), NORMAL (30-50%), ELEVATED (50-75%), CRISIS (>75%)"
                    />
                    <Metric
                      label="Premium"
                      value={`${(volatility.vol_premium_pct * 100).toFixed(1)}%`}
                      color={volatility.vol_premium_pct > 0 ? "positive" : "negative"}
                      icon={volatility.vol_premium_pct > 0 ? "up" : "down"}
                      tooltip="Vol Premium — IV minus RV. Positive = market overpricing vol (sell signals). Negative = underpricing (buy signals)."
                    />
                  </>
                )}
              </div>

              {/* ── Primary Grid: Chart + Book + Signals ── */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-2 flex-[3] min-h-0">
                {/* Chart — 7 cols */}
                <div className="lg:col-span-7 min-h-0 fade-in">
                  <LivelineChart signals={signals} />
                </div>

                {/* Order Book — 2 cols */}
                <div className="lg:col-span-2 min-h-0 fade-in stagger-1">
                  <OrderBookDepth ticker={selectedTicker || undefined} />
                </div>

                {/* Signals — 3 cols */}
                <div className="lg:col-span-3 min-h-0 fade-in stagger-2">
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

              {/* ── Secondary Grid: Stats + Opportunities + Skew ── */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-2 flex-[2] min-h-0">
                <div className="lg:col-span-5 min-h-0 fade-in">
                  <HourlyStatsWidget />
                </div>
                <div className="lg:col-span-3 min-h-0 fade-in stagger-1">
                  <ExtremeOpportunitiesWidget />
                </div>
                <div className="lg:col-span-4 min-h-0 fade-in stagger-2">
                  <VolatilitySkewChart />
                </div>
              </div>
            </>
          )}
        </div>
      </main>

      {/* Dialogs */}
      <HelpDialog />
      <CalculatorDialog />
    </div>
  );
}

/* ── Inline Metric Chip with infographic indicator + hover tooltip ── */
function Metric({
  label,
  value,
  color,
  sublabel,
  icon,
  tooltip,
}: {
  label: string;
  value: string | number;
  color?: "positive" | "negative";
  sublabel?: string;
  icon?: "up" | "down" | "dot" | "chart" | "shield" | "zap";
  tooltip?: string;
}) {
  const [hovered, setHovered] = useState(false);

  const iconEl = icon ? (
    <span className={
      color === "positive" ? "text-emerald-500 dark:text-emerald-400" :
      color === "negative" ? "text-red-500 dark:text-red-400" :
      "text-muted-foreground"
    }>
      {icon === "up" && <i className="icon-[lucide--trending-up] w-3 h-3 inline-block" />}
      {icon === "down" && <i className="icon-[lucide--trending-down] w-3 h-3 inline-block" />}
      {icon === "dot" && <span className="inline-block w-1.5 h-1.5 rounded-full bg-current" />}
      {icon === "chart" && <i className="icon-[lucide--bar-chart-3] w-3 h-3 inline-block" />}
      {icon === "shield" && <i className="icon-[lucide--shield] w-3 h-3 inline-block" />}
      {icon === "zap" && <i className="icon-[lucide--zap] w-3 h-3 inline-block" />}
    </span>
  ) : null;

  return (
    <div
      className="relative flex-1 min-w-0"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-md bg-card border border-border text-xs cursor-default">
        {iconEl}
        <span className="text-muted-foreground">{label}</span>
        <span
          className={
            color === "positive"
              ? "font-semibold text-emerald-500 dark:text-emerald-400 font-tabular-nums"
              : color === "negative"
              ? "font-semibold text-red-500 dark:text-red-400 font-tabular-nums"
              : "font-semibold font-tabular-nums"
          }
        >
          {value}
        </span>
        {sublabel && (
          <span className="text-[10px] text-muted-foreground/60">{sublabel}</span>
        )}
      </div>
      {tooltip && hovered && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1.5 z-50 w-52">
          <div className="rounded-lg px-3 py-2 text-[11px] text-muted-foreground shadow-lg border border-border/50 leading-relaxed bg-popover">
            {tooltip}
          </div>
        </div>
      )}
    </div>
  );
}
