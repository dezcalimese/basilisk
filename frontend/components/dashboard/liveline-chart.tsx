"use client";

import { useEffect, useMemo, useState } from "react";
import { useTheme } from "next-themes";
import { Liveline } from "liveline";
import type { CandlePoint, LivelinePoint, OrderbookData } from "liveline";
import { useRealtimeStore, useMultiAssetStore, useAnalyticalStore } from "@/lib/stores/multi-asset-store";
import { AnimatedPrice } from "@/components/dashboard/animated-price";
import type { TradeSignal } from "@/lib/api";

interface LivelineChartProps {
  signals?: TradeSignal[];
}

export function LivelineChart({ signals = [] }: LivelineChartProps) {
  const [chartMode, setChartMode] = useState<"line" | "candle">("candle");
  const [lineMode, setLineMode] = useState(false);
  const { resolvedTheme } = useTheme();

  const selectedAsset = useMultiAssetStore((state) => state.selectedAsset);
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

  // Map strike prices to orderbook-style floating labels
  // Bids = BUY signals (below current price), Asks = SELL/above signals
  const strikeOrderbook: OrderbookData | undefined = useMemo(() => {
    const activeSignals = signals.filter(
      (s) => s.is_active && s.strike_price != null && s.expiry_time
    );
    if (activeSignals.length === 0) return undefined;

    // Get nearest expiry only
    const nearestExpiry = activeSignals.reduce((nearest, signal) => {
      const signalExpiry = new Date(signal.expiry_time!).getTime();
      const nearestTime = nearest ? new Date(nearest.expiry_time!).getTime() : Infinity;
      return signalExpiry < nearestTime ? signal : nearest;
    }, activeSignals[0]);

    const nearestExpiryTime = nearestExpiry.expiry_time;
    const nearestExpirySignals = activeSignals.filter(
      (s) => s.expiry_time === nearestExpiryTime
    );

    const bids: [number, number][] = [];
    const asks: [number, number][] = [];

    nearestExpirySignals.forEach((signal) => {
      const price = signal.strike_price!;
      // Use EV as the "size" so brighter = higher EV
      const size = Math.max(1, Math.abs(signal.expected_value) * 100);

      if (signal.signal_type.includes("BUY") || price < currentPrice) {
        bids.push([price, size]);
      } else {
        asks.push([price, size]);
      }
    });

    // Sort bids descending, asks ascending
    bids.sort((a, b) => b[0] - a[0]);
    asks.sort((a, b) => a[0] - b[0]);

    return bids.length > 0 || asks.length > 0 ? { bids, asks } : undefined;
  }, [signals, currentPrice]);

  // Reference line for the best strike
  const referenceLine = useMemo(() => {
    if (!bestStrike?.strike_price) return undefined;
    const strikeK = bestStrike.strike_price / 1000;
    const ev = (bestStrike.expected_value * 100).toFixed(0);
    return {
      value: bestStrike.strike_price,
      label: `$${strikeK.toFixed(0)}k Strike (${ev}% EV)`,
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
              ${(bestStrike.strike_price! / 1000).toFixed(0)}k
            </span>
            <span className={bestStrike.expected_value >= 0 ? "text-green-500" : "text-red-500"}>
              {(bestStrike.expected_value * 100).toFixed(1)}% EV
            </span>
          </div>
        )}
      </div>

      {/* Chart container - Liveline fills its parent */}
      <div className="flex-1 min-h-0">
        <Liveline
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
              setLineMode(true);
            } else {
              setLineMode(false);
            }
          }}
          // Appearance
          theme={resolvedTheme === "light" ? "light" : "dark"}
          color="#06b6d4"
          grid
          badge
          fill
          pulse
          // Features
          momentum
          scrub
          showValue
          valueMomentumColor
          degen={isDegen ? { scale: 1.5 } : false}
          exaggerate={false}
          badgeVariant="minimal"
          // State
          loading={isLoading}
          paused={connectionState === "error"}
          emptyText={`Waiting for ${selectedAsset} data...`}
          // Time windows
          windows={[
            { label: "5m", secs: 300 },
            { label: "15m", secs: 900 },
            { label: "1h", secs: 3600 },
            { label: "3h", secs: 10800 },
            { label: "1d", secs: 86400 },
          ]}
          windowStyle="rounded"
          // Strike prices
          referenceLine={referenceLine}
          orderbook={strikeOrderbook}
          // Formatting
          formatValue={formatValue}
          // Layout
          padding={{ top: 12, right: 88, bottom: 56, left: 12 }}
        />
      </div>
    </div>
  );
}
