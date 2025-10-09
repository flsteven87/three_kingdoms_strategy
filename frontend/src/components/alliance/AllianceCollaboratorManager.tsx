/**
 * Alliance Collaborator Manager Component
 *
 * 符合 CLAUDE.md 🔴:
 * - 100% ES imports (no require)
 * - JSX syntax only
 * - Explicit prop interfaces
 * - Use TanStack Query hooks
 */

import React from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  useAllianceCollaborators,
  useAddAllianceCollaborator,
  useRemoveAllianceCollaborator
} from '@/hooks/use-alliance-collaborators'

interface AllianceCollaboratorManagerProps {
  readonly allianceId: string
}

export const AllianceCollaboratorManager: React.FC<AllianceCollaboratorManagerProps> = ({
  allianceId
}) => {
  const [email, setEmail] = React.useState('')
  const [successMessage, setSuccessMessage] = React.useState<string | null>(null)
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null)

  const { data: collaboratorsData, isLoading } = useAllianceCollaborators(allianceId)
  const addCollaborator = useAddAllianceCollaborator()
  const removeCollaborator = useRemoveAllianceCollaborator()

  const handleAddCollaborator = async (e: React.FormEvent) => {
    e.preventDefault()
    setSuccessMessage(null)
    setErrorMessage(null)

    try {
      const result = await addCollaborator.mutateAsync({
        allianceId,
        data: { email }
      })

      setEmail('')

      // Check if this is a pending invitation or immediate add
      if (result.is_pending_registration) {
        setSuccessMessage(
          `✉️ 已發送邀請給 ${email}。使用者註冊後將自動加入同盟。`
        )
      } else {
        setSuccessMessage(`✅ 已成功新增 ${email} 到同盟`)
      }

      // Clear success message after 5 seconds
      setTimeout(() => setSuccessMessage(null), 5000)
    } catch (error: unknown) {
      // Handle different error types
      if (error && typeof error === 'object' && 'response' in error) {
        const axiosError = error as { response?: { status: number; data?: { detail?: string } } }

        if (axiosError.response?.status === 409) {
          const detail = axiosError.response.data?.detail || ''
          if (detail.includes('already sent')) {
            setErrorMessage(`⏳ 已經邀請過 ${email}，等待該使用者註冊中...`)
          } else if (detail.includes('already a collaborator')) {
            setErrorMessage(`ℹ️ ${email} 已經是同盟成員了`)
          } else {
            setErrorMessage(`⚠️ ${detail}`)
          }
        } else if (axiosError.response?.status === 403) {
          setErrorMessage('❌ 您沒有權限邀請成員')
        } else {
          const detail = axiosError.response?.data?.detail || '請稍後再試'
          setErrorMessage(`新增失敗: ${detail}`)
        }
      } else {
        const message = error instanceof Error ? error.message : '請稍後再試'
        setErrorMessage(`新增失敗: ${message}`)
      }
    }
  }

  const handleRemoveCollaborator = async (userId: string, userEmail: string) => {
    if (!confirm(`確定要移除 ${userEmail}？`)) return

    setSuccessMessage(null)
    setErrorMessage(null)

    try {
      await removeCollaborator.mutateAsync({ allianceId, userId })
      setSuccessMessage(`已將 ${userEmail} 移出同盟`)
      // Clear success message after 3 seconds
      setTimeout(() => setSuccessMessage(null), 3000)
    } catch (error) {
      const message = error instanceof Error ? error.message : '請稍後再試'
      setErrorMessage(`移除失敗: ${message}`)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>協作成員管理</CardTitle>
        <CardDescription>邀請其他使用者加入你的同盟，共同管理成員數據</CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Add Collaborator Form */}
        <form onSubmit={handleAddCollaborator} className="space-y-4">
          <div className="flex gap-2">
            <Input
              type="email"
              placeholder="輸入成員的 email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={addCollaborator.isPending}
            />
            <Button type="submit" disabled={addCollaborator.isPending}>
              {addCollaborator.isPending ? '新增中...' : '新增成員'}
            </Button>
          </div>

          {/* Success/Error Messages */}
          {successMessage && (
            <div className="rounded-md bg-green-50 dark:bg-green-950/30 p-3 text-sm text-green-700 dark:text-green-400">
              {successMessage}
            </div>
          )}

          {errorMessage && (
            <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
              {errorMessage}
            </div>
          )}
        </form>

        {/* Collaborators List */}
        <div className="space-y-2">
          <h4 className="font-medium">目前成員 ({collaboratorsData?.total ?? 0})</h4>

          {isLoading ? (
            <p className="text-sm text-muted-foreground">載入中...</p>
          ) : collaboratorsData?.collaborators.length === 0 ? (
            <p className="text-sm text-muted-foreground">尚無成員</p>
          ) : (
            <div className="space-y-2">
              {collaboratorsData?.collaborators.map((collaborator) => (
                <div
                  key={collaborator.id}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {/* User Avatar */}
                    {collaborator.user_avatar_url ? (
                      <img
                        src={collaborator.user_avatar_url}
                        alt={collaborator.user_full_name || collaborator.user_email || 'User'}
                        className="h-10 w-10 rounded-full object-cover shrink-0"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 shrink-0">
                        <span className="text-sm font-medium text-primary">
                          {(collaborator.user_full_name?.charAt(0) ||
                            collaborator.user_email?.charAt(0) ||
                            '?').toUpperCase()}
                        </span>
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">
                        {collaborator.user_full_name || collaborator.user_email || collaborator.user_id}
                      </p>
                      <p className="text-sm text-muted-foreground truncate">
                        {collaborator.role === 'owner' ? '👑 擁有者' : '👤 成員'}
                        {collaborator.user_full_name && collaborator.user_email && (
                          <> · {collaborator.user_email}</>
                        )}
                        {collaborator.joined_at && (
                          <>
                            {' · 加入於 '}
                            {new Date(collaborator.joined_at).toLocaleDateString('zh-TW')}
                          </>
                        )}
                      </p>
                    </div>
                  </div>

                  {collaborator.role !== 'owner' && collaborator.user_id && (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() =>
                        handleRemoveCollaborator(
                          collaborator.user_id!,
                          collaborator.user_full_name || collaborator.user_email || 'Unknown'
                        )
                      }
                      disabled={removeCollaborator.isPending}
                      className="shrink-0"
                    >
                      移除
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
