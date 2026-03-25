/**
 * Shared helper functions for Member Performance tab components.
 */
import type { MemberTrendItem } from "@/types/analytics";
import type { DailyDataPoint } from "@/types/member-performance";
import { expandPeriodsToDaily } from "@/lib/chart-utils";

// Re-export getDiffClassName from shared location for convenience
export { getDiffClassName } from "@/lib/chart-utils";

/**
 * Create daily chart data from period data.
 * Expands period data to daily data points for date-based X axis.
 */
export function createDailyChartData(
  periodData: readonly MemberTrendItem[],
): DailyDataPoint[] {
  return expandPeriodsToDaily(periodData, (p) => ({
    dailyContribution: p.daily_contribution,
    dailyMerit: p.daily_merit,
    dailyAssist: p.daily_assist,
    dailyDonation: p.daily_donation,
    endRank: p.end_rank,
    endPower: p.end_power,
    allianceAvgContribution: p.alliance_avg_contribution,
    allianceAvgMerit: p.alliance_avg_merit,
    allianceAvgAssist: p.alliance_avg_assist,
    allianceAvgDonation: p.alliance_avg_donation,
    allianceAvgPower: p.alliance_avg_power,
    allianceMedianContribution: p.alliance_median_contribution,
    allianceMedianMerit: p.alliance_median_merit,
    allianceMedianAssist: p.alliance_median_assist,
    allianceMedianDonation: p.alliance_median_donation,
    allianceMedianPower: p.alliance_median_power,
  }));
}
