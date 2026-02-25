"use client";

import { useEffect, useState, useRef } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { useMultiAssetStore } from "@/lib/stores/multi-asset-store";
import { fetchWithRetry } from "@/lib/fetch-with-retry";

interface HourlyStats {
  mean_return: number;
  std_return: number;
  median_return: number;
  percentile_5: number;
  percentile_25: number;
  percentile_50: number;
  percentile_75: number;
  percentile_95: number;
  max_hourly_move: number;
  max_positive_move: number;
  max_negative_move: number;
  by_hour: Record<
    number,
    { mean: number; std: number; count: number }
  >;
  total_samples: number;
}

interface ExtremeMoveData {
  extreme_probabilities: {
    [key: string]: {
      threshold: number;
      probability: number;
      odds: string;
      per_week: number;
    };
  };
  volatility_multiplier: number;
  regime: string;
}

interface HourlyStatsWidgetProps {
  apiUrl?: string;
  refreshInterval?: number; // milliseconds
}

export function HourlyStatsWidget({
  apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000",
  refreshInterval = 60000, // 1 minute default
}: HourlyStatsWidgetProps) {
  const [stats, setStats] = useState<HourlyStats | null>(null);
  const [extremeData, setExtremeData] = useState<ExtremeMoveData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Subscribe to selected asset
  const selectedAsset = useMultiAssetStore((state) => state.selectedAsset);

  useEffect(() => {
    let mounted = true;
    let interval: NodeJS.Timeout | null = null;

    const fetchStats = async () => {
      try {
        if (mounted && !stats) {
          setLoading(true);
        }

        // Fetch hourly statistics with retry
        const statsData = await fetchWithRetry<HourlyStats>(
          `${apiUrl}/api/v1/statistics/hourly-movements?hours=720&asset=${selectedAsset.toLowerCase()}`,
          {
            maxRetries: 5,
            initialDelay: 500,
            onRetry: (attempt, error) => {
              console.log(`[HourlyStats] Retry ${attempt} after error:`, error.message);
            },
          }
        );

        if (!mounted) return;
        setStats(statsData);

        // Fetch extreme move probabilities (non-critical, don't fail on error)
        try {
          const extremeData = await fetchWithRetry<ExtremeMoveData>(
            `${apiUrl}/api/v1/statistics/extreme-moves?hours=720&asset=${selectedAsset.toLowerCase()}`,
            { maxRetries: 3, initialDelay: 500 }
          );
          if (mounted) {
            setExtremeData(extremeData);
          }
        } catch {
          // Extreme data is optional, don't show error
          console.log('[HourlyStats] Extreme data not available');
        }

        if (mounted) {
          setError(null);
        }
      } catch (err) {
        console.error("Failed to fetch hourly stats:", err);
        if (mounted) {
          setError(err instanceof Error ? err.message : "Failed to load");
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    fetchStats();
    interval = setInterval(fetchStats, refreshInterval);

    return () => {
      mounted = false;
      if (interval) clearInterval(interval);
    };
  }, [apiUrl, refreshInterval, selectedAsset]);

  if (loading) {
    return (
      <div className="glass-card rounded-2xl p-4 h-full flex flex-col">
        <h3 className="text-sm font-semibold mb-2 flex-shrink-0">Hourly Movement Statistics</h3>
        <div className="flex-1 min-h-0 flex flex-col gap-2">
          {/* Skeleton chart area */}
          <div className="flex-1 bg-muted/20 rounded-lg animate-pulse" />
          {/* Skeleton stats row */}
          <div className="grid grid-cols-3 gap-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="space-y-1">
                <div className="h-2 w-16 bg-muted/30 rounded animate-pulse" />
                <div className="h-4 w-12 bg-muted/40 rounded animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="glass-card rounded-2xl p-4 h-full flex flex-col">
        <h3 className="text-sm font-semibold mb-2 flex-shrink-0">Hourly Movement Statistics</h3>
        <div className="flex items-center justify-center flex-1">
          <p className="text-destructive text-sm">
            {error || "No data available"}
          </p>
        </div>
      </div>
    );
  }

  // Prepare data for bar chart (hourly patterns)
  const hourlyData = Object.entries(stats.by_hour || {})
    .map(([hour, data]) => ({
      hour: `${hour.padStart(2, "0")}:00`,
      avgReturn: data.mean * 100, // Convert to percentage
      volatility: data.std * 100,
      hourNum: parseInt(hour),
    }))
    .sort((a, b) => a.hourNum - b.hourNum);

  return (
    <div className="glass-card rounded-2xl p-4 h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex-none mb-2 flex items-start justify-between">
        <div>
          <h3 className="text-sm font-semibold">{selectedAsset} Hourly Stats</h3>
          <p className="text-xs text-muted-foreground">
            30d • {stats.total_samples} samples
          </p>
        </div>
        {extremeData && (
          <span className={`px-1.5 py-0.5 rounded text-xs flex-shrink-0 ${
            extremeData.regime === "CRISIS"
              ? "bg-red-500/20 text-red-400"
              : extremeData.regime === "ELEVATED"
              ? "bg-amber-500/20 text-amber-400"
              : "bg-primary/20 text-[#4AADD8]"
          }`}>
            {extremeData.regime} ({extremeData.volatility_multiplier.toFixed(1)}x)
          </span>
        )}
      </div>

      {/* Key Metrics Grid */}
      <div className="flex-none grid grid-cols-3 gap-2 mb-2">
        <MetricBox
          label="Avg Return"
          value={`${(stats.mean_return * 100).toFixed(3)}%`}
          color={stats.mean_return > 0 ? "text-[#4AADD8]" : "text-red-400"}
        />
        <MetricBox
          label="Volatility"
          value={`${(stats.std_return * 100).toFixed(2)}%`}
          color="text-blue-400"
        />
        <MetricBox
          label="Max Move"
          value={`${(stats.max_hourly_move * 100).toFixed(2)}%`}
          color="text-amber-400"
        />
      </div>

      {/* Percentiles - compact */}
      <div className="flex-none mb-2">
        <div className="flex justify-between text-xs gap-1">
          <PercentileBox label="5th" value={stats.percentile_5} />
          <PercentileBox label="25th" value={stats.percentile_25} />
          <PercentileBox label="50th" value={stats.percentile_50} highlight={true} />
          <PercentileBox label="75th" value={stats.percentile_75} />
          <PercentileBox label="95th" value={stats.percentile_95} />
        </div>
      </div>

      {/* Hourly Pattern Chart */}
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height={140}>
          <BarChart data={hourlyData} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
            <XAxis
              dataKey="hour"
              tick={{ fontSize: 10, fill: "#94a3b8" }}
              stroke="#94a3b8"
              interval={3}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "#94a3b8" }}
              stroke="#94a3b8"
              width={32}
              tickFormatter={(value) => `${value.toFixed(1)}%`}
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
              formatter={(value: number) => `${value.toFixed(3)}%`}
            />
            <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="3 3" />
            <Bar dataKey="avgReturn" fill="#1E81B0" radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

    </div>
  );
}

function MetricBox({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="text-center">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-sm font-bold ${color}`}>{value}</p>
    </div>
  );
}

function PercentileBox({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div
      className={`text-center flex-1 ${
        highlight ? "border border-primary rounded px-1 py-0.5" : ""
      }`}
    >
      <p className={`text-xs ${highlight ? "font-semibold" : "text-muted-foreground"}`}>
        {label}
      </p>
      <p
        className={`text-xs ${
          highlight
            ? "font-semibold"
            : value > 0
            ? "text-[#4AADD8]"
            : value < 0
            ? "text-red-400"
            : ""
        }`}
      >
        {(value * 100).toFixed(2)}%
      </p>
    </div>
  );
}
