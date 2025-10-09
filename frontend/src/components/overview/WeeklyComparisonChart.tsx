/**
 * Weekly Comparison Line Chart
 * Shows week-over-week merit distribution comparison with coarse bins
 */

import { Line, LineChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent } from '@/components/ui/chart'

interface WeeklyComparisonData {
  range: string
  label: string
  current_week: number
  previous_week: number
}

interface WeeklyComparisonChartProps {
  readonly data: WeeklyComparisonData[]
}

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

const WeeklyComparisonChart: React.FC<WeeklyComparisonChartProps> = ({ data }) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>戰功趨勢對比</CardTitle>
        <CardDescription>本週 vs 上週戰功分佈變化</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[350px] w-full">
          <LineChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
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
            <ChartTooltip content={<ChartTooltipContent />} />
            <ChartLegend content={<ChartLegendContent />} />
            <Line
              type="monotone"
              dataKey="previous_week"
              stroke="var(--color-previous_week)"
              strokeWidth={2}
              dot={{ r: 4 }}
              activeDot={{ r: 6 }}
            />
            <Line
              type="monotone"
              dataKey="current_week"
              stroke="var(--color-current_week)"
              strokeWidth={2}
              dot={{ r: 4 }}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}

export default WeeklyComparisonChart
