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
    <div className="glass-metric liquid-gradient rounded-2xl p-6">
      <div className="relative z-10">
        <h3 className="text-sm font-medium text-muted-foreground mb-2">
          {title}
        </h3>
        <div className="text-3xl font-bold">{value}</div>
        {description && (
          <p className="text-xs text-muted-foreground mt-2">{description}</p>
        )}
        {trend && trendValue && (
          <p className={`text-xs mt-2 ${trendColor[trend]}`}>{trendValue}</p>
        )}
      </div>
    </div>
  );
}
