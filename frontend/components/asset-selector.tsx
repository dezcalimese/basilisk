"use client";

import Image from "next/image";
import { useMultiAssetStore, type Asset } from "@/lib/stores/multi-asset-store";
import { cn } from "@/lib/utils";

/**
 * Asset selector toggle buttons
 *
 * Allows users to switch between BTC, ETH, XRP, and SOL
 * Displays active asset with visual feedback and token logos
 */

const ASSETS: Array<{ symbol: Asset; name: string }> = [
  { symbol: 'BTC', name: 'Bitcoin' },
  { symbol: 'ETH', name: 'Ethereum' },
  { symbol: 'XRP', name: 'Ripple' },
  { symbol: 'SOL', name: 'Solana' },
];

export function AssetSelector() {
  const selectedAsset = useMultiAssetStore((state) => state.selectedAsset);
  const selectAsset = useMultiAssetStore((state) => state.selectAsset);

  return (
    <div className="flex gap-1 p-1 bg-muted/30 rounded-lg border border-border/50">
      {ASSETS.map(({ symbol, name }) => (
        <button
          key={symbol}
          onClick={() => selectAsset(symbol)}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all font-medium text-sm",
            "hover:bg-muted-foreground/10",
            selectedAsset === symbol
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground"
          )}
          title={`Switch to ${name}`}
        >
          <Image
            src={`/tokens/${symbol.toLowerCase()}.svg`}
            alt={name}
            width={16}
            height={16}
            className="rounded-full"
          />
          {symbol}
        </button>
      ))}
    </div>
  );
}
