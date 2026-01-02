/**
 * LINE Binding Page - LINE Group Integration Management
 *
 * Manages LINE Bot integration for alliance member binding.
 *
 * 符合 CLAUDE.md 🔴:
 * - JSX syntax only
 * - Type-safe component
 * - Hyper-minimalist UI
 */

import { useState } from 'react'
import { MessageSquare, Copy, Check, RefreshCw, Unlink, Users, ExternalLink } from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import {
  useLineBindingStatus,
  useGenerateBindingCode,
  useUnbindLineGroup,
  useCountdown,
  useCopyToClipboard,
  simulateSuccessfulBinding
} from '@/hooks/use-line-binding'
import { useAlliance } from '@/hooks/use-alliance'
import { useCanUpdateAlliance } from '@/hooks/use-user-role'

export function LineBinding() {
  const { data: alliance } = useAlliance()
  const allianceId = alliance?.id
  const canUpdate = useCanUpdateAlliance()
  const { data: status, isLoading, refetch } = useLineBindingStatus(allianceId)
  const generateCode = useGenerateBindingCode()
  const unbindGroup = useUnbindLineGroup()
  const { copied, copy } = useCopyToClipboard()
  const { formatted: countdown, isExpired, isUrgent } = useCountdown(
    status?.pending_code?.expires_at
  )

  const [showUnbindDialog, setShowUnbindDialog] = useState(false)

  // No alliance yet
  if (!allianceId) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">LINE 三國小幫手</h2>
          <p className="text-muted-foreground mt-1">
            連結 LINE 群組，讓盟友直接綁定遊戲 ID
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>尚未建立同盟</CardTitle>
            <CardDescription>請先建立同盟才能進行 LINE 群組綁定</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted mb-4">
                <MessageSquare className="h-8 w-8 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground">
                請先至「設定」頁面建立你的同盟
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">LINE 三國小幫手</h2>
          <p className="text-muted-foreground mt-1">
            連結 LINE 群組，讓盟友直接綁定遊戲 ID
          </p>
        </div>

        <Card>
          <CardContent className="py-12">
            <div className="flex items-center justify-center">
              <div className="flex items-center gap-2 text-muted-foreground">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                <span>載入中...</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Already bound
  if (status?.is_bound && status.binding) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">LINE 三國小幫手</h2>
            <p className="text-muted-foreground mt-1">
              連結 LINE 群組，讓盟友直接綁定遊戲 ID
            </p>
          </div>
          <Badge variant="default" className="bg-green-600">已連結</Badge>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>已綁定群組</CardTitle>
            <CardDescription>你的同盟已連結以下 LINE 群組</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Bound Group Info */}
            <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
              <div className="flex items-start gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100 shrink-0">
                  <MessageSquare className="h-6 w-6 text-green-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-lg truncate">
                    {status.binding.group_name || '未命名群組'}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    綁定於 {new Date(status.binding.bound_at).toLocaleDateString('zh-TW', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Users className="h-5 w-5" />
                  <span className="text-lg font-medium">{status.binding.member_count}</span>
                </div>
              </div>
            </div>

            {/* Instructions for members */}
            <div className="space-y-3">
              <h4 className="font-medium">盟友綁定說明</h4>
              <div className="rounded-lg border p-4 bg-muted/20">
                <p className="text-sm text-muted-foreground">
                  盟友在 LINE 群組中發送以下指令即可開始綁定遊戲帳號：
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <code className="flex-1 px-3 py-2 bg-background rounded text-sm font-mono border">
                    /綁定ID
                  </code>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copy('/綁定ID')}
                  >
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </div>

            {/* Unbind button */}
            {canUpdate && (
              <>
                <Separator />
                <div className="flex justify-end">
                  <Button
                    variant="outline"
                    onClick={() => setShowUnbindDialog(true)}
                    className="text-destructive hover:text-destructive"
                  >
                    <Unlink className="h-4 w-4 mr-2" />
                    解除連結
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Unbind Confirmation Dialog */}
        <Dialog open={showUnbindDialog} onOpenChange={setShowUnbindDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>確認解除連結？</DialogTitle>
              <DialogDescription>
                解除連結後，盟友將無法再透過此群組進行新的 ID 綁定。
                已綁定的成員資料會保留。
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setShowUnbindDialog(false)}
              >
                取消
              </Button>
              <Button
                variant="destructive"
                onClick={async () => {
                  await unbindGroup.mutateAsync(allianceId)
                  setShowUnbindDialog(false)
                }}
                disabled={unbindGroup.isPending}
              >
                {unbindGroup.isPending ? '處理中...' : '確認解除'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    )
  }

  // Has pending code (not expired)
  if (status?.pending_code && !isExpired) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">LINE 三國小幫手</h2>
          <p className="text-muted-foreground mt-1">
            連結 LINE 群組，讓盟友直接綁定遊戲 ID
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>等待綁定</CardTitle>
            <CardDescription>請在 LINE 群組中輸入綁定碼完成連結</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Generated Code Display */}
            <div className="rounded-lg border-2 border-dashed border-primary/30 bg-primary/5 p-8 text-center space-y-4">
              <div>
                <p className="text-sm text-muted-foreground mb-3">您的綁定碼</p>
                <div className="flex items-center justify-center gap-4">
                  <span className="text-5xl font-mono font-bold tracking-widest text-primary">
                    {status.pending_code.code}
                  </span>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => copy(status.pending_code!.code)}
                    className="shrink-0 h-12 w-12"
                  >
                    {copied ? (
                      <Check className="h-5 w-5 text-green-600" />
                    ) : (
                      <Copy className="h-5 w-5" />
                    )}
                  </Button>
                </div>
              </div>

              <div className={`text-sm ${isUrgent ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
                有效期限：{countdown}
              </div>
            </div>

            {/* Instructions */}
            <div className="space-y-3">
              <h4 className="font-medium">綁定步驟</h4>
              <ol className="text-sm text-muted-foreground space-y-3 list-decimal list-inside">
                <li>確認已將 LINE 三國小幫手 Bot 加入您的 LINE 群組</li>
                <li>
                  在群組中發送：
                  <code className="ml-2 px-2 py-1 bg-muted rounded text-xs font-mono">
                    /綁定 {status.pending_code.code}
                  </code>
                </li>
                <li>完成！頁面會自動更新，盟友即可開始綁定遊戲 ID</li>
              </ol>
            </div>

            {/* Actions */}
            {canUpdate && (
              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <Button
                  variant="outline"
                  onClick={() => generateCode.mutate(allianceId)}
                  disabled={generateCode.isPending}
                  className="flex-1"
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${generateCode.isPending ? 'animate-spin' : ''}`} />
                  重新生成
                </Button>
                {/* Demo button - remove in production */}
                <Button
                  variant="secondary"
                  onClick={() => {
                    simulateSuccessfulBinding()
                    refetch()
                  }}
                  className="flex-1"
                >
                  模擬綁定成功
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

  // Unbound state (default)
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">LINE 三國小幫手</h2>
        <p className="text-muted-foreground mt-1">
          連結 LINE 群組，讓盟友直接綁定遊戲 ID
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>連結 LINE 群組</CardTitle>
          <CardDescription>透過 LINE Bot 讓盟友輕鬆綁定遊戲帳號</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Feature Introduction */}
          <div className="rounded-lg border bg-muted/30 p-5 space-y-4">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 shrink-0">
                <MessageSquare className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="font-medium text-lg">為什麼要綁定 LINE 群組？</p>
                <p className="text-sm text-muted-foreground mt-2">
                  透過綁定 LINE 群組，盟友可以直接在群組內註冊遊戲 ID，
                  系統會自動關聯成員資料，方便您追蹤盟友表現，不再需要手動比對。
                </p>
              </div>
            </div>
          </div>

          {/* Bot Invite Info */}
          <div className="space-y-3">
            <h4 className="font-medium">Step 1：加入 Bot 到群組</h4>
            <div className="flex items-center gap-4 p-4 rounded-lg border">
              <div className="flex h-10 w-10 items-center justify-center rounded bg-[#06C755] shrink-0">
                <MessageSquare className="h-5 w-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium">LINE 三國小幫手</p>
                <p className="text-sm text-muted-foreground">Bot ID: @three-kingdoms-helper</p>
              </div>
              <Button variant="outline" asChild>
                <a
                  href="https://line.me/R/ti/p/@three-kingdoms-helper"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  加入好友
                </a>
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              加入好友後，請將 Bot 邀請到您的 LINE 群組中
            </p>
          </div>

          <Separator />

          {/* Generate Code Section */}
          <div className="space-y-3">
            <h4 className="font-medium">Step 2：生成綁定碼</h4>
            <p className="text-sm text-muted-foreground">
              確認 Bot 已加入群組後，點擊下方按鈕生成綁定碼
            </p>

            {canUpdate ? (
              <Button
                onClick={() => generateCode.mutate(allianceId)}
                disabled={generateCode.isPending}
                size="lg"
                className="w-full"
              >
                {generateCode.isPending ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    生成中...
                  </>
                ) : (
                  '生成綁定碼'
                )}
              </Button>
            ) : (
              <div className="text-center py-4 text-sm text-muted-foreground rounded-lg border bg-muted/30">
                僅同盟擁有者或協作者可以進行 LINE 群組綁定
              </div>
            )}
          </div>

          {/* Error message */}
          {generateCode.isError && (
            <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
              生成綁定碼失敗，請稍後再試
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
