/**
 * Metric card component for displaying key metrics with glassmorphism
 */

interface MetricCardProps {
  title: string;
  value: string | number;
  description?: string;
  trend?: "up" | "down" | "neutral";
  trendValue?: string;
}

export function MetricCard({
  title,
  value,
  description,
  trend,
  trendValue,
}: MetricCardProps) {
  const trendColor = {
    up: "text-green-600",
    down: "text-red-600",
    neutral: "text-gray-600",
  };

  return (
    <div className="glass-metric rounded-2xl p-4">
      <h3 className="text-xs font-medium text-muted-foreground mb-1">
        {title}
      </h3>
      <div className="text-2xl font-bold">{value}</div>
      {description && (
        <p className="text-xs text-muted-foreground mt-1">{description}</p>
      )}
      {trend && trendValue && (
        <p className={`text-xs mt-1 ${trendColor[trend]}`}>{trendValue}</p>
      )}
    </div>
  );
}
