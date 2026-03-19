"use client";

import { useEffect, useState } from "react";
import { checkGeoRestriction, type GeoCheckResult } from "@/lib/geoblocking";

type GeoGateState = "checking" | "allowed" | "blocked";

/**
 * Wraps children and blocks rendering if user is in a restricted jurisdiction.
 *
 * Shows a compliance message for restricted users. Fails open if
 * geolocation can't be determined (backend should also enforce).
 *
 * Usage:
 * ```tsx
 * <GeoGate>
 *   <TradeModal ... />
 * </GeoGate>
 * ```
 */
export function GeoGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<GeoGateState>("checking");
  const [geoResult, setGeoResult] = useState<GeoCheckResult | null>(null);

  useEffect(() => {
    let cancelled = false;

    checkGeoRestriction().then((result) => {
      if (cancelled) return;
      setGeoResult(result);
      setState(result.allowed ? "allowed" : "blocked");
    });

    return () => {
      cancelled = true;
    };
  }, []);

  if (state === "checking") {
    return null; // Don't flash anything while checking
  }

  if (state === "blocked") {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center gap-4">
        <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center">
          <svg
            className="w-6 h-6 text-red-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
            />
          </svg>
        </div>
        <h3 className="text-lg font-semibold">Trading Unavailable</h3>
        <p className="text-sm text-muted-foreground max-w-md">
          Prediction market trading is not available in{" "}
          {geoResult?.countryName || "your region"} due to regulatory
          restrictions. You can still view market data and analytics.
        </p>
        <p className="text-xs text-muted-foreground/60">
          This restriction is required by Kalshi (CFTC-regulated exchange)
          compliance requirements.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}

/**
 * Hook to check geo restriction status.
 * Returns the check result for use in conditional rendering.
 */
export function useGeoRestriction() {
  const [result, setResult] = useState<GeoCheckResult | null>(null);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    checkGeoRestriction().then((r) => {
      setResult(r);
      setIsChecking(false);
    });
  }, []);

  return {
    isChecking,
    isAllowed: result?.allowed ?? true,
    country: result?.country ?? null,
    countryName: result?.countryName ?? null,
  };
}
