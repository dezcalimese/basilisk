"use client"

import { useState, useEffect } from "react"
import { Calculator, DollarSign, TrendingUp, AlertTriangle } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"

interface CalculatorState {
  currentBtcPrice: number
  targetStrike: number
  entryPrice: number
  quantity: number
  direction: "bullish" | "bearish"
}

export function LimitOrderCalculator({
  apiUrl = "http://localhost:8000",
}: {
  apiUrl?: string
}) {
  const [currentPrice, setCurrentPrice] = useState(90000)
  const [calc, setCalc] = useState<CalculatorState>({
    currentBtcPrice: 90000,
    targetStrike: 96000,
    entryPrice: 0.10,
    quantity: 10,
    direction: "bullish",
  })

  useEffect(() => {
    const fetchCurrentPrice = async () => {
      try {
        const res = await fetch(`${apiUrl}/api/v1/btc-price`)
        const data = await res.json()
        const price = data.price || 90000
        setCurrentPrice(price)
        setCalc((prev) => ({ ...prev, currentBtcPrice: price }))
      } catch {
        // Use fallback price
      }
    }
    fetchCurrentPrice()
  }, [apiUrl])

  const requiredMovePct =
    ((calc.targetStrike - calc.currentBtcPrice) / calc.currentBtcPrice) * 100
  const requiredMoveAbs = calc.targetStrike - calc.currentBtcPrice

  // Profit/Loss scenarios
  const maxRisk = calc.entryPrice * calc.quantity
  const targetHitProfit = (1.0 - calc.entryPrice) * calc.quantity // Full 100¢ payout
  const fiftyFiftyPrice = 0.50
  const fiftyFiftyProfit = (fiftyFiftyPrice - calc.entryPrice) * calc.quantity
  const stayFlatPrice = 0.05
  const stayFlatLoss = (stayFlatPrice - calc.entryPrice) * calc.quantity
  const wrongWayPrice = 0.02
  const wrongWayLoss = (wrongWayPrice - calc.entryPrice) * calc.quantity

  // Calculate 50/50 zone (halfway to target)
  const fiftyFiftyPriceLevel =
    calc.currentBtcPrice + (calc.targetStrike - calc.currentBtcPrice) * 0.5

  // Calculate cancel zone (price moves opposite direction)
  const cancelZone =
    calc.direction === "bullish"
      ? calc.currentBtcPrice - Math.abs(requiredMoveAbs) * 0.3
      : calc.currentBtcPrice + Math.abs(requiredMoveAbs) * 0.3

  const riskRewardRatio = Math.abs(targetHitProfit / maxRisk)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calculator className="h-5 w-5" />
          💰 Limit Order Calculator
        </CardTitle>
        <CardDescription>
          Plan your extreme volatility trade with profit/loss scenarios
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Direction Toggle */}
        <div className="flex gap-2">
          <button
            onClick={() => setCalc({ ...calc, direction: "bullish" })}
            className={`flex-1 px-4 py-2 rounded-md font-medium transition-colors ${
              calc.direction === "bullish"
                ? "bg-green-500 text-white"
                : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
            }`}
          >
            <TrendingUp className="h-4 w-4 inline mr-2" />
            Bullish (BUY YES)
          </button>
          <button
            onClick={() => setCalc({ ...calc, direction: "bearish" })}
            className={`flex-1 px-4 py-2 rounded-md font-medium transition-colors ${
              calc.direction === "bearish"
                ? "bg-red-500 text-white"
                : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
            }`}
          >
            <TrendingUp className="h-4 w-4 inline mr-2 rotate-180" />
            Bearish (BUY NO)
          </button>
        </div>

        {/* Current BTC Price */}
        <div>
          <Label className="text-sm font-medium">Current BTC Price</Label>
          <div className="mt-1 text-2xl font-bold text-primary">
            ${currentPrice.toLocaleString()}
          </div>
        </div>

        {/* Target Strike */}
        <div className="space-y-2">
          <Label htmlFor="target-strike">
            Target Strike Price: ${calc.targetStrike.toLocaleString()}
          </Label>
          <Slider
            id="target-strike"
            min={currentPrice * 0.9}
            max={currentPrice * 1.1}
            step={100}
            value={[calc.targetStrike]}
            onValueChange={(value) => setCalc({ ...calc, targetStrike: value[0] })}
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>-10%</span>
            <span>
              Need: {requiredMovePct >= 0 ? "+" : ""}
              {requiredMovePct.toFixed(2)}%
            </span>
            <span>+10%</span>
          </div>
        </div>

        {/* Entry Price */}
        <div className="space-y-2">
          <Label htmlFor="entry-price">Entry Price: {(calc.entryPrice * 100).toFixed(0)}¢</Label>
          <Slider
            id="entry-price"
            min={0.05}
            max={0.20}
            step={0.01}
            value={[calc.entryPrice]}
            onValueChange={(value) => setCalc({ ...calc, entryPrice: value[0] })}
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>5¢</span>
            <span>Optimal: 8-12¢</span>
            <span>20¢</span>
          </div>
        </div>

        {/* Quantity */}
        <div className="space-y-2">
          <Label htmlFor="quantity">Quantity: {calc.quantity} contracts</Label>
          <Input
            id="quantity"
            type="number"
            min={1}
            max={100}
            value={calc.quantity}
            onChange={(e) =>
              setCalc({ ...calc, quantity: parseInt(e.target.value) || 10 })
            }
          />
        </div>

        {/* Profit Scenarios */}
        <div className="space-y-3">
          <h4 className="font-semibold text-sm">📊 Profit/Loss Scenarios</h4>

          <div className="space-y-2">
            <div className="flex justify-between items-center p-3 rounded-md bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800">
              <span className="text-sm font-medium text-green-900 dark:text-green-100">
                🎯 Target Hit (${calc.targetStrike.toLocaleString()})
              </span>
              <span className="font-bold text-green-600 dark:text-green-400">
                +${targetHitProfit.toFixed(2)} ({(targetHitProfit / maxRisk).toFixed(1)}x)
              </span>
            </div>

            <div className="flex justify-between items-center p-3 rounded-md bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800">
              <span className="text-sm font-medium text-blue-900 dark:text-blue-100">
                📈 50/50 Zone (${fiftyFiftyPriceLevel.toLocaleString()})
              </span>
              <span className="font-bold text-blue-600 dark:text-blue-400">
                +${fiftyFiftyProfit.toFixed(2)} ({(fiftyFiftyProfit / maxRisk).toFixed(1)}x)
              </span>
            </div>

            <div className="flex justify-between items-center p-3 rounded-md bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800">
              <span className="text-sm font-medium text-amber-900 dark:text-amber-100">
                ⚠️ No Move (${currentPrice.toLocaleString()})
              </span>
              <span className="font-semibold text-amber-600 dark:text-amber-400">
                ${stayFlatLoss.toFixed(2)} (-{Math.abs((stayFlatLoss / maxRisk) * 100).toFixed(0)}%)
              </span>
            </div>

            <div className="flex justify-between items-center p-3 rounded-md bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800">
              <span className="text-sm font-medium text-red-900 dark:text-red-100">
                ❌ Wrong Way (${cancelZone.toLocaleString()})
              </span>
              <span className="font-semibold text-red-600 dark:text-red-400">
                ${wrongWayLoss.toFixed(2)} (-{Math.abs((wrongWayLoss / maxRisk) * 100).toFixed(0)}%)
              </span>
            </div>
          </div>
        </div>

        {/* Risk Management */}
        <div className="space-y-2 pt-4 border-t">
          <h4 className="font-semibold text-sm">🎯 Risk Management</h4>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-muted-foreground">Max Loss</div>
              <div className="font-semibold text-red-600">${maxRisk.toFixed(2)}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Max Profit</div>
              <div className="font-semibold text-green-600">
                ${targetHitProfit.toFixed(2)}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">R/R Ratio</div>
              <div className="font-semibold text-primary">{riskRewardRatio.toFixed(1)}:1</div>
            </div>
            <div>
              <div className="text-muted-foreground">Cancel Zone</div>
              <div className="font-semibold text-amber-600">
                ${cancelZone.toLocaleString()}
              </div>
            </div>
          </div>
        </div>

        {/* Alert */}
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="text-xs">
            <strong>Strategy:</strong> Place resting limit order at{" "}
            {(calc.entryPrice * 100).toFixed(0)}¢ (maker = zero fees). Cancel if BTC{" "}
            {calc.direction === "bullish" ? "drops below" : "rises above"} $
            {cancelZone.toLocaleString()}. Risk ${maxRisk.toFixed(2)} to make $
            {targetHitProfit.toFixed(2)}.
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  )
}
