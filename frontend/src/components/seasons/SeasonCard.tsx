/**
 * SeasonCard - Collapsible Season Card with Inline Editing
 *
 * 符合 CLAUDE.md 🔴:
 * - JSX syntax only
 * - Type-safe component
 * - Inline editing without dialog
 * - Optimistic updates
 */

import { useState, useCallback } from 'react'
import { Calendar, Activity, Trash2, Check, X, Edit2 } from 'lucide-react'
import { CollapsibleCard } from '@/components/ui/collapsible-card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { DeleteConfirmDialog } from '@/components/ui/delete-confirm-dialog'
import { useCanManageSeasons } from '@/hooks/use-user-role'
import type { Season } from '@/types/season'

interface SeasonCardProps {
  readonly season: Season
  readonly onUpdate: (seasonId: string, data: Partial<Season>) => Promise<void>
  readonly onDelete: (seasonId: string) => Promise<void>
  readonly onActivate: (seasonId: string) => Promise<void>
}

export function SeasonCard({
  season,
  onUpdate,
  onDelete,
  onActivate,
}: SeasonCardProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [activateDialogOpen, setActivateDialogOpen] = useState(false)
  const [editData, setEditData] = useState({
    name: season.name,
    start_date: season.start_date,
    end_date: season.end_date || '',
    description: season.description || ''
  })

  const canManageSeasons = useCanManageSeasons()

  const handleEdit = useCallback(() => {
    setIsEditing(true)
  }, [])

  const handleCancel = useCallback(() => {
    setIsEditing(false)
    setEditData({
      name: season.name,
      start_date: season.start_date,
      end_date: season.end_date || '',
      description: season.description || ''
    })
  }, [season])

  const handleSave = useCallback(async () => {
    await onUpdate(season.id, {
      name: editData.name,
      start_date: editData.start_date,
      end_date: editData.end_date || null,
      description: editData.description || null
    })
    setIsEditing(false)
  }, [season.id, editData, onUpdate])

  const handleActivateClick = useCallback(() => {
    setActivateDialogOpen(true)
  }, [])

  const handleConfirmActivate = useCallback(async () => {
    await onActivate(season.id)
    setActivateDialogOpen(false)
  }, [season.id, onActivate])

  const handleDeleteClick = useCallback(() => {
    setDeleteDialogOpen(true)
  }, [])

  const handleConfirmDelete = useCallback(async () => {
    await onDelete(season.id)
  }, [season.id, onDelete])

  const actions = canManageSeasons ? (
    <div className="flex items-center gap-2">
      {isEditing ? (
        <>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleCancel}
            className="h-8 px-2"
          >
            <X className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="default"
            onClick={handleSave}
            className="h-8 px-2"
          >
            <Check className="h-4 w-4" />
          </Button>
        </>
      ) : (
        <>
          {!season.is_active && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleActivateClick}
              className="h-8"
            >
              <Activity className="h-4 w-4 mr-1" />
              啟用
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={handleEdit}
            className="h-8 px-2"
          >
            <Edit2 className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleDeleteClick}
            className="h-8 px-2 text-destructive hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </>
      )}
    </div>
  ) : undefined

  const icon = <Calendar className="h-4 w-4" />

  const title = season.name

  const badge = season.is_active ? (
    <Badge variant="default" className="text-xs">
      進行中
    </Badge>
  ) : undefined

  const description = season.is_active
    ? '目前進行中的賽季，所有新上傳的數據將歸類至此賽季'
    : `${season.start_date}${season.end_date ? ` - ${season.end_date}` : ' - 進行中'}`

  return (
    <>
      <CollapsibleCard
        icon={icon}
        title={title}
        badge={badge}
        description={description}
        actions={actions}
        collapsible={true}
        defaultExpanded={season.is_active}
      >
        {isEditing ? (
          <div className="space-y-4">
            {/* Edit Mode */}
            <div className="grid gap-4">
              <div className="space-y-2">
                <Label htmlFor={`season-name-${season.id}`}>賽季名稱</Label>
                <Input
                  id={`season-name-${season.id}`}
                  value={editData.name}
                  onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                  placeholder="例如：第一賽季、春季賽"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor={`season-start-${season.id}`}>開始日期</Label>
                  <Input
                    id={`season-start-${season.id}`}
                    type="date"
                    value={editData.start_date}
                    onChange={(e) => setEditData({ ...editData, start_date: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`season-end-${season.id}`}>結束日期</Label>
                  <Input
                    id={`season-end-${season.id}`}
                    type="date"
                    value={editData.end_date}
                    onChange={(e) => setEditData({ ...editData, end_date: e.target.value })}
                    placeholder="選填（留空表示進行中）"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor={`season-desc-${season.id}`}>賽季說明</Label>
                <Input
                  id={`season-desc-${season.id}`}
                  value={editData.description}
                  onChange={(e) => setEditData({ ...editData, description: e.target.value })}
                  placeholder="選填：補充說明或備註"
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* View Mode */}
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground mb-1">開始日期</p>
                <p className="font-medium">{season.start_date}</p>
              </div>
              <div>
                <p className="text-muted-foreground mb-1">結束日期</p>
                <p className="font-medium">{season.end_date || '進行中'}</p>
              </div>
            </div>

            {season.description && (
              <div className="text-sm">
                <p className="text-muted-foreground mb-1">說明</p>
                <p className="text-foreground">{season.description}</p>
              </div>
            )}

            <div className="pt-4 border-t border-border/50">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>建立於 {new Date(season.created_at).toLocaleDateString('zh-TW')}</span>
                <span>更新於 {new Date(season.updated_at).toLocaleDateString('zh-TW')}</span>
              </div>
            </div>
          </div>
        )}
      </CollapsibleCard>

      {/* Activate Confirmation Dialog */}
      <DeleteConfirmDialog
        open={activateDialogOpen}
        onOpenChange={setActivateDialogOpen}
        onConfirm={handleConfirmActivate}
        title="啟用賽季"
        description="確定要啟用此賽季嗎？"
        itemName={season.name}
        warningMessage="啟用此賽季後，其他所有賽季將自動停用。系統的數據分析功能（總覽、同盟分析、成員表現等）將僅顯示此賽季的數據。已上傳的歷史數據不會受影響，您可以隨時切換回其他賽季。"
        confirmText="確定啟用"
        variant="default"
      />

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleConfirmDelete}
        title="刪除賽季"
        description="確定要刪除此賽季嗎？"
        itemName={season.name}
        warningMessage="此操作將永久刪除賽季及相關的所有數據（CSV 上傳記錄、成員快照等），且無法復原。"
      />
    </>
  )
}
