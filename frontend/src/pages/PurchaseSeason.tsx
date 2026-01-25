/**
 * Purchase Season Page
 *
 * Standalone page for purchasing season quota.
 * Design: Single price card with quantity selector, trust badges, status, FAQ.
 */

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useRecur } from 'recur-tw'
import { Minus, Plus, Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/use-auth'
import { useSeasonQuota, seasonQuotaKeys } from '@/hooks/use-season-quota'
import { PRICE_PER_SEASON, MIN_QUANTITY, MAX_QUANTITY } from '@/constants'

interface FaqItem {
  readonly question: string
  readonly answer: string
}

const FAQ_ITEMS: readonly FaqItem[] = [
  {
    question: '這裡的「賽季」是什麼意思？',
    answer:
      '對應遊戲中的賽季（S1、S2、S3...）。每開一個新賽季來追蹤盟友數據，就會消耗 1 季。',
  },
  {
    question: '試用期結束後會怎樣？',
    answer:
      '14 天試用期間可以無限使用。試用結束後，需要購買才能開啟新賽季，但已建立的賽季數據都會保留。',
  },
  {
    question: '一季可以用多久？',
    answer:
      '沒有時間限制。一個賽季可以持續上傳 CSV、追蹤數據，直到你手動結束它。',
  },
  {
    question: '換季時舊資料會消失嗎？',
    answer:
      '不會。每個賽季的數據獨立保存，你可以隨時切換查看不同賽季的歷史記錄。',
  },
  {
    question: '可以讓其他幹部一起管理嗎？',
    answer:
      '可以。在設定中邀請協作者，他們就能一起上傳數據、查看分析，不需要額外購買。',
  },
]

function PurchaseSeason() {
  const [quantity, setQuantity] = useState(1)
  const [error, setError] = useState<string | null>(null)

  const { user } = useAuth()
  const queryClient = useQueryClient()
  const { data: quotaStatus, isLoading: isQuotaLoading } = useSeasonQuota()
  const { checkout, isCheckingOut } = useRecur()

  const total = quantity * PRICE_PER_SEASON
  const productId = import.meta.env.VITE_RECUR_PRODUCT_ID

  const decrementQuantity = () => {
    setQuantity((prev) => Math.max(MIN_QUANTITY, prev - 1))
  }

  const incrementQuantity = () => {
    setQuantity((prev) => Math.min(MAX_QUANTITY, prev + 1))
  }

  const handleQuantityInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    if (value === '') {
      setQuantity(MIN_QUANTITY)
      return
    }
    const num = parseInt(value, 10)
    if (!isNaN(num)) {
      setQuantity(Math.max(MIN_QUANTITY, Math.min(MAX_QUANTITY, num)))
    }
  }

  const handlePurchase = async () => {
    setError(null)

    if (!productId) {
      setError('付款功能尚未設定，請聯繫管理員')
      return
    }

    if (!user?.id) {
      setError('請先登入')
      return
    }

    // customerEmail is REQUIRED for embedded/modal checkout
    const customerEmail = user.email
    if (!customerEmail) {
      setError('無法取得您的電子郵件，請確認帳戶設定')
      return
    }

    try {
      // Format: user_id:quantity - used by webhook to grant seasons
      const externalCustomerId = `${user.id}:${quantity}`
      const baseUrl = window.location.origin
      const successUrl = `${baseUrl}/purchase?payment=success`
      const cancelUrl = `${baseUrl}/purchase?payment=cancelled`

      await checkout({
        productId,
        customerEmail,
        customerName: user.user_metadata?.full_name ?? user.user_metadata?.name ?? undefined,
        externalCustomerId,
        successUrl,
        cancelUrl,
        onSuccess: (result) => {
          console.log('[Recur] Checkout session created:', result)
        },
        onError: (checkoutError) => {
          console.error('[Recur] Checkout error:', checkoutError)
          setError(`付款錯誤：${checkoutError.message}`)
        },
        onPaymentComplete: async () => {
          // Refresh quota status after successful payment
          await queryClient.invalidateQueries({ queryKey: seasonQuotaKeys.all })
        },
        onPaymentFailed: (err) => {
          console.error('[Recur] Payment failed:', err)
          // Provide appropriate actions based on error code
          const errorCode = err?.code
          switch (errorCode) {
            case 'CARD_DECLINED':
            case 'INSUFFICIENT_FUNDS':
              return {
                action: 'custom' as const,
                customTitle: '付款失敗',
                customMessage: '請確認卡片餘額或使用其他付款方式',
              }
            default:
              return { action: 'retry' as const }
          }
        },
        onPaymentCancel: () => {
          console.log('[Recur] Payment cancelled by user')
        },
      })
    } catch (err: unknown) {
      console.error('[Recur] Checkout exception:', err)
      const errorMessage = err instanceof Error ? err.message : JSON.stringify(err)
      setError(`付款過程發生錯誤：${errorMessage}`)
    }
  }

  const getQuotaStatusText = () => {
    if (isQuotaLoading || !quotaStatus) {
      return '載入中...'
    }

    const { available_seasons, used_seasons, is_trial_active, trial_days_remaining } = quotaStatus

    if (is_trial_active && trial_days_remaining !== null) {
      return `試用期剩餘 ${trial_days_remaining} 天，目前可用 ${available_seasons} 季`
    }

    return `目前可用 ${available_seasons} 季（已使用 ${used_seasons} 季）`
  }

  const getQuotaStatusColor = () => {
    if (!quotaStatus) return 'text-muted-foreground'

    const { available_seasons, is_trial_active, trial_days_remaining } = quotaStatus

    if (!quotaStatus.can_activate_season) {
      return 'text-destructive'
    }

    if (available_seasons <= 2 || (is_trial_active && trial_days_remaining !== null && trial_days_remaining <= 3)) {
      return 'text-orange-500'
    }

    return 'text-foreground'
  }

  return (
    <div className="mx-auto max-w-2xl space-y-12 py-8">
      {/* Page Header */}
      <header className="text-center">
        <h1 className="text-4xl font-bold tracking-tight">購買賽季</h1>
      </header>

      {/* Purchase Card */}
      <div className="mx-auto max-w-md">
        <div className="rounded-2xl border bg-card p-10 shadow-lg space-y-7">
          {/* Price Display */}
          <div className="text-center space-y-1">
            <div className="text-5xl font-bold tracking-tight">
              NT$ {PRICE_PER_SEASON.toLocaleString()}
            </div>
            <div className="text-lg text-muted-foreground">/ 賽季</div>
          </div>

          {/* Quantity Selector */}
          <div className="space-y-3">
            <label className="block text-center text-sm font-medium text-muted-foreground">
              購買數量
            </label>
            <div className="flex items-center justify-center gap-4">
              <button
                type="button"
                onClick={decrementQuantity}
                disabled={quantity <= MIN_QUANTITY}
                className="flex h-11 w-11 items-center justify-center rounded-xl bg-secondary text-foreground transition-colors hover:bg-secondary/80 disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label="減少數量"
              >
                <Minus className="h-5 w-5" />
              </button>
              <input
                type="number"
                value={quantity}
                onChange={handleQuantityInput}
                min={MIN_QUANTITY}
                max={MAX_QUANTITY}
                className="h-13 w-20 rounded-xl border bg-background text-center text-2xl font-semibold focus:outline-none focus:ring-2 focus:ring-primary [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              <button
                type="button"
                onClick={incrementQuantity}
                disabled={quantity >= MAX_QUANTITY}
                className="flex h-11 w-11 items-center justify-center rounded-xl bg-secondary text-foreground transition-colors hover:bg-secondary/80 disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label="增加數量"
              >
                <Plus className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Subtotal */}
          <div className="flex items-center justify-between rounded-xl bg-secondary/50 px-5 py-4">
            <span className="text-muted-foreground">小計</span>
            <span className="text-2xl font-semibold">
              NT$ {total.toLocaleString()}
            </span>
          </div>

          {/* Error Message */}
          {error && (
            <div className="rounded-xl bg-destructive/10 p-4 text-sm text-destructive">
              {error}
            </div>
          )}

          {/* CTA Button */}
          <Button
            size="lg"
            className="w-full h-13 text-base font-semibold"
            onClick={handlePurchase}
            disabled={isCheckingOut}
          >
            {isCheckingOut ? '處理中...' : '立即購買'}
          </Button>
        </div>
      </div>

      {/* Current Quota Status */}
      <div className="flex items-center justify-center gap-2 rounded-xl bg-secondary/50 px-6 py-4 mx-auto max-w-md">
        <Info className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        <span className={cn('text-sm', getQuotaStatusColor())}>
          {getQuotaStatusText()}
        </span>
        {quotaStatus && !quotaStatus.can_activate_season && (
          <span className="text-sm text-destructive ml-1">
            — 購買後即可開啟新賽季
          </span>
        )}
      </div>

      {/* FAQ Section */}
      <section className="space-y-4 max-w-xl mx-auto">
        <h2 className="text-2xl font-semibold text-center">常見問題</h2>
        <Accordion type="single" collapsible className="w-full">
          {FAQ_ITEMS.map((item, index) => (
            <AccordionItem key={index} value={`item-${index}`}>
              <AccordionTrigger className="text-left text-base">
                {item.question}
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground">
                {item.answer}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>
    </div>
  )
}

export { PurchaseSeason }
