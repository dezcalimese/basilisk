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

import { useMultiAssetStore, type CandleData, type Asset } from './stores/multi-asset-store';
import { fetchWithRetry } from './fetch-with-retry';

class ExchangeAPIClient {
  private pollTimer: NodeJS.Timeout | null = null;
  private isPolling = false;
  private interval = '1m'; // 1 minute candles
  private lastCandleTimestamp: Record<Asset, number> = { BTC: 0, ETH: 0, XRP: 0, SOL: 0 };
  private consecutiveErrors = 0;
  private maxRetries = 5; // Increased retries
  private baseUrl: string;
  private currentAsset: Asset | null = null;

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
   * Fetch candle data from backend endpoint for the selected asset
   */
  private async fetchCandles(): Promise<void> {
    const store = useMultiAssetStore.getState();
    const asset = store.selectedAsset;
    const symbolMap: Record<Asset, string> = { BTC: 'btcusd', ETH: 'ethusd', XRP: 'xrpusd', SOL: 'solusd' };
    const symbol = symbolMap[asset];

    // Force full refetch when asset changes
    if (this.currentAsset !== asset) {
      console.log(`[Exchange API] Asset changed from ${this.currentAsset} to ${asset}, forcing full refetch`);
      this.currentAsset = asset;
      // Reset timestamp to force full data load for new asset
      this.lastCandleTimestamp[asset] = 0;
    }

    try {
      const url = `${this.baseUrl}/api/v1/candles/${symbol}?interval=${this.interval}&limit=1440`;

      // Use fetchWithRetry for reliability
      const candles = await fetchWithRetry<any[]>(url, {
        maxRetries: 5,
        initialDelay: 500,
        timeout: 15000,
        onRetry: (attempt, error) => {
          console.log(`[Exchange API] Retry ${attempt} for ${asset}:`, error.message);
        },
      });

      if (!candles || candles.length === 0) {
        console.warn(`[Exchange API] No candle data received for ${asset}`);
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

      // Filter out candles we've already processed for this asset
      const lastTimestamp = this.lastCandleTimestamp[asset];
      const newCandles = convertedCandles.filter(
        (candle) => candle.timestamp > lastTimestamp
      );

      if (newCandles.length > 0) {
        // On first fetch, set all candles
        if (lastTimestamp === 0) {
          console.log(`[Exchange API] ✓ Loaded ${convertedCandles.length} historical candles for ${asset}`);
          console.log(`[Exchange API] First candle:`, convertedCandles[0]);
          console.log(`[Exchange API] Last candle:`, convertedCandles[convertedCandles.length - 1]);
          store.setCandles(asset, convertedCandles);
          this.lastCandleTimestamp[asset] = convertedCandles[convertedCandles.length - 1].timestamp;
        } else {
          // On subsequent fetches, only add new candles
          console.log(`[Exchange API] ✓ Adding ${newCandles.length} new candle(s) for ${asset}`);
          newCandles.forEach((candle) => {
            console.log(`[Exchange API] New candle at ${new Date(candle.timestamp).toISOString()}:`, candle);
            store.addCandle(asset, candle);
            this.lastCandleTimestamp[asset] = candle.timestamp;
          });
        }
      } else {
        console.log(`[Exchange API] No new candles for ${asset} in this update`);
      }

    } catch (error) {
      this.consecutiveErrors++;
      console.error(`[Exchange API] Error fetching candles for ${asset} (${this.consecutiveErrors}/${this.maxRetries}):`, error);

      if (this.consecutiveErrors >= this.maxRetries) {
        console.error('[Exchange API] Max consecutive errors reached. Stopping polling.');
        this.stopPolling();
        store.setConnectionState(asset, 'error', 'Failed to fetch candle data');
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
