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
}

export const api = new ApiClient();
