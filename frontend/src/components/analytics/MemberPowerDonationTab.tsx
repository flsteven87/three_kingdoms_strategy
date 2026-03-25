/**
 * MemberPowerDonationTab - Power & Donation performance tab
 *
 * Shows:
 * - Left column: Power summary card + power trend chart
 * - Right column: Donation summary card + donation trend chart
 */
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ChartContainer, ChartTooltip } from "@/components/ui/chart";
import { TrendingUp, TrendingDown } from "lucide-react";
import { Line, LineChart, XAxis, YAxis, CartesianGrid, Legend } from "recharts";
import type { MemberTrendItem, SeasonSummaryResponse } from "@/types/analytics";
import type { AllianceAverage, DailyDataPoint } from "@/types/member-performance";
import {
  formatNumber,
  formatNumberCompact,
  calculatePercentDiff,
  formatDateLabel,
} from "@/lib/chart-utils";
import { memberChartConfigs, MEDIAN_LINE_COLOR } from "@/lib/chart-configs";

export interface MemberPowerDonationTabProps {
  readonly dailyChartData: DailyDataPoint[];
  readonly xAxisTicks: string[];
  readonly totalDonation: number;
  readonly periodData: readonly MemberTrendItem[];
  readonly seasonSummary: SeasonSummaryResponse;
  readonly allianceAvg: AllianceAverage;
}

export function MemberPowerDonationTab({
  dailyChartData,
  xAxisTicks,
  totalDonation,
  periodData,
  seasonSummary,
  allianceAvg,
}: MemberPowerDonationTabProps) {
  const latestPeriod = periodData[periodData.length - 1];
  const powerChange = seasonSummary.total_power_change;
  const powerDiff = calculatePercentDiff(
    latestPeriod.end_power,
    allianceAvg.power,
  );
  const donationDiff = calculatePercentDiff(
    seasonSummary.avg_daily_donation,
    allianceAvg.daily_donation,
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Left Column: Power */}
        <div className="space-y-4">
          <Card className="border-primary/50">
            <CardHeader className="pb-2">
              <CardDescription>當前勢力值</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold tabular-nums">
                  {formatNumber(latestPeriod.end_power)}
                </span>
              </div>
              <div className="flex items-center gap-3 mt-2">
                <div className="flex items-center gap-1">
                  {powerChange >= 0 ? (
                    <TrendingUp className="h-3 w-3 text-primary" />
                  ) : (
                    <TrendingDown className="h-3 w-3 text-destructive" />
                  )}
                  <span
                    className={`text-xs ${powerChange >= 0 ? "text-primary" : "text-destructive"}`}
                  >
                    {powerChange >= 0 ? "+" : ""}
                    {formatNumber(powerChange)} 賽季
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  {powerDiff >= 0 ? (
                    <TrendingUp className="h-3 w-3 text-primary" />
                  ) : (
                    <TrendingDown className="h-3 w-3 text-destructive" />
                  )}
                  <span
                    className={`text-xs ${powerDiff >= 0 ? "text-primary" : "text-destructive"}`}
                  >
                    {powerDiff >= 0 ? "+" : ""}
                    {powerDiff.toFixed(1)}% vs 盟均
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">勢力值趨勢</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <ChartContainer
                config={memberChartConfigs.power}
                className="h-[200px] w-full"
              >
                <LineChart data={dailyChartData} margin={{ left: 8, right: 8 }}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    className="stroke-muted"
                  />
                  <XAxis
                    dataKey="date"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    className="text-xs"
                    ticks={xAxisTicks}
                    tickFormatter={formatDateLabel}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tickMargin={4}
                    className="text-xs"
                    width={50}
                    tickFormatter={(value) => formatNumberCompact(value)}
                  />
                  <ChartTooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const data = payload[0].payload as DailyDataPoint;
                      return (
                        <div className="rounded-lg border bg-background p-2 shadow-sm">
                          <div className="font-medium">{data.dateLabel}</div>
                          <div className="text-sm">
                            勢力值: {formatNumber(data.endPower)}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            同盟平均: {formatNumber(data.allianceAvgPower)}
                          </div>
                          <div
                            className="text-sm"
                            style={{ color: MEDIAN_LINE_COLOR }}
                          >
                            同盟中位數: {formatNumber(data.allianceMedianPower)}
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: "12px" }} />
                  <Line
                    type="stepAfter"
                    dataKey="endPower"
                    name="勢力值"
                    stroke="var(--primary)"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                  <Line
                    type="stepAfter"
                    dataKey="allianceAvgPower"
                    name="同盟平均"
                    stroke="var(--muted-foreground)"
                    strokeWidth={1}
                    strokeDasharray="5 5"
                    dot={false}
                  />
                  <Line
                    type="stepAfter"
                    dataKey="allianceMedianPower"
                    name="同盟中位數"
                    stroke={MEDIAN_LINE_COLOR}
                    strokeWidth={1}
                    strokeDasharray="2 2"
                    dot={false}
                  />
                </LineChart>
              </ChartContainer>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Donation */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>賽季總捐獻</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold tabular-nums">
                  {formatNumber(totalDonation)}
                </span>
              </div>
              <div className="flex items-center gap-3 mt-2">
                <span className="text-xs text-muted-foreground">
                  日均: {formatNumber(seasonSummary.avg_daily_donation)}/日
                </span>
                <div className="flex items-center gap-1">
                  {donationDiff >= 0 ? (
                    <TrendingUp className="h-3 w-3 text-primary" />
                  ) : (
                    <TrendingDown className="h-3 w-3 text-destructive" />
                  )}
                  <span
                    className={`text-xs ${donationDiff >= 0 ? "text-primary" : "text-destructive"}`}
                  >
                    {donationDiff >= 0 ? "+" : ""}
                    {donationDiff.toFixed(1)}% vs 盟均
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">捐獻趨勢</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <ChartContainer
                config={memberChartConfigs.donation}
                className="h-[200px] w-full"
              >
                <LineChart data={dailyChartData} margin={{ left: 8, right: 8 }}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    className="stroke-muted"
                  />
                  <XAxis
                    dataKey="date"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    className="text-xs"
                    ticks={xAxisTicks}
                    tickFormatter={formatDateLabel}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tickMargin={4}
                    className="text-xs"
                    width={50}
                    tickFormatter={(value) => formatNumberCompact(value)}
                  />
                  <ChartTooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const data = payload[0].payload as DailyDataPoint;
                      return (
                        <div className="rounded-lg border bg-background p-2 shadow-sm">
                          <div className="font-medium">{data.dateLabel}</div>
                          <div className="text-sm">
                            日均捐獻: {formatNumber(data.dailyDonation)}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            同盟平均: {formatNumber(data.allianceAvgDonation)}
                          </div>
                          <div
                            className="text-sm"
                            style={{ color: MEDIAN_LINE_COLOR }}
                          >
                            同盟中位數:{" "}
                            {formatNumber(data.allianceMedianDonation)}
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: "12px" }} />
                  <Line
                    type="stepAfter"
                    dataKey="dailyDonation"
                    name="日均捐獻"
                    stroke="var(--chart-3)"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                  <Line
                    type="stepAfter"
                    dataKey="allianceAvgDonation"
                    name="同盟平均"
                    stroke="var(--muted-foreground)"
                    strokeWidth={1}
                    strokeDasharray="5 5"
                    dot={false}
                  />
                  <Line
                    type="stepAfter"
                    dataKey="allianceMedianDonation"
                    name="同盟中位數"
                    stroke={MEDIAN_LINE_COLOR}
                    strokeWidth={1}
                    strokeDasharray="2 2"
                    dot={false}
                  />
                </LineChart>
              </ChartContainer>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
