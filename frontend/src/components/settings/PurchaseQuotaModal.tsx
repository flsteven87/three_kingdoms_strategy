/**
 * Purchase Quota Modal Component
 *
 * Modal that guides users to the purchase page.
 * Shows current quota status and provides navigation to /purchase.
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
import { ShoppingCart } from 'lucide-react'
import { PRICE_PER_SEASON } from '@/constants'

interface PurchaseQuotaModalProps {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly currentAvailable: number
}

export function PurchaseQuotaModal({
  open,
  onOpenChange,
  currentAvailable,
}: PurchaseQuotaModalProps) {
  const navigate = useNavigate()

  const handleGoToPurchase = () => {
    onOpenChange(false)
    navigate('/purchase')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <ShoppingCart className="h-6 w-6 text-primary" />
          </div>
          <DialogTitle className="text-center">購買賽季額度</DialogTitle>
          <DialogDescription className="text-center">
            每季 NT$ {PRICE_PER_SEASON.toLocaleString()}，永久有效
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 text-center">
          <p className="text-sm text-muted-foreground">
            目前可用額度：
            <span className="ml-1 font-semibold text-foreground">
              {currentAvailable} 季
            </span>
          </p>
        </div>

        <DialogFooter className="gap-2 sm:justify-center">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={handleGoToPurchase}>前往購買</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
