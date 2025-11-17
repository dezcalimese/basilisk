/**
 * Shared types for technical indicators
 */

export interface CandleData {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  isClosed: boolean;
}

export interface IndicatorValue {
  time: number;
  value: number;
}

export interface MACDValue {
  time: number;
  macd: number;
  signal: number;
  histogram: number;
}

export interface StochasticValue {
  time: number;
  k: number;
  d: number;
}

export interface RSIConfig {
  period: number;
  overboughtLevel: number;
  oversoldLevel: number;
}

export interface MACDConfig {
  fastPeriod: number;
  slowPeriod: number;
  signalPeriod: number;
}

export interface StochasticConfig {
  period: number;
  signalPeriod: number;
  smoothPeriod: number;
}

export const DEFAULT_RSI_CONFIG: RSIConfig = {
  period: 14,
  overboughtLevel: 70,
  oversoldLevel: 30,
};

export const DEFAULT_MACD_CONFIG: MACDConfig = {
  fastPeriod: 12,
  slowPeriod: 26,
  signalPeriod: 9,
};

export const DEFAULT_STOCHASTIC_CONFIG: StochasticConfig = {
  period: 14,
  signalPeriod: 3,
  smoothPeriod: 3,
};
