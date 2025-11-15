"use client";

/**
 * Trade signals list component
 */

import { useMemo } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAnimatedNumber } from "@/hooks/use-animated-number";
import type { TradeSignal } from "@/lib/api";

interface SignalListProps {
  signals: TradeSignal[];
  currentTime: number;
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

export function SignalList({ signals, currentTime }: SignalListProps) {
  if (signals.length === 0) {
    return (
      <div className="glass-table p-4 h-full flex flex-col">
        <h2 className="text-lg font-bold mb-3">Active Signals</h2>
        <p className="text-muted-foreground text-center py-8 text-sm">
          No active signals at the moment
        </p>
      </div>
    );
  }

  return (
    <div className="glass-table p-4 h-full flex flex-col">
      <h2 className="text-lg font-bold mb-3">Active Signals</h2>
      <div className="space-y-3 overflow-y-auto flex-1 pr-2" style={{ maxHeight: "calc(100vh - 300px)" }}>
        {signals.map((signal) => (
          <SignalRow
            key={signal.id}
            signal={signal}
            currentTime={currentTime}
          />
        ))}
      </div>
    </div>
  );
}

interface SignalRowProps {
  signal: TradeSignal;
  currentTime: number;
}

function SignalRow({ signal, currentTime }: SignalRowProps) {
  const tickerInfo = parseTickerInfo(signal.ticker, signal.expiry_time);
  const animatedEv = useAnimatedNumber(signal.expected_value ?? 0, 500);
  const animatedYes = useAnimatedNumber(signal.yes_price ?? 0, 500);
  const animatedNo = useAnimatedNumber(signal.no_price ?? 0, 500);

  const timeRemainingLabel = useMemo(() => {
    return formatTimeRemaining(currentTime, signal.expiry_time, signal.time_to_expiry_hours);
  }, [currentTime, signal.expiry_time, signal.time_to_expiry_hours]);

  const evIsPositive = animatedEv >= 0;

  return (
    <div className="flex items-start justify-between p-3 rounded-lg border border-border/50 hover:border-border transition-all duration-200 hover:shadow-md backdrop-blur-sm">
      <div className="flex-1 min-w-0">
        {/* Readable expiry date/time */}
        <div className="flex items-center gap-2 mb-1">
          <h3 className="text-sm font-bold truncate">
            {tickerInfo.date} @ {tickerInfo.time}
          </h3>
          <Badge
            variant={
              signal.signal_type === "BUY YES"
                ? "default"
                : signal.signal_type === "BUY NO"
                ? "secondary"
                : "outline"
            }
            className="text-xs py-0 px-1.5"
          >
            {signal.signal_type}
          </Badge>
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
        <div className="text-xs text-muted-foreground mb-1 font-mono truncate">
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
      </div>

      {/* Stats column */}
      <div className="text-right ml-3 flex-shrink-0">
        <div
          className={`text-lg font-bold ${
            evIsPositive ? "text-green-600" : "text-red-600"
          }`}
        >
          {evIsPositive ? "+" : ""}
          {(animatedEv * 100).toFixed(1)}% EV
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">
          {(signal.edge_percentage * 100).toFixed(1)}% edge
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">
          {(signal.confidence_score * 100).toFixed(0)}% confidence
        </div>
        {signal.model_probability !== undefined && (
          <div className="text-xs text-muted-foreground mt-0.5">
            Model: {(signal.model_probability * 100).toFixed(1)}%
          </div>
        )}
      </div>
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
