/**
 * SSE Client for real-time trading data
 *
 * Connects to backend SSE stream at /api/v1/stream/trading
 * Implements exponential backoff reconnection: 1s → 2s → 4s → 8s → 30s max
 *
 * Events emitted by backend:
 * - "connected" - Initial connection established
 * - "btc_price" - BTC price updates (every 3s)
 * - "contracts_update" - Contract and volatility updates (every 20s)
 */

import { useRealtimeStore } from './stores/realtime-store';
import { useAnalyticalStore } from './stores/analytical-store';

export type SSEEventType = 'connected' | 'btc_price' | 'contracts_update';

export interface SSEEventData {
  [key: string]: any;
}

export interface SSEClientConfig {
  url: string;
  maxReconnectDelay?: number;
  onConnected?: () => void;
  onDisconnected?: () => void;
  onError?: (error: Error) => void;
}

export class SSEClient {
  private eventSource: EventSource | null = null;
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private maxReconnectDelay: number;
  private url: string;
  private onConnected?: () => void;
  private onDisconnected?: () => void;
  private onError?: (error: Error) => void;
  private isManualDisconnect = false;

  constructor(config: SSEClientConfig) {
    this.url = config.url;
    this.maxReconnectDelay = config.maxReconnectDelay || 30000; // 30s max
    this.onConnected = config.onConnected;
    this.onDisconnected = config.onDisconnected;
    this.onError = config.onError;
  }

  connect(): void {
    if (this.eventSource?.readyState === EventSource.OPEN) {
      console.log('[SSE] Already connected');
      return;
    }

    this.isManualDisconnect = false;

    // Update connection state to connecting
    console.log(`[SSE] Connecting to ${this.url}...`);
    useRealtimeStore.getState().setConnectionState('connecting');

    try {
      this.eventSource = new EventSource(this.url);
      console.log('[SSE] EventSource created, readyState:', this.eventSource.readyState);

      // Handle connection open
      this.eventSource.onopen = () => {
        console.log('[SSE] Connection established (onopen fired)');
        this.reconnectAttempts = 0;
        useRealtimeStore.getState().setConnectionState('connected');
        this.onConnected?.();
      };

      // Handle connection error
      this.eventSource.onerror = (error) => {
        console.error('[SSE] Connection error:', error);

        // Only reconnect if not manually disconnected
        if (!this.isManualDisconnect) {
          useRealtimeStore.getState().setConnectionState('reconnecting', 'Connection lost');
          this.onError?.(new Error('SSE connection error'));
          this.scheduleReconnect();
        }
      };

      // Listen for 'connected' event
      this.eventSource.addEventListener('connected', (event) => {
        const data = JSON.parse(event.data);
        console.log('[SSE] ✓ Connected event received:', data);
      });

      // Listen for 'btc_price' events
      this.eventSource.addEventListener('btc_price', (event) => {
        try {
          const data = JSON.parse(event.data);
          const { price, timestamp } = data;
          console.log(`[SSE] ✓ BTC price update: $${price.toLocaleString()}`);

          // Update real-time store
          useRealtimeStore.getState().setCurrentPrice(price, timestamp);
        } catch (err) {
          console.error('[SSE] Error parsing btc_price event:', err);
        }
      });

      // Listen for 'contracts_update' events
      this.eventSource.addEventListener('contracts_update', (event) => {
        try {
          const data = JSON.parse(event.data);
          const { contracts, volatility } = data;
          console.log(`[SSE] ✓ Contracts update: ${contracts.length} contracts`);

          // Update analytical store
          useAnalyticalStore.getState().setSignals(contracts, volatility);
        } catch (err) {
          console.error('[SSE] Error parsing contracts_update event:', err);
        }
      });

    } catch (error) {
      console.error('[SSE] Failed to create EventSource:', error);
      useRealtimeStore.getState().setConnectionState('error', (error as Error).message);
      this.scheduleReconnect();
    }
  }

  disconnect(): void {
    console.log('[SSE] Disconnecting...');
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
    this.onDisconnected?.();
  }

  private scheduleReconnect(): void {
    // Don't reconnect if manually disconnected
    if (this.isManualDisconnect) {
      return;
    }

    // Close existing connection
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }

    // Calculate exponential backoff: 1s → 2s → 4s → 8s → 30s max
    const baseDelay = 1000;
    const delay = Math.min(
      baseDelay * Math.pow(2, this.reconnectAttempts),
      this.maxReconnectDelay
    );

    this.reconnectAttempts++;

    console.log(`[SSE] Reconnecting in ${delay / 1000}s (attempt ${this.reconnectAttempts})...`);

    this.reconnectTimer = setTimeout(() => {
      console.log('[SSE] Attempting reconnection...');
      this.connect();
    }, delay);
  }

  getConnectionState(): EventSource['readyState'] | null {
    return this.eventSource?.readyState ?? null;
  }

  isConnected(): boolean {
    return this.eventSource?.readyState === EventSource.OPEN;
  }
}

// Singleton instance with connection tracking
let sseClient: SSEClient | null = null;
let connectionCount = 0;

export function getSSEClient(config?: SSEClientConfig): SSEClient {
  // If client exists and is connected, return it
  if (sseClient && sseClient.isConnected()) {
    console.log('[SSE Singleton] Reusing existing connection');
    connectionCount++;
    return sseClient;
  }

  // If client exists but disconnected, clean it up first
  if (sseClient) {
    console.log('[SSE Singleton] Cleaning up stale client');
    sseClient.disconnect();
    sseClient = null;
  }

  // Create new client only if config provided
  if (config) {
    console.log('[SSE Singleton] Creating new client');
    sseClient = new SSEClient(config);
    connectionCount = 1;
    return sseClient;
  }

  throw new Error('SSE Client not initialized. Call getSSEClient with config first.');
}

export function destroySSEClient(): void {
  connectionCount = Math.max(0, connectionCount - 1);

  // Only destroy if no more connections reference it
  if (connectionCount === 0 && sseClient) {
    console.log('[SSE Singleton] Destroying client (no more references)');
    sseClient.disconnect();
    sseClient = null;
  } else {
    console.log(`[SSE Singleton] Not destroying (${connectionCount} references remaining)`);
  }
}
