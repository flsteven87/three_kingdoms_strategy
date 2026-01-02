/**
 * Roster Tab
 *
 * Game ID registration for LIFF users.
 */

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useLiffMemberInfo, useLiffRegisterMember } from '../hooks/use-liff-member'
import type { LiffSession } from '../hooks/use-liff-session'

interface Props {
  readonly session: LiffSession
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

export function RosterTab({ session }: Props) {
  const [newGameId, setNewGameId] = useState('')
  const context = {
    lineUserId: session.lineUserId,
    lineGroupId: session.lineGroupId!,
    lineDisplayName: session.lineDisplayName,
  }

  const { data, isLoading, error } = useLiffMemberInfo(context)
  const registerMutation = useLiffRegisterMember(context)

  const handleRegister = async () => {
    if (!newGameId.trim()) return

    try {
      await registerMutation.mutateAsync({ gameId: newGameId.trim() })
      setNewGameId('')
    } catch {
      // Error handled by mutation
    }
  }

  if (isLoading) {
    return (
      <div className="py-8 text-center text-muted-foreground">載入中...</div>
    )
  }

  if (error) {
    return (
      <div className="py-8 text-center text-destructive">
        載入失敗: {error.message}
      </div>
    )
  }

  const accounts = data?.registered_ids || []

  return (
    <div className="space-y-4 mt-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">註冊遊戲 ID</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              value={newGameId}
              onChange={(e) => setNewGameId(e.target.value)}
              placeholder="輸入遊戲 ID"
              onKeyDown={(e) => e.key === 'Enter' && handleRegister()}
            />
            <Button
              onClick={handleRegister}
              disabled={!newGameId.trim() || registerMutation.isPending}
              size="icon"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          {registerMutation.error && (
            <p className="text-sm text-destructive">
              {registerMutation.error.message}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            已註冊帳號 ({accounts.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {accounts.length === 0 ? (
            <p className="text-sm text-muted-foreground">尚未註冊任何帳號</p>
          ) : (
            <div className="space-y-2">
              {accounts.map((acc) => (
                <div
                  key={`${acc.game_id}-${acc.created_at}`}
                  className="flex items-center justify-between py-2 border-b last:border-0"
                >
                  <span className="font-medium">{acc.game_id}</span>
                  <span className="text-sm text-muted-foreground">
                    {formatDate(acc.created_at)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
