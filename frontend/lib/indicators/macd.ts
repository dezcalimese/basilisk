/**
 * MACD (Moving Average Convergence Divergence) Calculator
 *
 * MACD is a trend-following momentum indicator that shows the relationship
 * between two moving averages of a security's price.
 *
 * Formula:
 * 1. MACD Line = 12-period EMA - 26-period EMA
 * 2. Signal Line = 9-period EMA of MACD Line
 * 3. Histogram = MACD Line - Signal Line
 *
 * Interpretation:
 * - MACD crosses above signal: Bullish (buy signal)
 * - MACD crosses below signal: Bearish (sell signal)
 * - Histogram increasing: Momentum strengthening
 * - Histogram decreasing: Momentum weakening
 * - Divergence: Price and MACD moving in opposite directions
 */

import { MACD } from 'technicalindicators';
import type { CandleData, MACDValue, MACDConfig } from './types';
import { DEFAULT_MACD_CONFIG } from './types';

interface MACDResult {
  MACD?: number;
  signal?: number;
  histogram?: number;
}

/**
 * Calculate MACD for a series of candles
 * Returns array aligned with input candles (undefined for insufficient data)
 */
export function calculateMACD(
  candles: CandleData[],
  config: Partial<MACDConfig> = {}
): MACDResult[] {
  const { fastPeriod, slowPeriod, signalPeriod } = {
    ...DEFAULT_MACD_CONFIG,
    ...config,
  };

  if (candles.length < slowPeriod) {
    return candles.map(() => ({
      MACD: undefined,
      signal: undefined,
      histogram: undefined,
    }));
  }

  const closePrices = candles.map((c) => c.close);

  try {
    const macdResults = MACD.calculate({
      values: closePrices,
      fastPeriod,
      slowPeriod,
      signalPeriod,
      SimpleMAOscillator: false, // Use EMA
      SimpleMASignal: false, // Use EMA for signal
    });

    // Pad with undefined for the first values
    const paddedValues: MACDResult[] = new Array(slowPeriod - 1).fill({
      MACD: undefined,
      signal: undefined,
      histogram: undefined,
    });

    return [...paddedValues, ...macdResults];
  } catch (error) {
    console.error('[MACD] Calculation error:', error);
    return candles.map(() => ({
      MACD: undefined,
      signal: undefined,
      histogram: undefined,
    }));
  }
}

/**
 * Format MACD values for lightweight-charts
 */
export function formatMACDData(
  candles: CandleData[],
  macdResults: MACDResult[]
): {
  macdData: { time: any; value: number }[];
  signalData: { time: any; value: number }[];
  histogramData: { time: any; value: number; color: string }[];
} {
  const macdData = candles
    .map((candle, index) => ({
      time: Math.floor(candle.timestamp / 1000) as any,
      value: macdResults[index]?.MACD ?? 0,
    }))
    .filter((d) => d.value !== 0);

  const signalData = candles
    .map((candle, index) => ({
      time: Math.floor(candle.timestamp / 1000) as any,
      value: macdResults[index]?.signal ?? 0,
    }))
    .filter((d) => d.value !== 0);

  const histogramData = candles
    .map((candle, index) => {
      const histValue = macdResults[index]?.histogram ?? 0;
      return {
        time: Math.floor(candle.timestamp / 1000) as any,
        value: histValue,
        color: histValue >= 0 ? '#26a69a' : '#ef5350',
      };
    })
    .filter((d) => d.value !== 0);

  return { macdData, signalData, histogramData };
}

/**
 * Streaming MACD calculator for real-time updates
 */
export class MACDStream {
  private macd: any;
  private config: MACDConfig;

  constructor(config: Partial<MACDConfig> = {}) {
    this.config = { ...DEFAULT_MACD_CONFIG, ...config };
    this.macd = new MACD({
      ...this.config,
      values: [],
      SimpleMAOscillator: false,
      SimpleMASignal: false,
    });
  }

  /**
   * Calculate MACD for next candle
   * Returns undefined if insufficient data
   */
  nextValue(closePrice: number): MACDResult | undefined {
    return this.macd.nextValue(closePrice);
  }

  /**
   * Get the current MACD value
   */
  getResult(): MACDResult | undefined {
    return this.macd.getResult();
  }

  /**
   * Reset the calculator
   */
  reset(): void {
    this.macd = new MACD({
      ...this.config,
      values: [],
      SimpleMAOscillator: false,
      SimpleMASignal: false,
    });
  }
}

/**
 * Detect MACD crossover signals
 */
export interface MACDSignal {
  type: 'bullish' | 'bearish' | 'neutral';
  macd: number;
  signal: number;
  histogram: number;
  crossover?: 'bullish' | 'bearish';
}

export function detectMACDSignal(
  currentResult: MACDResult | undefined,
  previousResult: MACDResult | undefined
): MACDSignal | null {
  if (!currentResult?.MACD || !currentResult?.signal || !currentResult?.histogram) {
    return null;
  }

  const signal: MACDSignal = {
    type: currentResult.histogram >= 0 ? 'bullish' : 'bearish',
    macd: currentResult.MACD,
    signal: currentResult.signal,
    histogram: currentResult.histogram,
  };

  // Detect crossovers
  if (previousResult?.MACD && previousResult?.signal) {
    const prevDiff = previousResult.MACD - previousResult.signal;
    const currDiff = currentResult.MACD - currentResult.signal;

    // Bullish crossover: MACD crosses above signal
    if (prevDiff <= 0 && currDiff > 0) {
      signal.crossover = 'bullish';
    }
    // Bearish crossover: MACD crosses below signal
    else if (prevDiff >= 0 && currDiff < 0) {
      signal.crossover = 'bearish';
    }
  }

  return signal;
}
