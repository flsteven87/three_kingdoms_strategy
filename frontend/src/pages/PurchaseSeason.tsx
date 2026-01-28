/**
 * Purchase Season Page
 *
 * Standalone page for purchasing season quota.
 * Design: Single price card for 1 season, trust badges, status, FAQ.
 *
 * Note: Recur SDK ONE_TIME products do not support quantity parameter,
 * so we limit purchases to 1 season at a time. Users can purchase multiple
 * times if they need more seasons.
 */

import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useRecur } from 'recur-tw'
import { Info, CheckCircle, X } from 'lucide-react'
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
import { PRICE_PER_SEASON } from '@/constants'

interface FaqItem {
  readonly question: string
  readonly answer: string
}

interface PaymentSuccessBannerProps {
  readonly visible: boolean
  readonly onClose: () => void
  readonly onNavigateToSeasons: () => void
}

function PaymentSuccessBanner({
  visible,
  onClose,
  onNavigateToSeasons,
}: PaymentSuccessBannerProps) {
  if (!visible) return null

  return (
    <div className="mx-auto max-w-md rounded-xl border border-green-200 bg-green-50 p-4 animate-in fade-in slide-in-from-top-2 duration-300 dark:border-green-800 dark:bg-green-950">
      <div className="flex items-start gap-3">
        <CheckCircle className="h-5 w-5 flex-shrink-0 text-green-600 dark:text-green-400" />
        <div className="flex-1 space-y-2">
          <p className="font-medium text-green-800 dark:text-green-200">付款成功</p>
          <p className="text-sm text-green-700 dark:text-green-300">已新增 1 季額度</p>
          <button
            type="button"
            onClick={onNavigateToSeasons}
            className="mt-1 text-sm font-medium text-green-700 underline-offset-4 hover:underline dark:text-green-300"
          >
            開始新賽季 →
          </button>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex-shrink-0 rounded-md p-1 text-green-600 transition-colors hover:bg-green-100 dark:text-green-400 dark:hover:bg-green-900"
          aria-label="關閉"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
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
  const [error, setError] = useState<string | null>(null)
  const [showSuccessBanner, setShowSuccessBanner] = useState(false)

  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const { data: quotaStatus, isLoading: isQuotaLoading } = useSeasonQuota()
  const { checkout, isCheckingOut } = useRecur()

  // Handle payment success from URL parameters (redirect from Recur)
  useEffect(() => {
    if (searchParams.get('payment') === 'success') {
      setShowSuccessBanner(true)
      queryClient.invalidateQueries({ queryKey: seasonQuotaKeys.all })
      // Clear URL parameters
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, queryClient, setSearchParams])

  const productId = import.meta.env.VITE_RECUR_PRODUCT_ID

  const closeBanner = () => {
    setShowSuccessBanner(false)
  }

  const handleNavigateToSeasons = () => {
    closeBanner()
    navigate('/seasons')
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

    const baseUrl = window.location.origin

    try {
      // Format: user_id:quantity - used by webhook to grant seasons
      // Fixed to 1 season per purchase (Recur ONE_TIME products don't support quantity)
      const externalCustomerId = `${user.id}:1`

      await checkout({
        productId,
        customerEmail,
        customerName: user.user_metadata?.full_name ?? user.user_metadata?.name ?? undefined,
        externalCustomerId,
        successUrl: `${baseUrl}/purchase?payment=success`,
        onSuccess: (result) => {
          console.log('[Recur] Checkout session created:', result)
        },
        onError: (checkoutError) => {
          console.error('[Recur] Checkout error:', checkoutError)
          setError(`付款錯誤：${checkoutError.message}`)
        },
        onPaymentComplete: async () => {
          // Refresh quota status and show success banner
          await queryClient.invalidateQueries({ queryKey: seasonQuotaKeys.all })
          setShowSuccessBanner(true)
        },
        onPaymentFailed: (err) => {
          console.error('[Recur] Payment failed:', err)
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

    const { available_seasons, has_trial_available, current_season_is_trial, trial_days_remaining } = quotaStatus

    if (has_trial_available) {
      return '尚未使用試用，啟用第一個賽季即可開始 14 天試用'
    }

    if (current_season_is_trial && trial_days_remaining !== null && trial_days_remaining > 0) {
      return `試用期剩餘 ${trial_days_remaining} 天`
    }

    if (available_seasons > 0) {
      return `剩餘 ${available_seasons} 季`
    }

    return '已用完，購買後可開新賽季'
  }

  const getQuotaStatusColor = () => {
    if (!quotaStatus) return 'text-muted-foreground'

    const { available_seasons, current_season_is_trial, trial_days_remaining, can_write } = quotaStatus

    if (!can_write && !quotaStatus.can_activate_season) {
      return 'text-destructive'
    }

    if (available_seasons <= 2 || (current_season_is_trial && trial_days_remaining !== null && trial_days_remaining <= 3)) {
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

      {/* Payment Success Banner */}
      <PaymentSuccessBanner
        visible={showSuccessBanner}
        onClose={closeBanner}
        onNavigateToSeasons={handleNavigateToSeasons}
      />

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

          {/* Product Description */}
          <p className="text-center text-sm text-muted-foreground">
            每次購買可開啟一個新賽季，需要更多可重複購買
          </p>

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
