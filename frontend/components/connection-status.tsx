"use client";

import { useRealtimeStore, ConnectionState } from "@/lib/stores/realtime-store";
import { Badge } from "@/components/ui/badge";

/**
 * Connection Status Indicator
 *
 * Displays current SSE connection state with appropriate icon and color.
 * Uses Iconify icons via Tailwind CSS plugin.
 */

const connectionConfig: Record<ConnectionState, {
  label: string;
  variant: "default" | "destructive" | "outline" | "secondary";
  iconClass: string;
  className: string;
}> = {
  disconnected: {
    label: "Disconnected",
    variant: "outline",
    iconClass: "icon-[lucide--wifi-off] h-3 w-3",
    className: "text-gray-500",
  },
  connecting: {
    label: "Connecting",
    variant: "secondary",
    iconClass: "icon-[lucide--refresh-cw] h-3 w-3 animate-spin",
    className: "text-blue-500",
  },
  connected: {
    label: "Connected",
    variant: "default",
    iconClass: "icon-[lucide--wifi] h-3 w-3",
    className: "text-green-500 bg-green-500/10",
  },
  reconnecting: {
    label: "Reconnecting",
    variant: "secondary",
    iconClass: "icon-[lucide--refresh-cw] h-3 w-3 animate-spin",
    className: "text-yellow-500",
  },
  error: {
    label: "Error",
    variant: "destructive",
    iconClass: "icon-[lucide--alert-circle] h-3 w-3",
    className: "text-red-500",
  },
};

interface ConnectionStatusProps {
  showLabel?: boolean;
  showError?: boolean;
}

export function ConnectionStatus({ showLabel = true, showError = false }: ConnectionStatusProps) {
  const connectionState = useRealtimeStore((state) => state.connectionState);
  const connectionError = useRealtimeStore((state) => state.connectionError);
  const lastConnectionTime = useRealtimeStore((state) => state.lastConnectionTime);

  const config = connectionConfig[connectionState];

  return (
    <div className="flex items-center gap-2">
      <Badge variant={config.variant} className={`${config.className} gap-1.5`}>
        <i className={config.iconClass} />
        {showLabel && <span className="text-xs font-medium">{config.label}</span>}
      </Badge>

      {showError && connectionError && (
        <span className="text-xs text-muted-foreground">
          {connectionError}
        </span>
      )}

      {connectionState === "connected" && lastConnectionTime && (
        <span className="text-xs text-muted-foreground">
          Connected {formatTimeSince(lastConnectionTime)}
        </span>
      )}
    </div>
  );
}

function formatTimeSince(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);

  if (seconds < 60) {
    return "just now";
  }

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}
