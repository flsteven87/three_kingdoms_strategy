/**
 * Typography System
 *
 * Semantic typography class combinations for consistent text styling.
 * Follows the pattern of button-variants.ts and badge-variants.ts.
 */

/**
 * LIFF typography optimized for mobile screens.
 * Uses smaller sizes appropriate for LINE in-app browser.
 */
export const liffTypography = {
  /** Page title: prominent but not overwhelming */
  pageTitle: "text-lg font-semibold",

  /** Section title: distinguishes content blocks */
  sectionTitle: "text-base font-medium",

  /** Card title: compact header within cards */
  cardTitle: "text-sm font-medium",

  /** Body text: primary readable content */
  body: "text-sm",

  /** Caption: secondary/helper text */
  caption: "text-xs text-muted-foreground",

  /** Large metric value: KPI display */
  metric: "text-2xl font-bold tabular-nums",

  /** Small metric value: compact KPI */
  metricSmall: "text-lg font-semibold tabular-nums",

  /** Metric label: describes the metric */
  metricLabel: "text-xs text-muted-foreground",

  /** Button text: action labels */
  button: "text-sm font-medium",

  /** Badge text: status indicators */
  badge: "text-xs font-medium",
} as const;

/**
 * Desktop typography for main application.
 * Uses larger sizes for desktop screens.
 */
export const desktopTypography = {
  /** Page title: main heading */
  pageTitle: "text-2xl font-semibold tracking-tight",

  /** Section title: content block headers */
  sectionTitle: "text-lg font-semibold",

  /** Card title: card headers */
  cardTitle: "text-base font-medium",

  /** Body text: primary content */
  body: "text-sm",

  /** Caption: secondary text */
  caption: "text-sm text-muted-foreground",

  /** Large metric: dashboard KPIs */
  metric: "text-3xl font-bold tabular-nums",

  /** Small metric: inline stats */
  metricSmall: "text-xl font-semibold tabular-nums",

  /** Metric label: KPI descriptions */
  metricLabel: "text-sm text-muted-foreground",
} as const;

/**
 * Shared typography utilities.
 */
export const typography = {
  /** Truncate text with ellipsis */
  truncate: "truncate",

  /** Prevent text wrapping */
  nowrap: "whitespace-nowrap",

  /** Center text */
  center: "text-center",

  /** Muted text color */
  muted: "text-muted-foreground",

  /** Success text color */
  success: "text-green-600 dark:text-green-400",

  /** Danger text color */
  danger: "text-red-600 dark:text-red-400",

  /** Warning text color */
  warning: "text-amber-600 dark:text-amber-400",
} as const;

export type LiffTypographyKey = keyof typeof liffTypography;
export type DesktopTypographyKey = keyof typeof desktopTypography;
