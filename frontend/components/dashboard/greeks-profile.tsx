"use client";

import { useState } from "react";
import type { TradeSignal } from "@/lib/api";
import { getGreekInterpretation } from "@/lib/binary-greeks";

interface GreeksProfileProps {
  signal: TradeSignal;
  compact?: boolean; // Compact view for inline display
}

/**
 * Display Greeks (Black-Scholes sensitivity metrics) for a trade signal
 *
 * Greeks are calculated on the frontend if not provided by the backend.
 * Shows Delta, Gamma, Vega, and Theta in a compact, visually informative way.
 */
export function GreeksProfile({ signal, compact = false }: GreeksProfileProps) {
  const [showTooltip, setShowTooltip] = useState<string | null>(null);

  // Return nothing if no Greeks available
  if (!signal.greeks) {
    return null;
  }

  const { delta, gamma, vega, theta } = signal.greeks;

  // Compact view for inline display in SignalList
  if (compact) {
    return (
      <div className="text-xs space-y-1 mt-2 border-t border-border/30 pt-2">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Greeks:</span>
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1">
          <GreekItem
            label="Δ"
            value={delta}
            format={(v) => v.toFixed(4)}
            tooltip={getGreekInterpretation("delta")}
            showTooltip={showTooltip === "delta"}
            onShowTooltip={() => setShowTooltip(showTooltip === "delta" ? null : "delta")}
          />
          <GreekItem
            label="Γ"
            value={gamma}
            format={(v) => v.toFixed(6)}
            tooltip={getGreekInterpretation("gamma")}
            showTooltip={showTooltip === "gamma"}
            onShowTooltip={() => setShowTooltip(showTooltip === "gamma" ? null : "gamma")}
          />
          <GreekItem
            label="ν"
            value={vega}
            format={(v) => v.toFixed(4)}
            tooltip={getGreekInterpretation("vega")}
            showTooltip={showTooltip === "vega"}
            onShowTooltip={() => setShowTooltip(showTooltip === "vega" ? null : "vega")}
          />
          <GreekItem
            label="Θ"
            value={theta}
            format={(v) => v.toFixed(4)}
            tooltip={getGreekInterpretation("theta")}
            showTooltip={showTooltip === "theta"}
            onShowTooltip={() => setShowTooltip(showTooltip === "theta" ? null : "theta")}
            colorize
          />
        </div>
      </div>
    );
  }

  // Full view for expanded display
  return (
    <div className="glass-card p-4 space-y-3">
      <h3 className="text-sm font-semibold">Greeks Profile</h3>
      <div className="space-y-2">
        <GreekRow
          label="Delta (Δ)"
          value={delta}
          format={(v) => v.toFixed(4)}
          description={getGreekInterpretation("delta")}
          barValue={Math.abs(delta)}
          maxBar={0.1}
        />
        <GreekRow
          label="Gamma (Γ)"
          value={gamma}
          format={(v) => v.toFixed(6)}
          description={getGreekInterpretation("gamma")}
          barValue={Math.abs(gamma)}
          maxBar={0.001}
        />
        <GreekRow
          label="Vega (ν)"
          value={vega}
          format={(v) => v.toFixed(4)}
          description={getGreekInterpretation("vega")}
          barValue={Math.abs(vega)}
          maxBar={0.1}
        />
        <GreekRow
          label="Theta (Θ)"
          value={theta}
          format={(v) => v.toFixed(4)}
          description={getGreekInterpretation("theta")}
          barValue={Math.abs(theta)}
          maxBar={0.01}
          colorize
        />
      </div>
    </div>
  );
}

interface GreekItemProps {
  label: string;
  value: number;
  format: (value: number) => string;
  tooltip: string;
  showTooltip: boolean;
  onShowTooltip: () => void;
  colorize?: boolean;
}

function GreekItem({
  label,
  value,
  format,
  tooltip,
  showTooltip,
  onShowTooltip,
  colorize = false,
}: GreekItemProps) {
  const valueColor = colorize
    ? value > 0
      ? "text-green-600"
      : value < 0
      ? "text-red-600"
      : "text-muted-foreground"
    : "text-foreground";

  return (
    <div className="relative">
      <button
        onClick={onShowTooltip}
        className="flex items-center justify-between w-full hover:bg-muted/30 rounded px-1 py-0.5 transition-colors"
      >
        <span className="text-muted-foreground font-medium">{label}:</span>
        <span className={`font-mono ${valueColor}`}>
          {value > 0 && !colorize ? "+" : ""}
          {format(value)}
        </span>
      </button>
      {showTooltip && (
        <div className="absolute z-10 left-0 top-full mt-1 w-48 bg-background/95 backdrop-blur-sm border border-border rounded-lg p-2 shadow-lg text-xs">
          {tooltip}
        </div>
      )}
    </div>
  );
}

interface GreekRowProps {
  label: string;
  value: number;
  format: (value: number) => string;
  description: string;
  barValue: number;
  maxBar: number;
  colorize?: boolean;
}

function GreekRow({
  label,
  value,
  format,
  description,
  barValue,
  maxBar,
  colorize = false,
}: GreekRowProps) {
  const percentage = Math.min((Math.abs(barValue) / maxBar) * 100, 100);
  const valueColor = colorize
    ? value > 0
      ? "text-green-600"
      : value < 0
      ? "text-red-600"
      : "text-muted-foreground"
    : "text-foreground";

  const barColor = colorize
    ? value > 0
      ? "bg-green-500/30"
      : "bg-red-500/30"
    : "bg-primary/30";

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium">{label}</span>
        <span className={`text-sm font-mono ${valueColor}`}>
          {value > 0 && !colorize ? "+" : ""}
          {format(value)}
        </span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full ${barColor} transition-all duration-300`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

/**
 * Calculate Greeks on the frontend if not provided by backend
 * This allows us to display Greeks even if the backend doesn't support them yet
 */
export function calculateGreeksForSignal(
  signal: TradeSignal,
  currentBtcPrice: number,
  annualVolatility: number
): TradeSignal {
  // If Greeks already exist or we don't have required data, return as-is
  if (
    signal.greeks ||
    !signal.strike_price ||
    !signal.time_to_expiry_hours ||
    !currentBtcPrice ||
    !annualVolatility
  ) {
    return signal;
  }

  // Import Greeks calculator
  // Note: This is a dynamic import to avoid circular dependencies
  // In practice, you'd import at the top of the file
  const { calculateBinaryGreeks } = require("@/lib/binary-greeks");

  const greeks = calculateBinaryGreeks({
    spotPrice: currentBtcPrice,
    strikePrice: signal.strike_price,
    timeToExpiryHours: signal.time_to_expiry_hours,
    volatility: annualVolatility,
    optionType: signal.signal_type.includes("YES") ? "call" : "put",
  });

  return {
    ...signal,
    greeks,
  };
}
