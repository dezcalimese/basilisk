/**
 * Binance WebSocket Client for BTC/USDT 1-minute candlestick data
 *
 * Connects to Binance WebSocket API to receive real-time candle updates
 * Singleton pattern with automatic reconnection and heartbeat monitoring
 *
 * Based on research: WebSocket connections don't have CORS issues
 * Uses Binance public market data streams (no authentication required)
 */

import { useRealtimeStore, CandleData } from './stores/realtime-store';

interface BinanceKline {
  e: string; // Event type
  E: number; // Event time
  s: string; // Symbol
  k: {
    t: number; // Kline start time
    T: number; // Kline close time
    s: string; // Symbol
    i: string; // Interval
    f: number; // First trade ID
    L: number; // Last trade ID
    o: string; // Open price
    c: string; // Close price
    h: string; // High price
    l: string; // Low price
    v: string; // Base asset volume
    n: number; // Number of trades
    x: boolean; // Is this kline closed?
    q: string; // Quote asset volume
    V: string; // Taker buy base asset volume
    Q: string; // Taker buy quote asset volume
    B: string; // Ignore
  };
}

class BinanceWSClient {
  private ws: WebSocket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private maxReconnectDelay = 30000;
  private isManualDisconnect = false;
  private symbol = 'btcusdt';
  private interval = '1m';
  private lastMessageTime = 0;
  private endpoints = [
    'wss://stream.binance.com:9443/ws',
    'wss://stream.binance.com/ws',
    'wss://data-stream.binance.vision/ws',
  ];
  private currentEndpointIndex = 0;

  /**
   * Connect to Binance WebSocket stream with automatic failover
   */
  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      console.log('[Binance WS] Already connected');
      return;
    }

    this.isManualDisconnect = false;

    const baseUrl = this.endpoints[this.currentEndpointIndex];
    const wsUrl = `${baseUrl}/${this.symbol}@kline_${this.interval}`;

    console.log(`[Binance WS] Connecting to ${baseUrl} (attempt ${this.reconnectAttempts + 1})`);

    try {
      this.ws = new WebSocket(wsUrl);

      // Set connection timeout
      const connectionTimeout = setTimeout(() => {
        if (this.ws?.readyState !== WebSocket.OPEN) {
          console.warn('[Binance WS] Connection timeout, trying next endpoint');
          this.ws?.close();
          this.tryNextEndpoint();
        }
      }, 5000);

      this.ws.onopen = () => {
        clearTimeout(connectionTimeout);
        console.log('[Binance WS] ✓ Connected successfully');
        this.reconnectAttempts = 0;
        this.lastMessageTime = Date.now();
        this.startHeartbeatMonitor();
      };

      this.ws.onmessage = (event) => {
        this.lastMessageTime = Date.now();

        try {
          const data: BinanceKline = JSON.parse(event.data);

          if (data.e === 'kline') {
            const kline = data.k;
            const candle: CandleData = {
              timestamp: kline.t,
              open: parseFloat(kline.o),
              high: parseFloat(kline.h),
              low: parseFloat(kline.l),
              close: parseFloat(kline.c),
              volume: parseFloat(kline.v),
              isClosed: kline.x,
            };

            if (kline.x) {
              // Candle is closed, add to history
              console.log('[Binance WS] ✓ Closed candle:', new Date(candle.timestamp).toISOString());
              useRealtimeStore.getState().addCandle(candle);
            } else {
              // Candle is still forming, update last candle
              useRealtimeStore.getState().updateLastCandle(candle);
            }
          }
        } catch (err) {
          console.error('[Binance WS] Error parsing message:', err);
        }
      };

      this.ws.onerror = (error) => {
        clearTimeout(connectionTimeout);
        console.warn('[Binance WS] Connection error, will retry with next endpoint');
      };

      this.ws.onclose = (event) => {
        clearTimeout(connectionTimeout);
        this.stopHeartbeatMonitor();
        console.log(`[Binance WS] Disconnected (code: ${event.code})`);

        if (!this.isManualDisconnect) {
          this.scheduleReconnect();
        }
      };

    } catch (error) {
      console.error('[Binance WS] Failed to create WebSocket:', error);
      this.scheduleReconnect();
    }
  }

  /**
   * Monitor for heartbeat - Binance sends updates every second for 1m klines
   */
  private startHeartbeatMonitor(): void {
    this.stopHeartbeatMonitor();

    this.heartbeatTimer = setInterval(() => {
      const timeSinceLastMessage = Date.now() - this.lastMessageTime;

      // If no message for 90 seconds, connection is stale
      if (timeSinceLastMessage > 90000) {
        console.warn('[Binance WS] No data received for 90s, reconnecting');
        this.ws?.close();
      }
    }, 10000); // Check every 10 seconds
  }

  private stopHeartbeatMonitor(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Try the next endpoint in the list
   */
  private tryNextEndpoint(): void {
    this.currentEndpointIndex = (this.currentEndpointIndex + 1) % this.endpoints.length;
    this.scheduleReconnect();
  }

  /**
   * Fetch historical candles from Binance REST API
   * Note: May fail due to CORS in browser - candles will build up from live stream
   */
  async fetchHistoricalCandles(limit: number = 60): Promise<void> {
    try {
      // Use CORS proxy to bypass browser restrictions
      const proxyUrl = 'https://corsproxy.io/?';
      const apiUrl = `https://api.binance.com/api/v3/klines?symbol=${this.symbol.toUpperCase()}&interval=${this.interval}&limit=${limit}`;
      const url = proxyUrl + encodeURIComponent(apiUrl);

      console.log(`[Binance WS] Fetching ${limit} historical candles...`);

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      const candles: CandleData[] = data.map((kline: any[]) => ({
        timestamp: kline[0],
        open: parseFloat(kline[1]),
        high: parseFloat(kline[2]),
        low: parseFloat(kline[3]),
        close: parseFloat(kline[4]),
        volume: parseFloat(kline[5]),
        isClosed: true,
      }));

      console.log(`[Binance WS] ✓ Loaded ${candles.length} historical candles`);
      useRealtimeStore.getState().setCandles(candles);

    } catch (error) {
      console.warn('[Binance WS] Could not fetch historical candles (CORS):', error);
      console.log('[Binance WS] Will build candle history from live stream');
    }
  }

  private scheduleReconnect(): void {
    if (this.isManualDisconnect) return;

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    const baseDelay = 1000;
    const delay = Math.min(
      baseDelay * Math.pow(2, this.reconnectAttempts),
      this.maxReconnectDelay
    );

    this.reconnectAttempts++;

    console.log(`[Binance WS] Reconnecting in ${delay / 1000}s (attempt ${this.reconnectAttempts})`);

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  disconnect(): void {
    console.log('[Binance WS] Disconnecting...');
    this.isManualDisconnect = true;

    this.stopHeartbeatMonitor();

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

// Global singleton instance
const binanceWS = new BinanceWSClient();

export default binanceWS;
