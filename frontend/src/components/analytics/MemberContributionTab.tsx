/**
 * MemberContributionTab - Contribution performance tab
 *
 * Shows:
 * - 4 summary cards (rank, daily contribution, season total, alliance avg)
 * - Contribution trend chart with alliance comparison
 */
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ChartContainer, ChartTooltip } from "@/components/ui/chart";
import { RankChangeIndicator } from "@/components/analytics/RankChangeIndicator";
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

export interface MemberContributionTabProps {
  readonly periodData: readonly MemberTrendItem[];
  readonly dailyChartData: DailyDataPoint[];
  readonly xAxisTicks: string[];
  readonly seasonSummary: SeasonSummaryResponse;
  readonly allianceAvg: AllianceAverage;
  readonly totalMembers: number;
}

export function MemberContributionTab({
  periodData,
  dailyChartData,
  xAxisTicks,
  seasonSummary,
  allianceAvg,
  totalMembers,
}: MemberContributionTabProps) {
  const latestPeriod = periodData[periodData.length - 1];

  // Calculate values and diffs
  const contributionValue = latestPeriod.daily_contribution;
  const contributionDiff = calculatePercentDiff(
    contributionValue,
    allianceAvg.daily_contribution,
  );
  const totalContribution = seasonSummary.total_contribution;
  const avgDailyContribution = seasonSummary.avg_daily_contribution;

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Contribution Rank */}
        <Card className="border-primary/50">
          <CardHeader className="pb-2">
            <CardDescription>貢獻排名</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold tabular-nums">
                #{latestPeriod.end_rank}
              </span>
              <span className="text-sm text-muted-foreground">
                / {totalMembers}
              </span>
            </div>
            <div className="flex items-center gap-1 mt-1">
              <RankChangeIndicator
                change={latestPeriod.rank_change}
                size="sm"
              />
              <span className="text-xs text-muted-foreground">本期</span>
            </div>
          </CardContent>
        </Card>

        {/* Daily Contribution */}
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>最新日均貢獻</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">
              {formatNumber(contributionValue)}
            </div>
            <div className="flex items-center gap-1 mt-1">
              {contributionDiff >= 0 ? (
                <TrendingUp className="h-3 w-3 text-primary" />
              ) : (
                <TrendingDown className="h-3 w-3 text-destructive" />
              )}
              <span
                className={`text-xs ${contributionDiff >= 0 ? "text-primary" : "text-destructive"}`}
              >
                {contributionDiff >= 0 ? "+" : ""}
                {contributionDiff.toFixed(1)}% vs 盟均
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Season Total Contribution */}
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>賽季總貢獻</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">
              {formatNumber(totalContribution)}
            </div>
            <span className="text-xs text-muted-foreground">
              日均: {formatNumber(avgDailyContribution)}/日
            </span>
          </CardContent>
        </Card>

        {/* Alliance Average */}
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>同盟日均</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums text-muted-foreground">
              {formatNumber(allianceAvg.daily_contribution)}
            </div>
            <span className="text-xs text-muted-foreground">全盟平均</span>
          </CardContent>
        </Card>
      </div>

      {/* Contribution Trend Chart */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm">貢獻趨勢</CardTitle>
          <CardDescription>日均貢獻與同盟對比</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <ChartContainer
            config={memberChartConfigs.contribution}
            className="h-[280px] w-full"
          >
            <LineChart data={dailyChartData} margin={{ left: 12, right: 12 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
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
                tickMargin={8}
                className="text-xs"
                tickFormatter={(value) => formatNumberCompact(value)}
              />
              <ChartTooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const data = payload[0].payload as DailyDataPoint;
                  return (
                    <div className="rounded-lg border bg-background p-2 shadow-sm">
                      <div className="font-medium">{data.dateLabel}</div>
                      <div className="text-xs text-muted-foreground mb-1">
                        Period {data.periodNumber}
                      </div>
                      <div
                        className="text-sm"
                        style={{ color: "var(--chart-4)" }}
                      >
                        日均貢獻: {formatNumber(data.dailyContribution)}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        同盟平均: {formatNumber(data.allianceAvgContribution)}
                      </div>
                      <div
                        className="text-sm"
                        style={{ color: MEDIAN_LINE_COLOR }}
                      >
                        同盟中位數:{" "}
                        {formatNumber(data.allianceMedianContribution)}
                      </div>
                    </div>
                  );
                }}
              />
              <Legend wrapperStyle={{ fontSize: "12px" }} />
              <Line
                type="stepAfter"
                dataKey="dailyContribution"
                name="日均貢獻"
                stroke="var(--chart-4)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 5, fill: "var(--chart-4)" }}
              />
              <Line
                type="stepAfter"
                dataKey="allianceAvgContribution"
                name="同盟平均"
                stroke="var(--muted-foreground)"
                strokeWidth={1}
                strokeDasharray="5 5"
                dot={false}
              />
              <Line
                type="stepAfter"
                dataKey="allianceMedianContribution"
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
  );
}
