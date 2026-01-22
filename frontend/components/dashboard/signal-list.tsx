"use client";

/**
 * Trade signals list component
 */

import { useMemo, useState, useCallback } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAnimatedNumber } from "@/hooks/use-animated-number";
import { useRealtimeStore } from "@/lib/stores/realtime-store";
import { useAnalyticalStore } from "@/lib/stores/analytical-store";
import { api, type TradeSignal, type TradeResponse } from "@/lib/api";
import { GreeksProfile, calculateGreeksForSignal } from "@/components/dashboard/greeks-profile";
import { TradeModal, type TradeOrder } from "@/components/trading/trade-modal";

interface SignalListProps {
  signals: TradeSignal[];
  currentTime: number;
  selectedTicker?: string | null;
  onSelectSignal?: (ticker: string) => void;
}

/**
 * Parse Kalshi ticker to extract readable information
 * Format: KXBTCD-25NOV1223-B96000
 * Returns: { date: "Nov 12", time: "11PM EST", strike: "$96,000" }
 */
function parseTickerInfo(ticker: string, expiryTime?: string) {
  const parts = ticker.split("-");
  if (parts.length < 3) {
    return { date: "", time: "", strike: "" };
  }

  // Parse date from ticker (e.g., "25NOV12" -> "Nov 12")
  const datePart = parts[1];
  const monthMap: Record<string, string> = {
    JAN: "Jan",
    FEB: "Feb",
    MAR: "Mar",
    APR: "Apr",
    MAY: "May",
    JUN: "Jun",
    JUL: "Jul",
    AUG: "Aug",
    SEP: "Sep",
    OCT: "Oct",
    NOV: "Nov",
    DEC: "Dec",
  };

  const monthStr = datePart.slice(2, 5);
  const dayStr = datePart.slice(5, 7);
  const hourStr = datePart.slice(7);

  const month = monthMap[monthStr] || monthStr;
  const day = parseInt(dayStr, 10);

  // Parse time from hour string (ticker time is in UTC, convert to EST)
  let time = "";
  if (hourStr) {
    const hourUTC = parseInt(hourStr, 10);
    // Convert UTC to EST (subtract 5 hours)
    let hourEST = hourUTC - 5;
    if (hourEST < 0) hourEST += 24; // Handle day rollover

    const hour12 = hourEST === 0 ? 12 : hourEST > 12 ? hourEST - 12 : hourEST;
    const ampm = hourEST >= 12 ? "PM" : "AM";
    time = `${hour12}${ampm} EST`;
  }

  // Parse strike price (e.g., "B96000" -> "$96,000")
  const strikePart = parts[2];
  const strikeMatch = strikePart.match(/[ABT](\d+)/);
  let strike = "";
  if (strikeMatch) {
    const strikeNum = parseInt(strikeMatch[1], 10);
    strike = `$${strikeNum.toLocaleString()}`;
  }

  // If backend provided expiry_time, use that as the single source of truth
  if (expiryTime) {
    const expiryDate = new Date(expiryTime);
    if (!Number.isNaN(expiryDate.getTime())) {
      const dateFormatter = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/New_York",
        month: "short",
        day: "numeric",
      });
      const timeFormatter = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/New_York",
        hour: "numeric",
        hour12: true,
      });

      const formattedDate = dateFormatter.format(expiryDate);
      const formattedTime = timeFormatter
        .format(expiryDate)
        .replace(" ", "")
        .toUpperCase();

      return {
        date: formattedDate,
        time: `${formattedTime} EST`,
        strike,
      };
    }
  }

  return {
    date: `${month} ${day}`,
    time,
    strike,
  };
}

/**
 * Extract asset type from Kalshi ticker (e.g., KXBTCD-... -> BTC)
 */
function extractAssetFromTicker(ticker: string): "BTC" | "ETH" | "XRP" {
  if (ticker.startsWith("KXBTC")) return "BTC";
  if (ticker.startsWith("KXETH")) return "ETH";
  if (ticker.startsWith("KXXRP")) return "XRP";
  return "BTC"; // Default
}

/**
 * Extract strike price from ticker or signal
 */
function extractStrike(ticker: string, signal: TradeSignal): number {
  if (signal.strike_price) return signal.strike_price;
  const match = ticker.match(/[TAB]([\d.]+)/);
  return match ? parseFloat(match[1]) : 0;
}

export function SignalList({ signals, currentTime, selectedTicker, onSelectSignal }: SignalListProps) {
  // Trade modal state
  const [tradeModalOpen, setTradeModalOpen] = useState(false);
  const [selectedSignalForTrade, setSelectedSignalForTrade] = useState<TradeSignal | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [tradeResult, setTradeResult] = useState<TradeResponse | null>(null);
  const [tradeError, setTradeError] = useState<string | null>(null);

  // Filter out HOLD signals - only show actionable trades
  const actionableSignals = signals.filter(signal => signal.signal_type !== "HOLD");

  const handleOpenTradeModal = (signal: TradeSignal) => {
    setSelectedSignalForTrade(signal);
    setTradeResult(null);
    setTradeError(null);
    setTradeModalOpen(true);
  };

  const handleCloseModal = useCallback(() => {
    setTradeModalOpen(false);
    setTradeResult(null);
    setTradeError(null);
  }, []);

  const handleTradeSubmit = useCallback(async (order: TradeOrder) => {
    if (!selectedSignalForTrade) return;

    setIsSubmitting(true);
    setTradeError(null);
    setTradeResult(null);

    try {
      const result = await api.executeTrade({
        ticker: order.ticker,
        asset: extractAssetFromTicker(order.ticker),
        direction: order.side.toUpperCase() as "YES" | "NO",
        strike: extractStrike(order.ticker, selectedSignalForTrade),
        contracts: order.quantity,
        order_type: order.orderType,
        limit_price: order.limitPrice,
        signal_id: selectedSignalForTrade.id?.toString(),
      });

      setTradeResult(result);

      if (result.success) {
        // Auto-close after successful trade
        setTimeout(() => {
          handleCloseModal();
        }, 2000);
      } else {
        setTradeError(result.error || "Trade failed");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to execute trade";
      setTradeError(message);
    } finally {
      setIsSubmitting(false);
    }
  }, [selectedSignalForTrade, handleCloseModal]);

  if (actionableSignals.length === 0) {
    return (
      <div className="glass-card rounded-2xl p-6 h-full flex flex-col">
        <h2 className="text-lg font-bold mb-3">Active Signals</h2>
        <p className="text-muted-foreground text-center py-8 text-sm">
          No active signals at the moment
        </p>
      </div>
    );
  }

  return (
    <div className="glass-card rounded-2xl p-6 h-full flex flex-col">
      <h2 className="text-lg font-bold mb-3">Active Signals</h2>
      <div className="space-y-3 overflow-y-auto flex-1 pr-2">
        {actionableSignals.map((signal) => (
          <SignalRow
            key={signal.id}
            signal={signal}
            currentTime={currentTime}
            isSelected={selectedTicker === signal.ticker}
            onSelect={() => onSelectSignal?.(signal.ticker)}
            onTrade={() => handleOpenTradeModal(signal)}
          />
        ))}
      </div>

      {/* Trade Modal */}
      <TradeModal
        signal={selectedSignalForTrade}
        isOpen={tradeModalOpen}
        onClose={handleCloseModal}
        onSubmit={handleTradeSubmit}
        isSubmitting={isSubmitting}
        tradeResult={tradeResult}
        tradeError={tradeError}
      />
    </div>
  );
}

interface SignalRowProps {
  signal: TradeSignal;
  currentTime: number;
  isSelected?: boolean;
  onSelect?: () => void;
  onTrade?: () => void;
}

function SignalRow({ signal, currentTime, isSelected, onSelect, onTrade }: SignalRowProps) {
  const tickerInfo = parseTickerInfo(signal.ticker, signal.expiry_time);
  const animatedEv = useAnimatedNumber(signal.expected_value ?? 0, 500);
  const animatedYes = useAnimatedNumber(signal.yes_price ?? 0, 500);
  const animatedNo = useAnimatedNumber(signal.no_price ?? 0, 500);

  // Get current BTC price and volatility for Greeks calculation
  const currentBtcPrice = useRealtimeStore((state) => state.currentPrice);
  const volatility = useAnalyticalStore((state) => state.volatility);

  const timeRemainingLabel = useMemo(() => {
    return formatTimeRemaining(currentTime, signal.expiry_time, signal.time_to_expiry_hours);
  }, [currentTime, signal.expiry_time, signal.time_to_expiry_hours]);

  // Calculate Greeks if not provided by backend
  const signalWithGreeks = useMemo(() => {
    if (signal.greeks || !volatility) return signal;
    return calculateGreeksForSignal(signal, currentBtcPrice, volatility.implied_vol);
  }, [signal, currentBtcPrice, volatility]);

  const evIsPositive = animatedEv >= 0;

  return (
    <div
      onClick={onSelect}
      className={`signal-card p-3 cursor-pointer ${isSelected ? "selected" : ""}`}
    >
      {/* Collapsed view for non-selected signals */}
      {!isSelected ? (
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-bold">
                {tickerInfo.date} @ {tickerInfo.time}
              </h3>
              <span
                className={`text-xs py-0.5 px-2 rounded-md font-medium whitespace-nowrap flex-shrink-0 ${
                  signal.signal_type === "BUY YES"
                    ? "badge-buy-yes"
                    : signal.signal_type === "BUY NO"
                    ? "badge-buy-no"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {signal.signal_type}
              </span>
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Strike: {signal.strike_price ? `$${signal.strike_price.toLocaleString()}` : tickerInfo.strike}
            </div>
          </div>
          <div className="text-right ml-3 flex-shrink-0">
            <div
              className={`text-base font-bold ${
                evIsPositive ? "value-positive" : "value-negative"
              }`}
            >
              {evIsPositive ? "+" : ""}
              {(animatedEv * 100).toFixed(1)}%
            </div>
            <div className="text-xs text-muted-foreground font-mono">
              {timeRemainingLabel}
            </div>
          </div>
        </div>
      ) : (
        /* Expanded view for selected signal */
        <>
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            {/* Readable expiry date/time */}
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h3 className="text-sm font-bold">
                {tickerInfo.date} @ {tickerInfo.time}
              </h3>
              <span
                className={`text-xs py-0.5 px-2 rounded-md font-medium whitespace-nowrap flex-shrink-0 ${
                  signal.signal_type === "BUY YES"
                    ? "badge-buy-yes"
                    : signal.signal_type === "BUY NO"
                    ? "badge-buy-no"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {signal.signal_type}
              </span>
            </div>

            {/* Strike price */}
            <div className="text-xs font-semibold text-muted-foreground mb-1">
              Strike: {signal.strike_price ? `$${signal.strike_price.toLocaleString()}` : tickerInfo.strike}
              {signal.current_btc_price && (
                <span className="ml-1 text-xs font-normal">
                  (BTC: ${signal.current_btc_price.toLocaleString()})
                </span>
              )}
            </div>

            {/* Ticker reference */}
            <div className="text-xs text-muted-foreground mb-1 font-mono break-all">
              {signal.ticker}
            </div>

            {/* Trading details */}
            <div className="text-xs text-muted-foreground space-y-0.5">
              <div>
                Recommended entry: ${signal.recommended_price.toFixed(2)}
                {timeRemainingLabel && (
                  <span className="ml-1">• {timeRemainingLabel} to expiry</span>
                )}
              </div>
              {signal.yes_price !== undefined && signal.no_price !== undefined && (
                <div className="text-xs">
                  Market: YES {animatedYes.toFixed(2)} / NO {animatedNo.toFixed(2)}
                </div>
              )}
            </div>

            {/* Greeks Profile - only show when expanded */}
            <GreeksProfile signal={signalWithGreeks} compact />
          </div>

          {/* Stats column */}
          <div className="text-right ml-3 flex-shrink-0">
            <div
              className={`text-lg font-bold ${
                evIsPositive ? "value-positive" : "value-negative"
              }`}
            >
              {evIsPositive ? "+" : ""}
              {(animatedEv * 100).toFixed(1)}% EV
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {(signal.edge_percentage * 100).toFixed(1)}% edge
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {(signal.confidence_score * 100).toFixed(0)}% confidence
            </div>
            {signal.model_probability !== undefined && (
              <div className="text-xs text-cyan-500 mt-1 font-medium">
                Model: {(signal.model_probability * 100).toFixed(1)}%
              </div>
            )}
          </div>
        </div>

        {/* Trade Button - Full width at bottom */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onTrade?.();
          }}
          className="btn-basilisk mt-3 w-full py-2.5 px-4 text-sm"
        >
          Trade This Signal
        </button>
        </>
      )}
    </div>
  );
}

function formatTimeRemaining(
  currentTime: number,
  expiryTime?: string,
  fallbackHours?: number | null
) {
  let msRemaining: number | null = null;

  if (expiryTime) {
    const expiryDate = new Date(expiryTime);
    if (!Number.isNaN(expiryDate.getTime())) {
      msRemaining = expiryDate.getTime() - currentTime;
    }
  } else if (typeof fallbackHours === "number") {
    msRemaining = Math.max(0, fallbackHours) * 3600 * 1000;
  }

  if (msRemaining === null) {
    return null;
  }

  const totalSeconds = Math.max(0, Math.floor(msRemaining / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}
