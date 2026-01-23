/**
 * CopperMines Page - Copper mine management
 *
 * Two sections:
 * 1. Rules configuration (alliance level) - Collaborator+ can edit
 * 2. Ownership list (season level) - All members can view
 */

import { Loader2, Gem } from 'lucide-react'
import { AllianceGuard } from '@/components/alliance/AllianceGuard'
import { useAlliance } from '@/hooks/use-alliance'
import { useCurrentSeason } from '@/hooks/use-seasons'
import { CopperMineRulesCard } from '@/components/copper-mines/CopperMineRulesCard'
import { CopperMineListCard } from '@/components/copper-mines/CopperMineListCard'
import { Alert, AlertDescription } from '@/components/ui/alert'

export function CopperMines() {
  const { data: alliance, isLoading: isLoadingAlliance } = useAlliance()
  const { data: currentSeason, isLoading: isLoadingSeason } = useCurrentSeason()

  const isLoading = isLoadingAlliance || isLoadingSeason

  return (
    <AllianceGuard>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <div className="flex items-center gap-2">
            <Gem className="h-6 w-6 text-amber-500" />
            <h2 className="text-2xl font-bold tracking-tight">銅礦管理</h2>
          </div>
          <p className="text-muted-foreground mt-1">
            設定銅礦申請規則並管理成員的銅礦擁有記錄
          </p>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Content */}
        {!isLoading && alliance && (
          <div className="space-y-6">
            {/* Rules Section (Alliance Level) */}
            <CopperMineRulesCard />

            {/* Ownership List Section (Season Level) */}
            {currentSeason ? (
              <CopperMineListCard
                seasonId={currentSeason.id}
                seasonName={currentSeason.name}
              />
            ) : (
              <Alert>
                <AlertDescription>
                  請先前往「賽季管理」頁面建立並啟用一個賽季，才能管理銅礦擁有記錄。
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}
      </div>
    </AllianceGuard>
  )
}
