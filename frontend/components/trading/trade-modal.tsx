"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { TradeSignal } from "@/lib/api";

interface TradeModalProps {
  signal: TradeSignal | null;
  isOpen: boolean;
  onClose: () => void;
  onSubmit?: (order: TradeOrder) => void;
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

export function TradeModal({ signal, isOpen, onClose, onSubmit }: TradeModalProps) {
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
        className="fixed inset-0 bg-black/50 z-40"
        onClick={onClose}
      />

      {/* Modal - Bottom sheet on mobile, centered on desktop */}
      <div className="fixed inset-x-0 bottom-0 md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 z-50 w-full md:max-w-md">
        <div className="bg-background rounded-t-2xl md:rounded-2xl shadow-xl border border-border">
          {/* Header */}
          <div className="flex items-start justify-between p-4 border-b border-border">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-orange-500 flex items-center justify-center">
                <span className="text-white font-bold text-sm">₿</span>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Bitcoin price today at {expiryDisplay}?</p>
                <p className="font-semibold text-primary">
                  {tab === "buy" ? "Buy" : "Sell"} {selectedSide === "yes" ? "Yes" : "No"} · {strikeDisplay} or above
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1 hover:bg-muted rounded-full transition-colors"
            >
              <X className="h-5 w-5 text-muted-foreground" />
            </button>
          </div>

          {/* Buy/Sell Tabs */}
          <div className="flex border-b border-border">
            <button
              onClick={() => setTab("buy")}
              className={cn(
                "flex-1 py-3 text-sm font-medium transition-colors",
                tab === "buy"
                  ? "text-primary border-b-2 border-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Buy
            </button>
            <button
              onClick={() => setTab("sell")}
              className={cn(
                "flex-1 py-3 text-sm font-medium transition-colors",
                tab === "sell"
                  ? "text-primary border-b-2 border-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Sell
            </button>

            {/* Order Mode Dropdown */}
            <div className="relative px-4 py-2">
              <select
                value={orderMode}
                onChange={(e) => setOrderMode(e.target.value as OrderMode)}
                className="appearance-none bg-transparent text-sm text-muted-foreground cursor-pointer pr-6"
              >
                <option value="dollars">Dollars</option>
                <option value="contracts">Contracts</option>
                <option value="limit">Limit order</option>
              </select>
              <span className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground">
                ▼
              </span>
            </div>
          </div>

          {/* Yes/No Buttons */}
          <div className="p-4 space-y-4">
            <div className="flex gap-2">
              <button
                onClick={() => setSelectedSide("yes")}
                className={cn(
                  "flex-1 py-3 rounded-lg font-semibold text-sm transition-colors",
                  selectedSide === "yes"
                    ? "bg-blue-600 text-white"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                )}
              >
                Yes {yesPrice}¢
              </button>
              <button
                onClick={() => setSelectedSide("no")}
                className={cn(
                  "flex-1 py-3 rounded-lg font-semibold text-sm transition-colors",
                  selectedSide === "no"
                    ? "bg-slate-600 text-white"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                )}
              >
                No {noPrice}¢
              </button>
            </div>

            {/* Input Field */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm text-muted-foreground">
                  {orderMode === "dollars" ? "Dollars" : "Contracts"}
                </label>
                <span className="text-xs text-muted-foreground">Earn 3.5% Interest</span>
              </div>
              <div className="relative">
                {orderMode === "dollars" && (
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                )}
                <Input
                  type="number"
                  placeholder="0"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className={cn(
                    "text-right text-xl font-semibold h-14",
                    orderMode === "dollars" && "pl-8"
                  )}
                />
              </div>
            </div>

            {/* Limit Price (only for limit orders) */}
            {orderMode === "limit" && (
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">Limit price (¢)</label>
                <Input
                  type="number"
                  placeholder="0"
                  value={limitPrice}
                  onChange={(e) => setLimitPrice(e.target.value)}
                  className="text-right text-lg font-semibold h-12"
                  min={1}
                  max={99}
                />
              </div>
            )}

            {/* Expiration (only for limit orders) */}
            {orderMode === "limit" && (
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">Expiration</label>
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
                        "flex-1 py-2 rounded-lg text-sm font-medium transition-colors",
                        expiration === option.value
                          ? "bg-slate-700 text-white"
                          : "bg-muted text-muted-foreground hover:bg-muted/80"
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Resting Order Checkbox (for limit orders) */}
            {orderMode === "limit" && (
              <label className="flex items-center gap-3 py-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="h-5 w-5 rounded border-border"
                />
                <span className="text-sm text-muted-foreground">Submit as resting order only</span>
              </label>
            )}

            {/* Cost Summary */}
            {quantity && (
              <div className="p-3 bg-muted/50 rounded-lg">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Estimated cost</span>
                  <span className="font-semibold">${estimatedCost.toFixed(2)}</span>
                </div>
                {orderMode !== "dollars" && (
                  <div className="flex justify-between text-sm mt-1">
                    <span className="text-muted-foreground">Max payout</span>
                    <span className="font-semibold text-green-500">
                      ${(parseInt(quantity) || 0).toFixed(2)}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Signal Info */}
            <div className="p-3 bg-blue-500/10 rounded-lg border border-blue-500/20">
              <div className="flex justify-between text-sm">
                <span className="text-blue-400">Expected Value</span>
                <span className="font-semibold text-blue-400">
                  +{(signal.expected_value * 100).toFixed(1)}%
                </span>
              </div>
              <div className="flex justify-between text-sm mt-1">
                <span className="text-muted-foreground">Model Probability</span>
                <span className="font-medium">
                  {((signal.model_probability || signal.implied_probability || 0.5) * 100).toFixed(0)}%
                </span>
              </div>
            </div>

            {/* Review Button */}
            <Button
              onClick={handleSubmit}
              disabled={!quantity || (orderMode === "limit" && !limitPrice)}
              className="w-full h-12 text-base font-semibold bg-emerald-600 hover:bg-emerald-700"
            >
              Review
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
