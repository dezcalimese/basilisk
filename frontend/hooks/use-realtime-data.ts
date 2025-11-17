import { useEffect } from 'react';
import sseManager from '@/lib/sse-manager';
import exchangeAPI from '@/lib/exchange-api';

/**
 * React hook for consuming real-time trading data via SSE and Exchange REST API
 *
 * Uses global managers that persist across React re-renders
 * to prevent hot-reload from breaking connections in development.
 *
 * Note: Uses multi-exchange data via backend proxy with automatic fallback.
 * Backend uses CCXT to try multiple exchanges (Kraken, Coinbase, etc.)
 * Falls back to CoinGecko if all exchanges fail.
 *
 * Usage:
 * ```tsx
 * function Dashboard() {
 *   useRealtimeData();
 *
 *   const currentPrice = useRealtimeStore((state) => state.currentPrice);
 *   const signals = useAnalyticalStore((state) => state.signals);
 *
 *   return <div>Current BTC: ${currentPrice}</div>;
 * }
 * ```
 */

interface UseRealtimeDataOptions {
  /**
   * Base URL for the backend API
   * @default http://localhost:8000
   */
  baseUrl?: string;

  /**
   * Enable automatic connection on mount
   * @default true
   */
  autoConnect?: boolean;
}

export function useRealtimeData(options: UseRealtimeDataOptions = {}) {
  const {
    baseUrl = 'http://localhost:8000',
    autoConnect = true,
  } = options;

  useEffect(() => {
    if (!autoConnect) {
      return;
    }

    const url = `${baseUrl}/api/v1/stream/trading`;

    // Connect to backend SSE for signals and volatility
    console.log('[useRealtimeData] Requesting SSE connection');
    sseManager.connect(url);

    // Start Exchange API polling for candles (via backend proxy)
    console.log('[useRealtimeData] Starting Exchange API polling via backend');
    exchangeAPI.startPolling();

    // Don't disconnect on cleanup - let the managers persist
    // This prevents hot-reload from breaking the connection
    return () => {
      console.log('[useRealtimeData] Component unmounting (managers persist)');
      // Intentionally NOT calling disconnect on managers
      // They will persist across re-renders
    };
  }, [baseUrl, autoConnect]);

  return {
    /**
     * Manually reconnect to SSE stream
     */
    reconnect: () => {
      const url = `${baseUrl}/api/v1/stream/trading`;
      sseManager.disconnect();
      sseManager.connect(url);
      exchangeAPI.stopPolling();
      exchangeAPI.startPolling();
    },

    /**
     * Check if currently connected
     */
    isConnected: () => sseManager.isConnected() && exchangeAPI.getIsPolling(),

    /**
     * Get current connection state
     */
    getReadyState: () => sseManager.getReadyState(),

    /**
     * Manually disconnect (use sparingly)
     */
    disconnect: () => {
      sseManager.disconnect();
      exchangeAPI.stopPolling();
    },
  };
}
