"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { TradeSignal, TradeResponse } from "@/lib/api";

interface TradeModalProps {
  signal: TradeSignal | null;
  isOpen: boolean;
  onClose: () => void;
  onSubmit?: (order: TradeOrder) => void;
  isSubmitting?: boolean;
  tradeResult?: TradeResponse | null;
  tradeError?: string | null;
}

export interface TradeOrder {
  ticker: string;
  side: "yes" | "no";
  action: "buy" | "sell";
  orderType: "market" | "limit";
  quantity: number;
  limitPrice?: number;
  inputMode: "dollars" | "contracts";
}

type OrderMode = "dollars" | "contracts" | "limit";
type TabType = "buy" | "sell";

export function TradeModal({
  signal,
  isOpen,
  onClose,
  onSubmit,
  isSubmitting = false,
  tradeResult,
  tradeError,
}: TradeModalProps) {
  const [tab, setTab] = useState<TabType>("buy");
  const [selectedSide, setSelectedSide] = useState<"yes" | "no">("yes");
  const [orderMode, setOrderMode] = useState<OrderMode>("contracts");
  const [quantity, setQuantity] = useState<string>("");
  const [limitPrice, setLimitPrice] = useState<string>("");
  const [expiration, setExpiration] = useState<"gtc" | "12am" | "ioc">("gtc");

  // Reset state when signal changes
  useEffect(() => {
    if (signal) {
      // Default to the recommended side based on signal
      setSelectedSide(signal.signal_type.includes("YES") ? "yes" : "no");
      setQuantity("");
      setLimitPrice("");
    }
  }, [signal]);

  if (!isOpen || !signal) return null;

  const yesPrice = signal.yes_price ? Math.round(signal.yes_price * 100) : 50;
  const noPrice = signal.no_price ? Math.round(signal.no_price * 100) : 50;

  const currentPrice = selectedSide === "yes" ? yesPrice : noPrice;

  // Parse strike from ticker (e.g., KXBTCD-25DEC1012-T91750)
  const strikeMatch = signal.ticker.match(/[TAB]([\d.]+)/);
  const strikeDisplay = strikeMatch
    ? `$${Number(strikeMatch[1]).toLocaleString()}`
    : signal.strike_price
    ? `$${signal.strike_price.toLocaleString()}`
    : "";

  // Extract expiry time from ticker
  const expiryMatch = signal.ticker.match(/(\d{2})([A-Z]{3})(\d{2})(\d{2})/);
  const expiryDisplay = expiryMatch
    ? `${expiryMatch[4]}:00 EST`
    : signal.time_to_expiry_hours
    ? `${signal.time_to_expiry_hours.toFixed(1)}h`
    : "";

  const handleSubmit = () => {
    if (!quantity) return;

    const order: TradeOrder = {
      ticker: signal.ticker,
      side: selectedSide,
      action: tab,
      orderType: orderMode === "limit" ? "limit" : "market",
      quantity: orderMode === "dollars" ? Math.floor(parseFloat(quantity) / (currentPrice / 100)) : parseInt(quantity),
      limitPrice: orderMode === "limit" ? parseInt(limitPrice) : undefined,
      inputMode: orderMode === "limit" ? "contracts" : orderMode,
    };

    onSubmit?.(order);
  };

  const estimatedCost =
    orderMode === "dollars"
      ? parseFloat(quantity) || 0
      : orderMode === "limit"
      ? ((parseInt(limitPrice) || 0) / 100) * (parseInt(quantity) || 0)
      : (currentPrice / 100) * (parseInt(quantity) || 0);

  return (
    <>
      {/* Backdrop */}
      <div
        className="trade-modal-backdrop fixed inset-0 z-40 animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Modal - Bottom sheet on mobile, centered on desktop */}
      <div className="fixed inset-x-0 bottom-0 md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 z-50 w-full md:max-w-md animate-in slide-in-from-bottom-4 md:slide-in-from-bottom-0 md:zoom-in-95 duration-300">
        <div className="trade-modal">
          {/* Header */}
          <div className="flex items-start justify-between p-5 border-b border-border/50">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500 to-sky-500 flex items-center justify-center glow-cyan">
                <span className="text-white font-bold text-lg">₿</span>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Bitcoin price at {expiryDisplay}?</p>
                <p className="font-semibold text-lg">
                  <span className={selectedSide === "yes" ? "text-cyan-500" : "text-cyan-500"}>
                    {tab === "buy" ? "Buy" : "Sell"} {selectedSide === "yes" ? "Yes" : "No"}
                  </span>
                  <span className="text-muted-foreground"> · {strikeDisplay} or above</span>
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
                  ? "text-cyan-500 border-b-2 border-cyan-500 bg-cyan-500/5"
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

          {/* Yes/No Buttons */}
          <div className="p-5 space-y-5">
            <div className="flex gap-3">
              <button
                onClick={() => setSelectedSide("yes")}
                className={cn(
                  "flex-1 py-3.5 rounded-xl font-semibold text-sm transition-all",
                  selectedSide === "yes"
                    ? "bg-gradient-to-r from-cyan-600 to-cyan-500 text-white shadow-lg shadow-cyan-500/25"
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
                    ? "bg-gradient-to-r from-cyan-600 to-cyan-500 text-white shadow-lg shadow-cyan-500/25"
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
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground text-lg">$</span>
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

            {/* Limit Price (only for limit orders) */}
            {orderMode === "limit" && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">Limit price (¢)</label>
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

            {/* Expiration (only for limit orders) */}
            {orderMode === "limit" && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">Expiration</label>
                <div className="flex gap-2">
                  {[
                    { value: "gtc", label: "GTC" },
                    { value: "12am", label: "12AM EST" },
                    { value: "ioc", label: "IOC" },
                  ].map((option) => (
                    <button
                      key={option.value}
                      onClick={() => setExpiration(option.value as typeof expiration)}
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

            {/* Cost Summary */}
            {quantity && (
              <div className="p-4 bg-muted/30 rounded-xl border border-border/50 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Estimated cost</span>
                  <span className="font-bold text-lg">${estimatedCost.toFixed(2)}</span>
                </div>
                {orderMode !== "dollars" && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Max payout</span>
                    <span className="font-bold text-lg value-positive">
                      ${(parseInt(quantity) || 0).toFixed(2)}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Signal Info */}
            <div className="p-4 bg-gradient-to-r from-cyan-500/10 to-sky-500/10 rounded-xl border border-cyan-500/20">
              <div className="flex justify-between text-sm">
                <span className="text-cyan-400 font-medium">Expected Value</span>
                <span className="font-bold text-cyan-400">
                  +{(signal.expected_value * 100).toFixed(1)}%
                </span>
              </div>
              <div className="flex justify-between text-sm mt-2">
                <span className="text-muted-foreground">Model Probability</span>
                <span className="font-semibold text-cyan-400">
                  {((signal.model_probability || signal.implied_probability || 0.5) * 100).toFixed(0)}%
                </span>
              </div>
            </div>

            {/* Error Display */}
            {tradeError && (
              <div className="p-4 bg-red-500/10 rounded-xl border border-red-500/20">
                <div className="flex items-center gap-3 text-red-400 text-sm">
                  <i className="icon-[lucide--alert-circle] h-5 w-5 flex-shrink-0" />
                  <span>{tradeError}</span>
                </div>
              </div>
            )}

            {/* Success Display */}
            {tradeResult?.success && (
              <div className="p-4 bg-cyan-500/10 rounded-xl border border-cyan-500/20">
                <div className="flex items-center gap-3 text-cyan-400 text-sm">
                  <i className="icon-[lucide--check-circle] h-5 w-5 flex-shrink-0" />
                  <span>
                    Order placed! Filled {tradeResult.filled} contracts
                    {tradeResult.price && ` at ${tradeResult.price}¢`}
                  </span>
                </div>
              </div>
            )}

            {/* Submit Button */}
            <button
              onClick={handleSubmit}
              disabled={!quantity || (orderMode === "limit" && !limitPrice) || isSubmitting || tradeResult?.success}
              className="btn-basilisk w-full h-14 text-base disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
            >
              {isSubmitting ? (
                <span className="flex items-center justify-center gap-2">
                  <i className="icon-[lucide--loader-2] h-5 w-5 animate-spin" />
                  Placing Order...
                </span>
              ) : tradeResult?.success ? (
                <span className="flex items-center justify-center gap-2">
                  <i className="icon-[lucide--check] h-5 w-5" />
                  Order Placed
                </span>
              ) : (
                "Place Order"
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
