/**
 * Seasons Page - Inline Editing with CollapsibleCard
 *
 * 符合 CLAUDE.md 🔴:
 * - JSX syntax only
 * - TanStack Query for server state
 * - Type-safe component
 * - No dialogs, inline editing only
 * - Optimistic updates
 */

import React, { useState, useCallback } from 'react'
import { Plus, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { SeasonCard } from '@/components/seasons/SeasonCard'
import { useAlliance } from '@/hooks/use-alliance'
import {
  useSeasons,
  useCreateSeason,
  useUpdateSeason,
  useDeleteSeason,
  useActivateSeason
} from '@/hooks/use-seasons'
import type { Season } from '@/types/season'

const Seasons: React.FC = () => {
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

  // Mutations
  const createMutation = useCreateSeason()
  const updateMutation = useUpdateSeason()
  const deleteMutation = useDeleteSeason()
  const activateMutation = useActivateSeason()

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

  /**
   * Handle create new season
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
      is_active: false
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
   * Handle activate season (optimistic)
   */
  const handleActivate = useCallback(async (seasonId: string) => {
    await activateMutation.mutateAsync(seasonId)
  }, [activateMutation])

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

  if (!alliance) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">賽季管理</h2>
          <p className="text-muted-foreground mt-1">請先設定同盟資訊</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">賽季管理</h2>
          <p className="text-muted-foreground mt-1">管理遊戲賽季與數據週期</p>
        </div>
        {!isCreating && (
          <Button onClick={() => setIsCreating(true)}>
            <Plus className="h-4 w-4 mr-2" />
            新增賽季
          </Button>
        )}
      </div>

      {/* Create New Season Card */}
      {isCreating && (
        <Card className="border-primary/50 shadow-sm">
          <CardHeader>
            <CardTitle>建立新賽季</CardTitle>
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
          <Button onClick={() => setIsCreating(true)}>
            <Plus className="h-4 w-4 mr-2" />
            建立第一個賽季
          </Button>
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
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default Seasons
