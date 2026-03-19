"use client";

import { useMultiAssetStore, type Timeframe } from "@/lib/stores/multi-asset-store";
import { cn } from "@/lib/utils";

const TIMEFRAMES: Array<{ value: Timeframe; label: string }> = [
  { value: "hourly", label: "1H" },
  { value: "15m", label: "15m" },
];

export function TimeframeSelector() {
  const selectedTimeframe = useMultiAssetStore((state) => state.selectedTimeframe);
  const selectTimeframe = useMultiAssetStore((state) => state.selectTimeframe);

  return (
    <div className="flex items-center gap-0.5 border-l border-border pl-2 ml-1">
      {TIMEFRAMES.map(({ value, label }) => (
        <button
          key={value}
          onClick={() => selectTimeframe(value)}
          className={cn(
            "px-2 py-1 rounded-md text-xs font-medium",
            "transition-colors duration-150",
            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary",
            selectedTimeframe === value
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
