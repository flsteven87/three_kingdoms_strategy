/**
 * SeasonCard - Collapsible Season Card with Inline Editing
 *
 * Season Purchase System:
 * - activation_status: draft → activated → completed (payment state)
 * - is_current: Whether this season is selected for display
 *
 * UX Design Decisions:
 * - "Current season" indicated by left border, not badge (visual hierarchy)
 * - Edit/Delete/Complete buttons in expanded area (progressive disclosure)
 * - Primary actions (Activate/Set Current) in header (quick access)
 *
 * 符合 CLAUDE.md 🔴:
 * - JSX syntax only
 * - Type-safe component
 * - Hyper-minimal UI - typography hierarchy over badges
 * - No manual memoization (React Compiler handles)
 */

import { useState } from "react";
import {
  Activity,
  Check,
  CheckCircle,
  Edit2,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { CollapsibleCard } from "@/components/ui/collapsible-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import { useCanManageSeasons } from "@/hooks/use-user-role";
import { useCanActivateSeason } from "@/hooks/use-season-quota";
import type { Season } from "@/types/season";
import {
  canActivate,
  canSetAsCurrent,
  canReopen,
  getActivationStatusLabel,
  getActivationStatusColor,
} from "@/types/season";
import { formatDateTW } from "@/lib/date-utils";

interface SeasonCardProps {
  readonly season: Season;
  readonly onUpdate: (seasonId: string, data: Partial<Season>) => Promise<void>;
  readonly onDelete: (seasonId: string) => Promise<void>;
  readonly onActivate: (seasonId: string) => Promise<void>;
  readonly onSetCurrent: (seasonId: string) => Promise<void>;
  readonly onComplete?: (seasonId: string) => Promise<void>;
  readonly onReopen?: (seasonId: string) => Promise<void>;
}

export function SeasonCard({
  season,
  onUpdate,
  onDelete,
  onActivate,
  onSetCurrent,
  onComplete,
  onReopen,
}: SeasonCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [activateDialogOpen, setActivateDialogOpen] = useState(false);
  const [setCurrentDialogOpen, setSetCurrentDialogOpen] = useState(false);
  const [completeDialogOpen, setCompleteDialogOpen] = useState(false);
  const [reopenDialogOpen, setReopenDialogOpen] = useState(false);
  const [editData, setEditData] = useState({
    name: season.name,
    start_date: season.start_date,
    end_date: season.end_date || "",
    description: season.description || "",
  });

  const canManageSeasons = useCanManageSeasons();
  const canActivateSeasonStatus = useCanActivateSeason();

  // Event handlers - React Compiler handles memoization automatically
  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditData({
      name: season.name,
      start_date: season.start_date,
      end_date: season.end_date || "",
      description: season.description || "",
    });
  };

  const handleSave = async () => {
    await onUpdate(season.id, {
      name: editData.name,
      start_date: editData.start_date,
      end_date: editData.end_date || null,
      description: editData.description || null,
    });
    setIsEditing(false);
  };

  const handleActivateClick = () => {
    setActivateDialogOpen(true);
  };

  const handleConfirmActivate = async () => {
    await onActivate(season.id);
    setActivateDialogOpen(false);
  };

  const handleSetCurrentClick = () => {
    setSetCurrentDialogOpen(true);
  };

  const handleConfirmSetCurrent = async () => {
    await onSetCurrent(season.id);
    setSetCurrentDialogOpen(false);
  };

  const handleCompleteClick = () => {
    setCompleteDialogOpen(true);
  };

  const handleConfirmComplete = async () => {
    if (onComplete) {
      await onComplete(season.id);
    }
    setCompleteDialogOpen(false);
  };

  const handleReopenClick = () => {
    setReopenDialogOpen(true);
  };

  const handleConfirmReopen = async () => {
    if (onReopen) {
      await onReopen(season.id);
    }
    setReopenDialogOpen(false);
  };

  const handleDeleteClick = () => {
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    await onDelete(season.id);
  };

  // Determine which buttons to show based on activation_status and is_current
  const showActivateButton = canActivate(season) && canActivateSeasonStatus;
  const showSetCurrentButton = canSetAsCurrent(season) && !season.is_current;
  const showCompleteButton =
    season.activation_status === "activated" && onComplete;
  const showReopenButton = canReopen(season) && onReopen;
  // Only draft seasons can be deleted
  const canDeleteSeason = season.activation_status === "draft";

  // Header actions: Only primary actions (Activate, Set Current)
  // Edit/Delete/Complete moved to expanded content for progressive disclosure
  const headerActions = canManageSeasons ? (
    <div className="flex items-center gap-2">
      {showActivateButton && (
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
    </div>
  ) : undefined;

  const title = season.name;

  // Build badges: Only status + trial (current indicated by left border)
  const statusColor = getActivationStatusColor(season.activation_status);
  const statusVariant =
    statusColor === "green"
      ? "default"
      : statusColor === "blue"
        ? "secondary"
        : "outline";

  const badge = (
    <div className="flex items-center gap-2">
      {season.is_trial && (
        <Badge variant="secondary" className="text-xs">
          試用
        </Badge>
      )}
      <Badge variant={statusVariant} className="text-xs">
        {getActivationStatusLabel(season.activation_status)}
      </Badge>
    </div>
  );

  // Description shows date range for non-draft seasons
  const description =
    season.activation_status === "draft"
      ? "草稿狀態 - 啟用後才能設為目前賽季"
      : `${season.start_date}${season.end_date ? ` ~ ${season.end_date}` : " ~ 進行中"}`;

  return (
    <>
      <CollapsibleCard
        title={title}
        badge={badge}
        description={description}
        actions={headerActions}
        collapsible={true}
        defaultExpanded={season.is_current}
        className={
          season.is_current ? "border-l-4 border-l-primary" : undefined
        }
      >
        <div className="space-y-4">
          {/* Unified layout for both view and edit modes */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground mb-1">
                開始日期
                {isEditing && season.activation_status !== "draft" && (
                  <span className="ml-1 text-xs">（已鎖定）</span>
                )}
              </p>
              {isEditing ? (
                <Input
                  type="date"
                  value={editData.start_date}
                  onChange={(e) =>
                    setEditData({ ...editData, start_date: e.target.value })
                  }
                  disabled={season.activation_status !== "draft"}
                  className="h-8 text-sm"
                />
              ) : (
                <p className="font-medium">{season.start_date}</p>
              )}
            </div>
            <div>
              <p className="text-muted-foreground mb-1">
                結束日期
                {isEditing && season.activation_status === "completed" && (
                  <span className="ml-1 text-xs">（已鎖定）</span>
                )}
              </p>
              {isEditing ? (
                <Input
                  type="date"
                  value={editData.end_date}
                  onChange={(e) =>
                    setEditData({ ...editData, end_date: e.target.value })
                  }
                  disabled={season.activation_status === "completed"}
                  className="h-8 text-sm"
                />
              ) : (
                <p className="font-medium">{season.end_date || "進行中"}</p>
              )}
            </div>
          </div>

          {/* Description - always show in edit mode, conditional in view mode */}
          {(isEditing || season.description) && (
            <div className="text-sm">
              <p className="text-muted-foreground mb-1">說明</p>
              {isEditing ? (
                <Input
                  value={editData.description}
                  onChange={(e) =>
                    setEditData({ ...editData, description: e.target.value })
                  }
                  placeholder="選填：補充說明或備註"
                  className="h-8 text-sm"
                />
              ) : (
                <p className="text-foreground">{season.description}</p>
              )}
            </div>
          )}

          {/* Help text for activated seasons in edit mode */}
          {isEditing && season.activation_status === "activated" && (
            <p className="text-xs text-muted-foreground">
              賽季已啟用：開始日期已鎖定，結束日期可延長（最長 120
              天且不與其他賽季重疊）
            </p>
          )}

          {/* Footer with timestamps and actions */}
          <div className="pt-4 border-t border-border/50">
            <div className="flex items-center justify-between">
              <div className="text-xs text-muted-foreground">
                <span>建立於 {formatDateTW(season.created_at)}</span>
                <span className="mx-2">·</span>
                <span>更新於 {formatDateTW(season.updated_at)}</span>
              </div>

              {/* Action buttons - different for edit vs view mode */}
              {canManageSeasons && (
                <div className="flex items-center gap-1">
                  {isEditing ? (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={handleCancel}
                        className="h-8 text-muted-foreground hover:text-foreground"
                      >
                        <X className="h-4 w-4 mr-1" />
                        取消
                      </Button>
                      <Button
                        size="sm"
                        variant="default"
                        onClick={handleSave}
                        className="h-8"
                      >
                        <Check className="h-4 w-4 mr-1" />
                        儲存
                      </Button>
                    </>
                  ) : (
                    <>
                      {showCompleteButton && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={handleCompleteClick}
                          className="h-8 text-muted-foreground hover:text-foreground"
                        >
                          <CheckCircle className="h-4 w-4 mr-1" />
                          結束賽季
                        </Button>
                      )}
                      {showReopenButton && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={handleReopenClick}
                          className="h-8 text-muted-foreground hover:text-foreground"
                        >
                          <Activity className="h-4 w-4 mr-1" />
                          重新開啟
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={handleEdit}
                        className="h-8 text-muted-foreground hover:text-foreground"
                      >
                        <Edit2 className="h-4 w-4 mr-1" />
                        編輯
                      </Button>
                      {canDeleteSeason && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={handleDeleteClick}
                          className="h-8 text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4 mr-1" />
                          刪除
                        </Button>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </CollapsibleCard>

      {/* Activate Confirmation Dialog */}
      <DeleteConfirmDialog
        open={activateDialogOpen}
        onOpenChange={setActivateDialogOpen}
        onConfirm={handleConfirmActivate}
        title="啟用賽季"
        description="確定要啟用此賽季嗎？"
        itemName={season.name}
        warningMessage="啟用後會消耗 1 季（試用期間免費），開始日期將鎖定不可更改。此賽季可設為「目前賽季」來進行數據分析。"
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

      {/* Reopen Confirmation Dialog */}
      <DeleteConfirmDialog
        open={reopenDialogOpen}
        onOpenChange={setReopenDialogOpen}
        onConfirm={handleConfirmReopen}
        title="重新開啟賽季"
        description="確定要重新開啟此賽季嗎？"
        itemName={season.name}
        warningMessage="重新開啟後，此賽季將恢復為「已啟用」狀態。您可以繼續上傳 CSV 資料（需在賽季日期範圍內）。"
        confirmText="確定開啟"
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
  );
}
