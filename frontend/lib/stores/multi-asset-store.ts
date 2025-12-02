import { create } from 'zustand';
import type { TradeSignal } from '@/lib/api';

/**
 * Multi-asset store combining real-time and analytical data for BTC, ETH, and XRP
 *
 * Design: Single store with Map-based per-asset data for optimal performance
 * - Only components subscribed to specific asset re-render on updates
 * - Supports on-demand streaming (connect only to selected assets)
 */

export type Asset = 'BTC' | 'ETH' | 'XRP';

export interface CandleData {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  isClosed: boolean;
}

export interface OrderBookSnapshot {
  yesBid: number;
  yesAsk: number;
  noBid: number;
  noAsk: number;
  timestamp: number;
}

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error';

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

// Per-asset real-time data
interface AssetRealtimeData {
  currentPrice: number;
  priceTimestamp: string;
  candles: CandleData[];
  lastCandle: CandleData | null;
  orderBook: OrderBookSnapshot | null;
  cvd: number;
}

// Per-asset analytical data
interface AssetAnalyticalData {
  signals: TradeSignal[];
  volatility: VolatilityData | null;
  greeksProfile: GreeksProfile | null;
  probabilityDistribution: ProbabilityDistribution | null;
  rsi: number | null;
  macd: { value: number; signal: number; histogram: number } | null;
  stochastic: { k: number; d: number } | null;
  signalsError: string | null;
  signalsLastUpdated: number | null;
}

// Per-asset connection state
interface AssetConnectionState {
  state: ConnectionState;
  error: string | null;
  lastConnectionTime: number | null;
}

interface MultiAssetState {
  // Selected asset
  selectedAsset: Asset;

  // Per-asset data (stored in objects for O(1) access)
  assetData: Record<Asset, AssetRealtimeData>;
  assetAnalytics: Record<Asset, AssetAnalyticalData>;
  assetConnections: Record<Asset, AssetConnectionState>;

  // Asset selection
  selectAsset: (asset: Asset) => void;

  // Asset-scoped getters (return data for current selected asset)
  getCurrentPrice: () => number;
  getCandles: () => CandleData[];
  getSignals: () => TradeSignal[];
  getVolatility: () => VolatilityData | null;
  getConnectionState: () => ConnectionState;

  // Asset-scoped setters
  setPrice: (asset: Asset, price: number, timestamp: string) => void;
  setSignals: (asset: Asset, signals: TradeSignal[], volatility: VolatilityData) => void;
  addCandle: (asset: Asset, candle: CandleData) => void;
  setCandles: (asset: Asset, candles: CandleData[]) => void;
  setOrderBook: (asset: Asset, orderBook: OrderBookSnapshot) => void;
  setConnectionState: (asset: Asset, state: ConnectionState, error?: string) => void;

  // Global reset
  reset: () => void;
  resetAsset: (asset: Asset) => void;
}

const createInitialAssetData = (): AssetRealtimeData => ({
  currentPrice: 0,
  priceTimestamp: '',
  candles: [],
  lastCandle: null,
  orderBook: null,
  cvd: 0,
});

const createInitialAnalytics = (): AssetAnalyticalData => ({
  signals: [],
  volatility: null,
  greeksProfile: null,
  probabilityDistribution: null,
  rsi: null,
  macd: null,
  stochastic: null,
  signalsError: null,
  signalsLastUpdated: null,
});

const createInitialConnection = (): AssetConnectionState => ({
  state: 'disconnected',
  error: null,
  lastConnectionTime: null,
});

const initialState = {
  selectedAsset: 'BTC' as Asset,
  assetData: {
    BTC: createInitialAssetData(),
    ETH: createInitialAssetData(),
    XRP: createInitialAssetData(),
  },
  assetAnalytics: {
    BTC: createInitialAnalytics(),
    ETH: createInitialAnalytics(),
    XRP: createInitialAnalytics(),
  },
  assetConnections: {
    BTC: createInitialConnection(),
    ETH: createInitialConnection(),
    XRP: createInitialConnection(),
  },
};

export const useMultiAssetStore = create<MultiAssetState>((set, get) => ({
  ...initialState,

  selectAsset: (asset: Asset) => set({ selectedAsset: asset }),

  // Getters (return data for selected asset)
  getCurrentPrice: () => {
    const { selectedAsset, assetData } = get();
    return assetData[selectedAsset].currentPrice;
  },

  getCandles: () => {
    const { selectedAsset, assetData } = get();
    return assetData[selectedAsset].candles;
  },

  getSignals: () => {
    const { selectedAsset, assetAnalytics } = get();
    return assetAnalytics[selectedAsset].signals;
  },

  getVolatility: () => {
    const { selectedAsset, assetAnalytics } = get();
    return assetAnalytics[selectedAsset].volatility;
  },

  getConnectionState: () => {
    const { selectedAsset, assetConnections } = get();
    return assetConnections[selectedAsset].state;
  },

  // Setters (asset-scoped)
  setPrice: (asset: Asset, price: number, timestamp: string) => set((state) => ({
    assetData: {
      ...state.assetData,
      [asset]: {
        ...state.assetData[asset],
        currentPrice: price,
        priceTimestamp: timestamp,
      },
    },
  })),

  setSignals: (asset: Asset, signals: TradeSignal[], volatility: VolatilityData) => set((state) => ({
    assetAnalytics: {
      ...state.assetAnalytics,
      [asset]: {
        ...state.assetAnalytics[asset],
        signals,
        volatility,
        signalsLastUpdated: Date.now(),
        signalsError: null,
      },
    },
  })),

  addCandle: (asset: Asset, candle: CandleData) => set((state) => ({
    assetData: {
      ...state.assetData,
      [asset]: {
        ...state.assetData[asset],
        candles: [...state.assetData[asset].candles, candle],
        lastCandle: candle,
      },
    },
  })),

  setCandles: (asset: Asset, candles: CandleData[]) => set((state) => ({
    assetData: {
      ...state.assetData,
      [asset]: {
        ...state.assetData[asset],
        candles,
      },
    },
  })),

  setOrderBook: (asset: Asset, orderBook: OrderBookSnapshot) => set((state) => ({
    assetData: {
      ...state.assetData,
      [asset]: {
        ...state.assetData[asset],
        orderBook,
      },
    },
  })),

  setConnectionState: (asset: Asset, connectionState: ConnectionState, error?: string) => set((state) => ({
    assetConnections: {
      ...state.assetConnections,
      [asset]: {
        state: connectionState,
        error: error || null,
        lastConnectionTime: connectionState === 'connected' ? Date.now() : null,
      },
    },
  })),

  reset: () => set(initialState),

  resetAsset: (asset: Asset) => set((state) => ({
    assetData: {
      ...state.assetData,
      [asset]: createInitialAssetData(),
    },
    assetAnalytics: {
      ...state.assetAnalytics,
      [asset]: createInitialAnalytics(),
    },
    assetConnections: {
      ...state.assetConnections,
      [asset]: createInitialConnection(),
    },
  })),
}));

// Backward compatibility hooks
export const useRealtimeStore = () => {
  const selectedAsset = useMultiAssetStore((state) => state.selectedAsset);
  const assetData = useMultiAssetStore((state) => state.assetData[selectedAsset]);
  const connectionState = useMultiAssetStore((state) => state.assetConnections[selectedAsset]);

  return {
    currentPrice: assetData.currentPrice,
    priceTimestamp: assetData.priceTimestamp,
    candles: assetData.candles,
    lastCandle: assetData.lastCandle,
    orderBook: assetData.orderBook,
    cvd: assetData.cvd,
    connectionState: connectionState.state,
    connectionError: connectionState.error,
    lastConnectionTime: connectionState.lastConnectionTime,
  };
};

export const useAnalyticalStore = () => {
  const selectedAsset = useMultiAssetStore((state) => state.selectedAsset);
  const analytics = useMultiAssetStore((state) => state.assetAnalytics[selectedAsset]);

  return {
    signals: analytics.signals,
    volatility: analytics.volatility,
    greeksProfile: analytics.greeksProfile,
    probabilityDistribution: analytics.probabilityDistribution,
    rsi: analytics.rsi,
    macd: analytics.macd,
    stochastic: analytics.stochastic,
    signalsError: analytics.signalsError,
    signalsLastUpdated: analytics.signalsLastUpdated,
  };
};
