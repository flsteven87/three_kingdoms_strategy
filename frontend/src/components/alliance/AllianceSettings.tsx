/**
 * Alliance Settings Component
 *
 * Allows users to update their alliance information
 * 符合 CLAUDE.md 🟢: Component reusability
 */

import { useState, useEffect } from 'react'
import { useAlliance, useUpdateAlliance } from '@/hooks/use-alliance'
import { Button } from '@/components/ui/button'
import { AllianceFormFields } from './AllianceFormFields'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card'

export const AllianceSettings: React.FC = () => {
  const { data: alliance, isLoading } = useAlliance()
  const updateAlliance = useUpdateAlliance()

  const [name, setName] = useState('')
  const [serverName, setServerName] = useState('')

  // Initialize form with current alliance data
  useEffect(() => {
    if (alliance) {
      setName(alliance.name)
      setServerName(alliance.server_name || '')
    }
  }, [alliance])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!name.trim()) return

    await updateAlliance.mutateAsync({
      name: name.trim(),
      server_name: serverName.trim() || null
    })
  }

  const hasChanges =
    alliance &&
    (name.trim() !== alliance.name ||
      (serverName.trim() || null) !== alliance.server_name)

  if (isLoading) {
    return (
      <Card className="w-full">
        <CardContent className="py-12">
          <div className="text-center text-muted-foreground">載入中...</div>
        </CardContent>
      </Card>
    )
  }

  if (!alliance) {
    return (
      <Card className="w-full">
        <CardContent className="py-12">
          <div className="text-center text-muted-foreground">
            無同盟資料
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>同盟設定</CardTitle>
        <CardDescription>更新你的同盟資訊</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <AllianceFormFields
            name={name}
            serverName={serverName}
            onNameChange={setName}
            onServerNameChange={setServerName}
            disabled={updateAlliance.isPending}
            nameId="alliance-name-edit"
            serverNameId="server-name-edit"
          />

          {updateAlliance.isError && (
            <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
              更新同盟失敗，請稍後再試
            </div>
          )}

          {updateAlliance.isSuccess && (
            <div className="rounded-md bg-primary/10 p-3 text-sm text-primary">
              更新成功！
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              type="submit"
              disabled={updateAlliance.isPending || !hasChanges || !name.trim()}
              className="sm:min-w-[160px]"
            >
              {updateAlliance.isPending ? '更新中...' : '儲存變更'}
            </Button>

            {hasChanges && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setName(alliance.name)
                  setServerName(alliance.server_name || '')
                }}
                disabled={updateAlliance.isPending}
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
