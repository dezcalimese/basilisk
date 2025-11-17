/**
 * RSI (Relative Strength Index) Calculator
 *
 * Uses Wilder's smoothing method (1/n) as per the original RSI formula.
 * This is different from standard EMA smoothing (2/(n+1)).
 *
 * Formula:
 * 1. Calculate price changes
 * 2. Separate gains and losses
 * 3. Calculate average gain and loss using Wilder smoothing
 * 4. RS = Average Gain / Average Loss
 * 5. RSI = 100 - (100 / (1 + RS))
 *
 * Interpretation:
 * - RSI > 70: Overbought (potential sell signal)
 * - RSI < 30: Oversold (potential buy signal)
 * - Divergence between RSI and price indicates trend reversal
 */

import { RSI } from 'technicalindicators';
import type { CandleData, IndicatorValue, RSIConfig } from './types';
import { DEFAULT_RSI_CONFIG } from './types';

/**
 * Calculate RSI for a series of candles
 * Returns array aligned with input candles (undefined for insufficient data)
 */
export function calculateRSI(
  candles: CandleData[],
  config: Partial<RSIConfig> = {}
): (number | undefined)[] {
  const { period } = { ...DEFAULT_RSI_CONFIG, ...config };

  if (candles.length < period + 1) {
    return candles.map(() => undefined);
  }

  const closePrices = candles.map((c) => c.close);

  try {
    const rsiValues = RSI.calculate({
      period,
      values: closePrices,
    });

    // Pad with undefined for the first (period) values
    const paddedValues: (number | undefined)[] = new Array(period).fill(undefined);
    return [...paddedValues, ...rsiValues];
  } catch (error) {
    console.error('[RSI] Calculation error:', error);
    return candles.map(() => undefined);
  }
}

/**
 * Format RSI values for lightweight-charts
 * Filters out undefined values
 */
export function formatRSIData(
  candles: CandleData[],
  rsiValues: (number | undefined)[]
): { time: any; value: number }[] {
  return candles
    .map((candle, index) => ({
      time: Math.floor(candle.timestamp / 1000) as any,
      value: rsiValues[index] ?? 0,
    }))
    .filter((d) => d.value > 0);
}

/**
 * Streaming RSI calculator for real-time updates
 * Maintains state across candle updates
 */
export class RSIStream {
  private rsi: any;
  private period: number;

  constructor(period: number = 14) {
    this.period = period;
    this.rsi = new RSI({ period, values: [] });
  }

  /**
   * Calculate RSI for next candle
   * Returns undefined if insufficient data
   */
  nextValue(closePrice: number): number | undefined {
    return this.rsi.nextValue(closePrice);
  }

  /**
   * Get the current RSI value
   */
  getResult(): number | undefined {
    return this.rsi.getResult();
  }

  /**
   * Reset the calculator
   */
  reset(): void {
    this.rsi = new RSI({ period: this.period, values: [] });
  }
}

/**
 * Detect RSI signal levels
 */
export interface RSISignal {
  type: 'overbought' | 'oversold' | 'neutral';
  value: number;
  level: number;
}

export function detectRSISignal(
  rsiValue: number | undefined,
  config: Partial<RSIConfig> = {}
): RSISignal | null {
  if (rsiValue === undefined) return null;

  const { overboughtLevel, oversoldLevel } = { ...DEFAULT_RSI_CONFIG, ...config };

  if (rsiValue >= overboughtLevel) {
    return {
      type: 'overbought',
      value: rsiValue,
      level: overboughtLevel,
    };
  }

  if (rsiValue <= oversoldLevel) {
    return {
      type: 'oversold',
      value: rsiValue,
      level: oversoldLevel,
    };
  }

  return {
    type: 'neutral',
    value: rsiValue,
    level: 50,
  };
}
