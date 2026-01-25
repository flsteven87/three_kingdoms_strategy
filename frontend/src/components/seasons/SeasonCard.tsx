/**
 * SeasonCard - Collapsible Season Card with Inline Editing
 *
 * Season Purchase System:
 * - activation_status: draft → activated → completed (payment state)
 * - is_current: Whether this season is selected for display
 *
 * 符合 CLAUDE.md 🔴:
 * - JSX syntax only
 * - Type-safe component
 * - Inline editing without dialog
 * - Optimistic updates
 */

import { useState, useCallback } from 'react'
import { Calendar, Activity, Trash2, Check, X, Edit2, Star, CheckCircle } from 'lucide-react'
import { CollapsibleCard } from '@/components/ui/collapsible-card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { DeleteConfirmDialog } from '@/components/ui/delete-confirm-dialog'
import { useCanManageSeasons } from '@/hooks/use-user-role'
import { useCanActivateSeason } from '@/hooks/use-season-quota'
import type { Season } from '@/types/season'
import {
  canActivate,
  canSetAsCurrent,
  getActivationStatusLabel,
  getActivationStatusColor,
} from '@/types/season'

interface SeasonCardProps {
  readonly season: Season
  readonly onUpdate: (seasonId: string, data: Partial<Season>) => Promise<void>
  readonly onDelete: (seasonId: string) => Promise<void>
  readonly onActivate: (seasonId: string) => Promise<void>
  readonly onSetCurrent: (seasonId: string) => Promise<void>
  readonly onComplete?: (seasonId: string) => Promise<void>
}

export function SeasonCard({
  season,
  onUpdate,
  onDelete,
  onActivate,
  onSetCurrent,
  onComplete,
}: SeasonCardProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [activateDialogOpen, setActivateDialogOpen] = useState(false)
  const [setCurrentDialogOpen, setSetCurrentDialogOpen] = useState(false)
  const [completeDialogOpen, setCompleteDialogOpen] = useState(false)
  const [editData, setEditData] = useState({
    name: season.name,
    start_date: season.start_date,
    end_date: season.end_date || '',
    description: season.description || ''
  })

  const canManageSeasons = useCanManageSeasons()
  const canActivateSeasonStatus = useCanActivateSeason()

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

  const handleSetCurrentClick = useCallback(() => {
    setSetCurrentDialogOpen(true)
  }, [])

  const handleConfirmSetCurrent = useCallback(async () => {
    await onSetCurrent(season.id)
    setSetCurrentDialogOpen(false)
  }, [season.id, onSetCurrent])

  const handleCompleteClick = useCallback(() => {
    setCompleteDialogOpen(true)
  }, [])

  const handleConfirmComplete = useCallback(async () => {
    if (onComplete) {
      await onComplete(season.id)
    }
    setCompleteDialogOpen(false)
  }, [season.id, onComplete])

  const handleDeleteClick = useCallback(() => {
    setDeleteDialogOpen(true)
  }, [])

  const handleConfirmDelete = useCallback(async () => {
    await onDelete(season.id)
  }, [season.id, onDelete])

  // Determine which buttons to show based on activation_status and is_current
  const showActivateButton = canActivate(season) && canActivateSeasonStatus
  const showSetCurrentButton = canSetAsCurrent(season) && !season.is_current
  const showCompleteButton = season.activation_status === 'activated' && onComplete
  // Only draft seasons can be deleted
  const canDelete = season.activation_status === 'draft'
  // Check if activation is blocked due to missing end_date
  const activationBlockedNoEndDate = canActivate(season) && !season.end_date

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
          {/* Activate button for draft seasons */}
          {showActivateButton && !activationBlockedNoEndDate && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleActivateClick}
              className="h-8"
            >
              <Activity className="h-4 w-4 mr-1" />
              啟用賽季
            </Button>
          )}
          {/* Show hint when activation is blocked due to missing end_date */}
          {activationBlockedNoEndDate && canActivateSeasonStatus && (
            <span className="text-xs text-muted-foreground">
              請先設定結束日期
            </span>
          )}
          {/* Set as current button for activated but not current seasons */}
          {showSetCurrentButton && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleSetCurrentClick}
              className="h-8"
            >
              <Star className="h-4 w-4 mr-1" />
              設為目前
            </Button>
          )}
          {/* Complete button for activated seasons */}
          {showCompleteButton && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleCompleteClick}
              className="h-8"
            >
              <CheckCircle className="h-4 w-4 mr-1" />
              結束賽季
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
          {canDelete && (
            <Button
              size="sm"
              variant="ghost"
              onClick={handleDeleteClick}
              className="h-8 px-2 text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </>
      )}
    </div>
  ) : undefined

  const icon = <Calendar className="h-4 w-4" />

  const title = season.name

  // Build badges based on status
  const statusColor = getActivationStatusColor(season.activation_status)
  const statusVariant = statusColor === 'green' ? 'default' :
                        statusColor === 'blue' ? 'secondary' : 'outline'

  const badge = (
    <div className="flex items-center gap-2">
      {season.is_current && (
        <Badge variant="default" className="text-xs">
          目前賽季
        </Badge>
      )}
      <Badge variant={statusVariant} className="text-xs">
        {getActivationStatusLabel(season.activation_status)}
      </Badge>
    </div>
  )

  const description = season.is_current
    ? '目前選定的賽季，所有新上傳的數據將歸類至此賽季'
    : season.activation_status === 'draft'
      ? '草稿狀態 - 啟用後才能設為目前賽季'
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
        defaultExpanded={season.is_current}
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
                  <Label htmlFor={`season-start-${season.id}`}>
                    開始日期
                    {season.activation_status !== 'draft' && (
                      <span className="ml-2 text-xs text-muted-foreground">（已鎖定）</span>
                    )}
                  </Label>
                  <Input
                    id={`season-start-${season.id}`}
                    type="date"
                    value={editData.start_date}
                    onChange={(e) => setEditData({ ...editData, start_date: e.target.value })}
                    disabled={season.activation_status !== 'draft'}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`season-end-${season.id}`}>
                    結束日期
                    {season.activation_status === 'completed' && (
                      <span className="ml-2 text-xs text-muted-foreground">（已鎖定）</span>
                    )}
                    {season.activation_status === 'draft' && (
                      <span className="ml-2 text-xs text-muted-foreground">（啟用前必填）</span>
                    )}
                  </Label>
                  <Input
                    id={`season-end-${season.id}`}
                    type="date"
                    value={editData.end_date}
                    onChange={(e) => setEditData({ ...editData, end_date: e.target.value })}
                    disabled={season.activation_status === 'completed'}
                  />
                </div>
              </div>

              {season.activation_status === 'activated' && (
                <p className="text-xs text-muted-foreground">
                  賽季已啟用：開始日期已鎖定，結束日期可延長（最長 120 天且不與其他賽季重疊）
                </p>
              )}

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
        warningMessage="啟用後會消耗 1 季（試用期間免費），此賽季可設為「目前賽季」來進行數據分析。"
        confirmText="確定啟用"
        variant="default"
      />

      {/* Set Current Confirmation Dialog */}
      <DeleteConfirmDialog
        open={setCurrentDialogOpen}
        onOpenChange={setSetCurrentDialogOpen}
        onConfirm={handleConfirmSetCurrent}
        title="設為目前賽季"
        description="確定要將此賽季設為目前賽季嗎？"
        itemName={season.name}
        warningMessage="設為目前賽季後，系統的數據分析功能（總覽、同盟分析、成員表現等）將顯示此賽季的數據。其他賽季將取消「目前」狀態，但資料不會受影響。"
        confirmText="確定設定"
        variant="default"
      />

      {/* Complete Confirmation Dialog */}
      <DeleteConfirmDialog
        open={completeDialogOpen}
        onOpenChange={setCompleteDialogOpen}
        onConfirm={handleConfirmComplete}
        title="結束賽季"
        description="確定要結束此賽季嗎？"
        itemName={season.name}
        warningMessage="結束賽季後，此賽季將標記為「已結束」。您仍可查看歷史數據，但無法再上傳新資料到此賽季。"
        confirmText="確定結束"
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
        warningMessage="此操作將永久刪除賽季及所有相關數據（CSV 上傳、成員快照等），無法復原。"
      />
    </>
  )
}
