/**
 * Exchange Candle Data Client (via Backend Proxy)
 *
 * Fetches BTC/USD candlestick data from our backend,
 * which uses CCXT to try multiple exchanges with automatic fallback.
 *
 * Supported exchanges (in order):
 * - Kraken, Coinbase, Bitfinex, Bybit
 * - Falls back to CoinGecko for daily data
 *
 * This approach:
 * - Avoids CORS issues
 * - Provides better error handling
 * - Automatic fallback if one exchange is blocked
 * - More reliable than direct browser-to-exchange calls
 */

import { useRealtimeStore, CandleData } from './stores/realtime-store';

class ExchangeAPIClient {
  private pollTimer: NodeJS.Timeout | null = null;
  private isPolling = false;
  private interval = '1m'; // 1 minute candles
  private lastCandleTimestamp = 0;
  private consecutiveErrors = 0;
  private maxRetries = 3;
  private baseUrl: string;

  constructor(baseUrl: string = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000') {
    this.baseUrl = baseUrl;
  }

  /**
   * Start polling backend for OHLC data
   * Polls every 10 seconds
   */
  startPolling(): void {
    if (this.isPolling) {
      console.log('[Exchange API] Already polling');
      return;
    }

    this.isPolling = true;
    console.log('[Exchange API] Starting candle polling via backend...');

    // Fetch immediately
    this.fetchCandles();

    // Then poll every 10 seconds
    this.pollTimer = setInterval(() => {
      this.fetchCandles();
    }, 10000);
  }

  /**
   * Fetch candle data from backend endpoint
   */
  private async fetchCandles(): Promise<void> {
    try {
      const url = `${this.baseUrl}/api/v1/candles/btcusd?interval=${this.interval}&limit=500`;

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(10000), // 10 second timeout
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const candles = await response.json();

      if (!candles || candles.length === 0) {
        console.warn('[Exchange API] No candle data received');
        return;
      }

      // Reset error counter on success
      this.consecutiveErrors = 0;

      // Convert backend format to our CandleData format
      // Backend returns: [timestamp, open, high, low, close, volume]
      const convertedCandles: CandleData[] = candles.map((kline: any[]) => ({
        timestamp: kline[0], // Already in milliseconds
        open: kline[1],
        high: kline[2],
        low: kline[3],
        close: kline[4],
        volume: kline[5],
        isClosed: true,
      }));

      // Filter out candles we've already processed
      const newCandles = convertedCandles.filter(
        (candle) => candle.timestamp > this.lastCandleTimestamp
      );

      if (newCandles.length > 0) {
        // On first fetch, set all candles
        if (this.lastCandleTimestamp === 0) {
          console.log(`[Exchange API] ✓ Loaded ${convertedCandles.length} historical candles`);
          console.log(`[Exchange API] First candle:`, convertedCandles[0]);
          console.log(`[Exchange API] Last candle:`, convertedCandles[convertedCandles.length - 1]);
          useRealtimeStore.getState().setCandles(convertedCandles);
          this.lastCandleTimestamp = convertedCandles[convertedCandles.length - 1].timestamp;
        } else {
          // On subsequent fetches, only add new candles
          console.log(`[Exchange API] ✓ Adding ${newCandles.length} new candle(s)`);
          newCandles.forEach((candle) => {
            console.log(`[Exchange API] New candle at ${new Date(candle.timestamp).toISOString()}:`, candle);
            useRealtimeStore.getState().addCandle(candle);
            this.lastCandleTimestamp = candle.timestamp;
          });
        }
      } else {
        console.log('[Exchange API] No new candles in this update');
      }

    } catch (error) {
      this.consecutiveErrors++;
      console.error(`[Exchange API] Error fetching candles (${this.consecutiveErrors}/${this.maxRetries}):`, error);

      if (this.consecutiveErrors >= this.maxRetries) {
        console.error('[Exchange API] Max consecutive errors reached. Stopping polling.');
        this.stopPolling();
        useRealtimeStore.getState().setConnectionState('error');
      }
    }
  }

  /**
   * Stop polling
   */
  stopPolling(): void {
    console.log('[Exchange API] Stopping polling...');
    this.isPolling = false;

    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  getIsPolling(): boolean {
    return this.isPolling;
  }

  /**
   * Retry polling after errors
   */
  retry(): void {
    console.log('[Exchange API] Retrying connection...');
    this.consecutiveErrors = 0;
    this.stopPolling();
    this.startPolling();
  }
}

// Global singleton instance
const exchangeAPI = new ExchangeAPIClient();

export default exchangeAPI;
