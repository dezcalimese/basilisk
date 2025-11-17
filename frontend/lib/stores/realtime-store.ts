import { create } from 'zustand';

/**
 * Real-time store for high-frequency updates (100-200ms)
 * Separated from analytical store to prevent unnecessary re-renders
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

export interface OrderBookSnapshot {
  yesBid: number;
  yesAsk: number;
  noBid: number;
  noAsk: number;
  timestamp: number;
}

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error';

interface RealtimeState {
  // Current BTC price
  currentPrice: number;
  priceTimestamp: string;

  // Candle data history (for charts)
  candles: CandleData[];
  lastCandle: CandleData | null;

  // Order book (if implemented)
  orderBook: OrderBookSnapshot | null;

  // Cumulative Volume Delta
  cvd: number;

  // Connection state
  connectionState: ConnectionState;
  connectionError: string | null;
  lastConnectionTime: number | null;

  // Actions
  setCurrentPrice: (price: number, timestamp: string) => void;
  addCandle: (candle: CandleData) => void;
  updateLastCandle: (candle: CandleData) => void;
  setCandles: (candles: CandleData[]) => void;
  setLastCandle: (candle: CandleData) => void;
  setOrderBook: (orderBook: OrderBookSnapshot) => void;
  updateCVD: (delta: number) => void;
  setConnectionState: (state: ConnectionState, error?: string) => void;
  reset: () => void;
}

const initialState = {
  currentPrice: 0,
  priceTimestamp: '',
  candles: [] as CandleData[],
  lastCandle: null,
  orderBook: null,
  cvd: 0,
  connectionState: 'disconnected' as ConnectionState,
  connectionError: null,
  lastConnectionTime: null,
};

export const useRealtimeStore = create<RealtimeState>((set) => ({
  ...initialState,

  setCurrentPrice: (price, timestamp) => set({
    currentPrice: price,
    priceTimestamp: timestamp,
  }),

  // Add a new closed candle to history
  addCandle: (candle) => set((state) => ({
    candles: [...state.candles, candle],
    lastCandle: candle,
  })),

  // Update the current (incomplete) candle
  updateLastCandle: (candle) => set({ lastCandle: candle }),

  // Set entire candle history (e.g., from initial fetch)
  setCandles: (candles) => set({ candles }),

  setLastCandle: (candle) => set({ lastCandle: candle }),

  setOrderBook: (orderBook) => set({ orderBook }),

  updateCVD: (delta) => set((state) => ({ cvd: state.cvd + delta })),

  setConnectionState: (connectionState, error) => set({
    connectionState,
    connectionError: error || null,
    lastConnectionTime: connectionState === 'connected' ? Date.now() : null,
  }),

  reset: () => set(initialState),
}));
