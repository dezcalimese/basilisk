/**
 * Multi-Asset SSE Manager - Manages separate SSE connections per asset
 *
 * Strategy: ON-DEMAND STREAMING
 * - Connect to selected asset immediately
 * - Keep 1 background connection to most recently viewed asset
 * - Disconnect idle assets after 60s grace period
 *
 * This prevents overwhelming the backend with 3 simultaneous connections
 * while maintaining instant switching for recently-viewed assets.
 */

import { useMultiAssetStore, type Asset } from './stores/multi-asset-store';

interface AssetConnection {
  eventSource: EventSource;
  disconnectTimer: NodeJS.Timeout | null;
  reconnectTimer: NodeJS.Timeout | null;
  reconnectAttempts: number;
}

class MultiAssetSSEManager {
  private connections: Map<Asset, AssetConnection> = new Map();
  private activeAsset: Asset | null = null;
  private lastActiveAsset: Asset | null = null;
  private maxReconnectDelay = 30000; // 30s
  private idleDisconnectDelay = 60000; // 60s grace period
  private baseUrl = 'http://localhost:8000';

  /**
   * Connect to an asset's SSE stream
   * Called when user selects an asset
   */
  connectAsset(asset: Asset): void {
    // If already connected, do nothing
    if (this.connections.has(asset)) {
      const conn = this.connections.get(asset)!;
      if (conn.eventSource.readyState === EventSource.OPEN) {
        console.log(`[SSE Multi] Already connected to ${asset}`);
        this.activeAsset = asset;
        // Cancel any pending disconnect
        if (conn.disconnectTimer) {
          clearTimeout(conn.disconnectTimer);
          conn.disconnectTimer = null;
        }
        return;
      }
    }

    this.activeAsset = asset;

    // Prune other connections (except last active)
    this.pruneConnections(asset);

    console.log(`[SSE Multi] Connecting to ${asset}...`);
    useMultiAssetStore.getState().setConnectionState(asset, 'connecting');

    try {
      const url = `${this.baseUrl}/api/v1/stream/${asset.toLowerCase()}`;
      const eventSource = new EventSource(url);

      const connection: AssetConnection = {
        eventSource,
        disconnectTimer: null,
        reconnectTimer: null,
        reconnectAttempts: 0,
      };

      // Setup event listeners
      this.setupAssetListeners(eventSource, asset, connection);

      this.connections.set(asset, connection);

      // Update last active
      this.lastActiveAsset = asset;

    } catch (error) {
      console.error(`[SSE Multi] Failed to create EventSource for ${asset}:`, error);
      useMultiAssetStore.getState().setConnectionState(asset, 'error', (error as Error).message);
      this.scheduleReconnect(asset);
    }
  }

  /**
   * Keep max 2 connections: current + last viewed
   * Disconnect others after 60s idle
   */
  private pruneConnections(currentAsset: Asset): void {
    const assetsToDisconnect = Array.from(this.connections.keys()).filter(
      asset => asset !== currentAsset && asset !== this.lastActiveAsset
    );

    assetsToDisconnect.forEach(asset => {
      const conn = this.connections.get(asset);
      if (conn && !conn.disconnectTimer) {
        console.log(`[SSE Multi] Scheduling disconnect for idle asset: ${asset}`);
        conn.disconnectTimer = setTimeout(() => {
          this.disconnectAsset(asset);
        }, this.idleDisconnectDelay);
      }
    });
  }

  private setupAssetListeners(es: EventSource, asset: Asset, connection: AssetConnection): void {
    // Connection events
    es.onopen = () => {
      console.log(`[SSE Multi] ✓ ${asset} connected`);
      connection.reconnectAttempts = 0;
      useMultiAssetStore.getState().setConnectionState(asset, 'connected');
    };

    es.onerror = (error) => {
      console.error(`[SSE Multi] ${asset} error:`, error);
      useMultiAssetStore.getState().setConnectionState(asset, 'error', 'Connection lost');
      this.scheduleReconnect(asset);
    };

    // Connected event
    es.addEventListener('connected', (event) => {
      const data = JSON.parse(event.data);
      console.log(`[SSE Multi] ✓ ${asset} connected event:`, data);
    });

    // Asset price updates (dynamic event name: btc_price, eth_price, xrp_price)
    es.addEventListener(`${asset.toLowerCase()}_price`, (event) => {
      try {
        const data = JSON.parse(event.data);
        const { price, timestamp } = data;
        useMultiAssetStore.getState().setPrice(asset, price, timestamp);
      } catch (err) {
        console.error(`[SSE Multi] Error parsing ${asset} price:`, err);
      }
    });

    // Contract updates
    es.addEventListener('contracts_update', (event) => {
      try {
        const data = JSON.parse(event.data);
        const { contracts, volatility } = data;
        console.log(`[SSE Multi] ✓ ${asset} contracts: ${contracts.length} signals`);
        useMultiAssetStore.getState().setSignals(asset, contracts, volatility);
      } catch (err) {
        console.error(`[SSE Multi] Error parsing ${asset} contracts:`, err);
      }
    });
  }

  private scheduleReconnect(asset: Asset): void {
    const connection = this.connections.get(asset);
    if (!connection) return;

    // Only reconnect if this is the active or last active asset
    if (asset !== this.activeAsset && asset !== this.lastActiveAsset) {
      console.log(`[SSE Multi] Not reconnecting idle asset: ${asset}`);
      return;
    }

    // Clear any existing reconnect timer
    if (connection.reconnectTimer) {
      clearTimeout(connection.reconnectTimer);
    }

    // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s (max)
    const delay = Math.min(
      1000 * Math.pow(2, connection.reconnectAttempts),
      this.maxReconnectDelay
    );

    console.log(`[SSE Multi] Scheduling ${asset} reconnect in ${delay}ms (attempt ${connection.reconnectAttempts + 1})`);
    connection.reconnectAttempts++;

    connection.reconnectTimer = setTimeout(() => {
      console.log(`[SSE Multi] Reconnecting ${asset}...`);
      this.disconnectAsset(asset);
      this.connectAsset(asset);
    }, delay);
  }

  disconnectAsset(asset: Asset): void {
    const connection = this.connections.get(asset);
    if (!connection) return;

    console.log(`[SSE Multi] Disconnecting ${asset}`);

    // Clear timers
    if (connection.disconnectTimer) {
      clearTimeout(connection.disconnectTimer);
    }
    if (connection.reconnectTimer) {
      clearTimeout(connection.reconnectTimer);
    }

    // Close connection
    connection.eventSource.close();
    this.connections.delete(asset);

    useMultiAssetStore.getState().setConnectionState(asset, 'disconnected');
  }

  disconnectAll(): void {
    console.log('[SSE Multi] Disconnecting all assets');
    Array.from(this.connections.keys()).forEach(asset => {
      this.disconnectAsset(asset);
    });
    this.activeAsset = null;
    this.lastActiveAsset = null;
  }

  isConnected(asset: Asset): boolean {
    const connection = this.connections.get(asset);
    return connection?.eventSource.readyState === EventSource.OPEN;
  }

  getReadyState(asset: Asset): number | null {
    const connection = this.connections.get(asset);
    return connection?.eventSource.readyState ?? null;
  }

  setBaseUrl(url: string): void {
    this.baseUrl = url;
  }

  /**
   * Switch to a different asset
   * Maintains connection to previous asset for 60s
   */
  switchAsset(asset: Asset): void {
    console.log(`[SSE Multi] Switching to ${asset}`);
    this.connectAsset(asset);
  }
}

// Export singleton instance
const multiAssetSSEManager = new MultiAssetSSEManager();
export default multiAssetSSEManager;
