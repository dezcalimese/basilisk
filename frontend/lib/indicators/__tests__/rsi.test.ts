import { describe, it, expect } from 'vitest';
import { calculateRSI, formatRSIData } from '../rsi';
import { DEFAULT_RSI_CONFIG } from '../types';
import type { CandleData } from '@/lib/stores/realtime-store';

describe('RSI Indicator', () => {
  const mockCandles: CandleData[] = [
    { timestamp: 1000, open: 100, high: 105, low: 95, close: 102, volume: 1000, isClosed: true },
    { timestamp: 2000, open: 102, high: 108, low: 101, close: 106, volume: 1200, isClosed: true },
    { timestamp: 3000, open: 106, high: 110, low: 104, close: 105, volume: 1100, isClosed: true },
    { timestamp: 4000, open: 105, high: 107, low: 103, close: 104, volume: 900, isClosed: true },
    { timestamp: 5000, open: 104, high: 109, low: 102, close: 108, volume: 1300, isClosed: true },
    { timestamp: 6000, open: 108, high: 112, low: 107, close: 110, volume: 1400, isClosed: true },
    { timestamp: 7000, open: 110, high: 111, low: 106, close: 107, volume: 1000, isClosed: true },
    { timestamp: 8000, open: 107, high: 109, low: 105, close: 106, volume: 950, isClosed: true },
    { timestamp: 9000, open: 106, high: 108, low: 104, close: 107, volume: 1050, isClosed: true },
    { timestamp: 10000, open: 107, high: 112, low: 106, close: 111, volume: 1500, isClosed: true },
    { timestamp: 11000, open: 111, high: 113, low: 110, close: 112, volume: 1200, isClosed: true },
    { timestamp: 12000, open: 112, high: 115, low: 111, close: 114, volume: 1300, isClosed: true },
    { timestamp: 13000, open: 114, high: 116, low: 112, close: 113, volume: 1100, isClosed: true },
    { timestamp: 14000, open: 113, high: 114, low: 110, close: 111, volume: 1000, isClosed: true },
    { timestamp: 15000, open: 111, high: 113, low: 109, close: 112, volume: 1150, isClosed: true },
  ];

  describe('calculateRSI', () => {
    it('should calculate RSI values correctly', () => {
      const rsi = calculateRSI(mockCandles);

      expect(rsi).toBeDefined();
      expect(rsi.length).toBe(mockCandles.length);

      // First 14 values should be undefined (warmup period for 14-period RSI)
      expect(rsi[0]).toBeUndefined();
      expect(rsi[13]).toBeUndefined();

      // Values after warmup should be defined (starting at index 14)
      expect(rsi[14]).toBeDefined();
    });

    it('should return values between 0 and 100', () => {
      const rsi = calculateRSI(mockCandles);

      rsi.forEach((value, index) => {
        if (value !== undefined) {
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThanOrEqual(100);
        }
      });
    });

    it('should use custom period configuration', () => {
      const customConfig = { period: 7 };
      const rsi = calculateRSI(mockCandles, customConfig);

      // With 7-period RSI, first 7 values should be undefined
      expect(rsi[0]).toBeUndefined();
      expect(rsi[6]).toBeUndefined();
      expect(rsi[7]).toBeDefined();
    });

    it('should handle insufficient data gracefully', () => {
      const shortCandles = mockCandles.slice(0, 5);
      const rsi = calculateRSI(shortCandles);

      // All values should be undefined with insufficient data
      rsi.forEach(value => {
        expect(value).toBeUndefined();
      });
    });

    it('should return empty array for empty input', () => {
      const rsi = calculateRSI([]);
      expect(rsi).toEqual([]);
    });
  });

  describe('formatRSIData', () => {
    it('should format RSI data for chart display', () => {
      const rsi = calculateRSI(mockCandles);
      const formatted = formatRSIData(mockCandles, rsi);

      expect(formatted).toBeDefined();
      expect(formatted.length).toBeLessThanOrEqual(mockCandles.length);

      formatted.forEach(point => {
        expect(point).toHaveProperty('time');
        expect(point).toHaveProperty('value');
        expect(point.value).toBeGreaterThanOrEqual(0);
        expect(point.value).toBeLessThanOrEqual(100);
      });
    });

    it('should filter out undefined RSI values', () => {
      const rsi = calculateRSI(mockCandles);
      const formatted = formatRSIData(mockCandles, rsi);

      // Formatted data should be shorter due to warmup period
      expect(formatted.length).toBeLessThan(mockCandles.length);
    });

    it('should convert timestamps to seconds', () => {
      const rsi = calculateRSI(mockCandles);
      const formatted = formatRSIData(mockCandles, rsi);

      formatted.forEach(point => {
        // Time should be in seconds (divided by 1000)
        expect(point.time).toBeLessThan(mockCandles[0].timestamp);
      });
    });
  });

  describe('DEFAULT_RSI_CONFIG', () => {
    it('should have correct default values', () => {
      expect(DEFAULT_RSI_CONFIG.period).toBe(14);
      expect(DEFAULT_RSI_CONFIG.overboughtLevel).toBe(70);
      expect(DEFAULT_RSI_CONFIG.oversoldLevel).toBe(30);
    });
  });
});
