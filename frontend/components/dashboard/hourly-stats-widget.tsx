"use client";

import { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

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
  apiUrl = "http://localhost:8000",
  refreshInterval = 60000, // 1 minute default
}: HourlyStatsWidgetProps) {
  const [stats, setStats] = useState<HourlyStats | null>(null);
  const [extremeData, setExtremeData] = useState<ExtremeMoveData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        // Fetch hourly statistics
        const statsResponse = await fetch(
          `${apiUrl}/api/v1/statistics/hourly-movements?hours=720`
        );
        if (!statsResponse.ok) {
          throw new Error(`HTTP ${statsResponse.status}`);
        }
        const statsData = await statsResponse.json();
        setStats(statsData);

        // Fetch extreme move probabilities
        const extremeResponse = await fetch(
          `${apiUrl}/api/v1/statistics/extreme-moves?hours=720`
        );
        if (extremeResponse.ok) {
          const extremeMovesData = await extremeResponse.json();
          setExtremeData(extremeMovesData);
        }

        setError(null);
      } catch (err) {
        console.error("Failed to fetch hourly stats:", err);
        setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
    const interval = setInterval(fetchStats, refreshInterval);

    return () => clearInterval(interval);
  }, [apiUrl, refreshInterval]);

  if (loading) {
    return (
      <div className="glass-card rounded-2xl p-6 h-full flex flex-col">
        <h3 className="text-lg font-semibold mb-4 flex-shrink-0">Hourly Movement Statistics</h3>
        <div className="flex items-center justify-center flex-1">
          <p className="text-muted-foreground">Loading statistics...</p>
        </div>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="glass-card rounded-2xl p-6 h-full flex flex-col">
        <h3 className="text-lg font-semibold mb-4 flex-shrink-0">Hourly Movement Statistics</h3>
        <div className="flex items-center justify-center flex-1">
          <p className="text-destructive">
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
    <div className="glass-card rounded-2xl p-6 h-full flex flex-col">
      {/* Header */}
      <div className="mb-6 flex-shrink-0">
        <h3 className="text-lg font-semibold">Hourly Movement Statistics</h3>
        <p className="text-sm text-muted-foreground">
          Last 30 days • {stats.total_samples} samples
        </p>
      </div>

      {/* Two-column layout: Main Stats (2/3) + Extreme Moves (1/3) */}
      <div className="flex-1 overflow-y-auto pr-2">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full">
          {/* Main Stats Section - 2/3 width */}
          <div className="lg:col-span-2 space-y-6">
            {/* Key Metrics Grid */}
            <div className="grid grid-cols-3 gap-4">
              <MetricBox
                label="Avg Hourly Return"
                value={`${(stats.mean_return * 100).toFixed(3)}%`}
                color={stats.mean_return > 0 ? "text-green-500" : "text-red-500"}
              />
              <MetricBox
                label="Volatility (1σ)"
                value={`${(stats.std_return * 100).toFixed(2)}%`}
                color="text-blue-500"
              />
              <MetricBox
                label="Max Move"
                value={`${(stats.max_hourly_move * 100).toFixed(2)}%`}
                color="text-orange-500"
              />
            </div>

            {/* Percentiles */}
            <div>
              <h4 className="text-sm font-semibold mb-2">Movement Percentiles</h4>
              <div className="flex justify-between text-xs gap-2">
                <PercentileBox label="5th" value={stats.percentile_5} />
                <PercentileBox label="25th" value={stats.percentile_25} />
                <PercentileBox
                  label="50th"
                  value={stats.percentile_50}
                  highlight={true}
                />
                <PercentileBox label="75th" value={stats.percentile_75} />
                <PercentileBox label="95th" value={stats.percentile_95} />
              </div>
            </div>

            {/* Hourly Pattern Chart */}
            <div>
              <h4 className="text-sm font-semibold mb-2">Returns by Hour (UTC)</h4>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={hourlyData}>
                  <XAxis
                    dataKey="hour"
                    tick={{ fontSize: 10, fill: "#94a3b8" }}
                    stroke="#94a3b8"
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "#94a3b8" }}
                    stroke="#94a3b8"
                    tickFormatter={(value) => `${value.toFixed(1)}%`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "rgba(15, 23, 42, 0.9)",
                      border: "1px solid rgba(148, 163, 184, 0.2)",
                      borderRadius: "8px",
                      fontSize: 12,
                    }}
                    formatter={(value: number) => `${value.toFixed(3)}%`}
                  />
                  <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="3 3" />
                  <Bar dataKey="avgReturn" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Extreme Move Probabilities - 1/3 width */}
          {extremeData && (
            <div className="lg:col-span-1 lg:border-l lg:pl-6">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <h4 className="text-sm font-semibold">🔥 Extreme Moves</h4>
                <span
                  className={`text-xs px-2 py-1 rounded ${
                    extremeData.regime === "CRISIS"
                      ? "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300"
                      : extremeData.regime === "ELEVATED"
                      ? "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300"
                      : "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300"
                  }`}
                >
                  {extremeData.regime} ({extremeData.volatility_multiplier.toFixed(2)}x)
                </span>
              </div>

              <div className="space-y-2">
                {Object.entries(extremeData.extreme_probabilities)
                  .filter(([key]) =>
                    ["move_3pct", "move_4pct", "move_5pct", "move_6pct"].includes(key)
                  )
                  .map(([key, data]) => (
                    <div
                      key={key}
                      className="flex justify-between items-center text-xs p-2 rounded bg-secondary/50"
                    >
                      <span className="font-medium">
                        &gt;{(data.threshold * 100).toFixed(0)}% move
                      </span>
                      <div className="flex gap-4">
                        <span className="text-muted-foreground">
                          {(data.probability * 100).toFixed(2)}%
                        </span>
                        <span className="text-muted-foreground">{data.odds}</span>
                        <span className="text-primary font-medium">
                          ~{data.per_week.toFixed(1)}/week
                        </span>
                      </div>
                    </div>
                  ))}
              </div>

              <p className="text-xs text-muted-foreground mt-4">
                💡 {extremeData.volatility_multiplier >= 1.5 ? "High volatility regime makes extreme moves MORE likely." : "Normal volatility - extreme moves occur at historical rates."}
              </p>
            </div>
          )}
        </div>
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
      <p className={`text-lg font-bold ${color}`}>{value}</p>
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
      <p className={`text-xs ${highlight ? "font-bold" : "text-muted-foreground"}`}>
        {label}
      </p>
      <p
        className={`text-xs ${
          highlight
            ? "font-bold"
            : value > 0
            ? "text-green-500"
            : value < 0
            ? "text-red-500"
            : ""
        }`}
      >
        {(value * 100).toFixed(2)}%
      </p>
    </div>
  );
}
