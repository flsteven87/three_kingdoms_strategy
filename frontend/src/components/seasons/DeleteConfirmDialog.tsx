/**
 * DeleteConfirmDialog Component
 *
 * 符合 CLAUDE.md 🔴:
 * - JSX syntax only
 * - Explicit TypeScript interfaces
 */

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface DeleteConfirmDialogProps {
  readonly open: boolean
  readonly seasonName: string
  readonly onClose: () => void
  readonly onConfirm: () => void
  readonly isDeleting?: boolean
}

export function DeleteConfirmDialog({
  open,
  seasonName,
  onClose,
  onConfirm,
  isDeleting = false,
}: DeleteConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle>確定要刪除賽季嗎？</DialogTitle>
          <DialogDescription className="pt-2">
            你即將刪除賽季「<span className="font-semibold text-gray-900">{seasonName}</span>」
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <div className="rounded-lg bg-destructive/10 p-4 border border-destructive/30">
            <p className="text-sm text-destructive">
              ⚠️ 此操作將同時刪除以下資料，且<strong>無法復原</strong>：
            </p>
            <ul className="mt-2 ml-4 text-sm text-destructive/80 list-disc space-y-1">
              <li>所有 CSV 上傳記錄</li>
              <li>所有成員表現快照</li>
              <li>賽季相關的統計數據</li>
            </ul>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isDeleting}>
            取消
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={isDeleting}
          >
            {isDeleting ? '刪除中...' : '確定刪除'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
