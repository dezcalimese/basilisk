/**
 * Stochastic Oscillator Calculator
 *
 * The stochastic oscillator is a momentum indicator comparing a closing price
 * to a range of prices over a certain period.
 *
 * Formula:
 * %K = [(Current Close - Lowest Low) / (Highest High - Lowest Low)] × 100
 * %D = 3-period SMA of %K
 *
 * Full Stochastic (smoothed):
 * %K (full) = 3-period SMA of %K (fast)
 * %D (full) = 3-period SMA of %K (full)
 *
 * Interpretation:
 * - %K > 80: Overbought (potential sell signal)
 * - %K < 20: Oversold (potential buy signal)
 * - %K crosses above %D: Bullish signal
 * - %K crosses below %D: Bearish signal
 */

import { Stochastic } from 'technicalindicators';
import type { CandleData, StochasticValue, StochasticConfig } from './types';
import { DEFAULT_STOCHASTIC_CONFIG } from './types';

interface StochasticResult {
  k?: number;
  d?: number;
}

/**
 * Calculate Stochastic for a series of candles
 * Returns array aligned with input candles (undefined for insufficient data)
 */
export function calculateStochastic(
  candles: CandleData[],
  config: Partial<StochasticConfig> = {}
): StochasticResult[] {
  const { period, signalPeriod } = { ...DEFAULT_STOCHASTIC_CONFIG, ...config };

  if (candles.length < period) {
    return candles.map(() => ({
      k: undefined,
      d: undefined,
    }));
  }

  const high = candles.map((c) => c.high);
  const low = candles.map((c) => c.low);
  const close = candles.map((c) => c.close);

  try {
    const stochResults = Stochastic.calculate({
      high,
      low,
      close,
      period,
      signalPeriod,
    });

    // Pad with undefined for the first values
    const paddingLength = period - 1;
    const paddedValues: StochasticResult[] = new Array(paddingLength).fill({
      k: undefined,
      d: undefined,
    });

    return [...paddedValues, ...stochResults];
  } catch (error) {
    console.error('[Stochastic] Calculation error:', error);
    return candles.map(() => ({
      k: undefined,
      d: undefined,
    }));
  }
}

/**
 * Format Stochastic values for lightweight-charts
 */
export function formatStochasticData(
  candles: CandleData[],
  stochResults: StochasticResult[]
): {
  kData: { time: any; value: number }[];
  dData: { time: any; value: number }[];
} {
  const kData = candles
    .map((candle, index) => ({
      time: Math.floor(candle.timestamp / 1000) as any,
      value: stochResults[index]?.k ?? 0,
    }))
    .filter((d) => d.value > 0);

  const dData = candles
    .map((candle, index) => ({
      time: Math.floor(candle.timestamp / 1000) as any,
      value: stochResults[index]?.d ?? 0,
    }))
    .filter((d) => d.value > 0);

  return { kData, dData };
}

/**
 * Streaming Stochastic calculator for real-time updates
 */
export class StochasticStream {
  private stochastic: any;
  private config: StochasticConfig;

  constructor(config: Partial<StochasticConfig> = {}) {
    this.config = { ...DEFAULT_STOCHASTIC_CONFIG, ...config };
    this.stochastic = new Stochastic({
      high: [],
      low: [],
      close: [],
      period: this.config.period,
      signalPeriod: this.config.signalPeriod,
    });
  }

  /**
   * Calculate Stochastic for next candle
   * Returns undefined if insufficient data
   */
  nextValue(candle: {
    high: number;
    low: number;
    close: number;
  }): StochasticResult | undefined {
    return this.stochastic.nextValue(candle);
  }

  /**
   * Get the current Stochastic value
   */
  getResult(): StochasticResult | undefined {
    return this.stochastic.getResult();
  }

  /**
   * Reset the calculator
   */
  reset(): void {
    this.stochastic = new Stochastic({
      high: [],
      low: [],
      close: [],
      period: this.config.period,
      signalPeriod: this.config.signalPeriod,
    });
  }
}

/**
 * Detect Stochastic signal levels and crossovers
 */
export interface StochasticSignal {
  type: 'overbought' | 'oversold' | 'neutral';
  k: number;
  d: number;
  crossover?: 'bullish' | 'bearish';
}

export function detectStochasticSignal(
  currentResult: StochasticResult | undefined,
  previousResult: StochasticResult | undefined,
  overboughtLevel: number = 80,
  oversoldLevel: number = 20
): StochasticSignal | null {
  if (!currentResult?.k || !currentResult?.d) {
    return null;
  }

  let type: 'overbought' | 'oversold' | 'neutral' = 'neutral';

  if (currentResult.k >= overboughtLevel) {
    type = 'overbought';
  } else if (currentResult.k <= oversoldLevel) {
    type = 'oversold';
  }

  const signal: StochasticSignal = {
    type,
    k: currentResult.k,
    d: currentResult.d,
  };

  // Detect crossovers
  if (previousResult?.k && previousResult?.d) {
    const prevDiff = previousResult.k - previousResult.d;
    const currDiff = currentResult.k - currentResult.d;

    // Bullish crossover: %K crosses above %D
    if (prevDiff <= 0 && currDiff > 0) {
      signal.crossover = 'bullish';
    }
    // Bearish crossover: %K crosses below %D
    else if (prevDiff >= 0 && currDiff < 0) {
      signal.crossover = 'bearish';
    }
  }

  return signal;
}
