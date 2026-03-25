import { Check, Copy, RefreshCw } from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useCopyToClipboard } from '@/hooks/use-line-binding'
import type { LineBindingCode } from '@/types/line-binding'

interface PendingCodeCardProps {
  readonly pendingCode: LineBindingCode
  readonly isTest: boolean
  readonly canUpdate: boolean
  readonly onRegenerate: () => void
  readonly isRegenerating: boolean
  readonly countdown: string
  readonly isUrgent: boolean
}

export function PendingCodeCard({
  pendingCode,
  isTest,
  canUpdate,
  onRegenerate,
  isRegenerating,
  countdown,
  isUrgent
}: PendingCodeCardProps) {
  const { copied, copy } = useCopyToClipboard()

  return (
    <Card>
      <CardHeader>
        <CardTitle>等待綁定</CardTitle>
        <CardDescription>
          請在 LINE {isTest ? '測試' : ''}群組中輸入綁定碼完成連結
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Generated Code Display */}
        <div className={`rounded-lg border-2 border-dashed p-8 text-center space-y-4 ${isTest ? 'border-yellow-500/50 bg-yellow-50/30 dark:bg-yellow-950/10' : 'border-primary/30 bg-primary/5'}`}>
          <div>
            <div className="flex items-center justify-center gap-2 mb-3">
              <p className="text-sm text-muted-foreground">您的綁定碼</p>
              {isTest && (
                <Badge variant="outline" className="border-yellow-500 text-yellow-600 text-xs">
                  測試
                </Badge>
              )}
            </div>
            <div className="flex items-center justify-center gap-4">
              <span className={`text-5xl font-mono font-bold tracking-widest ${isTest ? 'text-yellow-600' : 'text-primary'}`}>
                {pendingCode.code}
              </span>
              <Button
                variant="outline"
                size="icon"
                onClick={() => copy(pendingCode.code)}
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
            <li>確認已將 LINE 三國小幫手 Bot 加入您的 LINE {isTest ? '測試' : ''}群組</li>
            <li>
              在群組中發送：
              <code className="ml-2 px-2 py-1 bg-muted rounded text-xs font-mono">
                /綁定 {pendingCode.code}
              </code>
            </li>
            <li>完成！頁面會自動更新</li>
          </ol>
        </div>

        {/* Actions */}
        {canUpdate && (
          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <Button
              variant="outline"
              onClick={onRegenerate}
              disabled={isRegenerating}
              className="flex-1"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isRegenerating ? 'animate-spin' : ''}`} />
              重新生成
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
