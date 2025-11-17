/**
 * Kraken REST API Client for BTC/USD candlestick data
 *
 * Uses Kraken's public OHLC endpoint which is CORS-friendly
 * and works directly from browsers without any proxy.
 *
 * Based on research: https://api.kraken.com/0/public/OHLC
 * Returns last 720 candles of specified interval
 */

import { useRealtimeStore, CandleData } from './stores/realtime-store';

class KrakenAPIClient {
  private pollTimer: NodeJS.Timeout | null = null;
  private isPolling = false;
  private pair = 'XBTUSD'; // BTC/USD on Kraken
  private interval = 1; // 1 minute
  private lastCandleTimestamp = 0;

  /**
   * Start polling Kraken for OHLC data
   * Polls every 10 seconds (well within rate limits)
   */
  startPolling(): void {
    if (this.isPolling) {
      console.log('[Kraken API] Already polling');
      return;
    }

    this.isPolling = true;
    console.log('[Kraken API] Starting OHLC polling...');

    // Fetch immediately
    this.fetchOHLC();

    // Then poll every 10 seconds
    this.pollTimer = setInterval(() => {
      this.fetchOHLC();
    }, 10000);
  }

  /**
   * Fetch OHLC data from Kraken
   */
  private async fetchOHLC(): Promise<void> {
    try {
      const url = `https://api.kraken.com/0/public/OHLC?pair=${this.pair}&interval=${this.interval}`;

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      if (data.error && data.error.length > 0) {
        console.error('[Kraken API] API error:', data.error);
        return;
      }

      // Kraken returns data with the pair name as the key
      const candles = data.result[this.pair] || data.result['XXBTZUSD'];

      if (!candles || candles.length === 0) {
        console.warn('[Kraken API] No candle data received');
        return;
      }

      // Convert Kraken format to our CandleData format
      // Kraken format: [time, open, high, low, close, vwap, volume, count]
      const convertedCandles: CandleData[] = candles.map((kline: any[]) => ({
        timestamp: kline[0] * 1000, // Convert to milliseconds
        open: parseFloat(kline[1]),
        high: parseFloat(kline[2]),
        low: parseFloat(kline[3]),
        close: parseFloat(kline[4]),
        volume: parseFloat(kline[6]),
        isClosed: true,
      }));

      // Filter out candles we've already processed
      const newCandles = convertedCandles.filter(
        (candle) => candle.timestamp > this.lastCandleTimestamp
      );

      if (newCandles.length > 0) {
        // On first fetch, set all candles
        if (this.lastCandleTimestamp === 0) {
          console.log(`[Kraken API] ✓ Loaded ${convertedCandles.length} historical candles`);
          console.log(`[Kraken API] First candle:`, convertedCandles[0]);
          console.log(`[Kraken API] Last candle:`, convertedCandles[convertedCandles.length - 1]);
          useRealtimeStore.getState().setCandles(convertedCandles);
          this.lastCandleTimestamp = convertedCandles[convertedCandles.length - 1].timestamp;
        } else {
          // On subsequent fetches, only add new candles
          console.log(`[Kraken API] ✓ Adding ${newCandles.length} new candle(s)`);
          newCandles.forEach((candle) => {
            console.log(`[Kraken API] New candle at ${new Date(candle.timestamp).toISOString()}:`, candle);
            useRealtimeStore.getState().addCandle(candle);
            this.lastCandleTimestamp = candle.timestamp;
          });
        }
      } else {
        console.log('[Kraken API] No new candles in this update');
      }

    } catch (error) {
      console.error('[Kraken API] Error fetching OHLC:', error);
    }
  }

  /**
   * Stop polling
   */
  stopPolling(): void {
    console.log('[Kraken API] Stopping polling...');
    this.isPolling = false;

    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  getIsPolling(): boolean {
    return this.isPolling;
  }
}

// Global singleton instance
const krakenAPI = new KrakenAPIClient();

export default krakenAPI;
