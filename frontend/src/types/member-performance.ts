/**
 * Shared types for Member Performance analytics components.
 */

/** Alliance statistics — used for both averages and medians */
export interface AllianceStats {
  readonly daily_contribution: number;
  readonly daily_merit: number;
  readonly daily_assist: number;
  readonly daily_donation: number;
  readonly power: number;
}

/** Alliance average metrics — computed from trend data or season API */
export type AllianceAverage = AllianceStats;

/** Alliance median metrics — computed from trend data or season API */
export type AllianceMedian = AllianceStats;

/** Expanded daily data point for member performance charts */
export interface DailyDataPoint {
  readonly date: string;
  readonly dateLabel: string;
  readonly periodNumber: number;
  readonly dailyContribution: number;
  readonly dailyMerit: number;
  readonly dailyAssist: number;
  readonly dailyDonation: number;
  readonly endRank: number;
  readonly endPower: number;
  readonly allianceAvgContribution: number;
  readonly allianceAvgMerit: number;
  readonly allianceAvgAssist: number;
  readonly allianceAvgDonation: number;
  readonly allianceAvgPower: number;
  readonly allianceMedianContribution: number;
  readonly allianceMedianMerit: number;
  readonly allianceMedianAssist: number;
  readonly allianceMedianDonation: number;
  readonly allianceMedianPower: number;
}
