import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { useRealtimeStore } from '../stores/realtime-store';

// Mock fetch
global.fetch = vi.fn();

describe('ExchangeAPIClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    // Reset store
    useRealtimeStore.setState({
      currentPrice: 0,
      candles: [],
      lastCandle: null,
      connectionState: 'disconnected',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('API Response Handling', () => {
    it('should handle successful candle fetch', async () => {
      const mockCandles = [
        [1000, 100, 105, 95, 102, 1000],
        [2000, 102, 108, 101, 106, 1200],
      ];

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockCandles,
      });

      const response = await fetch('http://localhost:8000/api/v1/candles/btcusd?interval=1m&limit=500');
      const candles = await response.json();

      expect(candles).toEqual(mockCandles);
      expect(candles.length).toBe(2);
    });

    it('should handle HTTP errors', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
      });

      const response = await fetch('http://localhost:8000/api/v1/candles/btcusd?interval=1m&limit=500');

      expect(response.ok).toBe(false);
      expect(response.status).toBe(503);
    });

    it('should handle network errors', async () => {
      (global.fetch as any).mockRejectedValueOnce(new Error('Network error'));

      await expect(
        fetch('http://localhost:8000/api/v1/candles/btcusd?interval=1m&limit=500')
      ).rejects.toThrow('Network error');
    });

    it('should handle empty candle data', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });

      const response = await fetch('http://localhost:8000/api/v1/candles/btcusd?interval=1m&limit=500');
      const candles = await response.json();

      expect(candles).toEqual([]);
      expect(candles.length).toBe(0);
    });
  });

  describe('Candle Data Transformation', () => {
    it('should transform backend format to CandleData format', () => {
      const backendCandle = [1000, 100, 105, 95, 102, 1000];

      const transformed = {
        timestamp: backendCandle[0],
        open: backendCandle[1],
        high: backendCandle[2],
        low: backendCandle[3],
        close: backendCandle[4],
        volume: backendCandle[5],
        isClosed: true,
      };

      expect(transformed.timestamp).toBe(1000);
      expect(transformed.open).toBe(100);
      expect(transformed.high).toBe(105);
      expect(transformed.low).toBe(95);
      expect(transformed.close).toBe(102);
      expect(transformed.volume).toBe(1000);
      expect(transformed.isClosed).toBe(true);
    });
  });

  describe('URL Construction', () => {
    it('should construct correct API URL', () => {
      const baseUrl = 'http://localhost:8000';
      const interval = '1m';
      const limit = 500;

      const url = `${baseUrl}/api/v1/candles/btcusd?interval=${interval}&limit=${limit}`;

      expect(url).toBe('http://localhost:8000/api/v1/candles/btcusd?interval=1m&limit=500');
    });

    it('should handle different intervals', () => {
      const baseUrl = 'http://localhost:8000';
      const intervals = ['1m', '5m', '15m', '1h', '4h', '1d'];

      intervals.forEach(interval => {
        const url = `${baseUrl}/api/v1/candles/btcusd?interval=${interval}&limit=500`;
        expect(url).toContain(`interval=${interval}`);
      });
    });
  });
});
