"use client";

import { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { useMultiAssetStore } from "@/lib/stores/multi-asset-store";
import { fetchWithRetry } from "@/lib/fetch-with-retry";

interface VolSkewData {
  atm_iv: number;
  otm_call_iv: number;
  otm_put_iv: number;
  skew: number;
  skew_interpretation: string;
  contracts_analyzed: {
    atm: number;
    otm_calls: number;
    otm_puts: number;
    total: number;
  };
  strike_iv_pairs: Array<{
    strike: number;
    moneyness: number;
    implied_vol: number;
    type: "call" | "put";
    yes_price: number;
    ticker: string;
  }>;
  current_price: number;
}

interface VolatilitySkewChartProps {
  apiUrl?: string;
  refreshInterval?: number; // milliseconds
}

export function VolatilitySkewChart({
  apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000",
  refreshInterval = 30000, // 30 seconds default
}: VolatilitySkewChartProps) {
  const [skewData, setSkewData] = useState<VolSkewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Subscribe to selected asset
  const selectedAsset = useMultiAssetStore((state) => state.selectedAsset);

  useEffect(() => {
    let mounted = true;
    let interval: NodeJS.Timeout | null = null;

    const fetchSkew = async () => {
      try {
        if (mounted && !skewData) {
          setLoading(true);
        }

        const data = await fetchWithRetry<VolSkewData>(
          `${apiUrl}/api/v1/volatility/skew?asset=${selectedAsset.toLowerCase()}`,
          {
            maxRetries: 5,
            initialDelay: 500,
            onRetry: (attempt, error) => {
              console.log(`[VolSkew] Retry ${attempt}:`, error.message);
            },
          }
        );

        if (mounted) {
          setSkewData(data);
          setError(null);
        }
      } catch (err) {
        console.error("Failed to fetch volatility skew:", err);
        if (mounted) {
          setError(err instanceof Error ? err.message : "Failed to load");
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    fetchSkew();
    interval = setInterval(fetchSkew, refreshInterval);

    return () => {
      mounted = false;
      if (interval) clearInterval(interval);
    };
  }, [apiUrl, refreshInterval, selectedAsset]);

  if (loading) {
    return (
      <div className="glass-card rounded-2xl p-4 h-full flex flex-col">
        <h3 className="text-sm font-semibold mb-2">Volatility Skew</h3>
        <div className="flex-1 min-h-0 flex flex-col gap-2">
          {/* Skeleton chart */}
          <div className="flex-1 bg-muted/20 rounded-lg animate-pulse" />
          {/* Skeleton legend */}
          <div className="flex justify-center gap-6">
            {[1, 2].map((i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-muted/40 animate-pulse" />
                <div className="h-3 w-16 bg-muted/30 rounded animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error || !skewData) {
    return (
      <div className="glass-card rounded-2xl p-4 h-full flex flex-col">
        <h3 className="text-sm font-semibold mb-2">Volatility Skew</h3>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-destructive text-sm">{error || "No data available"}</p>
        </div>
      </div>
    );
  }

  // Prepare data for line chart
  const chartData = skewData.strike_iv_pairs
    .map((point) => ({
      moneyness: parseFloat(point.moneyness.toFixed(4)),
      moneynessDisplay: point.moneyness.toFixed(3),
      iv: point.implied_vol * 100,
      type: point.type,
      strike: point.strike,
    }))
    .sort((a, b) => a.moneyness - b.moneyness);

  return (
    <div className="glass-card rounded-2xl p-4 h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex-none mb-2">
        <h3 className="text-sm font-semibold">{selectedAsset} Volatility Skew</h3>
        <p className="text-xs text-muted-foreground line-clamp-1">
          {skewData.skew_interpretation}
        </p>
      </div>

      {/* Skew Metrics Grid */}
      <div className="flex-none grid grid-cols-4 gap-2 mb-2">
        <MetricBox
          label="ATM IV"
          value={`${(skewData.atm_iv * 100).toFixed(1)}%`}
        />
        <MetricBox
          label="OTM Call"
          value={`${(skewData.otm_call_iv * 100).toFixed(1)}%`}
        />
        <MetricBox
          label="OTM Put"
          value={`${(skewData.otm_put_iv * 100).toFixed(1)}%`}
        />
        <SkewMetric skew={skewData.skew} />
      </div>

      {/* Skew Curve */}
      <div className="flex-1 min-h-0 mb-2">
        <ResponsiveContainer width="100%" height={130}>
          <LineChart data={chartData} margin={{ top: 5, right: 5, bottom: 20, left: 0 }}>
            <XAxis
              dataKey="moneynessDisplay"
              tick={{ fontSize: 10, fill: "#94a3b8" }}
              stroke="#94a3b8"
              label={{
                value: "Moneyness",
                position: "insideBottom",
                offset: -10,
                style: { fontSize: 10, fill: "#94a3b8" },
              }}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "#94a3b8" }}
              stroke="#94a3b8"
              width={38}
              tickFormatter={(value) => `${value.toFixed(0)}%`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "rgba(15, 23, 42, 0.95)",
                border: "1px solid rgba(148, 163, 184, 0.2)",
                borderRadius: "8px",
                fontSize: 12,
              }}
              labelStyle={{ color: "#94a3b8" }}
              itemStyle={{ color: "#e2e8f0" }}
              formatter={(value: number) => `${value.toFixed(1)}%`}
              labelFormatter={(label) => `Moneyness: ${label}`}
            />
            <ReferenceLine
              x="1.000"
              stroke="#94a3b8"
              strokeDasharray="3 3"
              label={{ value: "ATM", fill: "#94a3b8", fontSize: 10 }}
            />
            <Line
              type="monotone"
              dataKey="iv"
              stroke="#06b6d4"
              strokeWidth={2}
              dot={{ fill: "#06b6d4", r: 2 }}
              activeDot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Interpretation - compact */}
      <div className="flex-none p-2 bg-muted/50 rounded-lg border border-border/50">
        <p className="text-xs leading-relaxed">
          <strong className="font-semibold">Insight:</strong>{" "}
          {skewData.skew > 0.1 ? (
            <>Downside risk priced in. Consider YES on higher strikes.</>
          ) : skewData.skew < -0.1 ? (
            <>Upside expected. Consider YES on lower strikes.</>
          ) : (
            <>Flat skew - symmetric market expectations.</>
          )}
        </p>
      </div>
    </div>
  );
}

function MetricBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold">{value}</p>
    </div>
  );
}

function SkewMetric({ skew }: { skew: number }) {
  const color =
    skew > 0.1
      ? "text-red-400"
      : skew < -0.1
      ? "text-[#4AADD8]"
      : "text-amber-400";
  return (
    <div className="text-center">
      <p className="text-xs text-muted-foreground">Skew</p>
      <p className={`text-sm font-bold ${color}`}>
        {skew > 0 ? "+" : ""}
        {skew.toFixed(2)}
      </p>
    </div>
  );
}
