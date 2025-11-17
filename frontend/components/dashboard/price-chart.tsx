"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { createChart, ColorType, IChartApi, ISeriesApi } from "lightweight-charts";
import { useRealtimeStore } from "@/lib/stores/realtime-store";
import type { TradeSignal } from "@/lib/api";
import {
  calculateRSI,
  formatRSIData,
  DEFAULT_RSI_CONFIG,
} from "@/lib/indicators";

interface PriceChartProps {
  signals?: TradeSignal[];
  height?: number;
}

type TimeRange = '1h' | '3h' | '1d' | '1mo';
type IndicatorType = 'rsi' | 'macd' | 'stochastic';

export function PriceChart({ signals = [], height = 400 }: PriceChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  // const rsiSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);

  const [timeRange, setTimeRange] = useState<TimeRange>('1d');
  const [showInfo, setShowInfo] = useState(false);
  // const [enabledIndicators, setEnabledIndicators] = useState<Set<IndicatorType>>(
  //   new Set(['rsi']) // RSI enabled by default
  // );

  // Subscribe to candle data from store
  const candles = useRealtimeStore((state) => state.candles);
  const lastCandle = useRealtimeStore((state) => state.lastCandle);
  const sseCurrentPrice = useRealtimeStore((state) => state.currentPrice);

  // Calculate indicators
  // TODO: Re-enable when chart display issues are fixed
  // const rsiValues = useMemo(() => {
  //   if (!enabledIndicators.has('rsi') || candles.length < 15) return [];
  //   return calculateRSI(candles, { period: DEFAULT_RSI_CONFIG.period });
  // }, [candles, enabledIndicators]);

  // const rsiData = useMemo(() => {
  //   if (rsiValues.length === 0) return [];
  //   return formatRSIData(candles, rsiValues);
  // }, [candles, rsiValues]);

  // Debug: Log when candles change
  useEffect(() => {
    console.log(`[PriceChart] Candles updated: ${candles.length} candles in store`);
    // if (enabledIndicators.has('rsi') && rsiValues.length > 0) {
    //   console.log(`[PriceChart] RSI calculated: ${rsiValues.filter(v => v !== undefined).length} values`);
    // }
  }, [candles.length]);

  // Use SSE stream price for current price line (syncs with header)
  // Fall back to candle price if SSE price not available
  const currentPrice = sseCurrentPrice > 0 ? sseCurrentPrice : (lastCandle?.close || (candles.length > 0 ? candles[candles.length - 1].close : 0));
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

    // Adjust candlestick scale margins
    // TODO: Re-enable indicator space when display issues are fixed
    // candleSeries.priceScale().applyOptions({
    //   scaleMargins: {
    //     top: 0.05,    // 5% margin at top
    //     bottom: 0.35, // 35% space for RSI overlay
    //   },
    // });

    candleSeriesRef.current = candleSeries as any;

    // Create RSI overlay series (separate price scale)
    // TODO: Re-enable when chart display issues are fixed
    // const rsiSeries = chart.addLineSeries({
    //   color: '#2962FF',
    //   lineWidth: 2,
    //   priceScaleId: 'rsi-scale',
    //   priceFormat: {
    //     type: 'price',
    //     precision: 1,
    //     minMove: 0.1,
    //   },
    // });

    // rsiSeries.priceScale().applyOptions({
    //   scaleMargins: {
    //     top: 0.7,   // Start at 70% (below candles)
    //     bottom: 0,  // Use bottom 30%
    //   },
    // });

    // // Add overbought/oversold lines to RSI
    // rsiSeries.createPriceLine({
    //   price: DEFAULT_RSI_CONFIG.overboughtLevel,
    //   color: '#ef4444',
    //   lineWidth: 1,
    //   lineStyle: 2, // Dashed
    //   axisLabelVisible: true,
    //   title: 'OB',
    // });

    // rsiSeries.createPriceLine({
    //   price: DEFAULT_RSI_CONFIG.oversoldLevel,
    //   color: '#22c55e',
    //   lineWidth: 1,
    //   lineStyle: 2,
    //   axisLabelVisible: true,
    //   title: 'OS',
    // });

    // rsiSeries.createPriceLine({
    //   price: 50,
    //   color: '#94a3b8',
    //   lineWidth: 1,
    //   lineStyle: 3, // Dotted
    //   axisLabelVisible: false,
    //   title: '',
    // });

    // rsiSeriesRef.current = rsiSeries as any;
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
      '3h': 3 * 60 * 60 * 1000,
      '1d': 24 * 60 * 60 * 1000,
      '1mo': 30 * 24 * 60 * 60 * 1000,
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

  // Update RSI visibility and data when toggled
  // TODO: Re-enable when chart display issues are fixed
  // useEffect(() => {
  //   if (!rsiSeriesRef.current) return;

  //   if (enabledIndicators.has('rsi')) {
  //     // Show RSI and update data
  //     rsiSeriesRef.current.applyOptions({ visible: true });
  //     if (rsiData.length > 0) {
  //       try {
  //         rsiSeriesRef.current.setData(rsiData);
  //         console.log(`[PriceChart] RSI data updated: ${rsiData.length} points`);
  //       } catch (error) {
  //         console.error('[PriceChart] Error setting RSI data:', error);
  //       }
  //     }
  //   } else {
  //     // Hide RSI
  //     rsiSeriesRef.current.applyOptions({ visible: false });
  //   }
  // }, [rsiData, enabledIndicators]);

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
      color: '#3b82f6', // Blue
      lineWidth: 2,
      lineStyle: 3, // Dotted
      axisLabelVisible: true,
      title: `Current: $${currentPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    });

    return () => {
      candleSeriesRef.current?.removePriceLine(priceLine);
    };
  }, [currentPrice]);

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

    // Find the signal with the highest EV
    const highestEVSignal = nearestExpirySignals.reduce((highest, signal) => {
      return signal.expected_value > highest.expected_value ? signal : highest;
    }, nearestExpirySignals[0]);

    // Create price lines for nearest expiry strikes
    const priceLines: any[] = [];
    nearestExpirySignals.forEach((signal) => {
      const color = signal.signal_type.includes('BUY') ? '#22c55e' : '#ef4444';
      const isHighestEV = signal === highestEVSignal;

      const priceLine = candleSeriesRef.current?.createPriceLine({
        price: signal.strike_price!,
        color: color,
        lineWidth: isHighestEV ? 2 : 1,
        lineStyle: 2, // Dashed
        axisLabelVisible: true,
        title: isHighestEV ? 'Highest EV Strike Price' : `$${(signal.strike_price! / 1000).toFixed(0)}k`,
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
            1-minute candles • Binance spot price
          </p>
        </div>
        <div className="flex items-center justify-center" style={{ height }}>
          <div className="text-center space-y-2">
            <p className="text-muted-foreground text-sm">Loading candle data...</p>
            <p className="text-xs text-muted-foreground">
              Fetching historical data from Binance
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
          {/* Time Range Selector */}
          <div className="flex items-center gap-1">
            {(['1h', '3h', '1d', '1mo'] as TimeRange[]).map((range) => (
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

          {/* Indicator Toggles - Commented out until chart display issues are fixed */}
          {/* <div className="flex items-center gap-1 ml-2 border-l border-border/30 pl-2">
            <button
              onClick={() => {
                const newIndicators = new Set(enabledIndicators);
                if (newIndicators.has('rsi')) {
                  newIndicators.delete('rsi');
                } else {
                  newIndicators.add('rsi');
                }
                setEnabledIndicators(newIndicators);
              }}
              className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                enabledIndicators.has('rsi')
                  ? 'bg-blue-600 text-white'
                  : 'text-muted-foreground hover:bg-slate-700/50'
              }`}
              title="Toggle RSI indicator"
            >
              RSI
            </button>
          </div> */}
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-sm text-muted-foreground">BTC/USD • Binance</h3>
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
            <p className="font-medium mb-1">Chart Elements:</p>
            <p>• <span className="text-green-500">Green/Red candles</span> - Price movement (1-min intervals)</p>
            <p>• <span className="text-blue-500">Blue dotted line</span> - Current BTC price (real-time)</p>
            <p>• <span className="text-green-500">Green</span>/<span className="text-red-500">Red dashed lines</span> - Strike prices (thicker line = highest EV)</p>
            <p className="text-xs opacity-75 mt-2">Updates every 10 seconds via multi-exchange data</p>
          </div>
        )}
      </div>

      <div ref={chartContainerRef} style={{ height: `${height}px`, width: '100%' }} />
    </div>
  );
}
