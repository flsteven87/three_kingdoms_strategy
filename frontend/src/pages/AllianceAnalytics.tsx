/**
 * AllianceAnalytics - Alliance Performance Analytics Dashboard
 *
 * Professional analytics page with tab-based navigation for different metrics.
 * First tab: Hegemony Score Analysis
 */

import React, { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertCircle, TrendingUp, Users, Award, Target } from 'lucide-react'
import { useAlliance } from '@/hooks/use-alliance'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'

// Chart imports
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart'

// ============================================================================
// Types
// ============================================================================

interface MemberRankingData {
  readonly member_name: string
  readonly total_score: number
  readonly rank: number
}

// ============================================================================
// Chart Configurations
// ============================================================================

const memberRankingChartConfig = {
  total_score: {
    label: '霸業分數',
    theme: {
      light: 'oklch(0.6487 0.1538 150.3071)',  // Primary color in light mode
      dark: 'oklch(0.6487 0.1538 150.3071)',   // Primary color in dark mode
    },
  },
} satisfies ChartConfig

// ============================================================================
// Mock Data (Replace with real API calls)
// ============================================================================

const mockMemberRankingData: MemberRankingData[] = [
  { member_name: '大地英豪', total_score: 850000, rank: 1 },
  { member_name: '委皇叔', total_score: 820000, rank: 2 },
  { member_name: '風雲戰將', total_score: 780000, rank: 3 },
  { member_name: '蜀漢軍師', total_score: 750000, rank: 4 },
  { member_name: '江東猛虎', total_score: 720000, rank: 5 },
  { member_name: '中原勇士', total_score: 690000, rank: 6 },
  { member_name: '北疆統帥', total_score: 660000, rank: 7 },
  { member_name: '西涼戰神', total_score: 630000, rank: 8 },
  { member_name: '南蠻霸主', total_score: 600000, rank: 9 },
  { member_name: '東吳智者', total_score: 580000, rank: 10 },
  { member_name: '荊州刺史', total_score: 560000, rank: 11 },
  { member_name: '幽州勇士', total_score: 540000, rank: 12 },
  { member_name: '并州戰將', total_score: 520000, rank: 13 },
  { member_name: '青州豪傑', total_score: 500000, rank: 14 },
  { member_name: '徐州守將', total_score: 480000, rank: 15 },
  { member_name: '揚州水師', total_score: 460000, rank: 16 },
  { member_name: '益州智囊', total_score: 440000, rank: 17 },
  { member_name: '涼州鐵騎', total_score: 420000, rank: 18 },
  { member_name: '冀州謀士', total_score: 400000, rank: 19 },
  { member_name: '兗州精兵', total_score: 380000, rank: 20 },
]

// ============================================================================
// Hegemony Score Tab Component
// ============================================================================

const HegemonyScoreTab: React.FC = () => {
  return (
    <div className="space-y-6">
      {/* Summary Info */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">總成員數</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">201</div>
            <p className="text-xs text-muted-foreground">
              顯示前 20 名成員排名
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">最高分數</CardTitle>
            <Award className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">850K</div>
            <p className="text-xs text-muted-foreground">
              第一名：大地英豪
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">平均分數</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">615K</div>
            <p className="text-xs text-muted-foreground">
              前 20 名平均
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Member Ranking Chart */}
      <Card>
        <CardHeader>
          <CardTitle>成員霸業分數排行榜</CardTitle>
          <CardDescription>
            根據加權計算後的霸業分數排序（從高到低）
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[800px] w-full">
            <style>{`
              .custom-chart .recharts-cartesian-grid-horizontal line,
              .custom-chart .recharts-cartesian-grid-vertical line {
                stroke: var(--border);
              }
              .custom-chart .recharts-text {
                fill: var(--muted-foreground);
              }
              .custom-chart .recharts-bar-rectangle {
                fill: var(--primary);
              }
            `}</style>
            <ChartContainer config={memberRankingChartConfig} className="h-full w-full custom-chart">
              <BarChart
                accessibilityLayer
                data={mockMemberRankingData}
                layout="vertical"
                margin={{
                  left: 80,
                  right: 40,
                  top: 12,
                  bottom: 12,
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
                  tickFormatter={(value) => `${(value / 1000).toFixed(0)}K`}
                />
                <ChartTooltip
                  cursor={false}
                  content={<ChartTooltipContent hideLabel />}
                />
                <Bar
                  dataKey="total_score"
                  fill="var(--color-total_score)"
                  radius={[0, 4, 4, 0]}
                />
              </BarChart>
            </ChartContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ============================================================================
// Main Component
// ============================================================================

const AllianceAnalytics: React.FC = () => {
  const { data: alliance, isLoading } = useAlliance()
  const [activeTab, setActiveTab] = useState('hegemony')

  // Show setup prompt if no alliance
  if (!isLoading && !alliance) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">同盟分析</h2>
          <p className="text-muted-foreground mt-1">
            查看同盟表現數據與趨勢分析
          </p>
        </div>

        <Card className="border-yellow-500/50 bg-yellow-50 dark:bg-yellow-950/20">
          <CardHeader>
            <div className="flex items-start gap-4">
              <AlertCircle className="h-6 w-6 text-yellow-600 dark:text-yellow-500 mt-1" />
              <div className="flex-1">
                <CardTitle className="text-yellow-900 dark:text-yellow-100">
                  尚未設定同盟
                </CardTitle>
                <CardDescription className="text-yellow-800 dark:text-yellow-200 mt-2">
                  在開始使用分析功能之前，請先前往設定頁面建立你的同盟資訊
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Link to="/settings">
              <Button className="gap-2">
                前往設定
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight">同盟分析</h2>
        <p className="text-muted-foreground mt-1">
          {alliance?.name || '載入中...'} - 表現數據與趨勢分析
        </p>
      </div>

      {/* Info Alert */}
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          數據每週更新。請確保已上傳最新的 CSV 數據以查看完整分析。
        </AlertDescription>
      </Alert>

      {/* Tab Navigation */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="hegemony" className="flex items-center gap-2">
            <Award className="h-4 w-4" />
            <span className="hidden sm:inline">霸業分數</span>
          </TabsTrigger>
          <TabsTrigger value="contribution" className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            <span className="hidden sm:inline">貢獻分析</span>
          </TabsTrigger>
          <TabsTrigger value="combat" className="flex items-center gap-2">
            <Target className="h-4 w-4" />
            <span className="hidden sm:inline">戰鬥表現</span>
          </TabsTrigger>
          <TabsTrigger value="members" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">成員統計</span>
          </TabsTrigger>
          <TabsTrigger value="trends" className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            <span className="hidden sm:inline">趨勢預測</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="hegemony" className="space-y-6">
          <HegemonyScoreTab />
        </TabsContent>

        <TabsContent value="contribution" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>貢獻分析</CardTitle>
              <CardDescription>建置中...</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                此功能正在開發中，敬請期待。
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="combat" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>戰鬥表現</CardTitle>
              <CardDescription>建置中...</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                此功能正在開發中，敬請期待。
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="members" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>成員統計</CardTitle>
              <CardDescription>建置中...</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                此功能正在開發中，敬請期待。
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="trends" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>趨勢預測</CardTitle>
              <CardDescription>建置中...</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                此功能正在開發中，敬請期待。
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

export default AllianceAnalytics
