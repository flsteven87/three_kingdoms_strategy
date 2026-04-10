import { Unlink, Users } from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { formatDateTimeTW } from '@/lib/date-utils'
import type { LineGroupBinding } from '@/types/line-binding'

interface GroupBindingCardProps {
  readonly binding: LineGroupBinding
  readonly canUpdate: boolean
  readonly isTest: boolean
  readonly onUnbind: () => void
  readonly isUnbinding: boolean
}

export function GroupBindingCard({
  binding,
  canUpdate,
  isTest,
  onUnbind,
  isUnbinding
}: GroupBindingCardProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>已綁定群組</CardTitle>
            <CardDescription>
              {isTest ? '測試群組連結資訊' : '正式群組連結資訊'}
            </CardDescription>
          </div>
          <Badge variant="default" className="bg-green-600">已連結</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Bound Group Info */}
        <div className={`rounded-lg border p-4 space-y-3 ${isTest ? 'border-dashed border-yellow-500/50 bg-yellow-50/30 dark:bg-yellow-950/10' : 'bg-muted/30'}`}>
          <div className="flex items-start gap-3">
            {binding.group_picture_url ? (
              <img
                src={binding.group_picture_url}
                alt={binding.group_name || '群組'}
                className="h-12 w-12 rounded-full object-cover shrink-0"
              />
            ) : (
              <img
                src="/assets/logo-200.png"
                alt="群組"
                className="h-12 w-12 rounded-full shrink-0"
              />
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-medium text-lg truncate">
                  {binding.group_name || '未命名群組'}
                </p>
                {isTest && (
                  <Badge variant="outline" className="border-yellow-500 text-yellow-600 text-xs">
                    測試
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                綁定於 {formatDateTimeTW(binding.bound_at)}
              </p>
            </div>
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Users className="h-5 w-5" />
              <span className="text-lg font-medium">{binding.member_count}</span>
            </div>
          </div>
        </div>

        {/* Bot behavior - only show for production group */}
        {!isTest && (
          <div className="space-y-3">
            <h4 className="font-medium">Bot 運作說明</h4>
            <div className="rounded-lg border p-4 bg-muted/20 space-y-4">
              <div>
                <p className="text-sm font-medium mb-2">Bot 何時推送功能入口</p>
                <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                  <li>在群組中 @三國小幫手</li>
                  <li>新成員加入群組時（自動歡迎）</li>
                  <li>未註冊者首次發言時（自動提醒）</li>
                </ul>
              </div>
              <div>
                <p className="text-sm font-medium mb-2">盟友可用功能</p>
                <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                  <li>註冊遊戲 ID — 綁定角色名稱</li>
                  <li>登記銅礦位置 — 記錄座標與等級</li>
                  <li>查看個人表現 — 排名、趨勢、五維圖</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Unbind button */}
        {canUpdate && (
          <>
            <Separator />
            <div className="flex justify-end">
              <Button
                variant="outline"
                onClick={onUnbind}
                disabled={isUnbinding}
                className="text-destructive hover:text-destructive"
              >
                <Unlink className="h-4 w-4 mr-2" />
                {isUnbinding ? '處理中...' : '解除連結'}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
