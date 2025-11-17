"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { TradeSignal } from "@/lib/api";

// Dynamic import to avoid SSR issues with Plotly
const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

interface VolatilitySurface3DProps {
  signals: TradeSignal[];
  currentBtcPrice: number | null;
}

interface SurfacePoint {
  strike: number;
  timeToExpiry: number;
  impliedProb: number;
  modelProb: number;
  mispricing: number;
  mispricingPct: number;
  ticker: string;
  signalType: string;
}

export function VolatilitySurface3D({
  signals,
  currentBtcPrice,
}: VolatilitySurface3DProps) {
  const [showInfo, setShowInfo] = useState(false);

  // Transform signals into surface data points
  const surfaceData = useMemo(() => {
    return signals
      .filter(
        (s) =>
          s.strike_price != null &&
          s.time_to_expiry_hours != null &&
          s.implied_probability != null &&
          s.model_probability != null
      )
      .map((s): SurfacePoint => {
        const impliedProb = s.implied_probability!;
        const modelProb = s.model_probability!;
        const mispricing = modelProb - impliedProb;
        const mispricingPct = (mispricing / impliedProb) * 100;

        return {
          strike: s.strike_price!,
          timeToExpiry: s.time_to_expiry_hours!,
          impliedProb: impliedProb * 100,
          modelProb: modelProb * 100,
          mispricing: mispricing * 100,
          mispricingPct,
          ticker: s.ticker,
          signalType: s.signal_type,
        };
      })
      .sort((a, b) => a.strike - b.strike || a.timeToExpiry - b.timeToExpiry);
  }, [signals]);

  // Create interpolated surface grid
  const plotData = useMemo(() => {
    if (!currentBtcPrice || surfaceData.length === 0) return [];

    // Extract unique X and Y values and sort them
    const points = surfaceData.map((d) => ({
      x: d.strike / currentBtcPrice,
      y: d.timeToExpiry,
      z: d.impliedProb,
      mispricing: d.mispricing,
    }));

    // Get min/max for grid bounds
    const xValues = points.map((p) => p.x);
    const yValues = points.map((p) => p.y);
    const xMin = Math.min(...xValues);
    const xMax = Math.max(...xValues);
    const yMin = Math.min(...yValues);
    const yMax = Math.max(...yValues);

    // Create regular grid (30x30 resolution)
    const gridSize = 30;
    const xGrid: number[] = [];
    const yGrid: number[] = [];
    const xStep = (xMax - xMin) / (gridSize - 1);
    const yStep = (yMax - yMin) / (gridSize - 1);

    for (let i = 0; i < gridSize; i++) {
      xGrid.push(xMin + i * xStep);
      yGrid.push(yMin + i * yStep);
    }

    // Interpolate Z values on grid using inverse distance weighting
    const zGrid: number[][] = [];
    const colorGrid: number[][] = [];

    for (let i = 0; i < gridSize; i++) {
      zGrid[i] = [];
      colorGrid[i] = [];
      for (let j = 0; j < gridSize; j++) {
        const gridX = xGrid[j];
        const gridY = yGrid[i];

        // Find nearest points and interpolate
        let totalWeight = 0;
        let weightedZ = 0;
        let weightedColor = 0;

        // Use inverse distance weighting with k nearest neighbors
        const k = Math.min(5, points.length);
        const distances = points
          .map((p, idx) => ({
            idx,
            dist: Math.sqrt(Math.pow(p.x - gridX, 2) + Math.pow(p.y - gridY, 2)),
          }))
          .sort((a, b) => a.dist - b.dist)
          .slice(0, k);

        distances.forEach(({ idx, dist }) => {
          const weight = dist === 0 ? 1e10 : 1 / (dist * dist);
          totalWeight += weight;
          weightedZ += weight * points[idx].z;
          weightedColor += weight * points[idx].mispricing;
        });

        zGrid[i][j] = weightedZ / totalWeight;
        colorGrid[i][j] = weightedColor / totalWeight;
      }
    }

    return [
      {
        type: "surface" as const,
        x: xGrid,
        y: yGrid,
        z: zGrid,
        surfacecolor: colorGrid,
        colorscale: [
          [0, "#dc2626"], // Strong SELL (darker red)
          [0.3, "#ef4444"], // SELL (red)
          [0.45, "#fca5a5"], // Light SELL
          [0.5, "#94a3b8"], // Neutral (gray)
          [0.55, "#86efac"], // Light BUY
          [0.7, "#22c55e"], // BUY (green)
          [1, "#15803d"], // Strong BUY (darker green)
        ] as any,
        colorbar: {
          title: { text: "Mispricing (pp)" },
          titleside: "right" as const,
          tickmode: "linear" as const,
          tick0: -15,
          dtick: 5,
          thickness: 15,
          len: 0.7,
        },
        opacity: 0.9,
        contours: {
          z: {
            show: true,
            usecolormap: true,
            highlightcolor: "#334155",
            project: { z: false },
          },
        },
        hovertemplate:
          "Moneyness: %{x:.3f}<br>" +
          "Time to Expiry: %{y:.2f}h<br>" +
          "Implied Prob: %{z:.1f}%<br>" +
          "<extra></extra>",
      },
      // Add scatter points on top of surface to show actual contracts
      {
        type: "scatter3d" as const,
        mode: "markers" as const,
        x: points.map((p) => p.x),
        y: points.map((p) => p.y),
        z: points.map((p) => p.z),
        text: surfaceData.map(
          (d) =>
            `<b>${d.ticker}</b><br>` +
            `Strike: $${d.strike.toFixed(0)}<br>` +
            `Moneyness: ${(d.strike / currentBtcPrice).toFixed(3)}<br>` +
            `Expiry: ${d.timeToExpiry < 1 ? `${(d.timeToExpiry * 60).toFixed(0)}m` : `${d.timeToExpiry.toFixed(1)}h`}<br>` +
            `Market: ${d.impliedProb.toFixed(1)}%<br>` +
            `Model: ${d.modelProb.toFixed(1)}%<br>` +
            `<b>Edge: ${d.mispricing > 0 ? "+" : ""}${d.mispricing.toFixed(1)}pp</b><br>` +
            `${d.signalType}`
        ),
        hovertemplate: "%{text}<extra></extra>",
        marker: {
          size: 4,
          color: "#ffffff",
          line: {
            color: "#334155",
            width: 1,
          },
          opacity: 0.8,
        },
        name: "Contracts",
        showlegend: false,
      },
    ] as any;
  }, [surfaceData, currentBtcPrice]);

  const layout = {
    autosize: true,
    margin: { l: 0, r: 0, t: 30, b: 0 },
    paper_bgcolor: "transparent",
    plot_bgcolor: "transparent",
    scene: {
      xaxis: {
        title: { text: "Moneyness (K/S)" },
        gridcolor: "#334155",
        showbackground: true,
        backgroundcolor: "rgba(15, 23, 42, 0.3)",
      },
      yaxis: {
        title: { text: "Time to Expiry (hours)" },
        gridcolor: "#334155",
        showbackground: true,
        backgroundcolor: "rgba(15, 23, 42, 0.3)",
      },
      zaxis: {
        title: { text: "Implied Probability (%)" },
        gridcolor: "#334155",
        showbackground: true,
        backgroundcolor: "rgba(15, 23, 42, 0.3)",
      },
      camera: {
        eye: { x: 1.5, y: 1.5, z: 1.3 },
      },
    },
    font: {
      family: "system-ui, -apple-system, sans-serif",
      size: 11,
      color: "#94a3b8",
    },
    hovermode: "closest" as const,
  } as any;

  const config = {
    responsive: true,
    displayModeBar: true,
    displaylogo: false,
    modeBarButtonsToRemove: ["select2d" as const, "lasso2d" as const],
  } as any;

  if (surfaceData.length === 0) {
    return (
      <div className="glass-card p-6 h-full flex flex-col">
        <h3 className="text-lg font-semibold mb-4">3D Volatility Surface</h3>
        <p className="text-sm text-muted-foreground text-center py-8">
          No data available for volatility surface
        </p>
      </div>
    );
  }

  if (!currentBtcPrice) {
    return (
      <div className="glass-card p-6 h-full flex flex-col">
        <h3 className="text-lg font-semibold mb-4">3D Volatility Surface</h3>
        <p className="text-sm text-muted-foreground text-center py-8">
          Waiting for current BTC price...
        </p>
      </div>
    );
  }

  return (
    <div className="glass-card p-4 h-full flex flex-col">
      <div className="mb-3">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold">3D Volatility Surface</h3>
          <button
            onClick={() => setShowInfo(!showInfo)}
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Info"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </button>
        </div>

        {showInfo && (
          <div className="mt-2 p-3 bg-muted/50 rounded-lg text-xs text-muted-foreground space-y-2">
            <p className="font-semibold text-foreground">Interactive 3D Volatility Surface</p>
            <p>
              This interpolated 3D surface shows the continuous volatility landscape with market mispricings.
            </p>
            <ul className="space-y-1 ml-4 list-disc">
              <li><strong>X-axis:</strong> Moneyness (K/S) - strike relative to spot price</li>
              <li><strong>Y-axis:</strong> Time to expiry (hours until settlement)</li>
              <li><strong>Z-axis:</strong> Implied probability from market prices</li>
              <li><strong>Surface color:</strong> Mispricing (green = underpriced, red = overpriced)</li>
              <li><strong>White dots:</strong> Actual contract positions</li>
              <li><strong>Contour lines:</strong> Equal probability levels</li>
            </ul>
            <p className="pt-1 border-t border-border">
              <strong>Controls:</strong> Click and drag to rotate • Scroll to zoom • Hover for details
            </p>
          </div>
        )}

        <p className="text-xs text-muted-foreground mt-1">
          Interactive 3D View • Drag to rotate • Scroll to zoom
        </p>
      </div>

      <div className="flex-1" style={{ minHeight: "500px" }}>
        <Plot
          data={plotData}
          layout={layout}
          config={config}
          style={{ width: "100%", height: "100%" }}
          useResizeHandler={true}
        />
      </div>

      {/* Stats summary */}
      <div className="mt-3 grid grid-cols-3 gap-3 text-xs">
        <div className="text-center">
          <p className="text-muted-foreground">Contracts</p>
          <p className="font-mono font-bold text-sm">{surfaceData.length}</p>
        </div>
        <div className="text-center">
          <p className="text-muted-foreground">Strike Range</p>
          <p className="font-mono font-bold text-sm">
            ${(Math.min(...surfaceData.map((d) => d.strike)) / 1000).toFixed(0)}k -{" "}
            ${(Math.max(...surfaceData.map((d) => d.strike)) / 1000).toFixed(0)}k
          </p>
        </div>
        <div className="text-center">
          <p className="text-muted-foreground">Avg Mispricing</p>
          <p className="font-mono font-bold text-sm">
            {(
              surfaceData.reduce((sum, d) => sum + d.mispricing, 0) /
              surfaceData.length
            ).toFixed(1)}
            pp
          </p>
        </div>
      </div>
    </div>
  );
}
