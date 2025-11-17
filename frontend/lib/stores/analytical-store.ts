import { create } from 'zustand';
import type { TradeSignal } from '@/lib/api';

/**
 * Analytical store for lower-frequency updates (5-20s)
 * Contains signals, Greeks, probability distributions, volume profile
 */

// Extended TradeSignal with additional mispricing fields
export interface ExtendedTradeSignal extends TradeSignal {
  theoretical_probability?: number;
  mispricing?: number;
  mispricing_pct?: number;
  mispricing_signal?: string;
  mispricing_opportunity?: string;
}

export interface VolatilityData {
  realized_vol: number;
  implied_vol: number;
  deribit_iv?: number;
  kalshi_iv?: number;
  regime: string;
  vol_premium: number;
  vol_premium_pct: number;
  vol_signal: string;
  mispricing_signal?: string;
}

export interface GreeksProfile {
  strikes: number[];
  delta: number[];
  gamma: number[];
  vega: number[];
  theta: number[];
  currentStrike: number;
}

export interface ProbabilityDistribution {
  strikes: number[];
  singlePointPDF: number[];
  twapPDF: number[];
  varianceReductionPct: number;
  feeAdjustedEV: number[];
}

export interface VolumeProfileData {
  priceLevel: number;
  volume: number;
  pocLevel: number; // Point of Control
  hvnLevels: number[]; // High Volume Nodes
  lvnLevels: number[]; // Low Volume Nodes
}

interface AnalyticalState {
  // Trade signals
  signals: TradeSignal[];
  volatility: VolatilityData | null;

  // Greeks data
  greeksProfile: GreeksProfile | null;

  // Probability distributions
  probabilityDistribution: ProbabilityDistribution | null;

  // Volume profile
  volumeProfile: VolumeProfileData | null;

  // Indicators (RSI, MACD, Stochastic)
  rsi: number | null;
  macd: { value: number; signal: number; histogram: number } | null;
  stochastic: { k: number; d: number } | null;

  // Loading states
  isLoadingSignals: boolean;
  isLoadingGreeks: boolean;
  isLoadingProbability: boolean;

  // Error states
  signalsError: string | null;
  greeksError: string | null;
  probabilityError: string | null;

  // Last update timestamps
  signalsLastUpdated: number | null;
  greeksLastUpdated: number | null;
  probabilityLastUpdated: number | null;

  // Actions
  setSignals: (signals: TradeSignal[], volatility: VolatilityData) => void;
  setGreeksProfile: (greeks: GreeksProfile) => void;
  setProbabilityDistribution: (dist: ProbabilityDistribution) => void;
  setVolumeProfile: (profile: VolumeProfileData) => void;
  setIndicators: (rsi: number, macd: any, stochastic: any) => void;
  setLoadingState: (type: 'signals' | 'greeks' | 'probability', loading: boolean) => void;
  setError: (type: 'signals' | 'greeks' | 'probability', error: string | null) => void;
  reset: () => void;
}

const initialState = {
  signals: [],
  volatility: null,
  greeksProfile: null,
  probabilityDistribution: null,
  volumeProfile: null,
  rsi: null,
  macd: null,
  stochastic: null,
  isLoadingSignals: false,
  isLoadingGreeks: false,
  isLoadingProbability: false,
  signalsError: null,
  greeksError: null,
  probabilityError: null,
  signalsLastUpdated: null,
  greeksLastUpdated: null,
  probabilityLastUpdated: null,
};

export const useAnalyticalStore = create<AnalyticalState>((set) => ({
  ...initialState,

  setSignals: (signals, volatility) => set({
    signals,
    volatility,
    signalsLastUpdated: Date.now(),
    signalsError: null,
  }),

  setGreeksProfile: (greeksProfile) => set({
    greeksProfile,
    greeksLastUpdated: Date.now(),
    greeksError: null,
  }),

  setProbabilityDistribution: (probabilityDistribution) => set({
    probabilityDistribution,
    probabilityLastUpdated: Date.now(),
    probabilityError: null,
  }),

  setVolumeProfile: (volumeProfile) => set({ volumeProfile }),

  setIndicators: (rsi, macd, stochastic) => set({ rsi, macd, stochastic }),

  setLoadingState: (type, loading) => {
    const key = `isLoading${type.charAt(0).toUpperCase()}${type.slice(1)}` as keyof AnalyticalState;
    set({ [key]: loading });
  },

  setError: (type, error) => {
    const key = `${type}Error` as keyof AnalyticalState;
    set({ [key]: error });
  },

  reset: () => set(initialState),
}));
