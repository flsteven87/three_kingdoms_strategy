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
import { AlertCircle, TrendingUp, Users, Target, Loader2, Award } from 'lucide-react'
import { AllianceGuard } from '@/components/alliance/AllianceGuard'
import { useAlliance } from '@/hooks/use-alliance'
import { useSeasons } from '@/hooks/use-seasons'
import { useHegemonyScoresPreview } from '@/hooks/use-hegemony-weights'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

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

interface ChartMemberData {
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
// Helper Functions
// ============================================================================

/**
 * Format hegemony score for display
 */
function formatScore(score: number): string {
  if (score >= 1000000) {
    return `${(score / 1000000).toFixed(1)}M`
  }
  if (score >= 1000) {
    return `${(score / 1000).toFixed(0)}K`
  }
  return score.toFixed(0)
}

// ============================================================================
// Hegemony Score Tab Component
// ============================================================================

interface HegemonyScoreTabProps {
  readonly seasonId: string | null
}

const HegemonyScoreTab: React.FC<HegemonyScoreTabProps> = ({ seasonId }) => {
  // State for display limit
  const [displayLimit, setDisplayLimit] = useState<number>(20)

  // Fetch hegemony scores with dynamic limit
  const { data: scoresData, isLoading, error } = useHegemonyScoresPreview(seasonId, displayLimit)

  // Transform API data to chart format
  const chartData: ChartMemberData[] = React.useMemo(() => {
    if (!scoresData) return []

    return scoresData.map(score => ({
      member_name: score.member_name,
      total_score: score.final_score,
      rank: score.rank
    }))
  }, [scoresData])

  // Calculate dynamic chart height based on number of members
  const totalMembers = chartData.length
  const chartHeight = Math.max(400, totalMembers * 40) // 40px per member, minimum 400px

  // Calculate X-axis domain: max value = top score + 10%
  const maxScore = chartData[0]?.total_score || 0
  const xAxisMax = Math.ceil(maxScore * 1.1)

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2 text-muted-foreground">載入霸業分數數據中...</span>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <Alert className="border-red-500/50 bg-red-50 dark:bg-red-950/20">
        <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
        <AlertDescription className="text-red-900 dark:text-red-100">
          <strong className="font-semibold">載入失敗</strong>
          <p className="mt-1 text-sm text-red-800 dark:text-red-200">
            無法載入霸業分數數據。請確保已上傳 CSV 數據並初始化權重配置。
          </p>
        </AlertDescription>
      </Alert>
    )
  }

  // Empty state
  if (!chartData || chartData.length === 0) {
    return (
      <Alert className="border-yellow-500/50 bg-yellow-50 dark:bg-yellow-950/20">
        <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
        <AlertDescription className="text-yellow-900 dark:text-yellow-100">
          <strong className="font-semibold">尚無數據</strong>
          <p className="mt-1 text-sm text-yellow-800 dark:text-yellow-200">
            請先上傳 CSV 數據並初始化霸業權重配置。
          </p>
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="space-y-6">
      {/* Member Ranking Chart */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>成員霸業分數排行榜</CardTitle>
              <CardDescription>
                根據加權計算後的霸業分數排序（從高到低）
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">顯示：</span>
              <Select
                value={displayLimit.toString()}
                onValueChange={(value) => setDisplayLimit(Number(value))}
              >
                <SelectTrigger className="w-[120px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">前 10 名</SelectItem>
                  <SelectItem value="20">前 20 名</SelectItem>
                  <SelectItem value="30">前 30 名</SelectItem>
                  <SelectItem value="50">前 50 名</SelectItem>
                  <SelectItem value="100">前 100 名</SelectItem>
                  <SelectItem value="200">全部成員</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="w-full" style={{ height: `${chartHeight}px` }}>
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
                data={chartData}
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
                  tickFormatter={(value) => formatScore(value)}
                  domain={[0, xAxisMax]}
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
  const { data: alliance } = useAlliance()
  const { data: seasons } = useSeasons(false)
  const [activeTab, setActiveTab] = useState('hegemony')

  // Get active season
  const activeSeason = React.useMemo(() => {
    return seasons?.find(s => s.is_active) || seasons?.[0] || null
  }, [seasons])

  return (
    <AllianceGuard>
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
          <HegemonyScoreTab seasonId={activeSeason?.id || null} />
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
    </AllianceGuard>
  )
}

export default AllianceAnalytics
