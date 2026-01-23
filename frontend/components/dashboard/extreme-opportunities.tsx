"use client"

import { useEffect, useState } from "react"
import { AlertTriangle, TrendingUp, TrendingDown, Target } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { fetchWithRetry } from "@/lib/fetch-with-retry"

interface Contract {
  id: number
  ticker: string
  signal_type: string
  expected_value: number
  edge_percentage: number
  recommended_price: number
  confidence_score: number
  time_to_expiry_hours?: number
  strike_price?: number
  current_btc_price?: number
  yes_price?: number
  no_price?: number
  implied_probability?: number
  model_probability?: number
}

interface ExtremeOpportunity extends Contract {
  required_move_pct: number
  entry_price: number
  target_price: number
  payoff_multiplier: number
  risk_amount: number
}

interface ExtremeMoveData {
  extreme_probabilities: {
    [key: string]: {
      threshold: number
      probability: number
      odds: string
      per_week: number
    }
  }
  volatility_multiplier: number
  regime: string
}

export function ExtremeOpportunitiesWidget({
  apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000",
  refreshInterval = 30000,
}: {
  apiUrl?: string
  refreshInterval?: number
}) {
  const [opportunities, setOpportunities] = useState<ExtremeOpportunity[]>([])
  const [extremeData, setExtremeData] = useState<ExtremeMoveData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true;

    const fetchData = async () => {
      try {
        // Fetch current signals with retry
        const signalsData = await fetchWithRetry<{ contracts: Contract[] }>(
          `${apiUrl}/api/v1/current`,
          {
            maxRetries: 5,
            initialDelay: 500,
            onRetry: (attempt, error) => {
              console.log(`[ExtremeOpps] Retry ${attempt}:`, error.message);
            },
          }
        );

        if (!mounted) return;

        // Fetch extreme move probabilities (optional)
        try {
          const extremeMovesData = await fetchWithRetry<ExtremeMoveData>(
            `${apiUrl}/api/v1/statistics/extreme-moves?hours=720`,
            { maxRetries: 3, initialDelay: 500 }
          );
          if (mounted) setExtremeData(extremeMovesData);
        } catch {
          console.log('[ExtremeOpps] Extreme data not available');
        }

        // Filter and enhance contracts for extreme opportunities
        const contracts: Contract[] = signalsData.contracts || []
        const currentPrice = signalsData.contracts[0]?.current_btc_price || 90000

        const extremeOps = contracts
          .filter((contract) => {
            if (!contract.strike_price || !contract.implied_probability) return false

            const requiredMove = Math.abs(
              (contract.strike_price - currentPrice) / currentPrice
            )
            const impliedProb = contract.implied_probability || 0.5

            // Filter criteria for extreme opportunities
            return (
              impliedProb < 0.25 && // Market thinks unlikely (<25%)
              requiredMove > 0.03 && // Requires >3% move
              contract.expected_value > 0 // Has positive EV
            )
          })
          .map((contract): ExtremeOpportunity => {
            const requiredMovePct =
              ((contract.strike_price! - currentPrice) / currentPrice) * 100
            const entryPrice = 0.10 // Target 10¢ entry
            const targetPrice = 0.50 // 50/50 becomes ~50¢
            const payoffMultiplier = targetPrice / entryPrice
            const riskAmount = entryPrice * 10 // Assume 10 contracts

            return {
              ...contract,
              required_move_pct: requiredMovePct,
              entry_price: entryPrice,
              target_price: targetPrice,
              payoff_multiplier: payoffMultiplier,
              risk_amount: riskAmount,
            }
          })
          .sort((a, b) => b.payoff_multiplier - a.payoff_multiplier)
          .slice(0, 6) // Top 6 opportunities

        if (mounted) {
          setOpportunities(extremeOps)
          setLoading(false)
          setError(null)
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : "Failed to fetch data")
          setLoading(false)
        }
      }
    }

    fetchData()
    const interval = setInterval(fetchData, refreshInterval)
    return () => {
      mounted = false;
      clearInterval(interval);
    }
  }, [apiUrl, refreshInterval])

  if (loading) {
    return (
      <div className="glass-card rounded-2xl p-4 h-full flex flex-col">
        <h3 className="text-sm font-semibold flex items-center gap-2 mb-2 flex-shrink-0">
          <Target className="h-4 w-4" />
          Extreme Opportunities
        </h3>
        <div className="flex-1 min-h-0 space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="p-2 bg-muted/10 rounded-lg space-y-1 animate-pulse">
              <div className="flex justify-between">
                <div className="h-3 w-20 bg-muted/30 rounded" />
                <div className="h-4 w-10 bg-muted/40 rounded-full" />
              </div>
              <div className="h-2 w-32 bg-muted/20 rounded" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="glass-card rounded-2xl p-4 h-full flex flex-col">
        <h3 className="text-sm font-semibold mb-2 flex-shrink-0">Extreme Opportunities</h3>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-xs text-destructive">Error: {error}</p>
        </div>
      </div>
    )
  }

  const isExtremeVol = extremeData && extremeData.volatility_multiplier >= 1.5
  const regime = extremeData?.regime || "UNKNOWN"

  return (
    <div className="glass-card rounded-2xl p-4 h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex-none mb-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold flex items-center gap-1.5">
            <Target className="h-4 w-4" />
            Extreme Opps
          </h3>
          {regime && (
            <Badge
              variant={
                regime === "CRISIS"
                  ? "destructive"
                  : regime === "ELEVATED"
                    ? "default"
                    : "secondary"
              }
              className="text-xs px-1.5 py-0"
            >
              {regime}
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          High-risk, high-reward
        </p>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {isExtremeVol && (
          <div className="mb-2 p-2 rounded-lg border border-amber-500/30 bg-amber-500/10">
            <div className="flex items-center gap-1.5 text-amber-400 text-xs">
              <AlertTriangle className="h-3 w-3" />
              <span className="font-medium">
                High Vol: {extremeData?.volatility_multiplier.toFixed(1)}x
              </span>
            </div>
          </div>
        )}

        {opportunities.length === 0 ? (
          <p className="text-center text-xs text-muted-foreground py-4">
            No extreme opportunities
          </p>
        ) : (
          <div className="space-y-1.5">
            {opportunities.slice(0, 4).map((opp) => (
              <div
                key={opp.id}
                className="p-2 rounded-lg border border-border/50 bg-card/50 hover:bg-accent/30 transition-colors"
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    {opp.signal_type === "BUY YES" ? (
                      <TrendingUp className="h-3 w-3 text-[#4AADD8]" />
                    ) : (
                      <TrendingDown className="h-3 w-3 text-red-400" />
                    )}
                    <span className="text-xs font-medium truncate max-w-[80px]">
                      {opp.ticker.split("-").pop()}
                    </span>
                  </div>
                  <span className="text-xs font-bold text-primary">
                    {opp.payoff_multiplier.toFixed(1)}x
                  </span>
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>
                    {opp.required_move_pct >= 0 ? "+" : ""}
                    {opp.required_move_pct.toFixed(1)}% move
                  </span>
                  <span>{((opp.implied_probability || 0) * 100).toFixed(0)}% implied</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer tip */}
      <div className="flex-none pt-2 border-t border-border/50 mt-2">
        <p className="text-xs text-muted-foreground">
          Enter at 8-12¢ for zero fees
        </p>
      </div>
    </div>
  )
}
