/**
 * Seasons Page - Season Purchase System
 *
 * Supports the Season Purchase System:
 * - Create draft seasons (no quota required)
 * - Activate seasons (consumes season credit or uses trial)
 * - Set activated seasons as current
 * - Complete seasons
 *
 * 符合 CLAUDE.md 🔴:
 * - JSX syntax only
 * - TanStack Query for server state
 * - Type-safe component
 * - Optimistic updates
 */

import { useState, useCallback } from 'react'
import { Plus, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { SeasonCard } from '@/components/seasons/SeasonCard'
import { AllianceGuard } from '@/components/alliance/AllianceGuard'
import { RoleGuard } from '@/components/alliance/RoleGuard'
import { useAlliance } from '@/hooks/use-alliance'
import { useSeasonQuotaDisplay } from '@/hooks/use-season-quota'
import {
  useSeasons,
  useCreateSeason,
  useUpdateSeason,
  useDeleteSeason,
  useActivateSeason,
  useSetCurrentSeason,
  useCompleteSeason
} from '@/hooks/use-seasons'
import type { Season } from '@/types/season'

function Seasons() {
  const [isCreating, setIsCreating] = useState(false)
  const [newSeasonData, setNewSeasonData] = useState({
    name: '',
    start_date: new Date().toISOString().split('T')[0],
    end_date: '',
    description: ''
  })

  // Fetch alliance data
  const { data: alliance } = useAlliance()

  // Fetch seasons
  const { data: seasons, isLoading } = useSeasons()

  // Season quota status for display
  const quotaDisplay = useSeasonQuotaDisplay()

  // Mutations
  const createMutation = useCreateSeason()
  const updateMutation = useUpdateSeason()
  const deleteMutation = useDeleteSeason()
  const activateMutation = useActivateSeason()
  const setCurrentMutation = useSetCurrentSeason()
  const completeMutation = useCompleteSeason()

  /**
   * Sort seasons: current first, then activated, then draft, by start_date descending
   */
  const sortedSeasons = seasons
    ? [...seasons].sort((a, b) => {
        // Current season first
        if (a.is_current && !b.is_current) return -1
        if (!a.is_current && b.is_current) return 1

        // Then by activation_status: activated > draft > completed
        const statusOrder = { activated: 0, draft: 1, completed: 2 }
        const statusDiff = statusOrder[a.activation_status] - statusOrder[b.activation_status]
        if (statusDiff !== 0) return statusDiff

        // Then by start_date descending
        return new Date(b.start_date).getTime() - new Date(a.start_date).getTime()
      })
    : []

  /**
   * Handle create new season (as draft)
   */
  const handleCreate = useCallback(async () => {
    if (!alliance || !newSeasonData.name.trim() || !newSeasonData.start_date) {
      return
    }

    await createMutation.mutateAsync({
      alliance_id: alliance.id,
      name: newSeasonData.name,
      start_date: newSeasonData.start_date,
      end_date: newSeasonData.end_date || null,
      description: newSeasonData.description || null,
    })

    // Reset form
    setNewSeasonData({
      name: '',
      start_date: new Date().toISOString().split('T')[0],
      end_date: '',
      description: ''
    })
    setIsCreating(false)
  }, [alliance, newSeasonData, createMutation])

  /**
   * Handle update season (optimistic)
   */
  const handleUpdate = useCallback(async (seasonId: string, data: Partial<Season>) => {
    await updateMutation.mutateAsync({ seasonId, data })
  }, [updateMutation])

  /**
   * Handle delete season (optimistic)
   */
  const handleDelete = useCallback(async (seasonId: string) => {
    await deleteMutation.mutateAsync(seasonId)
  }, [deleteMutation])

  /**
   * Handle activate season (consume season credit)
   */
  const handleActivate = useCallback(async (seasonId: string) => {
    await activateMutation.mutateAsync(seasonId)
  }, [activateMutation])

  /**
   * Handle set season as current
   */
  const handleSetCurrent = useCallback(async (seasonId: string) => {
    await setCurrentMutation.mutateAsync(seasonId)
  }, [setCurrentMutation])

  /**
   * Handle complete season
   */
  const handleComplete = useCallback(async (seasonId: string) => {
    await completeMutation.mutateAsync(seasonId)
  }, [completeMutation])

  /**
   * Cancel create mode
   */
  const handleCancelCreate = useCallback(() => {
    setIsCreating(false)
    setNewSeasonData({
      name: '',
      start_date: new Date().toISOString().split('T')[0],
      end_date: '',
      description: ''
    })
  }, [])

  return (
    <AllianceGuard>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">賽季管理</h2>
            <p className="text-muted-foreground mt-1">管理遊戲賽季與數據週期</p>
          </div>
          <RoleGuard requiredRoles={['owner', 'collaborator']}>
            {!isCreating && (
              <Button onClick={() => setIsCreating(true)}>
                <Plus className="h-4 w-4 mr-2" />
                新增賽季
              </Button>
            )}
          </RoleGuard>
        </div>

        {/* Season Quota Status Card */}
        <RoleGuard requiredRoles={['owner', 'collaborator']}>
          <Card className="border-muted">
            <CardHeader className="py-4">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">賽季額度</CardTitle>
                  <CardDescription>
                    {quotaDisplay.status}
                  </CardDescription>
                </div>
                <div className="text-right">
                  {quotaDisplay.availableSeasons > 0 ? (
                    <p className="text-2xl font-bold text-green-600">
                      {quotaDisplay.availableSeasons}
                    </p>
                  ) : quotaDisplay.trialDaysRemaining !== null ? (
                    <p className="text-sm text-muted-foreground">
                      試用期剩餘 {quotaDisplay.trialDaysRemaining} 天
                    </p>
                  ) : (
                    <p className="text-sm text-destructive">
                      無可用額度
                    </p>
                  )}
                </div>
              </div>
            </CardHeader>
          </Card>
        </RoleGuard>

        {/* Create New Season Card */}
        <RoleGuard requiredRoles={['owner', 'collaborator']}>
          {isCreating && (
            <Card className="border-primary/50 shadow-sm">
              <CardHeader>
                <CardTitle>建立新賽季</CardTitle>
                <CardDescription>
                  新賽季將建立為草稿狀態。啟用後才會消耗季數額度（試用期間免費）。
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="new-season-name">賽季名稱 *</Label>
                    <Input
                      id="new-season-name"
                      value={newSeasonData.name}
                      onChange={(e) => setNewSeasonData({ ...newSeasonData, name: e.target.value })}
                      placeholder="例如：第一賽季、春季賽"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="new-season-start">開始日期 *</Label>
                      <Input
                        id="new-season-start"
                        type="date"
                        value={newSeasonData.start_date}
                        onChange={(e) => setNewSeasonData({ ...newSeasonData, start_date: e.target.value })}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="new-season-end">結束日期</Label>
                      <Input
                        id="new-season-end"
                        type="date"
                        value={newSeasonData.end_date}
                        onChange={(e) => setNewSeasonData({ ...newSeasonData, end_date: e.target.value })}
                        placeholder="選填（留空表示進行中）"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="new-season-desc">賽季說明</Label>
                    <Input
                      id="new-season-desc"
                      value={newSeasonData.description}
                      onChange={(e) => setNewSeasonData({ ...newSeasonData, description: e.target.value })}
                      placeholder="選填：補充說明或備註"
                    />
                  </div>
                </div>

                <div className="flex gap-2 pt-4">
                  <Button
                    variant="outline"
                    onClick={handleCancelCreate}
                    disabled={createMutation.isPending}
                  >
                    取消
                  </Button>
                  <Button
                    onClick={handleCreate}
                    disabled={createMutation.isPending || !newSeasonData.name.trim() || !newSeasonData.start_date}
                  >
                    {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    建立賽季
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </RoleGuard>

        {/* Loading State */}
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Empty State */}
        {!isLoading && sortedSeasons.length === 0 && !isCreating && (
          <div className="flex flex-col items-center justify-center py-12 text-center border-2 border-dashed rounded-lg">
            <p className="text-muted-foreground mb-4">尚未建立任何賽季</p>
            <p className="text-sm text-muted-foreground max-w-md mb-6">
              建立第一個賽季以開始追蹤盟友表現數據。每個賽季可以設定時間範圍，方便進行數據分析與比較。
            </p>
            <RoleGuard requiredRoles={['owner', 'collaborator']}>
              <Button onClick={() => setIsCreating(true)}>
                <Plus className="h-4 w-4 mr-2" />
                建立第一個賽季
              </Button>
            </RoleGuard>
          </div>
        )}

        {/* Season Cards */}
        {!isLoading && sortedSeasons.length > 0 && (
          <div className="space-y-4">
            {sortedSeasons.map((season) => (
              <SeasonCard
                key={season.id}
                season={season}
                onUpdate={handleUpdate}
                onDelete={handleDelete}
                onActivate={handleActivate}
                onSetCurrent={handleSetCurrent}
                onComplete={handleComplete}
              />
            ))}
          </div>
        )}
      </div>
    </AllianceGuard>
  )
}

export { Seasons }
