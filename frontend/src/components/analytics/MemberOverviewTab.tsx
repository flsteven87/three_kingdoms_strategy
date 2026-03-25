/**
 * MemberOverviewTab - Overview tab for individual member performance
 *
 * Shows:
 * - 4 summary metric cards (contribution, merit, power, donation)
 * - Dual-axis contribution/merit line chart
 * - 5-dimension radar chart (member vs alliance avg vs median)
 * - ViewMode toggle (latest period vs season average)
 */
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ChartContainer, ChartTooltip } from "@/components/ui/chart";
import {
  ViewModeToggle,
  type ViewMode,
} from "@/components/analytics/ViewModeToggle";
import { TrendingUp, TrendingDown } from "lucide-react";
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Line,
  LineChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
} from "recharts";
import type { MemberTrendItem, SeasonSummaryResponse } from "@/types/analytics";
import type {
  AllianceAverage,
  AllianceMedian,
  DailyDataPoint,
} from "@/types/member-performance";
import {
  formatNumber,
  formatNumberCompact,
  calculatePercentDiff,
  formatDateLabel,
} from "@/lib/chart-utils";
import { memberChartConfigs, MEDIAN_LINE_COLOR } from "@/lib/chart-configs";

export interface MemberOverviewTabProps {
  readonly periodData: readonly MemberTrendItem[];
  readonly dailyChartData: DailyDataPoint[];
  readonly xAxisTicks: string[];
  readonly totalDonation: number;
  readonly seasonSummary: SeasonSummaryResponse;
  readonly allianceAvg: AllianceAverage;
  readonly allianceMedian: AllianceMedian;
  readonly memberName: string;
  readonly viewMode: ViewMode;
  readonly onViewModeChange: (mode: ViewMode) => void;
}

export function MemberOverviewTab({
  periodData,
  dailyChartData,
  xAxisTicks,
  totalDonation,
  seasonSummary,
  allianceAvg,
  allianceMedian,
  memberName,
  viewMode,
  onViewModeChange,
}: MemberOverviewTabProps) {
  const latestPeriod = periodData[periodData.length - 1];

  // Calculate values based on viewMode
  const contributionValue =
    viewMode === "latest"
      ? latestPeriod.daily_contribution
      : seasonSummary.avg_daily_contribution;
  const meritValue =
    viewMode === "latest"
      ? latestPeriod.daily_merit
      : seasonSummary.avg_daily_merit;
  // Card shows avg_power for season mode; radar uses current_power (intentionally different)
  const powerValue =
    viewMode === "latest" ? latestPeriod.end_power : seasonSummary.avg_power;
  const donationValue =
    viewMode === "latest"
      ? latestPeriod.daily_donation
      : seasonSummary.avg_daily_donation;

  // Radar-specific: power uses current_power in season mode (not avg_power)
  const radarPowerValue =
    viewMode === "latest" ? latestPeriod.end_power : seasonSummary.current_power;
  const assistValue =
    viewMode === "latest"
      ? latestPeriod.daily_assist
      : seasonSummary.avg_daily_assist;

  const powerChange = seasonSummary.total_power_change;
  const contributionDiff = calculatePercentDiff(
    contributionValue,
    allianceAvg.daily_contribution,
  );
  const meritDiff = calculatePercentDiff(meritValue, allianceAvg.daily_merit);
  const powerDiff = calculatePercentDiff(powerValue, allianceAvg.power);
  const donationDiff = calculatePercentDiff(
    donationValue,
    allianceAvg.daily_donation,
  );

  // Radar chart data - normalized as percentage of alliance average (100 = alliance avg)
  const normalize = (value: number, avg: number) =>
    avg > 0 ? Math.round((value / avg) * 100) : 0;

  const radarData = [
    {
      metric: "貢獻",
      member: normalize(contributionValue, allianceAvg.daily_contribution),
      memberRaw: contributionValue,
      alliance: 100,
      allianceRaw: allianceAvg.daily_contribution,
      median: normalize(
        allianceMedian.daily_contribution,
        allianceAvg.daily_contribution,
      ),
      medianRaw: allianceMedian.daily_contribution,
    },
    {
      metric: "戰功",
      member: normalize(meritValue, allianceAvg.daily_merit),
      memberRaw: meritValue,
      alliance: 100,
      allianceRaw: allianceAvg.daily_merit,
      median: normalize(allianceMedian.daily_merit, allianceAvg.daily_merit),
      medianRaw: allianceMedian.daily_merit,
    },
    {
      metric: "勢力值",
      member: normalize(radarPowerValue, allianceAvg.power),
      memberRaw: radarPowerValue,
      alliance: 100,
      allianceRaw: allianceAvg.power,
      median: normalize(allianceMedian.power, allianceAvg.power),
      medianRaw: allianceMedian.power,
    },
    {
      metric: "助攻",
      member: normalize(assistValue, allianceAvg.daily_assist),
      memberRaw: assistValue,
      alliance: 100,
      allianceRaw: allianceAvg.daily_assist,
      median: normalize(
        allianceMedian.daily_assist,
        allianceAvg.daily_assist,
      ),
      medianRaw: allianceMedian.daily_assist,
    },
    {
      metric: "捐獻",
      member: normalize(donationValue, allianceAvg.daily_donation),
      memberRaw: donationValue,
      alliance: 100,
      allianceRaw: allianceAvg.daily_donation,
      median: normalize(
        allianceMedian.daily_donation,
        allianceAvg.daily_donation,
      ),
      medianRaw: allianceMedian.daily_donation,
    },
  ];

  return (
    <div className="space-y-6">
      {/* View Mode Toggle */}
      <div className="flex items-center justify-end">
        <ViewModeToggle
          value={viewMode}
          onChange={onViewModeChange}
          className="w-auto"
        />
      </div>

      {/* Current Status Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Daily Contribution */}
        <Card className="border-primary/50">
          <CardHeader className="pb-2">
            <CardDescription>
              {viewMode === "latest" ? "最新日均貢獻" : "賽季日均貢獻"}
            </CardDescription>
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

        {/* Daily Merit */}
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>
              {viewMode === "latest" ? "最新日均戰功" : "賽季日均戰功"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">
              {formatNumber(meritValue)}
            </div>
            <div className="flex items-center gap-1 mt-1">
              {meritDiff >= 0 ? (
                <TrendingUp className="h-3 w-3 text-primary" />
              ) : (
                <TrendingDown className="h-3 w-3 text-destructive" />
              )}
              <span
                className={`text-xs ${meritDiff >= 0 ? "text-primary" : "text-destructive"}`}
              >
                {meritDiff >= 0 ? "+" : ""}
                {meritDiff.toFixed(1)}% vs 盟均
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Power */}
        <Card className="border-primary/50">
          <CardHeader className="pb-2">
            <CardDescription>
              {viewMode === "latest" ? "當前勢力值" : "賽季平均勢力值"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold tabular-nums">
                {formatNumber(powerValue)}
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

        {/* Donation */}
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>
              {viewMode === "latest" ? "最新日均捐獻" : "賽季日均捐獻"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold tabular-nums">
                {formatNumber(donationValue)}
              </span>
              <span className="text-muted-foreground text-sm">/日</span>
            </div>
            <div className="flex items-center gap-3 mt-2">
              <span className="text-xs text-muted-foreground">
                賽季總計: {formatNumber(totalDonation)}
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
      </div>

      {/* Charts Row */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Contribution & Merit Dual Axis Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">貢獻與戰功趨勢</CardTitle>
            <CardDescription>
              日均貢獻（左軸）與日均戰功（右軸）
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer
              config={memberChartConfigs.contributionMerit}
              className="h-[280px] w-full"
            >
              <LineChart
                data={dailyChartData}
                margin={{ left: 12, right: 12, top: 12 }}
              >
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
                {/* Left Y Axis: Contribution */}
                <YAxis
                  yAxisId="left"
                  orientation="left"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  className="text-xs"
                  tickFormatter={(value) => formatNumberCompact(value)}
                />
                {/* Right Y Axis: Merit */}
                <YAxis
                  yAxisId="right"
                  orientation="right"
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
                        <div className="text-sm text-primary">
                          日均戰功: {formatNumber(data.dailyMerit)}
                        </div>
                      </div>
                    );
                  }}
                />
                <Legend wrapperStyle={{ fontSize: "12px" }} />
                <Line
                  yAxisId="left"
                  type="stepAfter"
                  dataKey="dailyContribution"
                  name="日均貢獻"
                  stroke="var(--chart-4)"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 5, fill: "var(--chart-4)" }}
                />
                <Line
                  yAxisId="right"
                  type="stepAfter"
                  dataKey="dailyMerit"
                  name="日均戰功"
                  stroke="var(--primary)"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 5, fill: "var(--primary)" }}
                />
              </LineChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Radar Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">五維能力圖</CardTitle>
            <CardDescription>
              成員日均表現 vs 同盟平均/中位數（100% = 同盟平均）
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ChartContainer
              config={memberChartConfigs.radar}
              className="mx-auto aspect-square max-h-[280px]"
            >
              <RadarChart data={radarData}>
                <PolarGrid gridType="polygon" />
                <PolarAngleAxis
                  dataKey="metric"
                  className="text-xs"
                  tick={{ fill: "var(--foreground)", fontSize: 12 }}
                />
                <PolarRadiusAxis
                  angle={90}
                  domain={[
                    0,
                    Math.max(
                      150,
                      ...radarData.map((d) => Math.max(d.member, d.median)),
                    ),
                  ]}
                  tick={{ fontSize: 10 }}
                  tickFormatter={(value) => `${value}%`}
                />
                <Radar
                  name="同盟平均"
                  dataKey="alliance"
                  stroke="var(--muted-foreground)"
                  fill="var(--muted-foreground)"
                  fillOpacity={0.1}
                  strokeWidth={1}
                  strokeDasharray="4 4"
                />
                <Radar
                  name="同盟中位數"
                  dataKey="median"
                  stroke={MEDIAN_LINE_COLOR}
                  fill={MEDIAN_LINE_COLOR}
                  fillOpacity={0.08}
                  strokeWidth={1}
                  strokeDasharray="2 2"
                />
                <Radar
                  name={memberName}
                  dataKey="member"
                  stroke="var(--primary)"
                  fill="var(--primary)"
                  fillOpacity={0.4}
                  strokeWidth={2}
                />
                <ChartTooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const data = payload[0].payload as {
                      metric: string;
                      member: number;
                      memberRaw: number;
                      alliance: number;
                      allianceRaw: number;
                      median: number;
                      medianRaw: number;
                    };
                    return (
                      <div className="rounded-lg border bg-background p-2 shadow-sm">
                        <div className="font-medium mb-1">{data.metric}</div>
                        <div className="text-sm">
                          {memberName}：{formatNumberCompact(data.memberRaw)} (
                          {data.member}%)
                        </div>
                        <div className="text-sm text-muted-foreground">
                          同盟平均：{formatNumberCompact(data.allianceRaw)} (
                          {data.alliance}%)
                        </div>
                        <div
                          className="text-sm"
                          style={{ color: MEDIAN_LINE_COLOR }}
                        >
                          同盟中位數：{formatNumberCompact(data.medianRaw)} (
                          {data.median}%)
                        </div>
                      </div>
                    );
                  }}
                />
                <Legend />
              </RadarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
