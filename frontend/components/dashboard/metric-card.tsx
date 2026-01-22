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
  icon?: string;
  valueColor?: "positive" | "negative" | "neutral" | "accent";
  className?: string;
}

export function MetricCard({
  title,
  value,
  description,
  trend,
  trendValue,
  icon,
  valueColor,
  className,
}: MetricCardProps) {
  const valueColorClasses = {
    positive: "text-cyan-500 dark:text-cyan-400",
    negative: "text-red-500 dark:text-red-400",
    neutral: "text-foreground",
    accent: "text-cyan-500 dark:text-cyan-400",
  };

  const trendColors = {
    up: "text-cyan-500 dark:text-cyan-400",
    down: "text-red-500 dark:text-red-400",
    neutral: "text-muted-foreground",
  };

  const trendIcons = {
    up: "lucide--trending-up",
    down: "lucide--trending-down",
    neutral: "lucide--minus",
  };

  return (
    <div
      className={cn(
        "glass-metric rounded-lg p-3 h-full flex flex-col justify-between group",
        className
      )}
    >
      <div className="flex items-start justify-between gap-1">
        <h3 className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
          {title}
        </h3>
        {icon && (
          <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0 group-hover:bg-primary/15 transition-colors">
            <i className={cn(`icon-[${icon}] w-3 h-3 text-primary`)} />
          </div>
        )}
      </div>

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
          <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">
            {description}
          </p>
        )}

        {trend && trendValue && (
          <div className={cn("flex items-center gap-1 mt-1 text-[10px]", trendColors[trend])}>
            <i className={cn(`icon-[${trendIcons[trend]}] w-2.5 h-2.5`)} />
            <span className="font-medium">{trendValue}</span>
          </div>
        )}
      </div>
    </div>
  );
}
