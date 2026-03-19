"use client";

import { useState, useEffect } from "react";
import { useMultiAssetStore, type ConnectionState } from "@/lib/stores/multi-asset-store";

const stateConfig: Record<ConnectionState, {
  label: string;
  color: string;
  iconClass: string;
  animate: boolean;
}> = {
  disconnected: {
    label: "Disconnected",
    color: "text-gray-400",
    iconClass: "icon-[lucide--wifi-off]",
    animate: false,
  },
  connecting: {
    label: "Connecting...",
    color: "text-blue-400",
    iconClass: "icon-[lucide--wifi]",
    animate: true,
  },
  connected: {
    label: "Connected",
    color: "text-emerald-400",
    iconClass: "icon-[lucide--wifi]",
    animate: true,
  },
  reconnecting: {
    label: "Reconnecting...",
    color: "text-amber-400",
    iconClass: "icon-[lucide--wifi]",
    animate: true,
  },
  error: {
    label: "Connection error",
    color: "text-red-400",
    iconClass: "icon-[lucide--wifi-off]",
    animate: false,
  },
};

export function ConnectionStatus() {
  const connectionState = useMultiAssetStore((state) => state.assetConnections[state.selectedAsset].state);
  const connectionError = useMultiAssetStore((state) => state.assetConnections[state.selectedAsset].error);
  const lastConnectionTime = useMultiAssetStore((state) => state.assetConnections[state.selectedAsset].lastConnectionTime);
  const selectedAsset = useMultiAssetStore((state) => state.selectedAsset);

  const [hovered, setHovered] = useState(false);
  const [uptime, setUptime] = useState("");

  useEffect(() => {
    if (!hovered || connectionState !== "connected" || !lastConnectionTime) return;
    const update = () => {
      const secs = Math.floor((Date.now() - lastConnectionTime) / 1000);
      if (secs < 60) setUptime(`${secs}s`);
      else if (secs < 3600) setUptime(`${Math.floor(secs / 60)}m ${secs % 60}s`);
      else setUptime(`${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`);
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [hovered, connectionState, lastConnectionTime]);

  const config = stateConfig[connectionState];

  return (
    <div
      className="relative"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Wifi icon with pulse animation */}
      <div className={`relative w-6 h-6 flex items-center justify-center cursor-default ${config.color}`}>
        {config.animate && (
          <span
            className={`absolute inset-0 flex items-center justify-center ${config.color} opacity-40`}
          >
            <i className={`${config.iconClass} w-4 h-4 animate-ping`} style={{ animationDuration: "2s" }} />
          </span>
        )}
        <i className={`${config.iconClass} w-4 h-4 relative`} />
      </div>

      {/* Hover tooltip */}
      {hovered && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 z-50 whitespace-nowrap">
          <div className="glass-card rounded-lg px-3 py-2 text-xs shadow-lg border border-border/50">
            <div className="flex items-center gap-2">
              <i className={`${config.iconClass} w-3 h-3 ${config.color}`} />
              <span className="font-medium">{config.label}</span>
            </div>
            {connectionState === "connected" && (
              <div className="text-muted-foreground mt-1">
                {selectedAsset} stream · {uptime} uptime
              </div>
            )}
            {connectionState === "error" && connectionError && (
              <div className="text-red-400 mt-1 max-w-[200px] truncate">
                {connectionError}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
