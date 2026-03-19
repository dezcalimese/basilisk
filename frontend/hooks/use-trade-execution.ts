"use client";

import { useState, useCallback } from "react";
import { useWallets, type ConnectedWallet } from "@privy-io/react-auth";
import { Connection, VersionedTransaction, type VersionedTransaction as VersionedTx } from "@solana/web3.js";
import {
  dflowClient,
  USDC_MINT,
  usdcToUnits,
  isMaintenanceWindow,
  type DFlowOrderResponse,
  type OrderStatusResponse,
} from "@/lib/dflow/client";
import { useAuthStore } from "@/lib/stores/auth-store";
import { checkGeoRestriction } from "@/lib/geoblocking";

export type TradeStep =
  | "idle"
  | "verifying"
  | "getting-order"
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
  slippageBps?: number | "auto";
};

export type TradeState = {
  step: TradeStep;
  order: DFlowOrderResponse | null;
  orderStatus: OrderStatusResponse | null;
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
    order: null,
    orderStatus: null,
    txSignature: null,
    error: null,
  });

  const reset = useCallback(() => {
    setState({
      step: "idle",
      order: null,
      orderStatus: null,
      txSignature: null,
      error: null,
    });
  }, []);

  const setError = useCallback((error: string) => {
    setState((prev) => ({ ...prev, step: "error", error }));
  }, []);

  /**
   * Get a trade order (quote + transaction in one call)
   */
  const getOrder = useCallback(
    async (params: TradeParams): Promise<DFlowOrderResponse | null> => {
      if (!isAuthenticated || !wallet) {
        setError("Please connect your wallet first");
        return null;
      }

      // Check geoblocking
      const geo = await checkGeoRestriction();
      if (!geo.allowed) {
        setError(
          `Trading is not available in ${geo.countryName || "your region"} due to regulatory restrictions.`
        );
        return null;
      }

      // Check maintenance window
      if (isMaintenanceWindow()) {
        setError(
          "Kalshi maintenance window (Thu 3-5am ET). Orders will be reverted. Please try again later."
        );
        return null;
      }

      // Verify KYC for buys
      if (params.action === "buy") {
        setState((prev) => ({ ...prev, step: "verifying", error: null }));
        try {
          const verified = await dflowClient.verifyWallet(wallet.address);
          if (!verified) {
            setError(
              "Wallet not verified. Please complete Proof KYC verification before trading."
            );
            return null;
          }
        } catch {
          // KYC check failed but don't block — DFlow will reject at order time
        }
      }

      setState((prev) => ({
        ...prev,
        step: "getting-order",
        error: null,
      }));

      try {
        // Determine input/output mints
        let inputMint: string;
        let outputMint: string;

        if (params.action === "buy") {
          inputMint = USDC_MINT;
          outputMint =
            params.direction === "yes" ? params.yesMint : params.noMint;
        } else {
          inputMint =
            params.direction === "yes" ? params.yesMint : params.noMint;
          outputMint = USDC_MINT;
        }

        const order = await dflowClient.getOrder({
          inputMint,
          outputMint,
          amount: usdcToUnits(params.amount),
          userWallet: wallet.address,
          slippageBps: params.slippageBps ?? "auto",
        });

        setState((prev) => ({
          ...prev,
          step: "confirming",
          order,
        }));

        return order;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to get order";
        setError(message);
        return null;
      }
    },
    [isAuthenticated, wallet, setError]
  );

  /**
   * Execute a trade by signing and submitting the transaction
   */
  const executeTrade = useCallback(
    async (order: DFlowOrderResponse): Promise<boolean> => {
      if (!wallet) {
        setError("Wallet not connected");
        return false;
      }

      if (!order.transaction) {
        setError("No transaction to sign — order was quote-only");
        return false;
      }

      const connectedWallet = wallets[0];
      if (!connectedWallet) {
        setError("No wallet available");
        return false;
      }

      setState((prev) => ({ ...prev, step: "signing" }));

      try {
        // Decode the base64 transaction
        const txBuffer = Buffer.from(order.transaction, "base64");
        const transaction = VersionedTransaction.deserialize(txBuffer);

        // Sign with Privy wallet
        if (
          "signTransaction" in connectedWallet &&
          typeof connectedWallet.signTransaction === "function"
        ) {
          const signedTx = await (
            connectedWallet as ConnectedWallet & {
              signTransaction: (tx: VersionedTx) => Promise<VersionedTx>;
            }
          ).signTransaction(transaction);

          // Submit to Solana
          setState((prev) => ({ ...prev, step: "submitting" }));
          const connection = new Connection(SOLANA_RPC_URL, "confirmed");
          const signature = await connection.sendRawTransaction(
            signedTx.serialize(),
            { skipPreflight: false, maxRetries: 3 }
          );

          setState((prev) => ({ ...prev, txSignature: signature }));

          // All prediction market trades are async — poll for fills
          setState((prev) => ({ ...prev, step: "polling" }));
          const finalStatus = await pollOrderStatus(
            signature,
            order.lastValidBlockHeight ?? undefined
          );

          setState((prev) => ({
            ...prev,
            step: "completed",
            orderStatus: finalStatus,
          }));

          return finalStatus.status === "closed" && finalStatus.fills.length > 0;
        } else {
          throw new Error(
            "Wallet does not support Solana transactions. Please use a Solana-compatible wallet."
          );
        }
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
   * Poll order status until terminal state
   */
  const pollOrderStatus = async (
    signature: string,
    lastValidBlockHeight?: number,
    maxAttempts = 30,
    intervalMs = 2000
  ): Promise<OrderStatusResponse> => {
    for (let i = 0; i < maxAttempts; i++) {
      const status = await dflowClient.getOrderStatus(
        signature,
        lastValidBlockHeight
      );

      if (
        status.status === "closed" ||
        status.status === "expired" ||
        status.status === "failed"
      ) {
        return status;
      }

      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    throw new Error("Order status polling timed out");
  };

  /**
   * Combined: get order + execute trade
   */
  const trade = useCallback(
    async (params: TradeParams): Promise<boolean> => {
      const order = await getOrder(params);
      if (!order) return false;
      return executeTrade(order);
    },
    [getOrder, executeTrade]
  );

  return {
    state,
    isReady: isAuthenticated && !!wallet,
    getOrder,
    executeTrade,
    trade,
    reset,
  };
}
