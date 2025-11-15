"use client";

import { useEffect, useRef, useState } from "react";
import { createChart, ColorType, IChartApi, ISeriesApi } from "lightweight-charts";
import { useRealtimeStore } from "@/lib/stores/realtime-store";
import type { TradeSignal } from "@/lib/api";

interface PriceChartProps {
  signals?: TradeSignal[];
  height?: number;
}

type TimeRange = '1h' | '4h' | '1d';

export function PriceChart({ signals = [], height = 400 }: PriceChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

  const [timeRange, setTimeRange] = useState<TimeRange>('1h');
  const [showInfo, setShowInfo] = useState(false);

  // Subscribe to candle data from store
  const candles = useRealtimeStore((state) => state.candles);
  const lastCandle = useRealtimeStore((state) => state.lastCandle);

  // Debug: Log when candles change
  useEffect(() => {
    console.log(`[PriceChart] Candles updated: ${candles.length} candles in store`);
  }, [candles.length]);

  // Get current price
  const currentPrice = lastCandle?.close || (candles.length > 0 ? candles[candles.length - 1].close : 0);
  const previousPrice = candles.length > 1 ? candles[candles.length - 2].close : currentPrice;
  const priceChange = currentPrice - previousPrice;
  const priceChangePct = previousPrice > 0 ? (priceChange / previousPrice) * 100 : 0;

  // Initialize chart
  useEffect(() => {
    if (!chartContainerRef.current) {
      console.log('[PriceChart] Chart container ref not ready');
      return;
    }

    console.log('[PriceChart] Initializing chart...');

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#94a3b8',
        fontSize: 11,
      },
      grid: {
        vertLines: {
          color: 'rgba(148, 163, 184, 0.1)',
          style: 1,
        },
        horzLines: {
          color: 'rgba(148, 163, 184, 0.1)',
          style: 1,
        },
      },
      width: chartContainerRef.current.clientWidth,
      height,
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        borderColor: 'rgba(148, 163, 184, 0.2)',
        fixLeftEdge: true,
        fixRightEdge: true,
      },
      rightPriceScale: {
        borderColor: 'rgba(148, 163, 184, 0.2)',
        scaleMargins: {
          top: 0.1,
          bottom: 0.1,
        },
      },
      crosshair: {
        mode: 1, // Normal crosshair
        vertLine: {
          color: 'rgba(148, 163, 184, 0.5)',
          width: 1,
          style: 3,
          labelBackgroundColor: '#64748b',
        },
        horzLine: {
          color: 'rgba(148, 163, 184, 0.5)',
          width: 1,
          style: 3,
          labelBackgroundColor: '#64748b',
        },
      },
    });

    chartRef.current = chart;

    // Create candlestick series
    const candleSeries = chart.addCandlestickSeries({
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderVisible: false,
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
      priceFormat: {
        type: 'price',
        precision: 2,
        minMove: 0.01,
      },
    });

    candleSeriesRef.current = candleSeries as any;
    console.log('[PriceChart] ✓ Chart initialized successfully');

    // Handle resize
    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
        });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [height]);

  // Update chart data when candles change
  useEffect(() => {
    if (!candleSeriesRef.current) {
      console.log('[PriceChart] No candle series ref');
      return;
    }

    if (candles.length === 0) {
      console.log('[PriceChart] No candles to display');
      return;
    }

    // Filter candles based on time range
    const now = Date.now();
    const rangeMs = {
      '1h': 60 * 60 * 1000,
      '4h': 4 * 60 * 60 * 1000,
      '1d': 24 * 60 * 60 * 1000,
    }[timeRange];

    const filteredCandles = candles.filter(
      (candle) => candle.timestamp >= now - rangeMs
    );

    console.log(`[PriceChart] Displaying ${filteredCandles.length} candles (${timeRange} range)`);

    // Convert to lightweight-charts format
    const candleData = filteredCandles.map((candle) => ({
      time: Math.floor(candle.timestamp / 1000) as any,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
    }));

    try {
      candleSeriesRef.current.setData(candleData);
      console.log('[PriceChart] Chart data set successfully');

      // Fit content
      if (chartRef.current) {
        chartRef.current.timeScale().fitContent();
      }
    } catch (error) {
      console.error('[PriceChart] Error setting chart data:', error);
    }
  }, [candles, timeRange]);

  // Update last candle in real-time
  useEffect(() => {
    if (!candleSeriesRef.current || !lastCandle) return;

    const candleData = {
      time: Math.floor(lastCandle.timestamp / 1000) as any,
      open: lastCandle.open,
      high: lastCandle.high,
      low: lastCandle.low,
      close: lastCandle.close,
    };

    candleSeriesRef.current.update(candleData);
  }, [lastCandle]);

  // Add current price line
  useEffect(() => {
    if (!candleSeriesRef.current || currentPrice === 0) return;

    // Create price line for current price
    const priceLine = candleSeriesRef.current.createPriceLine({
      price: currentPrice,
      color: priceChange >= 0 ? '#22c55e' : '#ef4444',
      lineWidth: 1,
      lineStyle: 3, // Dotted
      axisLabelVisible: true,
      title: '',
    });

    return () => {
      candleSeriesRef.current?.removePriceLine(priceLine);
    };
  }, [currentPrice, priceChange]);

  // Add strike price overlay for nearest expiry only
  useEffect(() => {
    if (!chartRef.current || !candleSeriesRef.current || signals.length === 0) return;

    // Get active signals with strike prices
    const activeSignals = signals.filter(
      (s) => s.is_active && s.strike_price != null && s.expiry_time
    );

    if (activeSignals.length === 0) return;

    // Find the nearest expiry time
    const now = Date.now();
    const nearestExpiry = activeSignals.reduce((nearest, signal) => {
      const signalExpiry = new Date(signal.expiry_time!).getTime();
      const nearestExpiry = nearest ? new Date(nearest.expiry_time!).getTime() : Infinity;
      return signalExpiry < nearestExpiry ? signal : nearest;
    }, activeSignals[0]);

    // Only show strikes for the nearest expiry
    const nearestExpiryTime = nearestExpiry.expiry_time;
    const nearestExpirySignals = activeSignals.filter(
      (s) => s.expiry_time === nearestExpiryTime
    );

    // Create price lines for nearest expiry strikes
    const priceLines: any[] = [];
    nearestExpirySignals.forEach((signal) => {
      const color = signal.signal_type.includes('BUY') ? '#22c55e' : '#ef4444';

      const priceLine = candleSeriesRef.current?.createPriceLine({
        price: signal.strike_price!,
        color: color,
        lineWidth: 1,
        lineStyle: 2, // Dashed
        axisLabelVisible: true,
        title: `$${(signal.strike_price! / 1000).toFixed(0)}k`,
      });

      if (priceLine) priceLines.push(priceLine);
    });

    // Cleanup function to remove price lines
    return () => {
      priceLines.forEach((line) => {
        candleSeriesRef.current?.removePriceLine(line);
      });
    };

  }, [signals]);

  // Show placeholder if no candles
  if (candles.length === 0) {
    return (
      <div className="glass-card p-4">
        <div className="mb-3">
          <h3 className="text-lg font-semibold">BTC/USD Price</h3>
          <p className="text-xs text-muted-foreground mt-1">
            1-minute candles • Kraken spot price
          </p>
        </div>
        <div className="flex items-center justify-center" style={{ height }}>
          <div className="text-center space-y-2">
            <p className="text-muted-foreground text-sm">Loading candle data...</p>
            <p className="text-xs text-muted-foreground">
              Fetching historical data from Kraken
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card p-4">
      <div className="mb-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            {currentPrice > 0 && (
              <>
                <span className="text-3xl font-bold">
                  ${currentPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span className={`flex items-center gap-1 text-sm font-medium ${priceChange >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d={priceChange >= 0 ? "M5 15l7-7 7 7" : "M19 9l-7 7-7-7"}
                    />
                  </svg>
                  {Math.abs(priceChangePct).toFixed(1)}%
                </span>
              </>
            )}
          </div>

          {/* Time Range Selector */}
          <div className="flex items-center gap-1">
            {(['1h', '4h', '1d'] as TimeRange[]).map((range) => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                  timeRange === range
                    ? 'bg-slate-700 text-white'
                    : 'text-muted-foreground hover:bg-slate-700/50'
                }`}
              >
                {range.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-sm text-muted-foreground">BTC/USD • Kraken</h3>
            <button
              onClick={() => setShowInfo(!showInfo)}
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Info"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-3.5 w-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </button>
          </div>
        </div>

        {showInfo && (
          <div className="mt-2 p-3 bg-muted/50 rounded-lg text-xs text-muted-foreground space-y-1">
            <p>Updates every 10 seconds • 1-minute candles</p>
            <p>Green = price up • Red = price down • Dotted line = current price</p>
          </div>
        )}
      </div>

      <div ref={chartContainerRef} style={{ height: `${height}px`, width: '100%' }} />
    </div>
  );
}
