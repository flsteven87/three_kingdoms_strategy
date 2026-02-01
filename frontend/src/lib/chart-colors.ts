/**
 * Chart Colors
 *
 * Theme-aware color constants for Recharts.
 * Uses CSS variables for automatic light/dark mode support.
 */

/**
 * LIFF chart colors using CSS variables.
 * Recharts supports CSS variables in stroke/fill props.
 */
export const liffChartColors = {
  // Primary data series
  primary: "var(--primary)",

  // Secondary data series (for dual-axis charts)
  secondary: "var(--chart-2)",

  // Tertiary data series
  tertiary: "var(--chart-3)",

  // Grid and axis lines
  grid: "var(--border)",

  // Axis text
  axisText: "var(--muted-foreground)",

  // Reference lines (alliance average, etc.)
  reference: "var(--muted-foreground)",

  // Median lines (slightly different from average)
  median: "hsl(215 20% 55%)",
} as const;

/**
 * Radar chart specific colors.
 */
export const radarChartColors = {
  // User's data
  me: {
    stroke: "var(--primary)",
    fill: "var(--primary)",
    fillOpacity: 0.4,
    strokeWidth: 2,
  },

  // Alliance average (reference)
  average: {
    stroke: "var(--muted-foreground)",
    fill: "var(--muted-foreground)",
    fillOpacity: 0.1,
    strokeWidth: 1,
    strokeDasharray: "4 4",
  },

  // Alliance median
  median: {
    stroke: "hsl(215 20% 55%)",
    fill: "hsl(215 20% 55%)",
    fillOpacity: 0.08,
    strokeWidth: 1,
    strokeDasharray: "2 2",
  },
} as const;

/**
 * Line chart specific colors for trend visualization.
 */
export const trendChartColors = {
  contribution: "var(--chart-4)", // Purple/blue for contribution
  merit: "var(--primary)", // Primary green for merit
} as const;

/**
 * Axis styling configuration.
 */
export const axisStyles = {
  tick: {
    fontSize: 10,
    fill: "var(--muted-foreground)",
  },
  tickSmall: {
    fontSize: 9,
    fill: "var(--muted-foreground)",
  },
  axisLine: {
    stroke: "var(--border)",
  },
} as const;
