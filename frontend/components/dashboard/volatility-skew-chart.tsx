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
  apiUrl = "http://localhost:8000",
  refreshInterval = 30000, // 30 seconds default
}: VolatilitySkewChartProps) {
  const [skewData, setSkewData] = useState<VolSkewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Subscribe to selected asset
  const selectedAsset = useMultiAssetStore((state) => state.selectedAsset);

  useEffect(() => {
    const fetchSkew = async () => {
      try {
        setLoading(true);
        const response = await fetch(`${apiUrl}/api/v1/volatility/skew?asset=${selectedAsset.toLowerCase()}`);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const data = await response.json();
        setSkewData(data);
        setError(null);
      } catch (err) {
        console.error("Failed to fetch volatility skew:", err);
        setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    };

    fetchSkew();
    const interval = setInterval(fetchSkew, refreshInterval);

    return () => clearInterval(interval);
  }, [apiUrl, refreshInterval, selectedAsset]);

  if (loading) {
    return (
      <div className="glass-card rounded-2xl p-6">
        <h3 className="text-lg font-semibold mb-4">Volatility Skew</h3>
        <div className="space-y-4">
          {/* Skeleton chart */}
          <div className="h-56 bg-muted/20 rounded-lg animate-pulse" />
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
      <div className="glass-card rounded-2xl p-6">
        <h3 className="text-lg font-semibold mb-4">Volatility Skew</h3>
        <div className="flex items-center justify-center h-64">
          <p className="text-destructive">{error || "No data available"}</p>
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
    <div className="glass-card rounded-2xl p-6 h-full flex flex-col">
      {/* Header */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold">{selectedAsset} Volatility Skew</h3>
        <p className="text-sm text-muted-foreground">
          {skewData.skew_interpretation}
        </p>
      </div>

      {/* Skew Metrics Grid */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <MetricBox
          label="ATM IV"
          value={`${(skewData.atm_iv * 100).toFixed(1)}%`}
        />
        <MetricBox
          label="OTM Call IV"
          value={`${(skewData.otm_call_iv * 100).toFixed(1)}%`}
        />
        <MetricBox
          label="OTM Put IV"
          value={`${(skewData.otm_put_iv * 100).toFixed(1)}%`}
        />
        <SkewMetric skew={skewData.skew} />
      </div>

      {/* Skew Curve */}
      <div className="mb-6">
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData}>
            <XAxis
              dataKey="moneynessDisplay"
              tick={{ fontSize: 10, fill: "#94a3b8" }}
              stroke="#94a3b8"
              label={{
                value: "Moneyness (Strike/Spot)",
                position: "insideBottom",
                offset: -5,
                style: { fontSize: 11, fill: "#94a3b8" },
              }}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "#94a3b8" }}
              stroke="#94a3b8"
              label={{
                value: "Implied Vol %",
                angle: -90,
                position: "insideLeft",
                style: { fontSize: 11, fill: "#94a3b8" },
              }}
              tickFormatter={(value) => `${value.toFixed(0)}%`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "rgba(15, 23, 42, 0.9)",
                border: "1px solid rgba(148, 163, 184, 0.2)",
                borderRadius: "8px",
                fontSize: 12,
              }}
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
              stroke="#10b981"
              strokeWidth={2}
              dot={{ fill: "#10b981", r: 3 }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Interpretation */}
      <div className="p-3 bg-muted/50 rounded-lg border border-border/50">
        <p className="text-sm">
          <strong className="font-semibold">What this means:</strong>{" "}
          {skewData.skew > 0.1 ? (
            <>
              Lower strikes (YES at low levels) are more expensive than higher strikes.
              Market is pricing in downside risk (fear). If you disagree, buy YES on
              higher strikes (bet {selectedAsset} rises).
            </>
          ) : skewData.skew < -0.1 ? (
            <>
              Higher strikes (YES at high levels) are more expensive than lower strikes.
              Market expects strong upside (greed). If you disagree, buy YES on lower
              strikes (bet {selectedAsset} stays lower).
            </>
          ) : (
            <>
              Skew is relatively flat. Market has symmetric expectations around current
              price. No strong directional bias in digital option pricing.
            </>
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
      <p className="text-md font-semibold">{value}</p>
    </div>
  );
}

function SkewMetric({ skew }: { skew: number }) {
  const color =
    skew > 0.1
      ? "text-red-500"
      : skew < -0.1
      ? "text-green-500"
      : "text-yellow-500";
  return (
    <div className="text-center">
      <p className="text-xs text-muted-foreground">Skew</p>
      <p className={`text-md font-bold ${color}`}>
        {skew > 0 ? "+" : ""}
        {skew.toFixed(2)}
      </p>
    </div>
  );
}
