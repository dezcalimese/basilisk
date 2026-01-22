import { create } from 'zustand';
import type { TradeSignal } from '@/lib/api';

/**
 * Multi-asset store combining real-time and analytical data for BTC, ETH, and XRP
 *
 * Design: Single store with Map-based per-asset data for optimal performance
 * - Only components subscribed to specific asset re-render on updates
 * - Supports on-demand streaming (connect only to selected assets)
 */

export type Asset = 'BTC' | 'ETH' | 'XRP' | 'SOL';

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
    SOL: createInitialAssetData(),
  },
  assetAnalytics: {
    BTC: createInitialAnalytics(),
    ETH: createInitialAnalytics(),
    XRP: createInitialAnalytics(),
    SOL: createInitialAnalytics(),
  },
  assetConnections: {
    BTC: createInitialConnection(),
    ETH: createInitialConnection(),
    XRP: createInitialConnection(),
    SOL: createInitialConnection(),
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
        lastCandle: candles.length > 0 ? candles[candles.length - 1] : null,
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
// Each value gets its own selector for granular reactivity
export const useRealtimeStore = () => {
  const currentPrice = useMultiAssetStore((state) => state.assetData[state.selectedAsset].currentPrice);
  const priceTimestamp = useMultiAssetStore((state) => state.assetData[state.selectedAsset].priceTimestamp);
  const candles = useMultiAssetStore((state) => state.assetData[state.selectedAsset].candles);
  const lastCandle = useMultiAssetStore((state) => state.assetData[state.selectedAsset].lastCandle);
  const orderBook = useMultiAssetStore((state) => state.assetData[state.selectedAsset].orderBook);
  const cvd = useMultiAssetStore((state) => state.assetData[state.selectedAsset].cvd);
  const connectionState = useMultiAssetStore((state) => state.assetConnections[state.selectedAsset].state);
  const connectionError = useMultiAssetStore((state) => state.assetConnections[state.selectedAsset].error);
  const lastConnectionTime = useMultiAssetStore((state) => state.assetConnections[state.selectedAsset].lastConnectionTime);

  return {
    currentPrice,
    priceTimestamp,
    candles,
    lastCandle,
    orderBook,
    cvd,
    connectionState,
    connectionError,
    lastConnectionTime,
  };
};

export const useAnalyticalStore = () => {
  const signals = useMultiAssetStore((state) => state.assetAnalytics[state.selectedAsset].signals);
  const volatility = useMultiAssetStore((state) => state.assetAnalytics[state.selectedAsset].volatility);
  const greeksProfile = useMultiAssetStore((state) => state.assetAnalytics[state.selectedAsset].greeksProfile);
  const probabilityDistribution = useMultiAssetStore((state) => state.assetAnalytics[state.selectedAsset].probabilityDistribution);
  const rsi = useMultiAssetStore((state) => state.assetAnalytics[state.selectedAsset].rsi);
  const macd = useMultiAssetStore((state) => state.assetAnalytics[state.selectedAsset].macd);
  const stochastic = useMultiAssetStore((state) => state.assetAnalytics[state.selectedAsset].stochastic);
  const signalsError = useMultiAssetStore((state) => state.assetAnalytics[state.selectedAsset].signalsError);
  const signalsLastUpdated = useMultiAssetStore((state) => state.assetAnalytics[state.selectedAsset].signalsLastUpdated);

  return {
    signals,
    volatility,
    greeksProfile,
    probabilityDistribution,
    rsi,
    macd,
    stochastic,
    signalsError,
    signalsLastUpdated,
  };
};
