/**
 * MemberDistributionTab - Member distribution charts and rankings
 * - No manual memoization (React Compiler handles)
 */
import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChartContainer, ChartTooltip } from "@/components/ui/chart";
import { RankChangeIndicator } from "./RankChangeIndicator";
import type { ViewMode } from "./ViewModeToggle";
import type {
  AllianceAnalyticsResponse,
  PerformerItem,
  AttentionItem,
  DistributionBin,
} from "@/types/analytics";
import { AlertTriangle, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { Bar, BarChart, XAxis, YAxis, CartesianGrid } from "recharts";
import { formatNumber, formatNumberCompact } from "@/lib/chart-utils";
import { allianceChartConfigs } from "@/lib/chart-configs";

type SortField =
  | "rank"
  | "name"
  | "group"
  | "daily_contribution"
  | "daily_merit"
  | "merit_change"
  | "daily_assist"
  | "assist_change"
  | "rank_change";
type SortDirection = "asc" | "desc";

// Column definitions for sortable table header
const SORT_COLUMNS: Array<{
  field: SortField;
  label: string;
  align: "left" | "right";
  showOnlyLatest?: boolean;
}> = [
  { field: "rank", label: "排名", align: "left" },
  { field: "name", label: "成員", align: "left" },
  { field: "group", label: "組別", align: "left" },
  { field: "daily_contribution", label: "人日均貢獻", align: "right" },
  { field: "daily_merit", label: "人日均戰功", align: "right" },
  {
    field: "merit_change",
    label: "戰功變化",
    align: "right",
    showOnlyLatest: true,
  },
  { field: "daily_assist", label: "人日均助攻", align: "right" },
  {
    field: "assist_change",
    label: "助攻變化",
    align: "right",
    showOnlyLatest: true,
  },
  {
    field: "rank_change",
    label: "排名變化",
    align: "right",
    showOnlyLatest: true,
  },
];

interface MemberDistributionTabProps {
  readonly viewMode: ViewMode;
  readonly data: AllianceAnalyticsResponse;
}

export function MemberDistributionTab({
  viewMode,
  data,
}: MemberDistributionTabProps) {
  const [showTop, setShowTop] = useState(true);
  const [displayCount, setDisplayCount] = useState<string>("10");
  const [sortField, setSortField] = useState<SortField>("rank");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  const {
    summary,
    distributions,
    top_performers,
    bottom_performers,
    needs_attention,
  } = data;

  // Handle column header click for sorting
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      // Default: descending for numeric values, ascending for rank/name/group
      setSortDirection(
        ["rank", "name", "group"].includes(field) ? "asc" : "desc",
      );
    }
  };

  // Render sort icon based on current state
  const renderSortIcon = (field: SortField) => {
    if (sortField !== field)
      return <ArrowUpDown className="h-3 w-3 ml-1 opacity-50" />;
    return sortDirection === "asc" ? (
      <ArrowUp className="h-3 w-3 ml-1" />
    ) : (
      <ArrowDown className="h-3 w-3 ml-1" />
    );
  };

  // Filter and sort performers
  const source = showTop ? top_performers : bottom_performers;
  const count =
    displayCount === "all" ? source.length : parseInt(displayCount, 10);

  const displayedPerformers = [...source.slice(0, count)].sort((a, b) => {
    const aVal = a[sortField];
    const bVal = b[sortField];

    // Null values go to end
    if (aVal == null && bVal == null) return 0;
    if (aVal == null) return 1;
    if (bVal == null) return -1;

    // String vs numeric comparison
    const isString = sortField === "name" || sortField === "group";
    const diff = isString
      ? String(aVal).localeCompare(String(bVal), "zh-TW")
      : Number(aVal) - Number(bVal);

    return sortDirection === "asc" ? diff : -diff;
  });

  // Render change value cell (for merit_change, assist_change)
  const renderChangeCell = (value: number | null) => {
    if (value == null) return <span className="text-muted-foreground">-</span>;
    return (
      <span className={value >= 0 ? "text-primary" : "text-destructive"}>
        {value >= 0 ? "+" : ""}
        {formatNumberCompact(value)}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Distribution Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Contribution Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">貢獻分佈</CardTitle>
            <CardDescription>人日均貢獻區間分佈</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer
              config={allianceChartConfigs.distribution}
              className="h-[240px] w-full"
            >
              <BarChart
                data={[...distributions.contribution]}
                margin={{ left: 12, right: 12 }}
              >
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="range"
                  tickLine={false}
                  axisLine={false}
                  className="text-xs"
                />
                <YAxis tickLine={false} axisLine={false} className="text-xs" />
                <ChartTooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload as DistributionBin;
                    return (
                      <div className="rounded-lg border bg-background p-2 shadow-sm">
                        <div className="font-medium">{d.range}</div>
                        <div className="text-sm">{d.count} 人</div>
                      </div>
                    );
                  }}
                />
                <Bar
                  dataKey="count"
                  fill="var(--primary)"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ChartContainer>
            <div className="mt-3 pt-3 border-t text-sm text-muted-foreground">
              平均: {formatNumber(summary.avg_daily_contribution)} / 中位數:{" "}
              {formatNumber(summary.median_daily_contribution)}
            </div>
          </CardContent>
        </Card>

        {/* Merit Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">戰功分佈</CardTitle>
            <CardDescription>人日均戰功區間分佈</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer
              config={allianceChartConfigs.distribution}
              className="h-[240px] w-full"
            >
              <BarChart
                data={[...distributions.merit]}
                margin={{ left: 12, right: 12 }}
              >
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="range"
                  tickLine={false}
                  axisLine={false}
                  className="text-xs"
                />
                <YAxis tickLine={false} axisLine={false} className="text-xs" />
                <ChartTooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload as DistributionBin;
                    return (
                      <div className="rounded-lg border bg-background p-2 shadow-sm">
                        <div className="font-medium">{d.range}</div>
                        <div className="text-sm">{d.count} 人</div>
                      </div>
                    );
                  }}
                />
                <Bar
                  dataKey="count"
                  fill="var(--chart-2)"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ChartContainer>
            <div className="mt-3 pt-3 border-t text-sm text-muted-foreground">
              平均: {formatNumber(summary.avg_daily_merit)} / 中位數:{" "}
              {formatNumber(summary.median_daily_merit)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top/Bottom Performers */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base">成員排行</CardTitle>
              <CardDescription>
                {viewMode === "latest" ? "本期表現" : "賽季平均"}排名
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Tabs
                value={showTop ? "top" : "bottom"}
                onValueChange={(v) => setShowTop(v === "top")}
              >
                <TabsList className="h-8">
                  <TabsTrigger value="top" className="text-xs px-3">
                    Top
                  </TabsTrigger>
                  <TabsTrigger value="bottom" className="text-xs px-3">
                    Bottom
                  </TabsTrigger>
                </TabsList>
              </Tabs>
              <Select value={displayCount} onValueChange={setDisplayCount}>
                <SelectTrigger className="w-24 h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">5 人</SelectItem>
                  <SelectItem value="10">10 人</SelectItem>
                  <SelectItem value="20">20 人</SelectItem>
                  <SelectItem value="50">50 人</SelectItem>
                  <SelectItem value="all">全部</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  {SORT_COLUMNS.filter(
                    (col) => !col.showOnlyLatest || viewMode === "latest",
                  ).map((col) => (
                    <th key={col.field} className="py-2 px-2">
                      <button
                        type="button"
                        onClick={() => handleSort(col.field)}
                        className={`flex items-center font-medium hover:text-primary transition-colors ${
                          col.align === "right" ? "justify-end w-full" : ""
                        }`}
                      >
                        {col.label}
                        {renderSortIcon(col.field)}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayedPerformers.map((m: PerformerItem) => (
                  <tr key={m.member_id} className="border-b last:border-0">
                    <td className="py-2 px-2 tabular-nums font-medium">
                      #{m.rank}
                    </td>
                    <td className="py-2 px-2 font-medium">{m.name}</td>
                    <td className="py-2 px-2 text-muted-foreground">
                      {m.group || "-"}
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums">
                      {formatNumber(m.daily_contribution)}
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums">
                      {formatNumber(m.daily_merit)}
                    </td>
                    {viewMode === "latest" && (
                      <td className="py-2 px-2 text-right tabular-nums">
                        {renderChangeCell(m.merit_change)}
                      </td>
                    )}
                    <td className="py-2 px-2 text-right tabular-nums">
                      {formatNumber(m.daily_assist)}
                    </td>
                    {viewMode === "latest" && (
                      <td className="py-2 px-2 text-right tabular-nums">
                        {renderChangeCell(m.assist_change)}
                      </td>
                    )}
                    {viewMode === "latest" && (
                      <td className="py-2 px-2 text-right">
                        <RankChangeIndicator
                          change={m.rank_change}
                          showNewLabel={false}
                        />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Needs Attention */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            需關注成員
          </CardTitle>
          <CardDescription>排名大幅下滑或貢獻顯著低於中位數</CardDescription>
        </CardHeader>
        <CardContent>
          {needs_attention.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              目前沒有需要特別關注的成員
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-2 font-medium">成員</th>
                    <th className="text-left py-2 px-2 font-medium">組別</th>
                    <th className="text-right py-2 px-2 font-medium">
                      當前排名
                    </th>
                    {viewMode === "latest" && (
                      <th className="text-right py-2 px-2 font-medium">
                        排名變化
                      </th>
                    )}
                    <th className="text-left py-2 px-2 font-medium">原因</th>
                  </tr>
                </thead>
                <tbody>
                  {needs_attention.map((m: AttentionItem) => (
                    <tr
                      key={m.member_id}
                      className="border-b last:border-0 bg-destructive/5"
                    >
                      <td className="py-2 px-2 font-medium">{m.name}</td>
                      <td className="py-2 px-2 text-muted-foreground">
                        {m.group || "-"}
                      </td>
                      <td className="py-2 px-2 text-right tabular-nums">
                        #{m.rank}
                      </td>
                      {viewMode === "latest" && (
                        <td className="py-2 px-2 text-right">
                          <RankChangeIndicator
                            change={m.rank_change}
                            showNewLabel={false}
                          />
                        </td>
                      )}
                      <td className="py-2 px-2 text-destructive">{m.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
