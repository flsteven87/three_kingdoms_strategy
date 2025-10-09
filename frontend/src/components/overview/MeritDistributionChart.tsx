/**
 * Merit Distribution Histogram with Interactive Period Toggle
 * Shows current week or previous week merit distribution with fine-grained bins
 * User can click legend to switch between periods
 */

import React, { useState } from 'react'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { cn } from '@/lib/utils'

interface MeritDistributionData {
  range: string
  label: string
  current_week: number
  previous_week: number
}

interface MeritDistributionChartProps {
  readonly data: MeritDistributionData[]
}

type Period = 'current_week' | 'previous_week'

const chartConfig = {
  current_week: {
    label: '本週',
    theme: {
      light: 'oklch(0.6487 0.1538 150.3071)',  // chart-1: Primary green
      dark: 'oklch(0.6487 0.1538 150.3071)',
    },
  },
  previous_week: {
    label: '上週',
    theme: {
      light: 'oklch(0.6746 0.1414 261.3380)',  // chart-2: Secondary purple
      dark: 'oklch(0.5880 0.0993 245.7394)',   // chart-2 (dark): Deep purple-blue
    },
  },
}

const MeritDistributionChart: React.FC<MeritDistributionChartProps> = ({ data }) => {
  const [activePeriod, setActivePeriod] = useState<Period>('current_week')

  const handleLegendClick = (period: Period) => {
    setActivePeriod(period)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>戰功分佈</CardTitle>
        <CardDescription>
          成員週戰功區間分佈 · 點擊標籤切換時期
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Interactive Legend */}
        <div className="flex items-center justify-center gap-6">
          {(Object.keys(chartConfig) as Period[]).map((period) => {
            const config = chartConfig[period]
            const isActive = activePeriod === period

            return (
              <button
                key={period}
                onClick={() => handleLegendClick(period)}
                className={cn(
                  'flex items-center gap-2 rounded-md px-3 py-1.5 transition-all',
                  'hover:bg-accent/50',
                  isActive
                    ? 'bg-accent font-medium ring-2 ring-ring/20'
                    : 'opacity-60 hover:opacity-100'
                )}
                aria-pressed={isActive}
                aria-label={`切換至${config.label}`}
              >
                <div
                  className="h-3 w-3 rounded-sm"
                  style={{
                    backgroundColor:
                      config.theme.light || config.theme.dark,
                  }}
                />
                <span className="text-sm">{config.label}</span>
              </button>
            )
          })}
        </div>

        {/* Chart */}
        <ChartContainer config={chartConfig} className="h-[350px] w-full">
          <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="label"
              angle={-45}
              textAnchor="end"
              height={70}
              interval={0}
              tick={{ fontSize: 12 }}
            />
            <YAxis
              label={{ value: '成員數', angle: -90, position: 'insideLeft' }}
              tick={{ fontSize: 12 }}
            />
            <ChartTooltip
              content={<ChartTooltipContent hideLabel />}
            />
            <Bar
              dataKey={activePeriod}
              fill={`var(--color-${activePeriod})`}
              radius={[4, 4, 0, 0]}
              animationDuration={300}
            />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}

export default MeritDistributionChart
