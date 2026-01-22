/**
 * API client for Basilisk backend
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export interface TradeSignal {
  id: number;
  ticker: string;
  signal_type: "YES" | "NO" | "BUY YES" | "BUY NO" | "HOLD";
  expected_value: number;
  edge_percentage: number;
  recommended_price: number;
  confidence_score: number;
  time_to_expiry_hours: number | null;
  is_active: boolean;
  // Bitcoin contract fields
  strike_price?: number;
  expiry_time?: string;
  current_btc_price?: number;
  yes_price?: number;
  no_price?: number;
  implied_probability?: number;
  model_probability?: number;
  // DFlow token mints (for Solana trading)
  yes_mint?: string;
  no_mint?: string;
  // Greeks (Black-Scholes sensitivity metrics)
  greeks?: {
    price: number;      // Theoretical fair value (0-1)
    delta: number;      // Price sensitivity to spot move
    gamma: number;      // Rate of delta change
    vega: number;       // Volatility sensitivity
    theta: number;      // Time decay per day
    rho: number;        // Interest rate sensitivity
  };
}

export interface HealthResponse {
  status: string;
  service: string;
}

export interface ExecuteTradeRequest {
  ticker: string;
  asset: "BTC" | "ETH" | "XRP";
  direction: "YES" | "NO";
  strike: number;
  contracts: number;
  order_type: "market" | "limit";
  limit_price?: number;
  signal_id?: string;
}

export interface TradeResponse {
  success: boolean;
  trade_id?: number;
  order_id?: string;
  client_order_id?: string;
  filled: number;
  price?: number;
  cost?: number;
  error?: string;
}

export interface Position {
  trade_id: number;
  ticker: string;
  asset: string;
  direction: string;
  strike: number;
  contracts: number;
  entry_price: number;
  current_price?: number;
  unrealized_pnl?: number;
  status: string;
  expiry_at?: string;
  opened_at: string;
}

export interface TradeHistory {
  id: number;
  ticker: string;
  asset: string;
  direction: string;
  strike: number;
  contracts: number;
  entry_price: number;
  exit_price?: number;
  fees?: number;
  pnl?: number;
  status: string;
  opened_at: string;
  closed_at?: string;
}

export interface PnLSummary {
  period: string;
  total_pnl: number;
  total_fees: number;
  net_pnl: number;
  trade_count: number;
  wins: number;
  losses: number;
  win_rate: number;
}

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          ...options?.headers,
        },
      });

      if (!response.ok) {
        throw new Error(`API Error: ${response.status} ${response.statusText}`);
      }

      return response.json();
    } catch (error) {
      console.error(`API request failed: ${endpoint}`, error);
      throw error;
    }
  }

  async healthCheck(): Promise<HealthResponse> {
    return this.request<HealthResponse>("/api/v1/health");
  }

  async getCurrentSignals(limit: number = 10): Promise<TradeSignal[]> {
    const searchParams = new URLSearchParams({ limit: String(limit) });
    const response = await this.request<{ contracts: TradeSignal[] }>(
      `/api/v1/current?${searchParams.toString()}`
    );
    return response.contracts.slice(0, limit);
  }

  async getSignal(signalId: number): Promise<TradeSignal> {
    return this.request<TradeSignal>(`/api/v1/signals/${signalId}`);
  }

  // Trading endpoints
  async executeTrade(request: ExecuteTradeRequest): Promise<TradeResponse> {
    return this.request<TradeResponse>("/api/v1/trade", {
      method: "POST",
      body: JSON.stringify(request),
    });
  }

  async executeTradeFromSignal(
    signalId: number,
    contracts: number
  ): Promise<TradeResponse> {
    return this.request<TradeResponse>("/api/v1/trade/signal", {
      method: "POST",
      body: JSON.stringify({ signal_id: signalId, contracts }),
    });
  }

  async getPositions(): Promise<Position[]> {
    return this.request<Position[]>("/api/v1/trade/positions");
  }

  async getPosition(tradeId: number): Promise<Position> {
    return this.request<Position>(`/api/v1/trade/positions/${tradeId}`);
  }

  async closePosition(tradeId: number): Promise<TradeResponse> {
    return this.request<TradeResponse>(`/api/v1/trade/positions/${tradeId}`, {
      method: "DELETE",
    });
  }

  async getTradeHistory(limit = 50, offset = 0): Promise<TradeHistory[]> {
    const params = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
    });
    return this.request<TradeHistory[]>(`/api/v1/trade/history?${params}`);
  }

  async getPnLSummary(period: "today" | "week" | "all" = "today"): Promise<PnLSummary> {
    return this.request<PnLSummary>(`/api/v1/trade/pnl/${period}`);
  }

  async getBalance(): Promise<{ balance: number; available: number }> {
    return this.request<{ balance: number; available: number }>("/api/v1/trade/balance");
  }
}

export const api = new ApiClient();
