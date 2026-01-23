/**
 * Season Quota Tab Component
 *
 * Displays season quota status and purchase functionality.
 * Only visible to Owner and Collaborator roles.
 */

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Coins, Clock, TrendingUp, TrendingDown } from 'lucide-react'
import { useSeasonQuota } from '@/hooks/use-season-quota'
import { PurchaseQuotaModal } from './PurchaseQuotaModal'

export function SeasonQuotaTab() {
  const [isPurchaseModalOpen, setIsPurchaseModalOpen] = useState(false)
  const { data: quotaStatus, isLoading } = useSeasonQuota()

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <div className="flex items-center gap-2 text-muted-foreground">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <span>載入中...</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!quotaStatus) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <p className="text-muted-foreground">無法載入配額資訊</p>
        </CardContent>
      </Card>
    )
  }

  const statusBadge = quotaStatus.is_trial_active ? (
    <Badge variant="secondary" className="gap-1">
      <Clock className="h-3 w-3" />
      試用中
    </Badge>
  ) : quotaStatus.can_activate_season ? (
    <Badge variant="default" className="gap-1">
      <TrendingUp className="h-3 w-3" />
      已啟用
    </Badge>
  ) : (
    <Badge variant="destructive" className="gap-1">
      <TrendingDown className="h-3 w-3" />
      已過期
    </Badge>
  )

  return (
    <div className="space-y-4">
      {/* Quota Status Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Coins className="h-5 w-5" />
                賽季額度
              </CardTitle>
              <CardDescription className="mt-1">
                管理你的賽季額度與購買紀錄
              </CardDescription>
            </div>
            {statusBadge}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Trial Status */}
          {quotaStatus.is_trial_active && quotaStatus.trial_days_remaining !== null && (
            <div className="rounded-lg border bg-muted/50 p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">試用期剩餘</span>
                <span className="text-2xl font-bold">{quotaStatus.trial_days_remaining} 天</span>
              </div>
              {quotaStatus.trial_ends_at && (
                <p className="mt-1 text-xs text-muted-foreground">
                  到期日：{new Date(quotaStatus.trial_ends_at).toLocaleDateString('zh-TW')}
                </p>
              )}
            </div>
          )}

          {/* Quota Stats */}
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-lg border p-4 text-center">
              <p className="text-sm text-muted-foreground">可用額度</p>
              <p className="text-3xl font-bold text-primary">{quotaStatus.available_seasons}</p>
            </div>
            <div className="rounded-lg border p-4 text-center">
              <p className="text-sm text-muted-foreground">已使用</p>
              <p className="text-3xl font-bold">{quotaStatus.used_seasons}</p>
            </div>
            <div className="rounded-lg border p-4 text-center">
              <p className="text-sm text-muted-foreground">已購買</p>
              <p className="text-3xl font-bold">{quotaStatus.purchased_seasons}</p>
            </div>
          </div>

          {/* Purchase Button */}
          <div className="flex justify-center pt-2">
            <Button size="lg" onClick={() => setIsPurchaseModalOpen(true)}>
              購買額度
            </Button>
          </div>

          {/* Purchase Modal */}
          <PurchaseQuotaModal
            open={isPurchaseModalOpen}
            onOpenChange={setIsPurchaseModalOpen}
            currentAvailable={quotaStatus.available_seasons}
          />
        </CardContent>
      </Card>

      {/* Usage History Placeholder */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">使用紀錄</CardTitle>
          <CardDescription>查看賽季額度的使用與購買歷史</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            此功能即將推出
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
