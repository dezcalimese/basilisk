"use client";

import { useState, useEffect } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useTradeExecution, type TradeStep } from "@/hooks/use-trade-execution";
import { useAuthStore } from "@/lib/stores/auth-store";
import { formatCentsPrice, calculatePotentialProfit } from "@/lib/dflow/client";
import type { TradeSignal } from "@/lib/api";

// Extended signal type with DFlow mints
export type TradeSignalWithMints = TradeSignal & {
  yes_mint?: string;
  no_mint?: string;
};

type TradeModalProps = {
  signal: TradeSignalWithMints | null;
  isOpen: boolean;
  onClose: () => void;
};

type OrderMode = "dollars" | "contracts" | "limit";
type TabType = "buy" | "sell";

export function TradeModal({ signal, isOpen, onClose }: TradeModalProps) {
  const { login } = usePrivy();
  const { wallet, balance, isAuthenticated } = useAuthStore();
  const { state, isReady, getQuote, executeTrade, reset } = useTradeExecution();

  const [tab, setTab] = useState<TabType>("buy");
  const [selectedSide, setSelectedSide] = useState<"yes" | "no">("yes");
  const [orderMode, setOrderMode] = useState<OrderMode>("contracts");
  const [quantity, setQuantity] = useState<string>("");
  const [limitPrice, setLimitPrice] = useState<string>("");
  const [expiration, setExpiration] = useState<"gtc" | "12am" | "ioc">("gtc");

  // Reset state when signal changes
  useEffect(() => {
    if (signal) {
      setSelectedSide(signal.signal_type.includes("YES") ? "yes" : "no");
      setQuantity("");
      setLimitPrice("");
      reset();
    }
  }, [signal, reset]);

  // Reset on close
  useEffect(() => {
    if (!isOpen) {
      reset();
    }
  }, [isOpen, reset]);

  if (!isOpen || !signal) return null;

  const yesPrice = signal.yes_price ? Math.round(signal.yes_price * 100) : 50;
  const noPrice = signal.no_price ? Math.round(signal.no_price * 100) : 50;
  const currentPrice = selectedSide === "yes" ? yesPrice : noPrice;

  // Parse strike from ticker
  const strikeMatch = signal.ticker.match(/[TAB]([\d.]+)/);
  const strikeDisplay = strikeMatch
    ? `$${Number(strikeMatch[1]).toLocaleString()}`
    : signal.strike_price
    ? `$${signal.strike_price.toLocaleString()}`
    : "";

  // Extract expiry time
  const expiryMatch = signal.ticker.match(/(\d{2})([A-Z]{3})(\d{2})(\d{2})/);
  const expiryDisplay = expiryMatch
    ? `${expiryMatch[4]}:00 EST`
    : signal.time_to_expiry_hours
    ? `${signal.time_to_expiry_hours.toFixed(1)}h`
    : "";

  const estimatedCost =
    orderMode === "dollars"
      ? parseFloat(quantity) || 0
      : orderMode === "limit"
      ? ((parseInt(limitPrice) || 0) / 100) * (parseInt(quantity) || 0)
      : (currentPrice / 100) * (parseInt(quantity) || 0);

  const contractCount =
    orderMode === "dollars"
      ? Math.floor((parseFloat(quantity) || 0) / (currentPrice / 100))
      : parseInt(quantity) || 0;

  const potentialProfit = calculatePotentialProfit(contractCount, currentPrice);
  const hasMints = signal.yes_mint && signal.no_mint;
  const insufficientBalance = estimatedCost > balance;

  const handleGetQuote = async () => {
    if (!signal.yes_mint || !signal.no_mint) {
      return;
    }

    await getQuote({
      ticker: signal.ticker,
      direction: selectedSide,
      action: tab,
      amount: estimatedCost,
      yesMint: signal.yes_mint,
      noMint: signal.no_mint,
    });
  };

  const handleExecuteTrade = async () => {
    if (!state.quote) return;
    const success = await executeTrade(state.quote);
    if (success) {
      // Close modal after short delay to show success state
      setTimeout(onClose, 2000);
    }
  };

  const handleSubmit = () => {
    if (!isAuthenticated) {
      login();
      return;
    }

    if (state.step === "confirming" && state.quote) {
      handleExecuteTrade();
    } else {
      handleGetQuote();
    }
  };

  const getStepLabel = (step: TradeStep): string => {
    switch (step) {
      case "getting-quote":
        return "Getting Quote...";
      case "confirming":
        return "Confirm Trade";
      case "signing":
        return "Sign Transaction...";
      case "submitting":
        return "Submitting...";
      case "polling":
        return "Confirming...";
      case "completed":
        return "Trade Complete!";
      case "error":
        return "Try Again";
      default:
        return "Get Quote";
    }
  };

  const isProcessing = ["getting-quote", "signing", "submitting", "polling"].includes(state.step);
  const canSubmit =
    quantity &&
    (orderMode !== "limit" || limitPrice) &&
    !insufficientBalance &&
    !isProcessing &&
    state.step !== "completed";

  return (
    <>
      {/* Backdrop */}
      <div
        className="trade-modal-backdrop fixed inset-0 z-40 animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-x-0 bottom-0 md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 z-50 w-full md:max-w-md animate-in slide-in-from-bottom-4 md:slide-in-from-bottom-0 md:zoom-in-95 duration-300">
        <div className="trade-modal">
          {/* Header */}
          <div className="flex items-start justify-between p-5 border-b border-border/50">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#1E81B0] to-[#4AADD8] flex items-center justify-center glow-emerald">
                <span className="text-white font-bold text-lg">₿</span>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">
                  Bitcoin price at {expiryDisplay}?
                </p>
                <p className="font-semibold text-lg">
                  <span className="text-primary">
                    {tab === "buy" ? "Buy" : "Sell"}{" "}
                    {selectedSide === "yes" ? "Yes" : "No"}
                  </span>
                  <span className="text-muted-foreground">
                    {" "}
                    · {strikeDisplay} or above
                  </span>
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-muted rounded-lg transition-colors"
            >
              <i className="icon-[lucide--x] h-5 w-5 text-muted-foreground" />
            </button>
          </div>

          {/* Buy/Sell Tabs */}
          <div className="flex border-b border-border/50">
            <button
              onClick={() => setTab("buy")}
              className={cn(
                "flex-1 py-3.5 text-sm font-semibold transition-all",
                tab === "buy"
                  ? "text-primary border-b-2 border-primary bg-primary/5"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )}
            >
              Buy
            </button>
            <button
              onClick={() => setTab("sell")}
              className={cn(
                "flex-1 py-3.5 text-sm font-semibold transition-all",
                tab === "sell"
                  ? "text-red-500 border-b-2 border-red-500 bg-red-500/5"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )}
            >
              Sell
            </button>

            {/* Order Mode Dropdown */}
            <div className="relative px-4 py-2 flex items-center border-l border-border/50">
              <select
                value={orderMode}
                onChange={(e) => setOrderMode(e.target.value as OrderMode)}
                className="appearance-none bg-transparent text-sm text-muted-foreground cursor-pointer pr-6 focus:outline-none"
              >
                <option value="dollars">Dollars</option>
                <option value="contracts">Contracts</option>
                <option value="limit">Limit</option>
              </select>
              <i className="icon-[lucide--chevron-down] w-4 h-4 absolute right-4 pointer-events-none text-muted-foreground" />
            </div>
          </div>

          {/* Content */}
          <div className="p-5 space-y-5">
            {/* Wallet Connection Banner */}
            {!isAuthenticated && (
              <div className="p-4 bg-primary/10 rounded-xl border border-primary/20">
                <div className="flex items-center gap-3">
                  <i className="icon-[lucide--wallet] h-5 w-5 text-[#4AADD8]" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-[#4AADD8]">
                      Connect wallet to trade
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Trade directly from your Solana wallet using USDC
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Wallet Balance */}
            {isAuthenticated && wallet && (
              <div className="flex items-center justify-between p-3 bg-muted/30 rounded-xl border border-border/50">
                <div className="flex items-center gap-2">
                  <i className="icon-[lucide--wallet] h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    USDC Balance
                  </span>
                </div>
                <span className="font-semibold">${balance.toFixed(2)}</span>
              </div>
            )}

            {/* Yes/No Buttons */}
            <div className="flex gap-3">
              <button
                onClick={() => setSelectedSide("yes")}
                className={cn(
                  "flex-1 py-3.5 rounded-xl font-semibold text-sm transition-all",
                  selectedSide === "yes"
                    ? "bg-gradient-to-r from-[#176a91] to-[#1E81B0] text-white shadow-lg shadow-[#1E81B0]/25"
                    : "bg-muted/80 text-muted-foreground hover:bg-muted"
                )}
              >
                Yes {yesPrice}¢
              </button>
              <button
                onClick={() => setSelectedSide("no")}
                className={cn(
                  "flex-1 py-3.5 rounded-xl font-semibold text-sm transition-all",
                  selectedSide === "no"
                    ? "bg-gradient-to-r from-[#176a91] to-[#1E81B0] text-white shadow-lg shadow-[#1E81B0]/25"
                    : "bg-muted/80 text-muted-foreground hover:bg-muted"
                )}
              >
                No {noPrice}¢
              </button>
            </div>

            {/* Input Field */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-muted-foreground">
                  {orderMode === "dollars" ? "Amount" : "Contracts"}
                </label>
              </div>
              <div className="relative">
                {orderMode === "dollars" && (
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground text-lg">
                    $
                  </span>
                )}
                <Input
                  type="number"
                  placeholder="0"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className={cn(
                    "text-right text-2xl font-bold h-16 bg-muted/50 border-border/50 focus:border-primary/50 rounded-xl",
                    orderMode === "dollars" && "pl-10"
                  )}
                />
              </div>
            </div>

            {/* Limit Price */}
            {orderMode === "limit" && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">
                  Limit price (¢)
                </label>
                <Input
                  type="number"
                  placeholder="0"
                  value={limitPrice}
                  onChange={(e) => setLimitPrice(e.target.value)}
                  className="text-right text-xl font-bold h-14 bg-muted/50 border-border/50 focus:border-primary/50 rounded-xl"
                  min={1}
                  max={99}
                />
              </div>
            )}

            {/* Expiration (limit orders) */}
            {orderMode === "limit" && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">
                  Expiration
                </label>
                <div className="flex gap-2">
                  {[
                    { value: "gtc", label: "GTC" },
                    { value: "12am", label: "12AM EST" },
                    { value: "ioc", label: "IOC" },
                  ].map((option) => (
                    <button
                      key={option.value}
                      onClick={() =>
                        setExpiration(option.value as typeof expiration)
                      }
                      className={cn(
                        "flex-1 py-2.5 rounded-lg text-sm font-medium transition-all",
                        expiration === option.value
                          ? "bg-primary/20 text-primary border border-primary/30"
                          : "bg-muted/50 text-muted-foreground hover:bg-muted"
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Quote Display */}
            {state.quote && state.step === "confirming" && (
              <div className="p-4 bg-primary/10 rounded-xl border border-primary/20 space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Price per contract</span>
                  <span className="font-semibold">
                    {formatCentsPrice(Math.round(state.quote.price * 100))}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Contracts</span>
                  <span className="font-semibold">{state.quote.outputAmount}</span>
                </div>
                {state.quote.priceImpact > 0.1 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Price impact</span>
                    <span className="font-semibold text-amber-500">
                      {state.quote.priceImpact.toFixed(2)}%
                    </span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Fee</span>
                  <span className="font-semibold">${state.quote.fee.toFixed(2)}</span>
                </div>
                <div className="pt-2 border-t border-primary/20 flex justify-between">
                  <span className="text-[#4AADD8] font-medium">Total cost</span>
                  <span className="font-bold text-lg">
                    ${(state.quote.inputAmount / 1_000_000).toFixed(2)}
                  </span>
                </div>
              </div>
            )}

            {/* Cost Summary (before quote) */}
            {quantity && !state.quote && (
              <div className="p-4 bg-muted/30 rounded-xl border border-border/50 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Estimated cost</span>
                  <span className="font-bold text-lg">
                    ${estimatedCost.toFixed(2)}
                  </span>
                </div>
                {orderMode !== "dollars" && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Max payout</span>
                    <span className="font-bold text-lg value-positive">
                      ${contractCount.toFixed(2)}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Signal Info */}
            <div className="p-4 bg-gradient-to-r from-primary/10 to-[#4AADD8]/10 rounded-xl border border-primary/20">
              <div className="flex justify-between text-sm">
                <span className="text-[#4AADD8] font-medium">Expected Value</span>
                <span className="font-bold text-[#4AADD8]">
                  +{(signal.expected_value * 100).toFixed(1)}%
                </span>
              </div>
              <div className="flex justify-between text-sm mt-2">
                <span className="text-muted-foreground">Model Probability</span>
                <span className="font-semibold text-[#4AADD8]">
                  {(
                    (signal.model_probability || signal.implied_probability || 0.5) *
                    100
                  ).toFixed(0)}
                  %
                </span>
              </div>
            </div>

            {/* No mints warning */}
            {!hasMints && (
              <div className="p-4 bg-amber-500/10 rounded-xl border border-amber-500/20">
                <div className="flex items-center gap-3 text-amber-400 text-sm">
                  <i className="icon-[lucide--alert-triangle] h-5 w-5 flex-shrink-0" />
                  <span>
                    This market is not yet available for on-chain trading
                  </span>
                </div>
              </div>
            )}

            {/* Insufficient balance warning */}
            {insufficientBalance && isAuthenticated && (
              <div className="p-4 bg-red-500/10 rounded-xl border border-red-500/20">
                <div className="flex items-center gap-3 text-red-400 text-sm">
                  <i className="icon-[lucide--alert-circle] h-5 w-5 flex-shrink-0" />
                  <span>
                    Insufficient balance. You need ${estimatedCost.toFixed(2)} but
                    have ${balance.toFixed(2)}
                  </span>
                </div>
              </div>
            )}

            {/* Error Display */}
            {state.error && (
              <div className="p-4 bg-red-500/10 rounded-xl border border-red-500/20">
                <div className="flex items-center gap-3 text-red-400 text-sm">
                  <i className="icon-[lucide--alert-circle] h-5 w-5 flex-shrink-0" />
                  <span>{state.error}</span>
                </div>
              </div>
            )}

            {/* Success Display */}
            {state.step === "completed" && state.orderStatus && (
              <div className="p-4 bg-primary/10 rounded-xl border border-primary/20">
                <div className="flex items-center gap-3 text-[#4AADD8] text-sm">
                  <i className="icon-[lucide--check-circle] h-5 w-5 flex-shrink-0" />
                  <div>
                    <p className="font-medium">Trade Complete!</p>
                    <p className="text-muted-foreground">
                      Filled {state.orderStatus.filledAmount} contracts
                      {state.orderStatus.averagePrice &&
                        ` at ${formatCentsPrice(
                          Math.round(state.orderStatus.averagePrice * 100)
                        )}`}
                    </p>
                  </div>
                </div>
                {state.txSignature && (
                  <a
                    href={`https://solscan.io/tx/${state.txSignature}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 text-xs text-[#4AADD8] hover:underline flex items-center gap-1"
                  >
                    View on Solscan
                    <i className="icon-[lucide--external-link] h-3 w-3" />
                  </a>
                )}
              </div>
            )}

            {/* Submit Button */}
            <button
              onClick={handleSubmit}
              disabled={!canSubmit && isAuthenticated}
              className="btn-basilisk w-full h-14 text-base disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
            >
              {isProcessing ? (
                <span className="flex items-center justify-center gap-2">
                  <i className="icon-[lucide--loader-2] h-5 w-5 animate-spin" />
                  {getStepLabel(state.step)}
                </span>
              ) : state.step === "completed" ? (
                <span className="flex items-center justify-center gap-2">
                  <i className="icon-[lucide--check] h-5 w-5" />
                  Trade Complete
                </span>
              ) : !isAuthenticated ? (
                <span className="flex items-center justify-center gap-2">
                  <i className="icon-[lucide--wallet] h-5 w-5" />
                  Connect Wallet
                </span>
              ) : state.step === "confirming" ? (
                "Confirm Trade"
              ) : (
                "Get Quote"
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
