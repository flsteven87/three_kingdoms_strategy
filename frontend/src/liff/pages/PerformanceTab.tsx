/**
 * Performance Tab
 * - No manual memoization (React Compiler handles)
 *
 * Mobile-optimized member performance analytics for LIFF.
 * Includes: rank card, metrics grid, radar chart, trend chart, season totals.
 */

import { useState } from "react";
import {
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { AccountSelector } from "../components/AccountSelector";
import { formatWan } from "@/lib/chart-utils";
import { useLiffMemberInfo } from "../hooks/use-liff-member";
import { useLiffPerformance } from "../hooks/use-liff-performance";
import type { LiffSessionWithGroup } from "../hooks/use-liff-session";
import type { PerformanceMetrics } from "../lib/liff-api-client";

interface Props {
  readonly session: LiffSessionWithGroup;
}

function calcPercentVsAvg(value: number, avg: number): number {
  if (avg === 0) return 0;
  return Math.round(((value - avg) / avg) * 100);
}

interface MetricCardProps {
  readonly label: string;
  readonly value: number;
  readonly percentVsAvg: number;
}

function MetricCard({ label, value, percentVsAvg }: MetricCardProps) {
  const isPositive = percentVsAvg > 0;
  const isNegative = percentVsAvg < 0;

  return (
    <Card className="bg-muted/30">
      <CardContent className="p-3">
        <div className="text-xs text-muted-foreground mb-1">{label}</div>
        <div className="text-lg font-semibold">{formatWan(value)}</div>
        <div
          className={`text-xs flex items-center gap-0.5 ${
            isPositive
              ? "text-green-600"
              : isNegative
                ? "text-red-500"
                : "text-muted-foreground"
          }`}
        >
          {isPositive ? "+" : ""}
          {percentVsAvg}% vs 盟均
        </div>
      </CardContent>
    </Card>
  );
}

export function PerformanceTab({ session }: Props) {
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);

  const context = {
    lineUserId: session.lineUserId,
    lineGroupId: session.lineGroupId,
    lineDisplayName: session.lineDisplayName,
  };

  // Get registered accounts
  const { data: memberInfo, isLoading: isLoadingMember } =
    useLiffMemberInfo(context);

  // Auto-select first account
  const accounts = memberInfo?.registered_ids || [];
  const effectiveGameId = selectedGameId || accounts[0]?.game_id || null;

  // Get performance data
  const { data: performance, isLoading: isLoadingPerf } = useLiffPerformance(
    context,
    effectiveGameId,
  );

  // Prepare radar chart data
  const radarData = (() => {
    if (!performance?.latest || !performance?.alliance_avg) return [];

    // Dimension order matches MemberPerformance.tsx: 貢獻→戰功→勢力值→助攻→捐獻
    const metrics: Array<{
      key: keyof PerformanceMetrics;
      label: string;
    }> = [
      { key: "daily_contribution", label: "貢獻" },
      { key: "daily_merit", label: "戰功" },
      { key: "power", label: "勢力值" },
      { key: "daily_assist", label: "助攻" },
      { key: "daily_donation", label: "捐獻" },
    ];

    return metrics.map(({ key, label }) => {
      const myValue = performance.latest![key];
      const avgValue = performance.alliance_avg![key];
      const medianValue = performance.alliance_median?.[key] || avgValue;
      // Normalize to percentage (100 = alliance avg)
      const myPercent = avgValue > 0 ? (myValue / avgValue) * 100 : 100;
      const medianPercent = avgValue > 0 ? (medianValue / avgValue) * 100 : 100;
      return {
        metric: label,
        me: Math.min(myPercent, 200), // Cap at 200%
        avg: 100,
        median: Math.min(medianPercent, 200),
      };
    });
  })();

  // Prepare trend chart data
  const trendData = (() => {
    if (!performance?.trend) return [];
    return performance.trend.map((item) => ({
      label: item.period_label.split("-")[0], // Just show start date
      貢獻: Math.round(item.daily_contribution),
      戰功: Math.round(item.daily_merit),
    }));
  })();

  // Loading state
  if (isLoadingMember) {
    return (
      <div className="py-8 text-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent mx-auto" />
      </div>
    );
  }

  // No registered accounts (edge case - should not reach here with onboarding)
  if (accounts.length === 0) {
    return (
      <div className="p-4 text-center">
        <p className="text-sm text-muted-foreground">
          請先至「ID 管理」綁定遊戲帳號
        </p>
      </div>
    );
  }

  // Loading performance data
  if (isLoadingPerf) {
    return (
      <div className="p-3 space-y-3">
        <AccountSelector
          accounts={accounts}
          value={effectiveGameId}
          onValueChange={setSelectedGameId}
        />
        <div className="py-8 text-center">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent mx-auto" />
        </div>
      </div>
    );
  }

  // No data available
  if (!performance?.has_data) {
    return (
      <div className="p-3 space-y-3">
        <AccountSelector
          accounts={accounts}
          value={effectiveGameId}
          onValueChange={setSelectedGameId}
        />
        <div className="py-8 text-center">
          <p className="text-sm text-muted-foreground">
            暫無數據，請等待盟主上傳統計
          </p>
        </div>
      </div>
    );
  }

  const { rank, latest, alliance_avg, season_total, season_name } = performance;
  const rankChange = rank?.change ?? 0;

  return (
    <div className="p-3 space-y-4 pb-6">
      {/* Header: Account selector + Season */}
      <div className="flex items-center justify-between gap-2">
        {accounts.length > 1 ? (
          <AccountSelector
            accounts={accounts}
            value={effectiveGameId}
            onValueChange={setSelectedGameId}
            className="h-9 flex-1"
          />
        ) : (
          <span className="text-sm font-medium">{effectiveGameId}</span>
        )}
        {season_name && (
          <span className="text-xs text-muted-foreground shrink-0">
            {season_name}
          </span>
        )}
      </div>

      {/* Rank Card */}
      {rank && (
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="py-4 text-center">
            <div className="text-xs text-muted-foreground mb-1">貢獻排名</div>
            <div className="text-3xl font-bold text-primary">
              #{rank.current}
              <span className="text-lg font-normal text-muted-foreground">
                {" "}
                / {rank.total}
              </span>
            </div>
            {rankChange !== 0 && (
              <div
                className={`text-sm flex items-center justify-center gap-1 mt-1 ${
                  rankChange > 0 ? "text-green-600" : "text-red-500"
                }`}
              >
                {rankChange > 0 ? (
                  <TrendingUp className="h-4 w-4" />
                ) : (
                  <TrendingDown className="h-4 w-4" />
                )}
                {rankChange > 0 ? "+" : ""}
                {rankChange} 本期
              </div>
            )}
            {rankChange === 0 && rank.change !== null && (
              <div className="text-sm flex items-center justify-center gap-1 mt-1 text-muted-foreground">
                <Minus className="h-4 w-4" />
                持平
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Metrics Grid */}
      {latest && alliance_avg && (
        <div className="grid grid-cols-2 gap-2">
          <MetricCard
            label="日均貢獻"
            value={latest.daily_contribution}
            percentVsAvg={calcPercentVsAvg(
              latest.daily_contribution,
              alliance_avg.daily_contribution,
            )}
          />
          <MetricCard
            label="日均戰功"
            value={latest.daily_merit}
            percentVsAvg={calcPercentVsAvg(
              latest.daily_merit,
              alliance_avg.daily_merit,
            )}
          />
          <MetricCard
            label="日均助攻"
            value={latest.daily_assist}
            percentVsAvg={calcPercentVsAvg(
              latest.daily_assist,
              alliance_avg.daily_assist,
            )}
          />
          <MetricCard
            label="日均捐獻"
            value={latest.daily_donation}
            percentVsAvg={calcPercentVsAvg(
              latest.daily_donation,
              alliance_avg.daily_donation,
            )}
          />
        </div>
      )}

      {/* Radar Chart */}
      {radarData.length > 0 && (
        <Card>
          <CardContent className="pt-4 pb-2">
            <div className="text-xs text-muted-foreground mb-2 text-center">
              五維能力 (vs 同盟平均)
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="#e5e7eb" gridType="polygon" />
                <PolarAngleAxis
                  dataKey="metric"
                  tick={{ fontSize: 11, fill: "#6b7280" }}
                />
                <PolarRadiusAxis
                  angle={90}
                  domain={[
                    0,
                    Math.max(
                      150,
                      ...radarData.map((d) => Math.max(d.me, d.median)),
                    ),
                  ]}
                  tick={{ fontSize: 9, fill: "#9ca3af" }}
                  tickFormatter={(value) => `${value}%`}
                  tickCount={4}
                />
                {/* Render order: back to front for proper layering */}
                <Radar
                  name="盟均"
                  dataKey="avg"
                  stroke="#9ca3af"
                  fill="#9ca3af"
                  fillOpacity={0.1}
                  strokeDasharray="4 4"
                  strokeWidth={1}
                />
                <Radar
                  name="中位數"
                  dataKey="median"
                  stroke="#8b9cb3"
                  fill="#8b9cb3"
                  fillOpacity={0.08}
                  strokeDasharray="2 2"
                  strokeWidth={1}
                />
                <Radar
                  name="我"
                  dataKey="me"
                  stroke="#2563eb"
                  fill="#2563eb"
                  fillOpacity={0.4}
                  strokeWidth={2}
                />
              </RadarChart>
            </ResponsiveContainer>
            <div className="flex justify-center gap-4 text-xs mt-1">
              <span className="flex items-center gap-1">
                <span className="w-3 h-0.5 bg-primary inline-block" /> 我
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-0.5 bg-gray-400 inline-block opacity-70" />{" "}
                盟均
              </span>
              <span className="flex items-center gap-1">
                <span
                  className="w-3 h-0.5 inline-block"
                  style={{ backgroundColor: "#8b9cb3" }}
                />{" "}
                中位數
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Trend Chart */}
      {trendData.length > 1 && (
        <Card>
          <CardContent className="pt-4 pb-2">
            <div className="text-xs text-muted-foreground mb-2 text-center">
              貢獻與戰功趨勢
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={trendData}>
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: "#6b7280" }}
                  tickLine={false}
                  axisLine={{ stroke: "#e5e7eb" }}
                />
                <YAxis
                  yAxisId="left"
                  tick={{ fontSize: 10, fill: "#6b7280" }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => formatWan(v)}
                  width={45}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fontSize: 10, fill: "#6b7280" }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => formatWan(v)}
                  width={45}
                />
                <Tooltip
                  formatter={(value: number) => formatWan(value)}
                  labelStyle={{ fontSize: 11 }}
                  contentStyle={{ fontSize: 11 }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} iconSize={10} />
                <Line
                  yAxisId="left"
                  type="stepAfter"
                  dataKey="貢獻"
                  stroke="#2563eb"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
                <Line
                  yAxisId="right"
                  type="stepAfter"
                  dataKey="戰功"
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Season Totals */}
      {season_total && (
        <Card className="bg-muted/30">
          <CardContent className="py-3">
            <div className="text-xs text-muted-foreground mb-2">賽季累計</div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">總貢獻</span>
                <span className="font-medium">
                  {formatWan(season_total.contribution)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">總捐獻</span>
                <span className="font-medium">
                  {formatWan(season_total.donation)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">勢力值</span>
                <span className="font-medium">
                  {formatWan(season_total.power)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">勢力變化</span>
                <span
                  className={`font-medium ${season_total.power_change >= 0 ? "text-green-600" : "text-red-500"}`}
                >
                  {season_total.power_change >= 0 ? "+" : ""}
                  {formatWan(season_total.power_change)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
