"use client";

import { useMultiAssetStore, type Asset } from "@/lib/stores/multi-asset-store";
import { cn } from "@/lib/utils";

/**
 * Asset selector toggle buttons
 *
 * Allows users to switch between BTC, ETH, and XRP
 * Displays active asset with visual feedback
 */

const ASSETS: Array<{ symbol: Asset; name: string; color: string }> = [
  { symbol: 'BTC', name: 'Bitcoin', color: 'bg-orange-500/10 border-orange-500 text-orange-500' },
  { symbol: 'ETH', name: 'Ethereum', color: 'bg-blue-500/10 border-blue-500 text-blue-500' },
  { symbol: 'XRP', name: 'Ripple', color: 'bg-green-500/10 border-green-500 text-green-500' },
];

export function AssetSelector() {
  const selectedAsset = useMultiAssetStore((state) => state.selectedAsset);
  const selectAsset = useMultiAssetStore((state) => state.selectAsset);

  return (
    <div className="flex gap-2 p-1 bg-muted/30 rounded-lg border border-border/50">
      {ASSETS.map(({ symbol, name }) => (
        <button
          key={symbol}
          onClick={() => selectAsset(symbol)}
          className={cn(
            "px-4 py-2 rounded-md transition-all font-medium text-sm",
            "hover:bg-muted-foreground/10",
            selectedAsset === symbol
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground"
          )}
          title={`Switch to ${name}`}
        >
          {symbol}
        </button>
      ))}
    </div>
  );
}
