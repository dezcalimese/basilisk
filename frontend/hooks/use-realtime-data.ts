import { useEffect } from 'react';
import multiAssetSSEManager from '@/lib/sse-multi-asset-manager';
import exchangeAPI from '@/lib/exchange-api';
import { useMultiAssetStore, type Asset } from '@/lib/stores/multi-asset-store';

/**
 * React hook for consuming real-time multi-asset trading data via SSE
 *
 * Supports BTC, ETH, and XRP with on-demand streaming:
 * - Connects immediately to selected asset
 * - Keeps connection to last-viewed asset for 60s
 * - Disconnects idle assets after grace period
 *
 * Usage:
 * ```tsx
 * function Dashboard() {
 *   useRealtimeData();
 *
 *   const selectedAsset = useMultiAssetStore((state) => state.selectedAsset);
 *   const selectAsset = useMultiAssetStore((state) => state.selectAsset);
 *   const currentPrice = useMultiAssetStore((state) => state.getCurrentPrice());
 *
 *   return (
 *     <div>
 *       <button onClick={() => selectAsset('BTC')}>BTC</button>
 *       <button onClick={() => selectAsset('ETH')}>ETH</button>
 *       <button onClick={() => selectAsset('XRP')}>XRP</button>
 *       <div>Current {selectedAsset}: ${currentPrice}</div>
 *     </div>
 *   );
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

  const selectedAsset = useMultiAssetStore((state) => state.selectedAsset);

  useEffect(() => {
    if (!autoConnect) {
      return;
    }

    // Set base URL for multi-asset manager
    multiAssetSSEManager.setBaseUrl(baseUrl);

    // Connect to selected asset immediately
    console.log(`[useRealtimeData] Connecting to ${selectedAsset} stream`);
    multiAssetSSEManager.connectAsset(selectedAsset);

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

  // Watch for asset changes and switch connections
  useEffect(() => {
    if (!autoConnect) {
      return;
    }

    console.log(`[useRealtimeData] Asset changed to ${selectedAsset}`);
    multiAssetSSEManager.switchAsset(selectedAsset);
  }, [selectedAsset, autoConnect]);

  return {
    /**
     * Manually reconnect to current asset's SSE stream
     */
    reconnect: () => {
      multiAssetSSEManager.disconnectAsset(selectedAsset);
      multiAssetSSEManager.connectAsset(selectedAsset);
      exchangeAPI.stopPolling();
      exchangeAPI.startPolling();
    },

    /**
     * Check if currently connected to selected asset
     */
    isConnected: () => multiAssetSSEManager.isConnected(selectedAsset) && exchangeAPI.getIsPolling(),

    /**
     * Get current connection state for selected asset
     */
    getReadyState: () => multiAssetSSEManager.getReadyState(selectedAsset),

    /**
     * Manually disconnect all assets (use sparingly)
     */
    disconnect: () => {
      multiAssetSSEManager.disconnectAll();
      exchangeAPI.stopPolling();
    },

    /**
     * Switch to a different asset
     */
    switchAsset: (asset: Asset) => {
      useMultiAssetStore.getState().selectAsset(asset);
    },
  };
}
