/**
 * Metric card component with glassmorphism and basilisk theming
 */

import { cn } from "@/lib/utils";

interface MetricCardProps {
  title: string;
  value: string | number;
  description?: string;
  trend?: "up" | "down" | "neutral";
  trendValue?: string;
  valueColor?: "positive" | "negative" | "neutral" | "accent";
  className?: string;
}

export function MetricCard({
  title,
  value,
  description,
  trend,
  trendValue,
  valueColor,
  className,
}: MetricCardProps) {
  const valueColorClasses = {
    positive: "text-primary dark:text-[#4AADD8]",
    negative: "text-red-500 dark:text-red-400",
    neutral: "text-foreground",
    accent: "text-primary dark:text-[#4AADD8]",
  };

  const trendColors = {
    up: "text-primary dark:text-[#4AADD8]",
    down: "text-red-500 dark:text-red-400",
    neutral: "text-muted-foreground",
  };

  return (
    <div
      className={cn(
        "glass-metric rounded-lg p-3 h-full flex flex-col justify-between",
        className
      )}
    >
      <h3 className="label-caps">
        {title}
      </h3>

      <div className="mt-1">
        <div
          className={cn(
            "text-lg font-bold tracking-tight",
            valueColor ? valueColorClasses[valueColor] : "text-foreground"
          )}
        >
          {value}
        </div>

        {description && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
            {description}
          </p>
        )}

        {trend && trendValue && (
          <div className={cn("flex items-center gap-1 mt-1 text-xs", trendColors[trend])}>
            <span className="font-medium">{trendValue}</span>
          </div>
        )}
      </div>
    </div>
  );
}
