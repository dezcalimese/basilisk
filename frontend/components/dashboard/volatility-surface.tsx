"use client";

import { useMemo, useState } from "react";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from "recharts";
import type { TradeSignal } from "@/lib/api";

interface VolatilitySurfaceProps {
  signals: TradeSignal[];
  currentBtcPrice: number | null;
}

interface SurfacePoint {
  strike: number;
  timeToExpiry: number;
  impliedProb: number;
  modelProb: number;
  mispricing: number;
  mispricingPct: number;
  ticker: string;
  signalType: string;
}

export function VolatilitySurface({
  signals,
  currentBtcPrice,
}: VolatilitySurfaceProps) {
  // IMPORTANT: All hooks must be called BEFORE any conditional returns
  const [showInfo, setShowInfo] = useState(false);

  // Transform signals into surface data points
  const surfaceData = useMemo(() => {
    return signals
      .filter(
        (s) =>
          s.strike_price != null &&
          s.time_to_expiry_hours != null &&
          s.implied_probability != null &&
          s.model_probability != null
      )
      .map((s): SurfacePoint => {
        const impliedProb = s.implied_probability!;
        const modelProb = s.model_probability!;
        const mispricing = modelProb - impliedProb;
        const mispricingPct = (mispricing / impliedProb) * 100;

        return {
          strike: s.strike_price!,
          timeToExpiry: s.time_to_expiry_hours!,
          impliedProb: impliedProb * 100, // Convert to percentage
          modelProb: modelProb * 100,
          mispricing: mispricing * 100,
          mispricingPct,
          ticker: s.ticker,
          signalType: s.signal_type,
        };
      })
      .sort((a, b) => a.strike - b.strike || a.timeToExpiry - b.timeToExpiry);
  }, [signals]);

  // Get color based on mispricing magnitude
  const getColor = (mispricing: number): string => {
    // Mispricing in percentage points
    if (mispricing > 10) return "#22c55e"; // Strong BUY signal (green)
    if (mispricing > 5) return "#86efac"; // Moderate BUY signal (light green)
    if (mispricing > -5) return "#94a3b8"; // Neutral (gray)
    if (mispricing > -10) return "#fca5a5"; // Moderate SELL signal (light red)
    return "#ef4444"; // Strong SELL signal (red)
  };

  // Custom tooltip
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length > 0) {
      const data = payload[0].payload as SurfacePoint;
      return (
        <div className="bg-background/95 backdrop-blur-sm border border-border rounded-lg p-3 shadow-lg">
          <p className="font-mono text-xs font-bold mb-2">{data.ticker}</p>
          <div className="space-y-1 text-xs">
            <p>
              <span className="text-muted-foreground">Strike:</span>{" "}
              <span className="font-mono">${data.strike.toFixed(0)}</span>
            </p>
            <p>
              <span className="text-muted-foreground">Expiry:</span>{" "}
              <span className="font-mono">
                {data.timeToExpiry < 1
                  ? `${(data.timeToExpiry * 60).toFixed(0)}m`
                  : `${data.timeToExpiry.toFixed(1)}h`}
              </span>
            </p>
            <div className="border-t border-border my-1 pt-1">
              <p>
                <span className="text-muted-foreground">Market Price:</span>{" "}
                <span className="font-mono">{data.impliedProb.toFixed(1)}%</span>
              </p>
              <p>
                <span className="text-muted-foreground">Model Price:</span>{" "}
                <span className="font-mono">{data.modelProb.toFixed(1)}%</span>
              </p>
              <p
                className={`font-bold ${
                  data.mispricing > 5
                    ? "text-green-500"
                    : data.mispricing < -5
                      ? "text-red-500"
                      : "text-muted-foreground"
                }`}
              >
                <span className="text-muted-foreground font-normal">
                  Mispricing:
                </span>{" "}
                {data.mispricing > 0 ? "+" : ""}
                {data.mispricing.toFixed(1)}pp
              </p>
            </div>
            <p className="text-xs font-bold mt-1 text-primary">
              {data.signalType}
            </p>
          </div>
        </div>
      );
    }
    return null;
  };

  if (surfaceData.length === 0) {
    return (
      <div className="glass-card p-6 h-full flex flex-col">
        <h3 className="text-lg font-semibold mb-4">Volatility Surface</h3>
        <p className="text-sm text-muted-foreground text-center py-8">
          No data available for volatility surface
        </p>
      </div>
    );
  }

  return (
    <div className="glass-card p-4 h-full flex flex-col">
      <div className="mb-3">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold">Volatility Surface</h3>
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
            <p className="font-semibold text-foreground">What is this chart?</p>
            <p>
              This <strong>mispricing map</strong> shows where Kalshi's market prices deviate from theoretical probabilities calculated using DVOL (Bitcoin volatility) + Black-Scholes models.
            </p>
            <ul className="space-y-1 ml-4 list-disc">
              <li><strong>X-axis:</strong> Strike price (where BTC needs to be for YES to win)</li>
              <li><strong>Y-axis:</strong> Time to expiry (how long until contract settles)</li>
              <li><strong>Color:</strong> Mispricing magnitude (green = underpriced, red = overpriced)</li>
              <li><strong>Size:</strong> Edge size (bigger bubble = larger opportunity)</li>
            </ul>
            <p className="pt-1 border-t border-border">
              <strong>How to use it:</strong> Look for large green bubbles - these are contracts where the market is pricing them lower than our model suggests they should be, indicating potential buying opportunities.
            </p>
          </div>
        )}

        <p className="text-xs text-muted-foreground mt-1">
          Market vs Model Probability • Color = Mispricing Magnitude
        </p>
        <div className="flex items-center gap-3 mt-2 text-xs flex-wrap">
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-green-500"></div>
            <span className="text-muted-foreground">Strong Buy</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-green-300"></div>
            <span className="text-muted-foreground">Buy</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-gray-400"></div>
            <span className="text-muted-foreground">Neutral</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-red-300"></div>
            <span className="text-muted-foreground">Sell</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-red-500"></div>
            <span className="text-muted-foreground">Strong Sell</span>
          </div>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={500}>
        <ScatterChart
          margin={{ top: 10, right: 20, bottom: 30, left: 50 }}
        >
          <CartesianGrid strokeDasharray="3 3" className="opacity-20" />

          {/* X-axis: Strike Price */}
          <XAxis
            type="number"
            dataKey="strike"
            name="Strike Price"
            domain={["dataMin - 500", "dataMax + 500"]}
            tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
            label={{
              value: "Strike Price (USD)",
              position: "insideBottom",
              offset: -10,
              style: { fontSize: 12 },
            }}
          />

          {/* Y-axis: Time to Expiry */}
          <YAxis
            type="number"
            dataKey="timeToExpiry"
            name="Time to Expiry"
            domain={[0, "dataMax + 0.5"]}
            tickFormatter={(value) =>
              value < 1 ? `${(value * 60).toFixed(0)}m` : `${value.toFixed(1)}h`
            }
            label={{
              value: "Time to Expiry",
              angle: -90,
              position: "insideLeft",
              style: { fontSize: 12 },
            }}
          />

          {/* Z-axis: Mispricing (determines size) */}
          <ZAxis
            type="number"
            dataKey="mispricing"
            range={[50, 400]}
            name="Mispricing"
          />

          {/* Current BTC price reference line */}
          {currentBtcPrice && (
            <ReferenceLine
              x={currentBtcPrice}
              stroke="#3b82f6"
              strokeWidth={2}
              strokeDasharray="3 3"
              label={{
                value: `Current: $${currentBtcPrice.toFixed(0)}`,
                position: "top",
                fill: "#3b82f6",
                fontSize: 11,
              }}
            />
          )}

          <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: "3 3" }} />

          <Scatter name="Contracts" data={surfaceData}>
            {surfaceData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={getColor(entry.mispricing)} />
            ))}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>

      {/* Stats summary */}
      <div className="mt-3 grid grid-cols-3 gap-3 text-xs">
        <div className="text-center">
          <p className="text-muted-foreground">Contracts</p>
          <p className="font-mono font-bold text-sm">{surfaceData.length}</p>
        </div>
        <div className="text-center">
          <p className="text-muted-foreground">Strike Range</p>
          <p className="font-mono font-bold text-sm">
            ${(Math.min(...surfaceData.map((d) => d.strike)) / 1000).toFixed(0)}k -{" "}
            ${(Math.max(...surfaceData.map((d) => d.strike)) / 1000).toFixed(0)}k
          </p>
        </div>
        <div className="text-center">
          <p className="text-muted-foreground">Avg Mispricing</p>
          <p className="font-mono font-bold text-sm">
            {(
              surfaceData.reduce((sum, d) => sum + d.mispricing, 0) /
              surfaceData.length
            ).toFixed(1)}
            pp
          </p>
        </div>
      </div>
    </div>
  );
}
