/**
 * Format Utilities
 *
 * Number and duration formatting functions aligned with LINE Bot output.
 * Provides consistent display across LIFF and main app.
 */

/**
 * Format large numbers with K/M suffixes.
 * Matches LINE Bot Flex Message format.
 *
 * Examples:
 * - 8500 -> "8,500"
 * - 85000 -> "85K"
 * - 1500000 -> "1.5M"
 */
export function formatNumber(value: number): string {
  if (value >= 1_000_000) {
    const millions = value / 1_000_000;
    return millions % 1 === 0 ? `${millions}M` : `${millions.toFixed(1)}M`;
  }
  if (value >= 10_000) {
    return `${Math.round(value / 1000)}K`;
  }
  return value.toLocaleString();
}

/**
 * Format score with Chinese unit suffix.
 * Used in LIFF for compact display.
 *
 * Examples:
 * - 8500 -> "8,500"
 * - 85000 -> "8.5萬"
 * - 80000 -> "8萬" (compact mode)
 *
 * @param value - The numeric score value
 * @param compact - If true, omit decimal when value is exact multiple of 萬
 */
export function formatScore(value: number, compact = false): string {
  if (value >= 10000) {
    const wan = value / 10000;
    if (compact && wan % 1 === 0) {
      return `${wan}萬`;
    }
    return `${wan.toFixed(1)}萬`;
  }
  return value.toLocaleString();
}

/**
 * Format duration in minutes to human readable string.
 * Matches LINE Bot Flex Message format.
 *
 * Examples:
 * - 45 -> "45分鐘"
 * - 90 -> "1小時30分"
 * - 120 -> "2小時"
 */
export function formatDuration(minutes: number): string {
  if (minutes < 60) {
    return `${minutes}分鐘`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) {
    return `${hours}小時`;
  }
  return `${hours}小時${mins}分`;
}

/**
 * Format percentage with optional decimal places.
 */
export function formatPercent(value: number, decimals = 0): string {
  return `${value.toFixed(decimals)}%`;
}

/**
 * Format event time from ISO string.
 * Output: "MM/DD HH:MM"
 */
export function formatEventTime(dateStr: string | null): string {
  if (!dateStr) return "";

  // Handle both UTC and timezone-aware strings
  const utcStr =
    dateStr.endsWith("Z") || dateStr.includes("+") ? dateStr : `${dateStr}Z`;
  const date = new Date(utcStr);

  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${month}/${day} ${hours}:${minutes}`;
}
