"use client";

import Image from "next/image";
import { useMultiAssetStore, type Asset, type Timeframe } from "@/lib/stores/multi-asset-store";
import { cn } from "@/lib/utils";

// Assets available for both 1H and 15m contracts
const SHARED_ASSETS: Array<{ symbol: Asset; name: string }> = [
  { symbol: 'BTC', name: 'Bitcoin' },
  { symbol: 'ETH', name: 'Ethereum' },
  { symbol: 'SOL', name: 'Solana' },
  { symbol: 'XRP', name: 'XRP' },
  { symbol: 'DOGE', name: 'Dogecoin' },
];

// Assets ONLY available for 15m contracts
const FIFTEEN_MIN_ONLY: Array<{ symbol: Asset; name: string }> = [
  { symbol: 'HYPE', name: 'Hyperliquid' },
  { symbol: 'BNB', name: 'BNB' },
];

const FIFTEEN_MIN_ONLY_SYMBOLS = new Set(FIFTEEN_MIN_ONLY.map((a) => a.symbol));

export function AssetSelector() {
  const selectedAsset = useMultiAssetStore((state) => state.selectedAsset);
  const selectedTimeframe = useMultiAssetStore((state) => state.selectedTimeframe);
  const selectAsset = useMultiAssetStore((state) => state.selectAsset);
  const selectTimeframe = useMultiAssetStore((state) => state.selectTimeframe);

  const handleSelectAsset = (symbol: Asset) => {
    // Auto-switch to 15m when selecting a 15m-only asset
    if (FIFTEEN_MIN_ONLY_SYMBOLS.has(symbol) && selectedTimeframe !== "15m") {
      selectTimeframe("15m");
    }
    selectAsset(symbol);
  };

  // Show 15m-only assets only when 15m timeframe is selected
  const visibleAssets =
    selectedTimeframe === "15m"
      ? [...SHARED_ASSETS, ...FIFTEEN_MIN_ONLY]
      : SHARED_ASSETS;

  return (
    <div className="flex items-center gap-0.5">
      {visibleAssets.map(({ symbol, name }) => {
        const is15mOnly = FIFTEEN_MIN_ONLY_SYMBOLS.has(symbol);

        return (
          <button
            key={symbol}
            onClick={() => handleSelectAsset(symbol)}
            className={cn(
              "flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium",
              "transition-colors duration-150",
              "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary",
              selectedAsset === symbol
                ? "bg-primary/10 text-primary border border-primary/20"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            )}
            title={is15mOnly ? `${name} (15m only)` : name}
          >
            <Image
              src={`/tokens/${symbol.toLowerCase()}.svg`}
              alt={name}
              width={14}
              height={14}
              className="rounded-full"
            />
            <span className="hidden sm:inline">{symbol}</span>
          </button>
        );
      })}
    </div>
  );
}
