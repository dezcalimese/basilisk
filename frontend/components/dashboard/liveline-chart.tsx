"use client";

import { useEffect, useMemo, useState } from "react";
import { useTheme } from "next-themes";
import { Liveline } from "liveline";
import type { CandlePoint, LivelinePoint } from "liveline";
import { useRealtimeStore, useMultiAssetStore, useAnalyticalStore } from "@/lib/stores/multi-asset-store";
import { AnimatedPrice } from "@/components/dashboard/animated-price";
import type { TradeSignal } from "@/lib/api";

interface LivelineChartProps {
  signals?: TradeSignal[];
}

export function LivelineChart({ signals = [] }: LivelineChartProps) {
  const [chartMode, setChartMode] = useState<"line" | "candle">("line");
  const [lineMode, setLineMode] = useState(true);
  const [mounted, setMounted] = useState(false);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    setMounted(true);
  }, []);

  const selectedAsset = useMultiAssetStore((state) => state.selectedAsset);
  const selectedTimeframe = useMultiAssetStore((state) => state.selectedTimeframe);
  const connectionState = useRealtimeStore().connectionState;
  const { candles, lastCandle, currentPrice: sseCurrentPrice } = useRealtimeStore();
  const volatility = useAnalyticalStore().volatility;

  // Current price from SSE or fallback to last candle close
  const currentPrice = sseCurrentPrice > 0
    ? sseCurrentPrice
    : (lastCandle?.close || (candles.length > 0 ? candles[candles.length - 1].close : 0));

  // Convert candle data to Liveline line format (close prices as points)
  const lineData: LivelinePoint[] = useMemo(() => {
    return candles.map((c) => ({
      time: Math.floor(c.timestamp / 1000),
      value: c.close,
    }));
  }, [candles]);

  // Convert candle data to Liveline candlestick format
  const candleData: CandlePoint[] = useMemo(() => {
    return candles
      .filter((c) => c.isClosed)
      .map((c) => ({
        time: Math.floor(c.timestamp / 1000),
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }));
  }, [candles]);

  // Live candle (the current in-progress candle)
  const liveCandle: CandlePoint | undefined = useMemo(() => {
    if (!lastCandle) return undefined;
    return {
      time: Math.floor(lastCandle.timestamp / 1000),
      open: lastCandle.open,
      high: lastCandle.high,
      low: lastCandle.low,
      close: lastCandle.close,
    };
  }, [lastCandle]);

  // Find the highest-EV active signal for the reference line
  const bestStrike = useMemo(() => {
    const activeSignals = signals.filter(
      (s) => s.is_active && s.strike_price != null && s.expiry_time
    );
    if (activeSignals.length === 0) return undefined;

    // Get nearest expiry signals
    const nearestExpiry = activeSignals.reduce((nearest, signal) => {
      const signalExpiry = new Date(signal.expiry_time!).getTime();
      const nearestTime = nearest ? new Date(nearest.expiry_time!).getTime() : Infinity;
      return signalExpiry < nearestTime ? signal : nearest;
    }, activeSignals[0]);

    const nearestExpiryTime = nearestExpiry.expiry_time;
    const nearestExpirySignals = activeSignals.filter(
      (s) => s.expiry_time === nearestExpiryTime
    );

    // Find highest EV signal
    const best = nearestExpirySignals.reduce((highest, signal) => {
      return signal.expected_value > highest.expected_value ? signal : highest;
    }, nearestExpirySignals[0]);

    return best;
  }, [signals]);

  // Strike orderbook overlay removed — EV values were being displayed as
  // dollar amounts ($51 etc.) which was confusing. The reference line
  // already marks the best strike clearly.

  // Reference line for the best strike
  const referenceLine = useMemo(() => {
    if (!bestStrike?.strike_price) return undefined;
    const ev = (bestStrike.expected_value * 100).toFixed(0);
    const strikeFormatted = bestStrike.strike_price >= 1000
      ? `$${(bestStrike.strike_price / 1000).toFixed(1)}k`
      : `$${bestStrike.strike_price.toLocaleString()}`;
    return {
      value: bestStrike.strike_price,
      label: `${strikeFormatted} Strike (${ev}% EV)`,
    };
  }, [bestStrike]);

  // Next expiry countdown
  const [currentTime, setCurrentTime] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const nextExpiry = useMemo(() => {
    const firstWithExpiry = signals.find((s) => s.is_active && s.expiry_time);
    if (!firstWithExpiry?.expiry_time) return null;
    const ms = Math.max(0, new Date(firstWithExpiry.expiry_time).getTime() - currentTime);
    const totalSecs = Math.floor(ms / 1000);
    const h = Math.floor(totalSecs / 3600);
    const m = Math.floor((totalSecs % 3600) / 60);
    const s = totalSecs % 60;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  }, [signals, currentTime]);

  // No overlay series — chart shows the primary price line only

  // Determine if volatile regime for degen mode
  const isDegen = volatility?.regime === "CRISIS" || volatility?.regime === "HIGH";

  // Loading state
  const isLoading = connectionState === "connecting" && candles.length === 0;

  // Format price values
  const formatValue = (v: number) =>
    `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="glass-card rounded-2xl p-4 h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between mb-2 shrink-0">
        <div className="flex items-center gap-3">
          <h3 className="text-sm text-muted-foreground font-bold">
            {selectedAsset}/USD
          </h3>
          {currentPrice > 0 && (
            <AnimatedPrice price={currentPrice} decimals={2} className="text-lg font-bold text-primary" />
          )}
          {nextExpiry && (
            <span className="text-xs text-muted-foreground font-mono">
              {nextExpiry}
            </span>
          )}
        </div>
        {bestStrike && (
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-muted-foreground font-bold">Best Strike:</span>
            <span className="text-primary font-medium">
              {bestStrike.strike_price! >= 1000
                ? `$${(bestStrike.strike_price! / 1000).toFixed(1)}k`
                : `$${bestStrike.strike_price!.toLocaleString()}`}
            </span>
            <span className={bestStrike.expected_value >= 0 ? "text-green-500" : "text-red-500"}>
              {(bestStrike.expected_value * 100).toFixed(1)}% EV
            </span>
          </div>
        )}
      </div>

      {/* Chart container - Liveline fills its parent */}
      <div className="flex-1 min-h-0">
        {mounted && <Liveline
          key={`${selectedAsset}-${selectedTimeframe}`}
          // Data
          data={lineData}
          value={currentPrice}
          mode={chartMode}
          candles={candleData}
          candleWidth={60}
          liveCandle={liveCandle}
          lineMode={lineMode}
          lineData={lineData}
          lineValue={currentPrice}
          onModeChange={(mode) => {
            if (mode === "line") {
              setChartMode("line");
              setLineMode(true);
            } else {
              setChartMode("candle");
              setLineMode(false);
            }
          }}
          // Appearance
          theme={resolvedTheme === "light" ? "light" : "dark"}
          color="#2dd4bf"
          grid
          badge
          fill
          pulse
          // Features
          momentum
          scrub
          valueMomentumColor
          degen={isDegen ? { scale: 1.5 } : false}
          exaggerate={false}
          badgeVariant="minimal"
          badgeTail
          tooltipOutline
          // State
          loading={isLoading}
          paused={connectionState === "error"}
          emptyText={`Waiting for ${selectedAsset} data...`}
          // Time windows — order matters, first item is fallback default
          window={selectedTimeframe === "15m" ? 900 : 3600}
          windows={
            selectedTimeframe === "15m"
              ? [
                  { label: "15m", secs: 900 },
                  { label: "5m", secs: 300 },
                  { label: "1h", secs: 3600 },
                  { label: "3h", secs: 10800 },
                  { label: "1d", secs: 86400 },
                ]
              : [
                  { label: "1h", secs: 3600 },
                  { label: "5m", secs: 300 },
                  { label: "15m", secs: 900 },
                  { label: "3h", secs: 10800 },
                  { label: "1d", secs: 86400 },
                ]
          }
          windowStyle="rounded"
          // Strike price reference line
          referenceLine={referenceLine}
          // Formatting
          formatValue={formatValue}
          // Layout
          padding={{ top: 12, right: 88, bottom: 56, left: 12 }}
        />}
      </div>
    </div>
  );
}
