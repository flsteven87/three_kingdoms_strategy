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
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import {
  useAllianceCollaborators,
  useAddAllianceCollaborator,
  useRemoveAllianceCollaborator,
  useUpdateCollaboratorRole
} from '@/hooks/use-alliance-collaborators'
import { useCanManageCollaborators } from '@/hooks/use-user-role'
import { RoleGuard } from '@/components/alliance/RoleGuard'

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
  const updateRole = useUpdateCollaboratorRole()
  const canManageCollaborators = useCanManageCollaborators()

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

  const handleUpdateRole = async (userId: string, newRole: string, userEmail: string) => {
    setSuccessMessage(null)
    setErrorMessage(null)

    try {
      await updateRole.mutateAsync({ allianceId, userId, newRole })
      setSuccessMessage(`已更新 ${userEmail} 的角色`)
      // Clear success message after 3 seconds
      setTimeout(() => setSuccessMessage(null), 3000)
    } catch (error) {
      const message = error instanceof Error ? error.message : '請稍後再試'
      setErrorMessage(`更新角色失敗: ${message}`)
    }
  }

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'owner':
        return '👑 擁有者'
      case 'collaborator':
        return '🤝 協作者'
      case 'member':
        return '👤 成員'
      default:
        return role
    }
  }

  const getRoleBadgeVariant = (role: string): 'default' | 'secondary' | 'outline' => {
    switch (role) {
      case 'owner':
        return 'default'
      case 'collaborator':
        return 'secondary'
      case 'member':
        return 'outline'
      default:
        return 'outline'
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>協作成員管理</CardTitle>
        <CardDescription>邀請其他使用者加入你的同盟，共同管理成員數據</CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Add Collaborator Form - Only visible to owners */}
        <RoleGuard requiredRoles={['owner']}>
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
            <div className="rounded-md bg-primary/10 p-3 text-sm text-primary">
              {successMessage}
            </div>
          )}

          {errorMessage && (
            <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
              {errorMessage}
            </div>
          )}
          </form>
        </RoleGuard>

        {/* Collaborators List */}
        <div className="space-y-2">
          <h4 className="font-medium">目前成員 ({collaboratorsData?.total ?? 0})</h4>

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="flex items-center gap-2 text-muted-foreground">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                <span>載入成員資料中...</span>
              </div>
            </div>
          ) : collaboratorsData?.collaborators.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center border rounded-lg bg-muted/50">
              <p className="text-muted-foreground">尚無協作成員</p>
              <p className="text-sm text-muted-foreground mt-1">使用上方表單邀請成員加入同盟</p>
            </div>
          ) : (
            <div className="space-y-2">
              {collaboratorsData?.collaborators.map((collaborator) => (
                <div
                  key={collaborator.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
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
                      {/* Display Name (priority: full_name > email > user_id) */}
                      <p className="font-medium truncate">
                        {collaborator.user_full_name ||
                          collaborator.user_email ||
                          `使用者 ${collaborator.user_id?.slice(0, 8)}...`}
                      </p>

                      {/* Secondary Info (email if name exists, join date) */}
                      <div className="flex items-center gap-1 text-sm text-muted-foreground truncate">
                        {collaborator.user_full_name && collaborator.user_email && (
                          <>
                            <span className="truncate">{collaborator.user_email}</span>
                            {collaborator.joined_at && <span>·</span>}
                          </>
                        )}
                        {collaborator.joined_at && (
                          <span className="whitespace-nowrap">
                            加入於 {new Date(collaborator.joined_at).toLocaleDateString('zh-TW')}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {/* Role Selector - Only for owners and non-owner users */}
                    {collaborator.role === 'owner' ? (
                      <Badge variant={getRoleBadgeVariant(collaborator.role)} className="font-medium">
                        {getRoleLabel(collaborator.role)}
                      </Badge>
                    ) : canManageCollaborators && collaborator.user_id ? (
                      <Select
                        value={collaborator.role}
                        onValueChange={(newRole) =>
                          handleUpdateRole(
                            collaborator.user_id!,
                            newRole,
                            collaborator.user_full_name || collaborator.user_email || 'Unknown'
                          )
                        }
                        disabled={updateRole.isPending}
                      >
                        <SelectTrigger className="w-[140px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="collaborator">🤝 協作者</SelectItem>
                          <SelectItem value="member">👤 成員</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge variant={getRoleBadgeVariant(collaborator.role)} className="font-medium">
                        {getRoleLabel(collaborator.role)}
                      </Badge>
                    )}

                    {/* Remove Button - Only for non-owners */}
                    {canManageCollaborators &&
                      collaborator.role !== 'owner' &&
                      collaborator.user_id && (
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
                        >
                          移除
                        </Button>
                      )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
