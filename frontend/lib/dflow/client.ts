/**
 * DFlow API client for Solana-based prediction market trading.
 *
 * Uses the new GET /order flow (replaces legacy /quote + /swap).
 * All prediction market trades are async — poll /order-status after submitting.
 *
 * CORS: DFlow Trade API has no CORS headers, so all requests are proxied
 * through our backend (required per DFlow docs).
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// USDC mint on Solana mainnet
export const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

// ============================================================
// Types
// ============================================================

export type OrderRequest = {
  inputMint: string;
  outputMint: string;
  amount: number; // In atomic units (USDC = 6 decimals)
  userWallet?: string; // Omit to get quote only (no KYC required)
  slippageBps?: number | "auto";
};

export type DFlowOrderResponse = {
  inputMint: string;
  inAmount: string; // Scaled integer as string
  outputMint: string;
  outAmount: string; // Scaled integer as string
  otherAmountThreshold: string | null;
  slippageBps: number | null;
  priceImpactPct: string | null;
  executionMode: "sync" | "async";
  transaction: string | null; // Base64-encoded, null if no userWallet
  lastValidBlockHeight: number | null;
};

export type DFlowFill = {
  qty_in: number | null;
  qty_out: number | null;
};

export type OrderStatusResponse = {
  status: "pending" | "open" | "pendingClose" | "closed" | "expired" | "failed";
  fills: DFlowFill[];
};

export type MarketMints = {
  yesMint: string;
  noMint: string;
};

// ============================================================
// Client
// ============================================================

class DFlowClient {
  private baseUrl: string;
  private authToken: string | null = null;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  /**
   * Set the authentication token for API requests
   */
  setAuthToken(token: string | null) {
    this.authToken = token;
  }

  private async request<T>(
    endpoint: string,
    options?: RequestInit
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (this.authToken) {
      headers["Authorization"] = `Bearer ${this.authToken}`;
    }

    const response = await fetch(url, {
      ...options,
      headers: {
        ...headers,
        ...options?.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(
        error.detail || `API Error: ${response.status} ${response.statusText}`
      );
    }

    return response.json();
  }

  // ============================================================
  // Trade API (proxied through backend)
  // ============================================================

  /**
   * Get a trade order with a ready-to-sign transaction.
   *
   * Single call replaces the legacy quote + swap two-step flow.
   * Omit userWallet to get a quote without KYC (for price display).
   */
  async getOrder(request: OrderRequest): Promise<DFlowOrderResponse> {
    const data = await this.request<{
      input_mint: string;
      in_amount: string;
      output_mint: string;
      out_amount: string;
      other_amount_threshold: string | null;
      slippage_bps: number | null;
      price_impact_pct: string | null;
      execution_mode: string;
      transaction: string | null;
      last_valid_block_height: number | null;
    }>("/api/v1/trade/order", {
      method: "POST",
      body: JSON.stringify({
        input_mint: request.inputMint,
        output_mint: request.outputMint,
        amount: request.amount,
        user_wallet: request.userWallet,
        slippage_bps: request.slippageBps ?? "auto",
      }),
    });

    return {
      inputMint: data.input_mint,
      inAmount: data.in_amount,
      outputMint: data.output_mint,
      outAmount: data.out_amount,
      otherAmountThreshold: data.other_amount_threshold,
      slippageBps: data.slippage_bps,
      priceImpactPct: data.price_impact_pct,
      executionMode: data.execution_mode as "sync" | "async",
      transaction: data.transaction,
      lastValidBlockHeight: data.last_valid_block_height,
    };
  }

  /**
   * Poll order status by transaction signature.
   *
   * For async trades (all prediction market trades), poll with 2s interval
   * while status is 'open' or 'pendingClose'.
   */
  async getOrderStatus(
    signature: string,
    lastValidBlockHeight?: number
  ): Promise<OrderStatusResponse> {
    const params = new URLSearchParams({ signature });
    if (lastValidBlockHeight !== undefined) {
      params.set("last_valid_block_height", lastValidBlockHeight.toString());
    }

    return this.request<OrderStatusResponse>(
      `/api/v1/trade/order-status?${params.toString()}`
    );
  }

  /**
   * Check if a wallet is verified via Proof KYC.
   * Required before buying prediction market outcome tokens.
   */
  async verifyWallet(address: string): Promise<boolean> {
    const data = await this.request<{ verified: boolean }>(
      `/api/v1/trade/verify/${address}`
    );
    return data.verified;
  }

  // ============================================================
  // Market Data
  // ============================================================

  /**
   * Get YES/NO token mints for a market
   */
  async getMarketMints(ticker: string): Promise<MarketMints | null> {
    try {
      const data = await this.request<{
        yes_mint: string;
        no_mint: string;
      }>(`/api/v1/trade/markets/${ticker}/mints`);

      return {
        yesMint: data.yes_mint,
        noMint: data.no_mint,
      };
    } catch {
      return null;
    }
  }
}

// Export singleton instance
export const dflowClient = new DFlowClient();

// ============================================================
// Helper functions
// ============================================================

/**
 * Convert USDC amount to atomic units (6 decimals)
 */
export function usdcToUnits(amount: number): number {
  return Math.floor(amount * 1_000_000);
}

/**
 * Convert atomic units to USDC amount
 */
export function unitsToUsdc(units: number): number {
  return units / 1_000_000;
}

/**
 * Format price in cents to display format
 */
export function formatCentsPrice(cents: number): string {
  return `${cents}¢`;
}

/**
 * Calculate max payout for a position
 */
export function calculateMaxPayout(contracts: number): number {
  // Each contract pays $1 if it wins
  return contracts;
}

/**
 * Calculate potential profit
 */
export function calculatePotentialProfit(
  contracts: number,
  priceInCents: number
): number {
  const cost = (priceInCents / 100) * contracts;
  const maxPayout = contracts;
  return maxPayout - cost;
}

/**
 * Check if current time is within Kalshi maintenance window.
 * Thursdays 3:00 AM to 5:00 AM ET — orders submitted during
 * this window will be reverted.
 */
export function isMaintenanceWindow(): boolean {
  const now = new Date();
  // Convert to ET
  const et = new Date(
    now.toLocaleString("en-US", { timeZone: "America/New_York" })
  );
  const day = et.getDay(); // 4 = Thursday
  const hour = et.getHours();
  return day === 4 && hour >= 3 && hour < 5;
}
