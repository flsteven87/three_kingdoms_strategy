/**
 * HegemonyScoreChart - Stacked Bar Chart for Hegemony Score Visualization
 *
 * 符合 CLAUDE.md 🔴:
 * - JSX syntax only
 * - Type-safe component with explicit interfaces
 * - Separated chart presentation logic from parent component
 * - Reusable across different contexts (HegemonyWeightCard, Overview Dashboard)
 */

import React from 'react'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from '@/components/ui/chart'
import { formatScore } from '@/lib/hegemony-helpers'

/**
 * Chart data structure for a single member
 */
export interface ChartMemberData {
  readonly member_name: string
  readonly total_score: number
  readonly rank: number
  // Dynamic snapshot score fields (snapshot_0, snapshot_1, etc.)
  [key: string]: string | number
}

interface HegemonyScoreChartProps {
  /**
   * Array of member data with scores broken down by snapshot
   */
  readonly chartData: ChartMemberData[]

  /**
   * Array of snapshot dates in chronological order
   */
  readonly snapshotDates: string[]

  /**
   * Chart configuration mapping snapshot keys to labels and colors
   */
  readonly chartConfig: ChartConfig

  /**
   * Chart height in pixels (dynamically calculated based on number of members)
   */
  readonly chartHeight: number

  /**
   * Maximum value for X-axis domain
   */
  readonly xAxisMax: number
}

/**
 * Stacked Bar Chart Component for Hegemony Score Visualization
 *
 * Displays member rankings with score breakdown by snapshot.
 * Each bar is stacked with different snapshots shown in gradient colors
 * (older = lighter, newer = darker).
 *
 * @example
 * <HegemonyScoreChart
 *   chartData={memberScores}
 *   snapshotDates={['2025-10-01', '2025-10-09']}
 *   chartConfig={config}
 *   chartHeight={600}
 *   xAxisMax={1000000}
 * />
 */
export const HegemonyScoreChart: React.FC<HegemonyScoreChartProps> = ({
  chartData,
  snapshotDates,
  chartConfig,
  chartHeight,
  xAxisMax
}) => {
  return (
    <div className="w-full rounded-lg border bg-card p-6" style={{ height: `${chartHeight + 80}px` }}>
      <ChartContainer config={chartConfig} className="h-full w-full">
        <BarChart
          accessibilityLayer
          data={chartData}
          layout="vertical"
          margin={{
            left: 80,
            right: 40,
            top: 20,
            bottom: 60,
          }}
        >
          <CartesianGrid
            horizontal={false}
            strokeDasharray="3 3"
          />
          <YAxis
            dataKey="member_name"
            type="category"
            tickLine={false}
            axisLine={false}
            tickMargin={10}
            width={75}
          />
          <XAxis
            type="number"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            tickFormatter={(value) => formatScore(value)}
            domain={[0, xAxisMax]}
          />
          <ChartTooltip
            cursor={false}
            content={<ChartTooltipContent />}
          />
          <ChartLegend
            content={<ChartLegendContent />}
            verticalAlign="bottom"
          />
          {/* Dynamically render Bar components for each snapshot */}
          {snapshotDates.map((_, index) => {
            const snapshotKey = `snapshot_${index}`
            return (
              <Bar
                key={snapshotKey}
                dataKey={snapshotKey}
                fill={`var(--color-${snapshotKey})`}
                stackId="a"
                radius={index === snapshotDates.length - 1 ? [0, 4, 4, 0] : 0}
              />
            )
          })}
        </BarChart>
      </ChartContainer>
    </div>
  )
}
