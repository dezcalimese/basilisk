/**
 * DFlow API client for Solana-based prediction market trading
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// USDC mint on Solana mainnet
export const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

// ============================================================
// Types
// ============================================================

export type QuoteRequest = {
  inputMint: string;
  outputMint: string;
  amount: number; // In token units (USDC has 6 decimals)
  side: "buy" | "sell";
  slippageBps?: number;
};

export type DFlowQuote = {
  quoteId: string;
  inputMint: string;
  outputMint: string;
  inputAmount: number;
  outputAmount: number;
  price: number; // Effective price per contract
  priceImpact: number; // Percentage
  fee: number; // USD
  expiresAt: Date;
  slippageBps: number;
};

export type SwapTransaction = {
  quoteId: string;
  transaction: string; // Base64-encoded unsigned transaction
  orderId: string;
  expiresAt: Date;
};

export type OrderStatus = {
  orderId: string;
  quoteId: string;
  status: "pending" | "filling" | "filled" | "cancelled" | "expired";
  inputMint: string;
  outputMint: string;
  inputAmount: number;
  outputAmount: number;
  filledAmount: number;
  averagePrice: number | null;
  transactionSignature: string | null;
  createdAt: Date;
  updatedAt: Date;
  filledAt: Date | null;
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
  // Quote & Swap
  // ============================================================

  /**
   * Get a quote for swapping tokens
   */
  async getQuote(request: QuoteRequest): Promise<DFlowQuote> {
    const data = await this.request<{
      quote_id: string;
      input_mint: string;
      output_mint: string;
      input_amount: number;
      output_amount: number;
      price: number;
      price_impact: number;
      fee: number;
      expires_at: string;
      slippage_bps: number;
    }>("/api/v1/trade/quote", {
      method: "POST",
      body: JSON.stringify({
        input_mint: request.inputMint,
        output_mint: request.outputMint,
        amount: request.amount,
        side: request.side,
        slippage_bps: request.slippageBps ?? 50,
      }),
    });

    return {
      quoteId: data.quote_id,
      inputMint: data.input_mint,
      outputMint: data.output_mint,
      inputAmount: data.input_amount,
      outputAmount: data.output_amount,
      price: data.price,
      priceImpact: data.price_impact,
      fee: data.fee,
      expiresAt: new Date(data.expires_at),
      slippageBps: data.slippage_bps,
    };
  }

  /**
   * Create an unsigned swap transaction
   */
  async createSwap(
    quoteId: string,
    userWallet: string
  ): Promise<SwapTransaction> {
    const data = await this.request<{
      quote_id: string;
      transaction: string;
      order_id: string;
      expires_at: string;
    }>("/api/v1/trade/swap", {
      method: "POST",
      body: JSON.stringify({
        quote_id: quoteId,
        user_wallet: userWallet,
      }),
    });

    return {
      quoteId: data.quote_id,
      transaction: data.transaction,
      orderId: data.order_id,
      expiresAt: new Date(data.expires_at),
    };
  }

  /**
   * Get the status of an order
   */
  async getOrderStatus(orderId: string): Promise<OrderStatus> {
    const data = await this.request<{
      order_id: string;
      quote_id: string;
      status: string;
      input_mint: string;
      output_mint: string;
      input_amount: number;
      output_amount: number;
      filled_amount: number;
      average_price: number | null;
      transaction_signature: string | null;
      created_at: string;
      updated_at: string;
      filled_at: string | null;
    }>(`/api/v1/trade/orders/${orderId}`);

    return {
      orderId: data.order_id,
      quoteId: data.quote_id,
      status: data.status as OrderStatus["status"],
      inputMint: data.input_mint,
      outputMint: data.output_mint,
      inputAmount: data.input_amount,
      outputAmount: data.output_amount,
      filledAmount: data.filled_amount,
      averagePrice: data.average_price,
      transactionSignature: data.transaction_signature,
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
      filledAt: data.filled_at ? new Date(data.filled_at) : null,
    };
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
 * Convert USDC amount to token units (6 decimals)
 */
export function usdcToUnits(amount: number): number {
  return Math.floor(amount * 1_000_000);
}

/**
 * Convert token units to USDC amount
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
