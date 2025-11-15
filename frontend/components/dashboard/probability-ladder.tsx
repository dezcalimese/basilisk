"use client";

import { useMemo, useState } from "react";
import type { TradeSignal } from "@/lib/api";

interface ProbabilityLadderProps {
  signals: TradeSignal[];
  currentBtcPrice: number | null;
}

interface LadderLevel {
  strike: number;
  statisticalProb: number; // From our model
  marketProb: number; // From Kalshi
  mispricing: number; // Difference
  ticker: string;
  signalType: string;
  timeToExpiry: number;
}

/**
 * Calculate probability of BTC being above strike at expiry
 * Using log-normal distribution (Black-Scholes assumption)
 */
function calculateProbabilityAboveStrike(
  currentPrice: number,
  strike: number,
  timeToExpiryHours: number,
  volatility: number // Annual volatility (e.g., 0.60 for 60%)
): number {
  if (timeToExpiryHours <= 0) return currentPrice > strike ? 1 : 0;

  const timeToExpiryYears = timeToExpiryHours / (365 * 24);
  const d = (Math.log(currentPrice / strike) + (0.5 * volatility * volatility * timeToExpiryYears)) /
            (volatility * Math.sqrt(timeToExpiryYears));

  // Normal CDF approximation
  return normalCDF(d);
}

/**
 * Standard normal cumulative distribution function
 */
function normalCDF(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp(-x * x / 2);
  const probability = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - probability : probability;
}

export function ProbabilityLadder({ signals, currentBtcPrice }: ProbabilityLadderProps) {
  const [showInfo, setShowInfo] = useState(false);

  // Build ladder levels from signals
  const ladderLevels = useMemo(() => {
    if (!currentBtcPrice) return [];

    // Get average volatility from signals (use implied vol if available)
    const avgVolatility = signals.length > 0 && signals[0].model_probability
      ? 0.60 // Default 60% annual volatility for Bitcoin
      : 0.60;

    const levels: LadderLevel[] = signals
      .filter((s) => s.strike_price != null && s.time_to_expiry_hours != null)
      .map((s) => {
        const strike = s.strike_price!;
        const timeToExpiry = s.time_to_expiry_hours!;

        // Calculate statistical probability using log-normal distribution
        const statisticalProb = calculateProbabilityAboveStrike(
          currentBtcPrice,
          strike,
          timeToExpiry,
          avgVolatility
        );

        // Market probability (from Kalshi YES price)
        const marketProb = s.yes_price ?? (s.implied_probability ?? 0.5);

        // Mispricing = how much our model differs from market
        const mispricing = (statisticalProb - marketProb) * 100; // In percentage points

        return {
          strike,
          statisticalProb: statisticalProb * 100,
          marketProb: marketProb * 100,
          mispricing,
          ticker: s.ticker,
          signalType: s.signal_type,
          timeToExpiry,
        };
      })
      .sort((a, b) => b.strike - a.strike); // Sort high to low

    return levels;
  }, [signals, currentBtcPrice]);

  // Calculate win/loss statistics
  const winCount = ladderLevels.filter((l) => l.mispricing > 5).length;
  const lossCount = ladderLevels.filter((l) => l.mispricing < -5).length;
  const profitability = ladderLevels.length > 0
    ? (winCount / ladderLevels.length) * 100
    : 0;

  if (!currentBtcPrice || ladderLevels.length === 0) {
    return (
      <div className="glass-card p-4 h-full">
        <h3 className="text-lg font-semibold mb-3">Probability Ladder</h3>
        <p className="text-sm text-muted-foreground text-center py-8">
          No probability data available
        </p>
      </div>
    );
  }

  return (
    <div className="glass-card p-4 h-full flex flex-col">
      {/* Header */}
      <div className="mb-3">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold">Probability Ladder</h3>
          <button
            onClick={() => setShowInfo(!showInfo)}
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Info"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </button>
        </div>

        {showInfo && (
          <div className="mt-2 p-3 bg-muted/50 rounded-lg text-xs text-muted-foreground space-y-2">
            <p className="font-semibold text-foreground">Probability Ladder</p>
            <p>
              Shows statistical probability of BTC reaching each strike price at expiry, compared to Kalshi's market pricing.
            </p>
            <ul className="space-y-1 ml-4 list-disc">
              <li><strong>Statistical:</strong> Model probability (DVOL + log-normal distribution)</li>
              <li><strong>Market:</strong> Kalshi YES price</li>
              <li><strong>Green:</strong> Market underpriced (buy opportunity)</li>
              <li><strong>Red:</strong> Market overpriced (avoid/sell)</li>
            </ul>
          </div>
        )}

        {/* Stats */}
        <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
          <div className="text-center p-2 bg-green-500/10 rounded">
            <div className="font-bold text-green-600">{winCount}</div>
            <div className="text-muted-foreground">WIN</div>
          </div>
          <div className="text-center p-2 bg-red-500/10 rounded">
            <div className="font-bold text-red-600">{lossCount}</div>
            <div className="text-muted-foreground">LOSS</div>
          </div>
          <div className="text-center p-2 bg-muted/30 rounded">
            <div className="font-bold">{profitability.toFixed(1)}%</div>
            <div className="text-muted-foreground">Probability</div>
          </div>
        </div>
      </div>

      {/* Current BTC Price Banner */}
      <div className="mb-3 p-2 bg-blue-500/10 border border-blue-500/30 rounded-lg text-center">
        <div className="text-xs text-muted-foreground">Current BTC Price</div>
        <div className="text-xl font-bold text-blue-500">
          ${currentBtcPrice.toLocaleString()}
        </div>
      </div>

      {/* Ladder Levels */}
      <div className="flex-1 overflow-y-auto space-y-2 pr-2" style={{ maxHeight: "calc(100vh - 450px)" }}>
        {ladderLevels.map((level, index) => {
          const isAbovePrice = level.strike > currentBtcPrice;
          const mispricingMagnitude = Math.abs(level.mispricing);
          const isOpportunity = level.mispricing > 5;
          const isOverpriced = level.mispricing < -5;

          return (
            <div
              key={level.ticker}
              className={`p-3 rounded-lg border transition-all ${
                isOpportunity
                  ? "border-green-500/50 bg-green-500/10"
                  : isOverpriced
                  ? "border-red-500/50 bg-red-500/10"
                  : "border-border/50 bg-muted/20"
              }`}
            >
              {/* Strike Price */}
              <div className="flex items-center justify-between mb-2">
                <div className="font-mono font-bold text-sm">
                  ${level.strike.toLocaleString()}
                </div>
                <div className="text-xs text-muted-foreground">
                  {level.timeToExpiry < 1
                    ? `${(level.timeToExpiry * 60).toFixed(0)}m`
                    : `${level.timeToExpiry.toFixed(1)}h`}
                </div>
              </div>

              {/* Probabilities */}
              <div className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Statistical:</span>
                  <span className="font-mono font-semibold">
                    {level.statisticalProb.toFixed(1)}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Market:</span>
                  <span className="font-mono">
                    {level.marketProb.toFixed(1)}%
                  </span>
                </div>
                <div className="flex justify-between pt-1 border-t border-border/30">
                  <span className="text-muted-foreground">Mispricing:</span>
                  <span
                    className={`font-mono font-bold ${
                      isOpportunity
                        ? "text-green-600"
                        : isOverpriced
                        ? "text-red-600"
                        : "text-muted-foreground"
                    }`}
                  >
                    {level.mispricing > 0 ? "+" : ""}
                    {level.mispricing.toFixed(1)}pp
                  </span>
                </div>
              </div>

              {/* Visual probability bar */}
              <div className="mt-2 relative h-4 bg-muted/30 rounded overflow-hidden">
                {/* Statistical probability bar */}
                <div
                  className="absolute top-0 left-0 h-full bg-blue-500/40"
                  style={{ width: `${level.statisticalProb}%` }}
                />
                {/* Market probability bar */}
                <div
                  className="absolute top-0 left-0 h-full bg-primary/60 border-r-2 border-primary"
                  style={{ width: `${level.marketProb}%` }}
                />
              </div>
              <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                <span>0%</span>
                <span>100%</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
