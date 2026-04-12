/**
 * Hegemony Weights Page - Season-based Weight Configuration
 *
 * Performance optimizations:
 * - Prefetches hegemony weights and CSV uploads for all seasons in parallel
 * - Reduces waterfall effect when rendering HegemonyWeightCards
 *
 * 符合 CLAUDE.md 🔴:
 * - JSX syntax only
 * - TanStack Query for server state
 * - Type-safe component
 * - Each season is a CollapsibleCard
 * - Auto-expand active season
 * - Auto-load snapshot weights
 */

import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Loader2, Scale } from 'lucide-react'
import { AllianceGuard } from '@/components/alliance/AllianceGuard'
import { EmptyState } from '@/components/ui/empty-state'
import { useSeasons } from '@/hooks/use-seasons'
import { HegemonyWeightCard } from '@/components/hegemony-weights/HegemonyWeightCard'
import { hegemonyWeightKeys } from '@/hooks/use-hegemony-weights'
import { csvUploadKeys } from '@/lib/query-keys'
import { apiClient } from '@/lib/api-client'

function HegemonyWeights() {
  const queryClient = useQueryClient()

  // Fetch all seasons
  const { data: seasons, isLoading } = useSeasons()

  /**
   * Prefetch hegemony weights and CSV uploads for all seasons
   * This runs in parallel and populates the cache before HegemonyWeightCards render
   */
  useEffect(() => {
    if (!seasons || seasons.length === 0) return

    // Prefetch data for all seasons in parallel
    seasons.forEach((season) => {
      // Prefetch hegemony weights
      queryClient.prefetchQuery({
        queryKey: hegemonyWeightKeys.list(season.id),
        queryFn: () => apiClient.getHegemonyWeights(season.id),
        staleTime: 5 * 60 * 1000
      })

      // Prefetch CSV uploads
      queryClient.prefetchQuery({
        queryKey: csvUploadKeys.list(season.id),
        queryFn: () => apiClient.getCsvUploads(season.id),
        staleTime: 5 * 60 * 1000
      })
    })
  }, [seasons, queryClient])

  /**
   * Sort seasons: current first, then by start_date descending
   */
  const sortedSeasons = seasons
    ? [...seasons].sort((a, b) => {
        if (a.is_current && !b.is_current) return -1
        if (!a.is_current && b.is_current) return 1
        return new Date(b.start_date).getTime() - new Date(a.start_date).getTime()
      })
    : []

  return (
    <AllianceGuard>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h2 className="text-2xl font-bold tracking-tight">霸業權重配置</h2>
          <p className="text-muted-foreground mt-1">
            設定各賽季的指標權重與時間點權重，用於計算盟友霸業排名
          </p>
        </div>

      {/* Info Card */}
      <div className="p-4 rounded-lg border bg-muted/30">
        <h3 className="text-sm font-semibold mb-2">權重系統說明</h3>
        <ul className="space-y-1 text-sm text-muted-foreground">
          <li>
            <strong>指標權重：</strong>
            每個快照內「貢獻/戰功/助攻/捐獻」的比重（總和需為 100%）
          </li>
          <li>
            <strong>快照權重：</strong>
            各時間快照在最終計算中的比重（總和需為 100%）
          </li>
          <li>
            <strong>計算公式：</strong>
            快照分數 = Σ(指標數據 × 指標權重)，最終分數 = Σ(快照分數 × 快照權重)
          </li>
        </ul>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Empty State */}
      {!isLoading && sortedSeasons.length === 0 && (
        <EmptyState
          icon={Scale}
          title="尚無賽季"
          description="請先前往「賽季管理」頁面建立賽季，並上傳 CSV 數據快照後，再回到此處配置霸業權重。"
        />
      )}

      {/* Season Weight Cards */}
      {!isLoading && sortedSeasons.length > 0 && (
        <div className="space-y-4">
          {sortedSeasons.map((season) => (
            <HegemonyWeightCard key={season.id} season={season} />
          ))}
        </div>
      )}
      </div>
    </AllianceGuard>
  )
}

export { HegemonyWeights }
