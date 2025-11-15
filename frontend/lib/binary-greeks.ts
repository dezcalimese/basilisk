/**
 * Binary Options Greeks Calculator
 *
 * Calculates Black-Scholes Greeks for cash-or-nothing (binary) options.
 * These are digital options that pay out a fixed amount if the option expires ITM.
 *
 * Key formulas:
 * - Binary Call Price: P = e^(-r*τ) * N(d₂)
 * - Delta: Δ = (φ * e^(-r*τ)) / (S * σ * √τ) * n(d₂)
 * - Gamma: Γ = -(φ * e^(-r*τ)) / (S² * σ² * τ) * n(d₂) * d₁
 * - Vega: ν = -(φ * e^(-r*τ)) / σ * d₁ * n(d₂)
 * - Theta: Complex time decay formula
 * - Rho: ρ = -τ * P (for binary calls)
 *
 * Where:
 * - φ = 1 for calls, -1 for puts
 * - N(x) = standard normal CDF
 * - n(x) = standard normal PDF
 * - d₁ = [ln(S/K) + (r + σ²/2)τ] / (σ√τ)
 * - d₂ = d₁ - σ√τ
 */

export interface BinaryOptionParams {
  spotPrice: number;           // Current BTC price
  strikePrice: number;         // Strike price
  timeToExpiryHours: number;   // Time to expiry in hours
  volatility: number;          // Annual volatility (e.g., 0.60 for 60%)
  riskFreeRate?: number;       // Annual risk-free rate (default: 4.5%)
  optionType?: 'call' | 'put'; // Default: 'call'
}

export interface Greeks {
  price: number;      // Binary option fair value (0 to 1)
  delta: number;      // ∂P/∂S - sensitivity to spot price change
  gamma: number;      // ∂²P/∂S² - rate of delta change
  vega: number;       // ∂P/∂σ - sensitivity to volatility (per 1% vol change)
  theta: number;      // ∂P/∂t - time decay per day
  rho: number;        // ∂P/∂r - sensitivity to interest rate (per 1% rate change)
}

/**
 * Standard normal cumulative distribution function (CDF)
 * Uses Abramowitz & Stegun approximation (accurate to 10^-7)
 */
function normalCDF(x: number): number {
  if (x < -10) return 0;
  if (x > 10) return 1;

  const sign = x >= 0 ? 1 : -1;
  const absX = Math.abs(x);

  // Constants for approximation
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const t = 1.0 / (1.0 + p * absX);
  const erf =
    1 -
    ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) *
      t *
      Math.exp(-absX * absX);

  return 0.5 * (1 + sign * erf);
}

/**
 * Standard normal probability density function (PDF)
 */
function normalPDF(x: number): number {
  return (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * x * x);
}

/**
 * Calculate d₁ for Black-Scholes
 */
function calculateD1(
  S: number,
  K: number,
  tau: number,
  sigma: number,
  r: number
): number {
  if (tau <= 0) return S >= K ? Infinity : -Infinity;
  if (sigma <= 0) return S >= K ? Infinity : -Infinity;

  const numerator = Math.log(S / K) + (r + 0.5 * sigma * sigma) * tau;
  const denominator = sigma * Math.sqrt(tau);

  return numerator / denominator;
}

/**
 * Calculate d₂ for Black-Scholes
 */
function calculateD2(d1: number, sigma: number, tau: number): number {
  if (tau <= 0) return d1;
  return d1 - sigma * Math.sqrt(tau);
}

/**
 * Calculate all Greeks for a binary option
 */
export function calculateBinaryGreeks(
  params: BinaryOptionParams
): Greeks {
  const {
    spotPrice: S,
    strikePrice: K,
    timeToExpiryHours,
    volatility: annualVol,
    riskFreeRate = 0.045, // 4.5% default
    optionType = 'call',
  } = params;

  // Convert time to years
  const tau = timeToExpiryHours / (24 * 365);

  // Handle edge cases
  if (tau <= 0) {
    const isITM = optionType === 'call' ? S >= K : S <= K;
    return {
      price: isITM ? 1 : 0,
      delta: 0,
      gamma: 0,
      vega: 0,
      theta: 0,
      rho: 0,
    };
  }

  if (annualVol <= 0) {
    const isITM = optionType === 'call' ? S >= K : S <= K;
    return {
      price: isITM ? Math.exp(-riskFreeRate * tau) : 0,
      delta: 0,
      gamma: 0,
      vega: 0,
      theta: 0,
      rho: 0,
    };
  }

  // Direction factor: +1 for calls, -1 for puts
  const phi = optionType === 'call' ? 1 : -1;

  // Calculate d₁ and d₂
  const d1 = calculateD1(S, K, tau, annualVol, riskFreeRate);
  const d2 = calculateD2(d1, annualVol, tau);

  // Calculate discount factor
  const discountFactor = Math.exp(-riskFreeRate * tau);

  // Binary option price
  const Nd2 = normalCDF(phi * d2);
  const price = discountFactor * Nd2;

  // PDF values
  const nd2 = normalPDF(d2);

  // Delta: sensitivity to spot price
  const delta =
    (phi * discountFactor * nd2) / (S * annualVol * Math.sqrt(tau));

  // Gamma: rate of change of delta
  const gamma =
    -(phi * discountFactor * nd2 * d1) /
    (S * S * annualVol * annualVol * tau);

  // Vega: sensitivity to volatility (per 1% change)
  // Note: divided by 100 to get per 1% vol change
  const vega = -(phi * discountFactor * d1 * nd2) / (100 * annualVol);

  // Theta: time decay (per day)
  // Note: multiplied by 365 to get per day instead of per year
  const term1 = (phi * nd2 * S * annualVol) / (2 * Math.sqrt(tau));
  const term2 = riskFreeRate * price;
  const theta = -(term1 - term2) / 365;

  // Rho: sensitivity to interest rate (per 1% change)
  // Note: divided by 100 to get per 1% rate change
  const rho = -(tau * price) / 100;

  return {
    price,
    delta,
    gamma,
    vega,
    theta,
    rho,
  };
}

/**
 * Calculate Greeks for multiple strikes (batch calculation)
 * Useful for volatility surface visualization
 */
export function calculateGreeksBatch(
  strikes: number[],
  params: Omit<BinaryOptionParams, 'strikePrice'>
): Map<number, Greeks> {
  const results = new Map<number, Greeks>();

  for (const strike of strikes) {
    const greeks = calculateBinaryGreeks({
      ...params,
      strikePrice: strike,
    });
    results.set(strike, greeks);
  }

  return results;
}

/**
 * Format Greeks for display
 */
export function formatGreeks(greeks: Greeks): Record<string, string> {
  return {
    price: `${(greeks.price * 100).toFixed(2)}%`,
    delta: greeks.delta.toFixed(4),
    gamma: greeks.gamma.toFixed(6),
    vega: greeks.vega.toFixed(4),
    theta: greeks.theta.toFixed(4),
    rho: greeks.rho.toFixed(6),
  };
}

/**
 * Get Greek interpretation for tooltips
 */
export function getGreekInterpretation(greek: keyof Greeks): string {
  const interpretations = {
    price: 'Theoretical probability of finishing in-the-money (0-100%)',
    delta: 'Change in option value per $1 move in BTC price',
    gamma: 'Rate of change of delta per $1 move in BTC price',
    vega: 'Change in option value per 1% change in volatility',
    theta: 'Time decay - daily change in option value',
    rho: 'Change in option value per 1% change in interest rates',
  };

  return interpretations[greek] || '';
}
