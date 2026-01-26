/**
 * Date utilities for consistent timezone handling
 *
 * Core principle:
 * - Store all timestamps in UTC (database)
 * - Display all dates/times in Asia/Taipei (UTC+8) for game consistency
 * - CSV filenames contain game server time (UTC+8)
 *
 * This ensures users always see dates in the game's timezone regardless of
 * their browser's local timezone setting.
 */

/** Game server timezone (Taiwan/China servers use UTC+8) */
export const GAME_TIMEZONE = 'Asia/Taipei'

/**
 * Format UTC ISO string to Taiwan date display (YYYY/MM/DD)
 *
 * @param isoString - ISO 8601 timestamp (e.g., "2025-10-09T02:13:09Z")
 * @param options - Formatting options
 * @returns Formatted date string in Taiwan timezone (e.g., "2025/10/9")
 */
export function formatDateTW(
  isoString: string | null | undefined,
  options: { padded?: boolean } = {}
): string {
  if (!isoString) return '-'

  const { padded = false } = options
  const date = new Date(isoString)
  return date.toLocaleDateString('zh-TW', {
    timeZone: GAME_TIMEZONE,
    year: 'numeric',
    month: padded ? '2-digit' : 'numeric',
    day: padded ? '2-digit' : 'numeric',
  })
}

/**
 * Format UTC ISO string to Taiwan time display (HH:mm)
 *
 * @param isoString - ISO 8601 timestamp
 * @returns Formatted time string in Taiwan timezone (e.g., "10:13")
 */
export function formatTimeTW(isoString: string | null | undefined): string {
  if (!isoString) return '-'

  const date = new Date(isoString)
  return date.toLocaleTimeString('zh-TW', {
    timeZone: GAME_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

/**
 * Format UTC ISO string to Taiwan full datetime display
 *
 * @param isoString - ISO 8601 timestamp
 * @returns Formatted datetime string (e.g., "2025/10/9 10:13")
 */
export function formatDateTimeTW(isoString: string | null | undefined): string {
  if (!isoString) return '-'

  return `${formatDateTW(isoString)} ${formatTimeTW(isoString)}`
}

/**
 * Parse CSV filename datetime (UTC+8) and return UTC Date object
 *
 * CSV filenames contain game server time in format: 同盟統計YYYY年MM月DD日HH时MM分SS秒.csv
 * This time is in UTC+8 (Taiwan/China timezone).
 *
 * @param filename - CSV filename with embedded datetime
 * @returns UTC Date object, or null if filename format is invalid
 */
export function parseCsvFilenameDate(filename: string): Date | null {
  const match = filename.match(
    /(\d{4})年(\d{2})月(\d{2})日(\d{2})时(\d{2})分(\d{2})秒/
  )
  if (!match) return null

  const [, year, month, day, hour, minute, second] = match

  // CSV datetime is in UTC+8, convert to UTC
  // Method: Create UTC time, then subtract 8 hours to get actual UTC
  const utcDate = new Date(
    Date.UTC(
      parseInt(year, 10),
      parseInt(month, 10) - 1, // JS months are 0-indexed
      parseInt(day, 10),
      parseInt(hour, 10) - 8, // Convert UTC+8 to UTC
      parseInt(minute, 10),
      parseInt(second, 10)
    )
  )

  return utcDate
}

/**
 * Check if a date (UTC) falls within a date range (date-only comparison in Taiwan timezone)
 *
 * @param targetDate - The date to check (Date object)
 * @param startDate - Range start date (YYYY-MM-DD string or Date)
 * @param endDate - Range end date (YYYY-MM-DD string, Date, or null for open-ended)
 * @returns true if targetDate is within the range (inclusive)
 */
export function isDateInRange(
  targetDate: Date,
  startDate: string | Date,
  endDate: string | Date | null
): boolean {
  // Get Taiwan timezone date strings for comparison
  const targetDateStr = targetDate.toLocaleDateString('en-CA', {
    timeZone: GAME_TIMEZONE,
  }) // YYYY-MM-DD format

  const startDateStr =
    typeof startDate === 'string'
      ? startDate
      : startDate.toLocaleDateString('en-CA', { timeZone: GAME_TIMEZONE })

  const endDateStr = endDate
    ? typeof endDate === 'string'
      ? endDate
      : endDate.toLocaleDateString('en-CA', { timeZone: GAME_TIMEZONE })
    : new Date().toLocaleDateString('en-CA', { timeZone: GAME_TIMEZONE })

  return targetDateStr >= startDateStr && targetDateStr <= endDateStr
}
