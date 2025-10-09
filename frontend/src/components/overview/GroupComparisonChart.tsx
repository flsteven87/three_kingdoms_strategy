/**
 * Group Comparison Bar Chart
 * Horizontal bar chart showing average merit by group
 */

import { Bar, BarChart, CartesianGrid, XAxis, YAxis, LabelList } from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'

interface GroupComparisonData {
  group_name: string
  avg_merit: number
  member_count: number
  participation_rate: number
}

interface GroupComparisonChartProps {
  readonly data: GroupComparisonData[]
}

const chartConfig = {
  avg_merit: {
    label: '週均戰功',
    theme: {
      light: 'oklch(0.6487 0.1538 150.3071)',  // Primary color
      dark: 'oklch(0.6487 0.1538 150.3071)',
    },
  },
}

const GroupComparisonChart: React.FC<GroupComparisonChartProps> = ({ data }) => {
  // Sort by avg_merit descending
  const sortedData = [...data].sort((a, b) => b.avg_merit - a.avg_merit)

  return (
    <Card>
      <CardHeader>
        <CardTitle>組別戰功對比</CardTitle>
        <CardDescription>各組別週均戰功與參戰率</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[300px] w-full">
          <BarChart
            data={sortedData}
            layout="vertical"
            margin={{ top: 5, right: 80, left: 80, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 12 }} />
            <YAxis
              type="category"
              dataKey="group_name"
              tick={{ fontSize: 12 }}
              width={70}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value, _name, props) => {
                    const data = props.payload as GroupComparisonData
                    return (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-muted-foreground">週均戰功:</span>
                          <span className="font-mono font-medium">
                            {Number(value).toLocaleString()}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-muted-foreground">成員數:</span>
                          <span className="font-mono font-medium">{data.member_count}</span>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-muted-foreground">參戰率:</span>
                          <span className="font-mono font-medium">
                            {data.participation_rate}%
                          </span>
                        </div>
                      </div>
                    )
                  }}
                />
              }
            />
            <Bar dataKey="avg_merit" fill="var(--color-avg_merit)" radius={[0, 4, 4, 0]}>
              <LabelList
                dataKey="avg_merit"
                position="right"
                formatter={(value: number) => value.toLocaleString()}
                className="fill-foreground text-xs font-medium"
              />
            </Bar>
          </BarChart>
        </ChartContainer>

        <div className="mt-4">
          <table className="w-full text-sm">
            <thead className="border-b">
              <tr className="text-muted-foreground">
                <th className="text-left py-2">組別</th>
                <th className="text-right py-2">成員數</th>
                <th className="text-right py-2">週均戰功</th>
                <th className="text-right py-2">參戰率</th>
              </tr>
            </thead>
            <tbody>
              {sortedData.map((group) => (
                <tr key={group.group_name} className="border-b">
                  <td className="py-2 font-medium">{group.group_name}</td>
                  <td className="text-right">{group.member_count}</td>
                  <td className="text-right font-mono">
                    {group.avg_merit.toLocaleString()}
                  </td>
                  <td className="text-right">{group.participation_rate}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}

export default GroupComparisonChart
