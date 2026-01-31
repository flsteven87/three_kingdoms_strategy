/**
 * AllianceAnalytics - Alliance Performance Analytics Dashboard
 *
 * Alliance-level performance analysis with 3 tabs:
 * 1. Overview: KPIs, trends, health metrics
 * 2. Group Comparison: Cross-group performance ranking
 * 3. Member Distribution: Distribution analysis, top/bottom performers
 *
 * Features ViewMode toggle (latest period vs season average) for fair comparison.
 */

import { useState } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AllianceGuard } from '@/components/alliance/AllianceGuard'
import { ViewModeToggle, type ViewMode } from '@/components/analytics/ViewModeToggle'
import { OverviewTab } from '@/components/analytics/OverviewTab'
import { GroupComparisonTab } from '@/components/analytics/GroupComparisonTab'
import { MemberDistributionTab } from '@/components/analytics/MemberDistributionTab'
import { useCurrentSeason } from '@/hooks/use-seasons'
import { useAllianceAnalytics } from '@/hooks/use-analytics'
import { EmptyState } from '@/components/ui/empty-state'
import { LayoutDashboard, GitCompare, Users } from 'lucide-react'

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      {/* KPI Cards Skeleton */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-32" />
              <Skeleton className="h-3 w-20 mt-2" />
            </CardContent>
          </Card>
        ))}
      </div>
      {/* Chart Skeleton */}
      <div className="grid gap-6 lg:grid-cols-2">
        {[...Array(2)].map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-48 mt-1" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-[200px] w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

function AllianceAnalytics() {
  const [activeTab, setActiveTab] = useState('overview')
  const [viewMode, setViewMode] = useState<ViewMode>('latest')

  // Get current season
  const { data: currentSeason, isLoading: seasonsLoading } = useCurrentSeason()

  // Get alliance analytics data
  const { data: analyticsData, isLoading: analyticsLoading } = useAllianceAnalytics(
    currentSeason?.id,
    viewMode
  )

  const isLoading = seasonsLoading || analyticsLoading
  const hasData = currentSeason && analyticsData

  return (
    <AllianceGuard>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">同盟分析</h2>
            <p className="text-muted-foreground mt-1">
              同盟整體表現分析與趨勢洞察
            </p>
          </div>

          <ViewModeToggle value={viewMode} onChange={setViewMode} />
        </div>

        {/* Loading State */}
        {isLoading && <LoadingSkeleton />}

        {/* No Data State */}
        {!isLoading && !hasData && (
          <EmptyState
            icon={LayoutDashboard}
            title="尚無數據"
            description="請先創建賽季並上傳 CSV 數據快照，以查看同盟分析。"
          />
        )}

        {/* Tab Navigation */}
        {!isLoading && hasData && (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="overview" className="flex items-center gap-2">
                <LayoutDashboard className="h-4 w-4" />
                <span>總覽</span>
              </TabsTrigger>
              <TabsTrigger value="groups" className="flex items-center gap-2">
                <GitCompare className="h-4 w-4" />
                <span>組別對比</span>
              </TabsTrigger>
              <TabsTrigger value="distribution" className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                <span>成員分佈</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview">
              <OverviewTab viewMode={viewMode} data={analyticsData} />
            </TabsContent>

            <TabsContent value="groups">
              <GroupComparisonTab data={analyticsData} />
            </TabsContent>

            <TabsContent value="distribution">
              <MemberDistributionTab viewMode={viewMode} data={analyticsData} />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </AllianceGuard>
  )
}

export { AllianceAnalytics }
