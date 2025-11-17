import { describe, it, expect, beforeEach } from 'vitest';
import { useRealtimeStore } from '../realtime-store';
import type { CandleData } from '../realtime-store';

describe('Realtime Store', () => {
  beforeEach(() => {
    // Reset store before each test
    useRealtimeStore.setState({
      currentPrice: 0,
      candles: [],
      lastCandle: null,
      connectionState: 'disconnected',
    });
  });

  describe('setCurrentPrice', () => {
    it('should update current price', () => {
      const { setCurrentPrice } = useRealtimeStore.getState();

      setCurrentPrice(95000);

      expect(useRealtimeStore.getState().currentPrice).toBe(95000);
    });

    it('should handle zero price', () => {
      const { setCurrentPrice } = useRealtimeStore.getState();

      setCurrentPrice(0);

      expect(useRealtimeStore.getState().currentPrice).toBe(0);
    });
  });

  describe('setCandles', () => {
    it('should replace all candles', () => {
      const { setCandles } = useRealtimeStore.getState();

      const mockCandles: CandleData[] = [
        { timestamp: 1000, open: 100, high: 105, low: 95, close: 102, volume: 1000, isClosed: true },
        { timestamp: 2000, open: 102, high: 108, low: 101, close: 106, volume: 1200, isClosed: true },
      ];

      setCandles(mockCandles);

      expect(useRealtimeStore.getState().candles).toEqual(mockCandles);
      expect(useRealtimeStore.getState().candles.length).toBe(2);
    });

    it('should not automatically set lastCandle when setting candles', () => {
      const { setCandles } = useRealtimeStore.getState();

      const mockCandles: CandleData[] = [
        { timestamp: 1000, open: 100, high: 105, low: 95, close: 102, volume: 1000, isClosed: true },
        { timestamp: 2000, open: 102, high: 108, low: 101, close: 106, volume: 1200, isClosed: true },
      ];

      setCandles(mockCandles);

      // setCandles only sets the candles array, not lastCandle
      expect(useRealtimeStore.getState().lastCandle).toBeNull();
      expect(useRealtimeStore.getState().candles).toEqual(mockCandles);
    });

    it('should handle empty candles array', () => {
      const { setCandles } = useRealtimeStore.getState();

      setCandles([]);

      expect(useRealtimeStore.getState().candles).toEqual([]);
      expect(useRealtimeStore.getState().lastCandle).toBeNull();
    });
  });

  describe('addCandle', () => {
    it('should append a new candle', () => {
      const { setCandles, addCandle } = useRealtimeStore.getState();

      const initialCandles: CandleData[] = [
        { timestamp: 1000, open: 100, high: 105, low: 95, close: 102, volume: 1000, isClosed: true },
      ];

      setCandles(initialCandles);

      const newCandle: CandleData = {
        timestamp: 2000,
        open: 102,
        high: 108,
        low: 101,
        close: 106,
        volume: 1200,
        isClosed: true,
      };

      addCandle(newCandle);

      const state = useRealtimeStore.getState();
      expect(state.candles.length).toBe(2);
      expect(state.candles[1]).toEqual(newCandle);
      expect(state.lastCandle).toEqual(newCandle);
    });

    it('should add candle to empty array', () => {
      const { addCandle } = useRealtimeStore.getState();

      const newCandle: CandleData = {
        timestamp: 1000,
        open: 100,
        high: 105,
        low: 95,
        close: 102,
        volume: 1000,
        isClosed: true,
      };

      addCandle(newCandle);

      const state = useRealtimeStore.getState();
      expect(state.candles.length).toBe(1);
      expect(state.candles[0]).toEqual(newCandle);
      expect(state.lastCandle).toEqual(newCandle);
    });

    it('should append candles without limiting (no built-in limit)', () => {
      const { setCandles, addCandle } = useRealtimeStore.getState();

      // Create 1000 candles
      const initialCandles: CandleData[] = Array.from({ length: 1000 }, (_, i) => ({
        timestamp: i * 1000,
        open: 100,
        high: 105,
        low: 95,
        close: 102,
        volume: 1000,
        isClosed: true,
      }));

      setCandles(initialCandles);

      // Add one more
      const newCandle: CandleData = {
        timestamp: 1000000,
        open: 103,
        high: 108,
        low: 102,
        close: 107,
        volume: 1100,
        isClosed: true,
      };

      addCandle(newCandle);

      const state = useRealtimeStore.getState();
      // Store doesn't have a built-in limit, so it will have 1001 candles
      expect(state.candles.length).toBe(1001);
      expect(state.candles[1000]).toEqual(newCandle);
    });
  });

  describe('setConnectionState', () => {
    it('should update connection state', () => {
      const { setConnectionState } = useRealtimeStore.getState();

      setConnectionState('connecting');
      expect(useRealtimeStore.getState().connectionState).toBe('connecting');

      setConnectionState('connected');
      expect(useRealtimeStore.getState().connectionState).toBe('connected');

      setConnectionState('error');
      expect(useRealtimeStore.getState().connectionState).toBe('error');

      setConnectionState('disconnected');
      expect(useRealtimeStore.getState().connectionState).toBe('disconnected');
    });
  });

  describe('initial state', () => {
    it('should have correct initial values', () => {
      const initialState = useRealtimeStore.getState();

      expect(initialState.currentPrice).toBe(0);
      expect(initialState.candles).toEqual([]);
      expect(initialState.lastCandle).toBeNull();
      expect(initialState.connectionState).toBe('disconnected');
    });
  });
});
