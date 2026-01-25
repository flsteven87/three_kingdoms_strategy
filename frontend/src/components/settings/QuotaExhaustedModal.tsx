/**
 * Quota Exhausted Modal Component
 *
 * Shown when user tries to activate a season but has no available quota.
 * Provides option to navigate to purchase page or dismiss.
 */

import { useNavigate } from 'react-router-dom'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { AlertTriangle } from 'lucide-react'

interface QuotaExhaustedModalProps {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly trialEndedAt?: string | null
}

export function QuotaExhaustedModal({
  open,
  onOpenChange,
  trialEndedAt,
}: QuotaExhaustedModalProps) {
  const navigate = useNavigate()

  const handlePurchase = () => {
    onOpenChange(false)
    navigate('/purchase')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="h-6 w-6 text-destructive" />
          </div>
          <DialogTitle className="text-center">無法啟用賽季</DialogTitle>
          <DialogDescription className="text-center">
            需要購買賽季才能繼續
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-4 text-center text-sm text-muted-foreground">
          {trialEndedAt && (
            <p>
              試用期已於 {new Date(trialEndedAt).toLocaleDateString('zh-TW')}{' '}
              結束
            </p>
          )}
          <p>
            可開啟賽季：<span className="font-medium text-foreground">0</span>
          </p>
        </div>

        <DialogFooter className="gap-2 sm:justify-center">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            稍後再說
          </Button>
          <Button onClick={handlePurchase}>前往購買</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
