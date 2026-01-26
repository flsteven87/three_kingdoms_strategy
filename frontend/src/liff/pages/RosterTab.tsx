/**
 * Roster Tab
 *
 * Compact game ID registration for LIFF Tall mode.
 */

import { useState } from 'react'
import { Plus, Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useLiffMemberInfo, useLiffRegisterMember, useLiffUnregisterMember } from '../hooks/use-liff-member'
import type { LiffSession } from '../hooks/use-liff-session'

interface Props {
  readonly session: LiffSession
}

function formatDate(dateString: string): string {
  // Ensure UTC interpretation: append 'Z' if no timezone info
  const utcStr = dateString.endsWith('Z') || dateString.includes('+') ? dateString : `${dateString}Z`
  return new Date(utcStr).toLocaleDateString('zh-TW', {
    month: 'numeric',
    day: 'numeric',
  })
}

export function RosterTab({ session }: Props) {
  const [newGameId, setNewGameId] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const context = {
    lineUserId: session.lineUserId,
    lineGroupId: session.lineGroupId!,
    lineDisplayName: session.lineDisplayName,
  }

  const { data, isLoading, error } = useLiffMemberInfo(context)
  const registerMutation = useLiffRegisterMember(context)
  const unregisterMutation = useLiffUnregisterMember(context)

  const handleRegister = async () => {
    if (!newGameId.trim()) return

    try {
      await registerMutation.mutateAsync({ gameId: newGameId.trim() })
      setNewGameId('')
    } catch {
      // Error handled by mutation
    }
  }

  const handleUnregister = async (gameId: string) => {
    setDeletingId(gameId)
    try {
      await unregisterMutation.mutateAsync({ gameId })
    } catch {
      // Error handled by mutation
    } finally {
      setDeletingId(null)
    }
  }

  if (isLoading) {
    return (
      <div className="py-6 text-center">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent mx-auto" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-3 text-center text-sm text-destructive">
        {error.message}
      </div>
    )
  }

  const accounts = data?.registered_ids || []

  return (
    <div className="p-3 space-y-3">
      {/* Input form */}
      <div className="space-y-1.5">
        <p className="text-xs text-muted-foreground">角色名稱（非數字編號）</p>
        <div className="flex gap-2">
          <Input
            value={newGameId}
            onChange={(e) => setNewGameId(e.target.value)}
            placeholder="例：曹操丞相"
            onKeyDown={(e) => e.key === 'Enter' && handleRegister()}
            className="h-10"
          />
          <Button
            onClick={handleRegister}
            disabled={!newGameId.trim() || registerMutation.isPending}
            size="icon"
            className="h-10 w-10 shrink-0"
          >
            {registerMutation.isPending ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      {(registerMutation.error || unregisterMutation.error) && (
        <p className="text-xs text-destructive">
          {registerMutation.error?.message || unregisterMutation.error?.message}
        </p>
      )}

      {/* Registered accounts list */}
      <div className="pt-2">
        <div className="text-xs text-muted-foreground mb-2">
          已註冊 ({accounts.length})
        </div>
        {accounts.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            尚未註冊帳號
          </p>
        ) : (
          <div className="space-y-1">
            {accounts.map((acc) => (
              <div
                key={`${acc.game_id}-${acc.created_at}`}
                className="flex items-center justify-between py-2 px-3 bg-muted/50 rounded-lg"
              >
                <div className="flex items-center gap-2">
                  <Check className="h-3.5 w-3.5 text-primary" />
                  <span className="text-sm font-medium">{acc.game_id}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {formatDate(acc.created_at)}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-muted-foreground hover:text-destructive"
                    onClick={() => handleUnregister(acc.game_id)}
                    disabled={deletingId === acc.game_id}
                  >
                    {deletingId === acc.game_id ? (
                      <div className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    ) : (
                      <X className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
