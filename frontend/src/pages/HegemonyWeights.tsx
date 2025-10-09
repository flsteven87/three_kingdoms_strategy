/**
 * Hegemony Weights Page - Season-based Weight Configuration
 *
 * 符合 CLAUDE.md 🔴:
 * - JSX syntax only
 * - TanStack Query for server state
 * - Type-safe component
 * - Each season is a CollapsibleCard
 * - Auto-expand active season
 * - Auto-load snapshot weights
 */

import React from 'react'
import { Loader2, Scale } from 'lucide-react'
import { AllianceGuard } from '@/components/alliance/AllianceGuard'
import { useSeasons } from '@/hooks/use-seasons'
import { HegemonyWeightCard } from '@/components/hegemony-weights/HegemonyWeightCard'

const HegemonyWeights: React.FC = () => {
  // Fetch all seasons
  const { data: seasons, isLoading } = useSeasons()

  /**
   * Sort seasons: active first, then by start_date descending
   */
  const sortedSeasons = seasons
    ? [...seasons].sort((a, b) => {
        if (a.is_active && !b.is_active) return -1
        if (!a.is_active && b.is_active) return 1
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
        <div className="flex flex-col items-center justify-center py-12 text-center border-2 border-dashed rounded-lg">
          <Scale className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-muted-foreground mb-4">尚未建立任何賽季</p>
          <p className="text-sm text-muted-foreground max-w-md">
            請先前往「賽季管理」頁面建立賽季，並上傳 CSV 數據快照後，再回到此處配置霸業權重。
          </p>
        </div>
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

export default HegemonyWeights
