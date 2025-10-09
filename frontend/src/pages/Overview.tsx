/**
 * Overview Page - Alliance Performance Dashboard
 * Focuses on merit (戰功) as the primary KPI
 */

import { Link } from 'react-router-dom'
import { useAlliance } from '@/hooks/use-alliance'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { AlertCircle, Settings, TrendingUp, TrendingDown, Users, Award, Target, Activity } from 'lucide-react'
import MeritDistributionChart from '@/components/overview/MeritDistributionChart'
import WeeklyComparisonChart from '@/components/overview/WeeklyComparisonChart'
import GroupComparisonChart from '@/components/overview/GroupComparisonChart'

// ============================================================================
// Mock Data (TODO: Replace with API data)
// ============================================================================

// Fine-grained bins for current week vs previous week distribution (more detailed)
const mockMeritDistribution = [
  { range: '0', label: '0', current_week: 16, previous_week: 8 },
  { range: '1-20000', label: '1-2萬', current_week: 12, previous_week: 15 },
  { range: '20000-40000', label: '2-4萬', current_week: 18, previous_week: 20 },
  { range: '40000-60000', label: '4-6萬', current_week: 15, previous_week: 12 },
  { range: '60000-80000', label: '6-8萬', current_week: 20, previous_week: 18 },
  { range: '80000-100000', label: '8-10萬', current_week: 22, previous_week: 25 },
  { range: '100000-120000', label: '10-12萬', current_week: 18, previous_week: 15 },
  { range: '120000-140000', label: '12-14萬', current_week: 15, previous_week: 13 },
  { range: '140000-160000', label: '14-16萬', current_week: 12, previous_week: 14 },
  { range: '160000-180000', label: '16-18萬', current_week: 10, previous_week: 8 },
  { range: '180000-200000', label: '18-20萬', current_week: 8, previous_week: 10 },
  { range: '200000-250000', label: '20-25萬', current_week: 12, previous_week: 11 },
  { range: '250000-300000', label: '25-30萬', current_week: 10, previous_week: 9 },
  { range: '300000-350000', label: '30-35萬', current_week: 8, previous_week: 7 },
  { range: '350000-400000', label: '35-40萬', current_week: 6, previous_week: 5 },
  { range: '400000+', label: '40萬+', current_week: 5, previous_week: 4 },
]

// Coarse bins for weekly comparison (broader view)
const mockWeeklyComparison = [
  { range: '0', label: '掛機 (0)', current_week: 16, previous_week: 8 },
  { range: '1-50000', label: '低活躍\n(1-5萬)', current_week: 65, previous_week: 70 },
  { range: '50000-100000', label: '一般\n(5-10萬)', current_week: 42, previous_week: 45 },
  { range: '100000-200000', label: '活躍\n(10-20萬)', current_week: 43, previous_week: 38 },
  { range: '200000-400000', label: '核心\n(20-40萬)', current_week: 36, previous_week: 32 },
  { range: '400000+', label: '精英\n(40萬+)', current_week: 5, previous_week: 4 },
]

const mockGroupComparison = [
  { group_name: '冬組', avg_merit: 185000, member_count: 25, participation_rate: 96 },
  { group_name: '沐組', avg_merit: 162000, member_count: 18, participation_rate: 94 },
  { group_name: '春組', avg_merit: 98000, member_count: 12, participation_rate: 83 },
  { group_name: '未分組', avg_merit: 75000, member_count: 146, participation_rate: 89 },
]

const mockInactiveMembers = [
  { name: '大地英豪', prev_merit: 104306, curr_merit: 0, consecutive_weeks: 2 },
  { name: '奇奇王國', prev_merit: 0, curr_merit: 0, consecutive_weeks: 2 },
  { name: '張飛', prev_merit: 85000, curr_merit: 0, consecutive_weeks: 1 },
]

const mockDecliningMembers = [
  { name: '委皇叔', prev_merit: 329171, curr_merit: 73201, change_rate: -78 },
  { name: '胖丨噴泡包', prev_merit: 510243, curr_merit: 180000, change_rate: -65 },
]

const mockMVPMembers = [
  { rank: 1, name: '小沐沐', merit: 226150, emoji: '🥇' },
  { rank: 2, name: '大地英豪', merit: 104306, emoji: '🥈' },
  { rank: 3, name: '委皇叔', merit: 73201, emoji: '🥉' },
  { rank: 4, name: '張飛', merit: 68500, emoji: '4️⃣' },
  { rank: 5, name: '關羽', merit: 65200, emoji: '5️⃣' },
]

const Overview: React.FC = () => {
  const { data: alliance, isLoading } = useAlliance()

  // Show setup prompt if no alliance
  if (!isLoading && !alliance) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">總覽</h2>
          <p className="text-muted-foreground mt-1">盟友表現數據總覽</p>
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
                  在開始使用系統功能之前，請先前往設定頁面建立你的同盟資訊
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Link to="/settings">
              <Button className="gap-2">
                <Settings className="h-4 w-4" />
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
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight">總覽</h2>
        <p className="text-muted-foreground mt-1">盟友戰功表現數據總覽</p>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">本週總戰功</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">2,845,320</div>
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              <TrendingUp className="h-3 w-3 text-primary" />
              較上週 +315,000 (+12.5%)
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">週均戰功</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">14,151</div>
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              <TrendingUp className="h-3 w-3 text-primary" />
              較上週 +820 (+6.2%)
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">戰功貢獻者</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">185 / 201</div>
            <p className="text-xs text-muted-foreground mt-1">
              92.0% 參戰率
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">戰功增長率</CardTitle>
            <Award className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">↑ 12.5%</div>
            <p className="text-xs text-muted-foreground mt-1">
              較上週趨勢
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Section */}
      <div className="grid gap-6 lg:grid-cols-2">
        <MeritDistributionChart data={mockMeritDistribution} />
        <WeeklyComparisonChart data={mockWeeklyComparison} />
      </div>

      <div className="grid gap-6">
        <GroupComparisonChart data={mockGroupComparison} />
      </div>

      {/* Alerts Section */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Inactive Members Alert */}
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="text-destructive flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              需關注成員
            </CardTitle>
            <CardDescription>本週戰功為 0 的成員</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {mockInactiveMembers.map((member) => (
                <div
                  key={member.name}
                  className="flex items-center justify-between border-b pb-2 last:border-0"
                >
                  <div>
                    <p className="font-medium">{member.name}</p>
                    <p className="text-xs text-muted-foreground">
                      上週: {member.prev_merit.toLocaleString()} → 本週: 0
                    </p>
                  </div>
                  <Badge variant="destructive">
                    連續 {member.consecutive_weeks} 週
                  </Badge>
                </div>
              ))}
              <Button variant="outline" size="sm" className="w-full mt-2">
                查看全部 ({mockInactiveMembers.length} 人)
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* MVP Members */}
        <Card className="border-primary/50">
          <CardHeader>
            <CardTitle className="text-primary flex items-center gap-2">
              <Award className="h-5 w-5" />
              本週戰功榜
            </CardTitle>
            <CardDescription>戰功前 5 名表現優異</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {mockMVPMembers.map((member) => (
                <div
                  key={member.name}
                  className="flex items-center justify-between border-b pb-2 last:border-0"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{member.emoji}</span>
                    <div>
                      <p className="font-medium">{member.name}</p>
                      <p className="text-xs text-muted-foreground">
                        週戰功: {member.merit.toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <Badge variant="default">TOP {member.rank}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Declining Members Warning */}
        <Card className="border-yellow-500/50">
          <CardHeader>
            <CardTitle className="text-yellow-600 dark:text-yellow-400 flex items-center gap-2">
              <TrendingDown className="h-5 w-5" />
              戰功下滑成員
            </CardTitle>
            <CardDescription>降幅超過 50%</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {mockDecliningMembers.map((member) => (
                <div
                  key={member.name}
                  className="flex items-center justify-between border-b pb-2 last:border-0"
                >
                  <div>
                    <p className="font-medium">{member.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {member.prev_merit.toLocaleString()} → {member.curr_merit.toLocaleString()}
                    </p>
                  </div>
                  <Badge variant="outline" className="text-yellow-600 dark:text-yellow-400">
                    {member.change_rate}%
                  </Badge>
                </div>
              ))}
              <Button variant="outline" size="sm" className="w-full mt-2">
                查看全部 ({mockDecliningMembers.length} 人)
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Group Insights */}
        <Card className="border-primary/30">
          <CardHeader>
            <CardTitle className="text-primary flex items-center gap-2">
              <Users className="h-5 w-5" />
              組別建議
            </CardTitle>
            <CardDescription>基於數據分析的行動建議</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3">
                <p className="text-sm font-medium text-destructive">
                  🔴 春組平均戰功下降
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  建議檢視組內活躍度與策略調整
                </p>
              </div>
              <div className="rounded-lg bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-500/20 p-3">
                <p className="text-sm font-medium text-yellow-600 dark:text-yellow-400">
                  🟡 146 人未分組
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  建議進行組別分配，提升管理效率
                </p>
              </div>
              <div className="rounded-lg bg-primary/10 border border-primary/20 p-3">
                <p className="text-sm font-medium text-primary">
                  ✅ 冬組表現優異
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  週均戰功 18.5萬，可作為其他組別標竿
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default Overview
