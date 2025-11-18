"use client"

import { useEffect, useState } from "react"
import { AlertTriangle, TrendingUp, TrendingDown, Target } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"

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
  apiUrl = "http://localhost:8000",
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
    const fetchData = async () => {
      try {
        // Fetch current signals
        const signalsRes = await fetch(`${apiUrl}/api/v1/current`)
        const signalsData = await signalsRes.json()

        // Fetch extreme move probabilities
        const extremeRes = await fetch(`${apiUrl}/api/v1/statistics/extreme-moves?hours=720`)
        const extremeMovesData = await extremeRes.json()

        setExtremeData(extremeMovesData)

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

        setOpportunities(extremeOps)
        setLoading(false)
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch data")
        setLoading(false)
      }
    }

    fetchData()
    const interval = setInterval(fetchData, refreshInterval)
    return () => clearInterval(interval)
  }, [apiUrl, refreshInterval])

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Extreme Volatility Opportunities
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Loading...</p>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Extreme Opportunities</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-destructive">Error: {error}</p>
        </CardContent>
      </Card>
    )
  }

  const isExtremeVol = extremeData && extremeData.volatility_multiplier >= 1.5
  const regime = extremeData?.regime || "UNKNOWN"

  return (
    <Card className="col-span-2">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              🎲 Extreme Volatility Opportunities
            </CardTitle>
            <CardDescription>
              High-risk, high-reward contracts for volatile markets
            </CardDescription>
          </div>
          {regime && (
            <Badge
              variant={
                regime === "CRISIS"
                  ? "destructive"
                  : regime === "ELEVATED"
                    ? "default"
                    : "secondary"
              }
            >
              {regime}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isExtremeVol && (
          <Alert variant="default" className="mb-4 border-amber-500 bg-amber-50 dark:bg-amber-950">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertTitle className="text-amber-900 dark:text-amber-100">
              High Volatility Detected
            </AlertTitle>
            <AlertDescription className="text-amber-800 dark:text-amber-200">
              Volatility multiplier: {extremeData?.volatility_multiplier.toFixed(2)}x
              - Extreme moves are {extremeData?.volatility_multiplier.toFixed(1)}x more
              likely than historical average.
            </AlertDescription>
          </Alert>
        )}

        {opportunities.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-8">
            No extreme opportunities available. Market conditions may not support
            high-volatility strategies.
          </p>
        ) : (
          <div className="space-y-3">
            {opportunities.map((opp) => (
              <div
                key={opp.id}
                className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    {opp.signal_type === "BUY YES" ? (
                      <TrendingUp className="h-4 w-4 text-green-500" />
                    ) : (
                      <TrendingDown className="h-4 w-4 text-red-500" />
                    )}
                    <span className="font-medium">{opp.ticker}</span>
                    <Badge
                      variant={opp.signal_type === "BUY YES" ? "default" : "destructive"}
                      className="text-xs"
                    >
                      {opp.signal_type}
                    </Badge>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Strike: ${opp.strike_price?.toLocaleString()} | Need:{" "}
                    {opp.required_move_pct >= 0 ? "+" : ""}
                    {opp.required_move_pct.toFixed(2)}% move
                  </div>
                </div>

                <div className="flex gap-6 items-center">
                  <div className="text-right">
                    <div className="text-xs text-muted-foreground">Entry</div>
                    <div className="font-semibold">
                      {(opp.entry_price * 100).toFixed(0)}¢
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-xs text-muted-foreground">Target</div>
                    <div className="font-semibold text-green-600">
                      {(opp.target_price * 100).toFixed(0)}¢
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-xs text-muted-foreground">Payoff</div>
                    <div className="font-bold text-primary">
                      {opp.payoff_multiplier.toFixed(1)}x
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-xs text-muted-foreground">Implied%</div>
                    <div className="font-medium">
                      {((opp.implied_probability || 0) * 100).toFixed(0)}%
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <Alert variant="default" className="mt-4 border-blue-500 bg-blue-50 dark:bg-blue-950">
          <AlertDescription className="text-xs text-blue-900 dark:text-blue-100">
            ⚠️ <strong>Risk Warning:</strong> These require extreme moves ({">"} 3%). Enter
            as resting orders at 8-12¢ to pay zero fees. Cancel immediately if price moves
            against you. Risk: $10-15 per trade. Reward: $50-100+ if strike hit.
          </Alert>
        </Alert>
      </CardContent>
    </Card>
  )
}
