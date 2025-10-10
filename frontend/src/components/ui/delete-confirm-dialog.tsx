/**
 * DeleteConfirmDialog - Reusable Delete Confirmation Dialog
 *
 * 符合 CLAUDE.md 🔴:
 * - JSX syntax only
 * - Type-safe component
 * - Explicit prop interfaces
 */

import React from 'react'
import { AlertTriangle } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'

interface DeleteConfirmDialogProps {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly onConfirm: () => void | Promise<void>
  readonly title: string
  readonly description: string
  readonly itemName?: string
  readonly warningMessage?: string
  readonly isDeleting?: boolean
  readonly confirmText?: string
  readonly variant?: 'default' | 'destructive'
}

export const DeleteConfirmDialog: React.FC<DeleteConfirmDialogProps> = ({
  open,
  onOpenChange,
  onConfirm,
  title,
  description,
  itemName,
  warningMessage,
  isDeleting = false,
  confirmText = '確認刪除',
  variant = 'destructive'
}) => {
  const handleConfirm = async () => {
    await onConfirm()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className={`flex items-center gap-2 ${variant === 'destructive' ? 'text-destructive' : ''}`}>
            <AlertTriangle className="h-5 w-5" />
            {title}
          </DialogTitle>
          <DialogDescription className="text-left pt-2">
            {description}
          </DialogDescription>
        </DialogHeader>

        {itemName && (
          <div className="py-3">
            <div className="rounded-md bg-muted p-3">
              <p className="text-sm font-medium text-foreground">
                {itemName}
              </p>
            </div>
          </div>
        )}

        {warningMessage && (
          <Alert variant={variant === 'destructive' ? 'destructive' : 'default'} className={variant === 'destructive' ? 'border-destructive/50' : ''}>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="text-sm">
              {warningMessage}
            </AlertDescription>
          </Alert>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isDeleting}
          >
            取消
          </Button>
          <Button
            type="button"
            variant={variant}
            onClick={handleConfirm}
            disabled={isDeleting}
          >
            {isDeleting ? '處理中...' : confirmText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default DeleteConfirmDialog
