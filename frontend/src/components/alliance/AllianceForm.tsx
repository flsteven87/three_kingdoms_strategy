/**
 * Alliance Form Component (Unified)
 *
 * Handles both alliance creation and updates with consistent UI
 * 符合 CLAUDE.md 🔴:
 * - ES imports only
 * - Explicit TypeScript interfaces
 * - TanStack Query for mutations
 * - DRY principle 🟢
 */

import { useState, useEffect } from 'react'
import { useAlliance, useCreateAlliance, useUpdateAlliance } from '@/hooks/use-alliance'
import { Button } from '@/components/ui/button'
import { AllianceFormFields } from './AllianceFormFields'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card'

export const AllianceForm: React.FC = () => {
  const { data: alliance, isLoading } = useAlliance()
  const createAlliance = useCreateAlliance()
  const updateAlliance = useUpdateAlliance()

  const [name, setName] = useState('')
  const [serverName, setServerName] = useState('')

  // Initialize form with current alliance data when editing
  useEffect(() => {
    if (alliance) {
      setName(alliance.name)
      setServerName(alliance.server_name || '')
    }
  }, [alliance])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!name.trim()) return

    const data = {
      name: name.trim(),
      server_name: serverName.trim() || null
    }

    if (alliance) {
      await updateAlliance.mutateAsync(data)
    } else {
      await createAlliance.mutateAsync(data)
    }
  }

  const handleReset = () => {
    if (alliance) {
      setName(alliance.name)
      setServerName(alliance.server_name || '')
    } else {
      setName('')
      setServerName('')
    }
  }

  const hasChanges = alliance
    ? name.trim() !== alliance.name ||
      (serverName.trim() || null) !== alliance.server_name
    : name.trim().length > 0

  const mutation = alliance ? updateAlliance : createAlliance
  const isEditing = Boolean(alliance)

  if (isLoading) {
    return (
      <Card className="w-full">
        <CardContent className="py-12">
          <div className="text-center text-muted-foreground">載入中...</div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>{isEditing ? '同盟設定' : '設定同盟'}</CardTitle>
        <CardDescription>
          {isEditing
            ? '更新你的同盟資訊'
            : '請先設定你的同盟資訊，才能開始使用系統'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <AllianceFormFields
            name={name}
            serverName={serverName}
            onNameChange={setName}
            onServerNameChange={setServerName}
            disabled={mutation.isPending}
            nameId={isEditing ? 'alliance-name-edit' : 'alliance-name-setup'}
            serverNameId={isEditing ? 'server-name-edit' : 'server-name-setup'}
          />

          {mutation.isError && (
            <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
              {isEditing ? '更新同盟失敗，請稍後再試' : '建立同盟失敗，請稍後再試'}
            </div>
          )}

          {mutation.isSuccess && (
            <div className="rounded-md bg-green-50 dark:bg-green-950/30 p-3 text-sm text-green-700 dark:text-green-400">
              {isEditing ? '更新成功！' : '建立成功！'}
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              type="submit"
              disabled={mutation.isPending || !hasChanges || !name.trim()}
              className="sm:min-w-[160px]"
            >
              {mutation.isPending
                ? isEditing
                  ? '更新中...'
                  : '建立中...'
                : isEditing
                  ? '儲存變更'
                  : '建立同盟'}
            </Button>

            {hasChanges && (
              <Button
                type="button"
                variant="outline"
                onClick={handleReset}
                disabled={mutation.isPending}
                className="sm:min-w-[120px]"
              >
                取消變更
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
