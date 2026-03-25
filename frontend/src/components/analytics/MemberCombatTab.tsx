/**
 * MemberCombatTab - Combat performance tab (Merit & Assist)
 *
 * Shows:
 * - Left column: Merit summary card + trend chart + detail table
 * - Right column: Assist summary card + trend chart + detail table
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
import type { ViewMode } from "@/components/analytics/ViewModeToggle";
import {
  formatNumber,
  formatNumberCompact,
  calculatePercentDiff,
  formatDateLabel,
  getDiffClassName,
} from "@/lib/chart-utils";
import { memberChartConfigs, MEDIAN_LINE_COLOR } from "@/lib/chart-configs";

type MetricType = "merit" | "assist";

interface MetricDetailTableProps {
  readonly title: string;
  readonly metricType: MetricType;
  readonly periodData: readonly MemberTrendItem[];
}

function MetricDetailTable({
  title,
  metricType,
  periodData,
}: MetricDetailTableProps) {
  const getMetricValue = (d: MemberTrendItem) =>
    metricType === "merit" ? d.daily_merit : d.daily_assist;
  const getAvgValue = (d: MemberTrendItem) =>
    metricType === "merit" ? d.alliance_avg_merit : d.alliance_avg_assist;
  const getMedianValue = (d: MemberTrendItem) =>
    metricType === "merit" ? d.alliance_median_merit : d.alliance_median_assist;
  const metricLabel = metricType === "merit" ? "戰功" : "助攻";

  return (
    <Card>
      <CardHeader className="py-3">
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-1.5 px-2 font-medium text-xs">
                  日期
                </th>
                <th className="text-right py-1.5 px-2 font-medium text-xs">
                  日均{metricLabel}
                </th>
                <th className="text-right py-1.5 px-2 font-medium text-xs">
                  同盟平均
                </th>
                <th className="text-right py-1.5 px-2 font-medium text-xs">
                  同盟中位數
                </th>
              </tr>
            </thead>
            <tbody>
              {periodData.map((d, index) => {
                const value = getMetricValue(d);
                const prev =
                  index > 0 ? getMetricValue(periodData[index - 1]) : null;
                const delta = prev !== null ? value - prev : null;
                const diffAvg = value - getAvgValue(d);
                const diffMedian = value - getMedianValue(d);

                return (
                  <tr key={d.period_number} className="border-b last:border-0">
                    <td className="py-1.5 px-2 text-xs text-muted-foreground">
                      {d.period_label}
                    </td>
                    <td className="py-1.5 px-2 text-right text-xs tabular-nums">
                      {formatNumber(value)}
                      {delta !== null && (
                        <span className={`ml-1 ${getDiffClassName(delta)}`}>
                          ({delta >= 0 ? "+" : ""}
                          {formatNumberCompact(delta)})
                        </span>
                      )}
                    </td>
                    <td className="py-1.5 px-2 text-right text-xs tabular-nums text-muted-foreground">
                      {formatNumber(getAvgValue(d))}
                      <span className={`ml-1 ${getDiffClassName(diffAvg)}`}>
                        ({diffAvg >= 0 ? "+" : ""}
                        {formatNumberCompact(diffAvg)})
                      </span>
                    </td>
                    <td className="py-1.5 px-2 text-right text-xs tabular-nums text-muted-foreground">
                      {formatNumber(getMedianValue(d))}
                      <span className={`ml-1 ${getDiffClassName(diffMedian)}`}>
                        ({diffMedian >= 0 ? "+" : ""}
                        {formatNumberCompact(diffMedian)})
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

export interface MemberCombatTabProps {
  readonly periodData: readonly MemberTrendItem[];
  readonly dailyChartData: DailyDataPoint[];
  readonly xAxisTicks: string[];
  readonly seasonSummary: SeasonSummaryResponse;
  readonly allianceAvg: AllianceAverage;
  readonly viewMode: ViewMode;
}

export function MemberCombatTab({
  periodData,
  dailyChartData,
  xAxisTicks,
  seasonSummary,
  allianceAvg,
  viewMode,
}: MemberCombatTabProps) {
  const latestPeriod = periodData[periodData.length - 1];

  // Get values based on view mode
  const meritValue =
    viewMode === "latest"
      ? latestPeriod.daily_merit
      : seasonSummary.avg_daily_merit;
  const assistValue =
    viewMode === "latest"
      ? latestPeriod.daily_assist
      : seasonSummary.avg_daily_assist;
  const meritDiff = calculatePercentDiff(meritValue, allianceAvg.daily_merit);
  const assistDiff = calculatePercentDiff(
    assistValue,
    allianceAvg.daily_assist,
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Left Column: Merit */}
        <div className="space-y-4">
          <Card className="border-primary/50">
            <CardHeader className="pb-2">
              <CardDescription>日均戰功</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold tabular-nums">
                  {formatNumber(meritValue)}
                </span>
                <span className="text-muted-foreground text-sm">/日</span>
              </div>
              <div className="flex items-center gap-3 mt-2">
                <div className="flex items-center gap-1">
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
                <span className="text-xs text-muted-foreground">
                  盟均: {formatNumber(allianceAvg.daily_merit)}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">戰功趨勢</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <ChartContainer
                config={memberChartConfigs.merit}
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
                    width={45}
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
                            日均戰功: {formatNumber(data.dailyMerit)}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            同盟平均: {formatNumber(data.allianceAvgMerit)}
                          </div>
                          <div
                            className="text-sm"
                            style={{ color: MEDIAN_LINE_COLOR }}
                          >
                            同盟中位數: {formatNumber(data.allianceMedianMerit)}
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: "12px" }} />
                  <Line
                    type="stepAfter"
                    dataKey="dailyMerit"
                    name="日均戰功"
                    stroke="var(--primary)"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                  <Line
                    type="stepAfter"
                    dataKey="allianceAvgMerit"
                    name="同盟平均"
                    stroke="var(--muted-foreground)"
                    strokeWidth={1}
                    strokeDasharray="5 5"
                    dot={false}
                  />
                  <Line
                    type="stepAfter"
                    dataKey="allianceMedianMerit"
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

          <MetricDetailTable
            title="戰功明細"
            metricType="merit"
            periodData={periodData}
          />
        </div>

        {/* Right Column: Assist */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>日均助攻</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold tabular-nums">
                  {formatNumber(assistValue)}
                </span>
                <span className="text-muted-foreground text-sm">/日</span>
              </div>
              <div className="flex items-center gap-3 mt-2">
                <div className="flex items-center gap-1">
                  {assistDiff >= 0 ? (
                    <TrendingUp className="h-3 w-3 text-primary" />
                  ) : (
                    <TrendingDown className="h-3 w-3 text-destructive" />
                  )}
                  <span
                    className={`text-xs ${assistDiff >= 0 ? "text-primary" : "text-destructive"}`}
                  >
                    {assistDiff >= 0 ? "+" : ""}
                    {assistDiff.toFixed(1)}% vs 盟均
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">
                  盟均: {formatNumber(allianceAvg.daily_assist)}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">助攻趨勢</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <ChartContainer
                config={memberChartConfigs.assist}
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
                    width={45}
                  />
                  <ChartTooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const data = payload[0].payload as DailyDataPoint;
                      return (
                        <div className="rounded-lg border bg-background p-2 shadow-sm">
                          <div className="font-medium">{data.dateLabel}</div>
                          <div className="text-sm">
                            日均助攻: {formatNumber(data.dailyAssist)}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            同盟平均: {formatNumber(data.allianceAvgAssist)}
                          </div>
                          <div
                            className="text-sm"
                            style={{ color: MEDIAN_LINE_COLOR }}
                          >
                            同盟中位數:{" "}
                            {formatNumber(data.allianceMedianAssist)}
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: "12px" }} />
                  <Line
                    type="stepAfter"
                    dataKey="dailyAssist"
                    name="日均助攻"
                    stroke="var(--chart-2)"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                  <Line
                    type="stepAfter"
                    dataKey="allianceAvgAssist"
                    name="同盟平均"
                    stroke="var(--muted-foreground)"
                    strokeWidth={1}
                    strokeDasharray="5 5"
                    dot={false}
                  />
                  <Line
                    type="stepAfter"
                    dataKey="allianceMedianAssist"
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

          <MetricDetailTable
            title="助攻明細"
            metricType="assist"
            periodData={periodData}
          />
        </div>
      </div>
    </div>
  );
}
