/**
 * Global SSE Manager - Singleton that persists across React re-renders
 *
 * This manager lives outside React's lifecycle to prevent
 * hot-reload and strict mode from destroying connections.
 */

import { useRealtimeStore } from './stores/realtime-store';
import { useAnalyticalStore } from './stores/analytical-store';

class SSEManager {
  private eventSource: EventSource | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private maxReconnectDelay = 30000;
  private isManualDisconnect = false;
  private url: string | null = null;

  /**
   * Initialize and connect to SSE stream
   * Safe to call multiple times - will reuse existing connection
   */
  connect(url: string): void {
    // If already connected to the same URL, do nothing
    if (this.eventSource?.readyState === EventSource.OPEN && this.url === url) {
      console.log('[SSE Manager] Already connected to', url);
      return;
    }

    // If connected to a different URL, disconnect first
    if (this.eventSource && this.url !== url) {
      console.log('[SSE Manager] Switching URL from', this.url, 'to', url);
      this.disconnect();
    }

    this.url = url;
    this.isManualDisconnect = false;

    console.log('[SSE Manager] Connecting to', url);
    useRealtimeStore.getState().setConnectionState('connecting');

    try {
      this.eventSource = new EventSource(url);
      console.log('[SSE Manager] EventSource created, readyState:', this.eventSource.readyState);

      // Connection opened
      this.eventSource.onopen = () => {
        console.log('[SSE Manager] ✓ Connection established');
        this.reconnectAttempts = 0;
        useRealtimeStore.getState().setConnectionState('connected');
      };

      // Connection error
      this.eventSource.onerror = (error) => {
        console.error('[SSE Manager] Connection error:', error);

        if (!this.isManualDisconnect) {
          useRealtimeStore.getState().setConnectionState('reconnecting', 'Connection lost');
          this.scheduleReconnect();
        }
      };

      // Listen for events
      this.setupEventListeners();

    } catch (error) {
      console.error('[SSE Manager] Failed to create EventSource:', error);
      useRealtimeStore.getState().setConnectionState('error', (error as Error).message);
      this.scheduleReconnect();
    }
  }

  private setupEventListeners(): void {
    if (!this.eventSource) return;

    // Connected event
    this.eventSource.addEventListener('connected', (event) => {
      const data = JSON.parse(event.data);
      console.log('[SSE Manager] ✓ Connected event:', data);
    });

    // BTC price updates
    this.eventSource.addEventListener('btc_price', (event) => {
      try {
        const data = JSON.parse(event.data);
        const { price, timestamp } = data;
        console.log(`[SSE Manager] ✓ BTC price: $${price.toLocaleString()}`);
        useRealtimeStore.getState().setCurrentPrice(price, timestamp);
      } catch (err) {
        console.error('[SSE Manager] Error parsing btc_price:', err);
      }
    });

    // Contracts update
    this.eventSource.addEventListener('contracts_update', (event) => {
      try {
        const data = JSON.parse(event.data);
        const { contracts, volatility } = data;
        console.log(`[SSE Manager] ✓ Contracts update: ${contracts.length} contracts`);
        useAnalyticalStore.getState().setSignals(contracts, volatility);
      } catch (err) {
        console.error('[SSE Manager] Error parsing contracts_update:', err);
      }
    });
  }

  private scheduleReconnect(): void {
    if (this.isManualDisconnect || !this.url) return;

    // Close existing connection
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }

    // Calculate backoff
    const baseDelay = 1000;
    const delay = Math.min(
      baseDelay * Math.pow(2, this.reconnectAttempts),
      this.maxReconnectDelay
    );

    this.reconnectAttempts++;

    console.log(`[SSE Manager] Reconnecting in ${delay / 1000}s (attempt ${this.reconnectAttempts})`);

    this.reconnectTimer = setTimeout(() => {
      if (this.url) {
        this.connect(this.url);
      }
    }, delay);
  }

  disconnect(): void {
    console.log('[SSE Manager] Disconnecting...');
    this.isManualDisconnect = true;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }

    useRealtimeStore.getState().setConnectionState('disconnected');
    this.url = null;
  }

  isConnected(): boolean {
    return this.eventSource?.readyState === EventSource.OPEN;
  }

  getReadyState(): number | null {
    return this.eventSource?.readyState ?? null;
  }
}

// Global singleton instance
const sseManager = new SSEManager();

export default sseManager;
