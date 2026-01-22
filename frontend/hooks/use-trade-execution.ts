"use client";

import { useState, useCallback } from "react";
import { useWallets, type ConnectedWallet } from "@privy-io/react-auth";
import { Connection, VersionedTransaction, type VersionedTransaction as VersionedTx } from "@solana/web3.js";
import {
  dflowClient,
  USDC_MINT,
  usdcToUnits,
  type DFlowQuote,
  type OrderStatus,
} from "@/lib/dflow/client";
import { useAuthStore } from "@/lib/stores/auth-store";

export type TradeStep =
  | "idle"
  | "getting-quote"
  | "confirming"
  | "signing"
  | "submitting"
  | "polling"
  | "completed"
  | "error";

export type TradeDirection = "yes" | "no";
export type TradeAction = "buy" | "sell";

export type TradeParams = {
  ticker: string;
  direction: TradeDirection;
  action: TradeAction;
  amount: number; // In USD
  yesMint: string;
  noMint: string;
  slippageBps?: number;
};

export type TradeState = {
  step: TradeStep;
  quote: DFlowQuote | null;
  orderId: string | null;
  orderStatus: OrderStatus | null;
  txSignature: string | null;
  error: string | null;
};

const SOLANA_RPC_URL =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
  "https://api.mainnet-beta.solana.com";

export function useTradeExecution() {
  const { wallets } = useWallets();
  const { wallet, isAuthenticated } = useAuthStore();

  const [state, setState] = useState<TradeState>({
    step: "idle",
    quote: null,
    orderId: null,
    orderStatus: null,
    txSignature: null,
    error: null,
  });

  const reset = useCallback(() => {
    setState({
      step: "idle",
      quote: null,
      orderId: null,
      orderStatus: null,
      txSignature: null,
      error: null,
    });
  }, []);

  const setError = useCallback((error: string) => {
    setState((prev) => ({ ...prev, step: "error", error }));
  }, []);

  /**
   * Get a quote for a trade
   */
  const getQuote = useCallback(
    async (params: TradeParams): Promise<DFlowQuote | null> => {
      if (!isAuthenticated || !wallet) {
        setError("Please connect your wallet first");
        return null;
      }

      setState((prev) => ({
        ...prev,
        step: "getting-quote",
        error: null,
      }));

      try {
        // Determine input/output mints based on action and direction
        let inputMint: string;
        let outputMint: string;

        if (params.action === "buy") {
          // Buying YES/NO tokens with USDC
          inputMint = USDC_MINT;
          outputMint =
            params.direction === "yes" ? params.yesMint : params.noMint;
        } else {
          // Selling YES/NO tokens for USDC
          inputMint =
            params.direction === "yes" ? params.yesMint : params.noMint;
          outputMint = USDC_MINT;
        }

        const quote = await dflowClient.getQuote({
          inputMint,
          outputMint,
          amount: usdcToUnits(params.amount),
          side: params.action,
          slippageBps: params.slippageBps ?? 50,
        });

        setState((prev) => ({
          ...prev,
          step: "confirming",
          quote,
        }));

        return quote;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to get quote";
        setError(message);
        return null;
      }
    },
    [isAuthenticated, wallet, setError]
  );

  /**
   * Execute a trade after getting a quote
   */
  const executeTrade = useCallback(
    async (quote: DFlowQuote): Promise<boolean> => {
      if (!wallet) {
        setError("Wallet not connected");
        return false;
      }

      const connectedWallet = wallets[0];
      if (!connectedWallet) {
        setError("No wallet available");
        return false;
      }

      setState((prev) => ({ ...prev, step: "signing" }));

      try {
        // Create the swap transaction
        const swapTx = await dflowClient.createSwap(quote.quoteId, wallet.address);

        setState((prev) => ({
          ...prev,
          orderId: swapTx.orderId,
        }));

        // Decode the unsigned transaction
        const txBuffer = Buffer.from(swapTx.transaction, "base64");
        const transaction = VersionedTransaction.deserialize(txBuffer);

        // Sign with Privy wallet using the address method
        // Note: Privy v3 handles signing through the wallet provider
        setState((prev) => ({ ...prev, step: "signing" }));

        // Get the wallet provider and sign
        // For now, we'll use the sendTransaction approach which handles signing internally
        const connection = new Connection(SOLANA_RPC_URL, "confirmed");

        // Use Privy's signTransaction if available, otherwise throw helpful error
        if ("signTransaction" in connectedWallet && typeof connectedWallet.signTransaction === "function") {
          const signedTx = await (connectedWallet as ConnectedWallet & { signTransaction: (tx: VersionedTx) => Promise<VersionedTx> }).signTransaction(transaction);

          // Submit to Solana
          setState((prev) => ({ ...prev, step: "submitting" }));
          const signature = await connection.sendRawTransaction(
            signedTx.serialize(),
            {
              skipPreflight: false,
              maxRetries: 3,
            }
          );

          setState((prev) => ({ ...prev, txSignature: signature }));

          // Wait for confirmation
          const confirmation = await connection.confirmTransaction(
            signature,
            "confirmed"
          );

          if (confirmation.value.err) {
            throw new Error(`Transaction failed: ${confirmation.value.err}`);
          }
        } else {
          // Fallback: The wallet doesn't support signTransaction directly
          // This means we need Privy's Solana adapter (requires @privy-io/react-auth/solana)
          throw new Error("Wallet does not support Solana transactions. Please use a Solana-compatible wallet.");
        }

        // Poll for order completion
        setState((prev) => ({ ...prev, step: "polling" }));
        const finalStatus = await pollOrderStatus(swapTx.orderId);

        setState((prev) => ({
          ...prev,
          step: "completed",
          orderStatus: finalStatus,
        }));

        return true;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Trade execution failed";
        setError(message);
        return false;
      }
    },
    [wallet, wallets, setError]
  );

  /**
   * Poll for order status until filled or failed
   */
  const pollOrderStatus = async (
    orderId: string,
    maxAttempts = 30,
    intervalMs = 2000
  ): Promise<OrderStatus> => {
    for (let i = 0; i < maxAttempts; i++) {
      const status = await dflowClient.getOrderStatus(orderId);

      if (
        status.status === "filled" ||
        status.status === "cancelled" ||
        status.status === "expired"
      ) {
        return status;
      }

      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    throw new Error("Order status polling timed out");
  };

  /**
   * Combined function to get quote and execute trade
   */
  const trade = useCallback(
    async (params: TradeParams): Promise<boolean> => {
      const quote = await getQuote(params);
      if (!quote) return false;

      // Auto-execute after getting quote
      // In the trade modal, we'll split this to show confirmation first
      return executeTrade(quote);
    },
    [getQuote, executeTrade]
  );

  return {
    state,
    isReady: isAuthenticated && !!wallet,
    getQuote,
    executeTrade,
    trade,
    reset,
  };
}
