/**
 * Iconify Icon Component
 *
 * Provides a consistent interface for using Iconify icons with Tailwind CSS.
 * Uses the Tailwind 4 plugin for zero runtime overhead.
 *
 * Usage:
 *   <Icon name="lucide--moon" className="h-4 w-4" />
 *   <Icon name="lucide--sun" size="lg" />
 *
 * Icon names follow the format: {icon-set}--{icon-name}
 * Browse icons at: https://icon-sets.iconify.design/
 */

import { cn } from "@/lib/utils";

// Standard icon sizes
const ICON_SIZES = {
  xs: "h-3 w-3", // 12px
  sm: "h-4 w-4", // 16px
  md: "h-5 w-5", // 20px
  lg: "h-6 w-6", // 24px
  xl: "h-8 w-8", // 32px
} as const;

type IconSize = keyof typeof ICON_SIZES;

interface IconProps {
  /** Icon name in format: {icon-set}--{icon-name} (e.g., "lucide--moon") */
  name: string;
  /** Preset size or custom className */
  size?: IconSize;
  /** Additional CSS classes */
  className?: string;
  /** Accessible label for screen readers */
  "aria-label"?: string;
}

/**
 * Icon component using Iconify Tailwind plugin.
 *
 * Icons are rendered at build time with zero runtime overhead.
 * Uses currentColor by default, so icon color inherits from parent text color.
 */
export function Icon({
  name,
  size = "sm",
  className,
  "aria-label": ariaLabel,
}: IconProps) {
  return (
    <i
      className={cn(`icon-[${name}]`, ICON_SIZES[size], className)}
      aria-label={ariaLabel}
      aria-hidden={!ariaLabel}
    />
  );
}

/**
 * Common icon names mapped to Iconify format.
 * Use these constants for type-safe icon usage.
 */
export const ICONS = {
  // Theme
  moon: "lucide--moon",
  sun: "lucide--sun",
  monitor: "lucide--monitor",

  // Navigation & Actions
  x: "lucide--x",
  menu: "lucide--menu",
  chevronDown: "lucide--chevron-down",
  chevronUp: "lucide--chevron-up",
  chevronLeft: "lucide--chevron-left",
  chevronRight: "lucide--chevron-right",
  arrowUp: "lucide--arrow-up",
  arrowDown: "lucide--arrow-down",
  externalLink: "lucide--external-link",

  // Status & Alerts
  alertCircle: "lucide--alert-circle",
  alertTriangle: "lucide--alert-triangle",
  checkCircle: "lucide--check-circle",
  info: "lucide--info",
  helpCircle: "lucide--help-circle",

  // Connection
  wifi: "lucide--wifi",
  wifiOff: "lucide--wifi-off",
  refreshCw: "lucide--refresh-cw",
  loader: "lucide--loader-2",

  // Trading
  trendingUp: "lucide--trending-up",
  trendingDown: "lucide--trending-down",
  dollarSign: "lucide--dollar-sign",
  calculator: "lucide--calculator",
  target: "lucide--target",
  activity: "lucide--activity",
  barChart: "lucide--bar-chart-2",

  // Crypto
  bitcoin: "lucide--bitcoin",

  // General
  settings: "lucide--settings",
  user: "lucide--user",
  search: "lucide--search",
  filter: "lucide--filter",
  copy: "lucide--copy",
  check: "lucide--check",
  clock: "lucide--clock",
  calendar: "lucide--calendar",
  zap: "lucide--zap",
  flame: "lucide--flame",
  gauge: "lucide--gauge",
  percent: "lucide--percent",
} as const;

export type IconName = keyof typeof ICONS;
