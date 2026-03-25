import { AlertCircle, ExternalLink, MessageSquare, RefreshCw } from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { LINE_BOT_ID, ADD_FRIEND_URL } from '@/components/line-binding/constants'
import type { QueryError } from '@/types/api'

interface UnboundCardProps {
  readonly isTest: boolean
  readonly canUpdate: boolean
  readonly onGenerate: () => void
  readonly isGenerating: boolean
  readonly error: QueryError | null
}

export function UnboundCard({
  isTest,
  canUpdate,
  onGenerate,
  isGenerating,
  error
}: UnboundCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>連結 LINE {isTest ? '測試' : ''}群組</CardTitle>
        <CardDescription>
          {isTest
            ? '綁定測試群組用於開發驗證'
            : '透過 LINE Bot 讓盟友輕鬆綁定遊戲帳號'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Feature Introduction */}
        {!isTest && (
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
        )}

        {isTest && (
          <div className="rounded-lg border border-yellow-500/50 bg-yellow-50/30 dark:bg-yellow-950/10 p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-yellow-600 shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-yellow-700 dark:text-yellow-500">測試群組</p>
                <p className="text-muted-foreground mt-1">
                  測試群組與正式群組功能相同，可用於開發階段的功能驗證。
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Bot Invite Info */}
        <div className="space-y-3">
          <h4 className="font-medium">Step 1：加入 Bot 到群組</h4>
          <div className="flex items-center gap-4 p-4 rounded-lg border">
            <div className="flex h-10 w-10 items-center justify-center rounded bg-[#06C755] shrink-0">
              <MessageSquare className="h-5 w-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium">LINE 三國小幫手</p>
              <p className="text-sm text-muted-foreground">Bot ID: {LINE_BOT_ID}</p>
            </div>
            <Button variant="outline" asChild>
              <a
                href={ADD_FRIEND_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                加入好友
              </a>
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            加入好友後，請將 Bot 邀請到您的 LINE {isTest ? '測試' : ''}群組中
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
              onClick={onGenerate}
              disabled={isGenerating}
              size="lg"
              className="w-full"
              variant={isTest ? 'outline' : 'default'}
            >
              {isGenerating ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  生成中...
                </>
              ) : (
                `生成${isTest ? '測試' : ''}綁定碼`
              )}
            </Button>
          ) : (
            <div className="text-center py-4 text-sm text-muted-foreground rounded-lg border bg-muted/30">
              僅同盟擁有者或協作者可以進行 LINE 群組綁定
            </div>
          )}
        </div>

        {/* Error message */}
        {error && (
          <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
            {error.message || '生成綁定碼失敗，請稍後再試'}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
