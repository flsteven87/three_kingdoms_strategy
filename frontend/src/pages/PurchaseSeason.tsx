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

import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { useRecur } from 'recur-tw'
import { Info, CheckCircle, Loader2, AlertTriangle, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/use-auth'
import { useSeasonQuota } from '@/hooks/use-season-quota'
import { usePurchaseFlow, type PaymentFlowState } from '@/hooks/use-purchase-flow'
import { PRICE_PER_SEASON } from '@/constants'

interface FaqItem {
  readonly question: string
  readonly answer: string
}

interface PaymentStatusBannerProps {
  readonly state: PaymentFlowState
  readonly availableSeasons: number | null
  readonly onClose: () => void
  readonly onNavigateToSeasons: () => void
}

function PaymentStatusBanner({
  state,
  availableSeasons,
  onClose,
  onNavigateToSeasons,
}: PaymentStatusBannerProps) {
  if (state === 'idle') return null

  if (state === 'pending') {
    return (
      <div className="mx-auto max-w-md rounded-xl border border-blue-200 bg-blue-50 p-4 animate-in fade-in slide-in-from-top-2 duration-300 dark:border-blue-800 dark:bg-blue-950">
        <div className="flex items-start gap-3">
          <Loader2 className="h-5 w-5 flex-shrink-0 animate-spin text-blue-600 dark:text-blue-400" />
          <div className="flex-1 space-y-1">
            <p className="font-medium text-blue-800 dark:text-blue-200">正在確認付款</p>
            <p className="text-sm text-blue-700 dark:text-blue-300">
              已收到付款，正在為您入帳，請稍候…
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (state === 'timeout') {
    return (
      <div className="mx-auto max-w-md rounded-xl border border-orange-200 bg-orange-50 p-4 animate-in fade-in slide-in-from-top-2 duration-300 dark:border-orange-800 dark:bg-orange-950">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 flex-shrink-0 text-orange-600 dark:text-orange-400" />
          <div className="flex-1 space-y-2">
            <p className="font-medium text-orange-800 dark:text-orange-200">入帳處理較慢</p>
            <p className="text-sm text-orange-700 dark:text-orange-300">
              付款已收到，但額度尚未入帳。請稍後重新整理頁面；若持續未更新，請聯繫客服協助。
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-1 text-sm font-medium text-orange-700 underline-offset-4 hover:underline dark:text-orange-300"
            >
              重新整理頁面
            </button>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex-shrink-0 rounded-md p-1 text-orange-600 transition-colors hover:bg-orange-100 dark:text-orange-400 dark:hover:bg-orange-900"
            aria-label="關閉"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    )
  }

  // granted
  return (
    <div className="mx-auto max-w-md rounded-xl border border-green-200 bg-green-50 p-4 animate-in fade-in slide-in-from-top-2 duration-300 dark:border-green-800 dark:bg-green-950">
      <div className="flex items-start gap-3">
        <CheckCircle className="h-5 w-5 flex-shrink-0 text-green-600 dark:text-green-400" />
        <div className="flex-1 space-y-2">
          <p className="font-medium text-green-800 dark:text-green-200">付款成功</p>
          <p className="text-sm text-green-700 dark:text-green-300">
            {availableSeasons != null
              ? `額度已入帳，目前共 ${availableSeasons} 季可用`
              : '額度已入帳'}
          </p>
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
      '每個賽季最長可設定 120 天（約 4 個月），對應遊戲中一個賽季的週期。期間內可以無限上傳 CSV、追蹤數據。賽季結束後需開啟新賽季繼續記錄。',
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

  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { data: quotaStatus, isLoading: isQuotaLoading } = useSeasonQuota()
  const { checkout, isCheckingOut } = useRecur()
  const purchaseFlow = usePurchaseFlow()

  // Handle payment success from URL parameters (redirect back from Recur).
  // We don't have a pre-purchase baseline on this code path (the page just
  // loaded fresh), so polling succeeds on any positive count within the
  // timeout window. If the grant genuinely failed, the banner will flip to
  // 'timeout' instead of lying about success.
  //
  // This effect is self-limiting: after startPolling() + setSearchParams({}),
  // subsequent re-runs see no ?payment=success and early-return, so
  // including purchaseFlow.startPolling in deps is safe even though its
  // identity changes per render.
  const { startPolling } = purchaseFlow
  useEffect(() => {
    if (searchParams.get('payment') !== 'success') return
    startPolling(null)
    setSearchParams({}, { replace: true })
  }, [searchParams, setSearchParams, startPolling])

  const productId = import.meta.env.VITE_RECUR_PRODUCT_ID

  const closeBanner = () => {
    purchaseFlow.reset()
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

    // Capture the pre-purchase quota snapshot so the purchase flow can poll
    // until the backend grant lands (baseline+1). If quotaStatus hasn't
    // loaded yet, fall back to 0 — the grant will still strictly increase.
    const baselineSeasons = quotaStatus?.available_seasons ?? 0

    try {
      // externalCustomerId = user UUID ONLY. The server treats every successful
      // checkout as exactly 1 season for the configured product. Do NOT encode
      // quantity client-side — the webhook would trust it.
      const externalCustomerId = user.id

      await checkout({
        productId,
        customerEmail,
        customerName: user.user_metadata?.full_name ?? user.user_metadata?.name ?? undefined,
        externalCustomerId,
        successUrl: `${baseUrl}/purchase?payment=success`,
        onError: (checkoutError) => {
          const msg = typeof checkoutError?.message === 'string'
            ? checkoutError.message
            : typeof checkoutError === 'object' && checkoutError !== null
              ? JSON.stringify(checkoutError)
              : String(checkoutError ?? '未知錯誤')
          setError(`付款錯誤：${msg}`)
        },
        onPaymentComplete: async () => {
          // Do NOT trust this callback as proof of grant — it fires when
          // Recur collects payment, not when our webhook lands. Poll the
          // backend quota endpoint until the count strictly increases past
          // the captured baseline (grant confirmed) or we hit the timeout.
          purchaseFlow.startPolling(baselineSeasons)
        },
        onPaymentFailed: (err) => {
          const errorCode = err?.code
          switch (errorCode) {
            case 'CARD_DECLINED':
            case 'PAYUNI_DECLINED':
            case 'UNAPPROVED':
              return {
                action: 'custom' as const,
                customTitle: '付款被拒絕',
                customMessage: '請確認卡片狀態或聯繫發卡銀行',
              }
            case 'INSUFFICIENT_FUNDS':
              return {
                action: 'custom' as const,
                customTitle: '餘額不足',
                customMessage: '請確認卡片餘額或使用其他付款方式',
              }
            case 'EXPIRED_CARD':
              return {
                action: 'custom' as const,
                customTitle: '卡片已過期',
                customMessage: '請使用有效的信用卡重新付款',
              }
            case 'INVALID_CARD':
              return {
                action: 'custom' as const,
                customTitle: '卡號無效',
                customMessage: '請確認卡號是否正確',
              }
            default:
              return { action: 'retry' as const }
          }
        },
      })
    } catch (err: unknown) {
      let errorMessage: string
      if (err instanceof Error) {
        // Recur SDK may wrap error objects, resulting in "[object Object]" as message
        errorMessage = err.message === '[object Object]'
          ? '付款處理失敗，請稍後再試或聯繫客服'
          : err.message
      } else if (typeof err === 'object' && err !== null) {
        const errObj = err as Record<string, unknown>
        errorMessage = (typeof errObj.message === 'string' ? errObj.message : null)
          ?? (typeof errObj.error === 'string' ? errObj.error : null)
          ?? JSON.stringify(err)
      } else {
        errorMessage = String(err)
      }
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

      {/* Payment Status Banner */}
      <PaymentStatusBanner
        state={purchaseFlow.state}
        availableSeasons={purchaseFlow.availableSeasons}
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
            一次性購買，不自動續訂。需要更多賽季可重複購買
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

          {/* Legal disclosure & consent */}
          <p className="text-center text-xs text-muted-foreground leading-relaxed">
            本服務提供 14 天免費試用，購買後即開通使用。依消保法規定，數位服務一經提供不適用
            7 天鑑賞期。購買即表示您同意{' '}
            <Link to="/terms" className="text-primary hover:underline">服務條款</Link>{' '}
            及{' '}
            <Link to="/terms#refund" className="text-primary hover:underline">退款政策</Link>
          </p>
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
            <AccordionItem key={item.question} value={`item-${index}`}>
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
