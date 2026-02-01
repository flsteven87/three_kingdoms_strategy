/**
 * GroupContributionDistributionTab - Group contribution distribution charts
 * - No manual memoization (React Compiler handles)
 */
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ChartContainer, ChartTooltip } from "@/components/ui/chart";
import { DetailedStripPlot } from "./BoxPlot";
import {
  Bar,
  BarChart,
  Line,
  LineChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
} from "recharts";
import {
  formatNumber,
  formatNumberCompact,
  expandPeriodsToDaily,
  getPeriodBoundaryTicks,
  formatDateLabel,
  calculateDistributionBins,
  type DistributionBin,
} from "@/lib/chart-utils";
import { groupChartConfigs } from "@/lib/chart-configs";
import type {
  GroupStats,
  GroupMember,
  GroupTrendItem,
} from "@/types/analytics";

interface GroupContributionDistributionTabProps {
  readonly groupStats: GroupStats;
  readonly members: readonly GroupMember[];
  readonly periodTrends: readonly GroupTrendItem[];
}

export function GroupContributionDistributionTab({
  groupStats,
  members,
  periodTrends,
}: GroupContributionDistributionTabProps) {
  // Expand periods to daily data for date-based X-axis
  const dailyData = expandPeriodsToDaily(periodTrends, (p) => ({
    avgRank: p.avg_rank,
    avgContribution: p.avg_contribution,
    avgMerit: p.avg_merit,
  }));
  const xAxisTicks = getPeriodBoundaryTicks(periodTrends);

  // Calculate dynamic contribution distribution bins using shared utility
  const contributionBins = calculateDistributionBins(
    members,
    (m) => m.daily_contribution,
  );

  // Prepare box plot stats and strip plot points
  const boxPlotStats = {
    min: groupStats.contribution_min,
    q1: groupStats.contribution_q1,
    median: groupStats.contribution_median,
    q3: groupStats.contribution_q3,
    max: groupStats.contribution_max,
  };

  const stripPlotPoints = members.map((m) => ({
    id: m.id,
    name: m.name,
    value: m.daily_contribution,
  }));

  return (
    <div className="space-y-6">
      {/* Detailed Strip Plot - member list with visual positions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">貢獻分佈概覽</CardTitle>
          <CardDescription>箱型圖統計 · 每位成員獨立一行顯示</CardDescription>
        </CardHeader>
        <CardContent>
          <DetailedStripPlot
            stats={boxPlotStats}
            points={stripPlotPoints}
            color="chart-3"
            sortOrder="desc"
          />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Contribution Distribution by Range */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">貢獻區間分佈</CardTitle>
            <CardDescription>成員日均貢獻區間人數分佈</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer
              config={groupChartConfigs.contributionDistribution}
              className="h-[220px] w-full"
            >
              <BarChart
                data={contributionBins}
                margin={{ left: 10, right: 10, bottom: 20 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  className="stroke-muted"
                  vertical={false}
                />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  className="text-xs"
                  angle={-30}
                  textAnchor="end"
                  height={50}
                  interval={0}
                />
                <YAxis tickLine={false} axisLine={false} className="text-xs" />
                <ChartTooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const data = payload[0].payload as DistributionBin;
                    return (
                      <div className="rounded-lg border bg-background p-2 shadow-sm">
                        <div className="font-medium">
                          日均貢獻: {data.label}
                        </div>
                        <div className="text-sm">
                          人數: {data.count} ({data.percentage}%)
                        </div>
                      </div>
                    );
                  }}
                />
                <Bar
                  dataKey="count"
                  fill="var(--chart-3)"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Contribution Trend */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">貢獻趨勢</CardTitle>
            <CardDescription>組別人日均貢獻變化</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer
              config={groupChartConfigs.contributionTrend}
              className="h-[220px] w-full"
            >
              <LineChart data={dailyData} margin={{ left: 12, right: 12 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  className="text-xs"
                  ticks={xAxisTicks}
                  tickFormatter={formatDateLabel}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  className="text-xs"
                  tickFormatter={(value) => formatNumberCompact(value)}
                />
                <ChartTooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const data = payload[0].payload as (typeof dailyData)[0];
                    return (
                      <div className="rounded-lg border bg-background p-2 shadow-sm">
                        <div className="font-medium">{data.dateLabel}</div>
                        <div className="text-sm">
                          人日均貢獻: {formatNumber(data.avgContribution)}
                        </div>
                      </div>
                    );
                  }}
                />
                <Legend wrapperStyle={{ fontSize: "12px" }} />
                <Line
                  type="stepAfter"
                  dataKey="avgContribution"
                  name="人日均貢獻"
                  stroke="var(--chart-3)"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
