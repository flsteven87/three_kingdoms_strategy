/**
 * Purchase Quota Modal Component
 *
 * Modal for purchasing season quota with +/- quantity selector.
 * Price: NT$ 999 / season
 */

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Minus, Plus } from 'lucide-react'

interface PurchaseQuotaModalProps {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly currentAvailable: number
}

const PRICE_PER_SEASON = 999

export function PurchaseQuotaModal({
  open,
  onOpenChange,
  currentAvailable,
}: PurchaseQuotaModalProps) {
  const [quantity, setQuantity] = useState(1)

  const handleDecrease = () => {
    if (quantity > 1) {
      setQuantity(quantity - 1)
    }
  }

  const handleIncrease = () => {
    if (quantity < 99) {
      setQuantity(quantity + 1)
    }
  }

  const total = quantity * PRICE_PER_SEASON

  const handlePurchase = () => {
    // TODO: Integrate with payment gateway (Recur/綠界)
    alert('金流整合即將推出')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>購買賽季額度</DialogTitle>
          <DialogDescription>
            選擇要購買的賽季數量
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Current Balance */}
          <div className="text-center text-sm text-muted-foreground">
            目前可用：<span className="font-medium text-foreground">{currentAvailable} 季</span>
          </div>

          {/* Quantity Selector */}
          <div className="flex items-center justify-center gap-4">
            <Button
              variant="outline"
              size="icon"
              onClick={handleDecrease}
              disabled={quantity <= 1}
            >
              <Minus className="h-4 w-4" />
            </Button>
            <span className="w-16 text-center text-3xl font-bold">{quantity}</span>
            <Button
              variant="outline"
              size="icon"
              onClick={handleIncrease}
              disabled={quantity >= 99}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          {/* Price Breakdown */}
          <div className="space-y-2 rounded-lg border p-4">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">單價</span>
              <span>NT$ {PRICE_PER_SEASON.toLocaleString()} / 季</span>
            </div>
            <div className="flex justify-between border-t pt-2 font-medium">
              <span>小計</span>
              <span className="text-lg">NT$ {total.toLocaleString()}</span>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={handlePurchase}>
            前往付款
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
