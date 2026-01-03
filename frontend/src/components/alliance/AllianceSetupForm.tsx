/**
 * Alliance Setup Form Component
 *
 * 符合 CLAUDE.md 🔴:
 * - ES imports only
 * - Explicit TypeScript interfaces
 * - TanStack Query for mutations
 * - Component reusability 🟢
 */

import { useState, type FormEvent } from 'react'
import { useCreateAlliance } from '@/hooks/use-alliance'
import { Button } from '@/components/ui/button'
import { AllianceFormFields } from './AllianceFormFields'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card'

export function AllianceSetupForm() {
  const [name, setName] = useState('')
  const [serverName, setServerName] = useState('')
  const createAlliance = useCreateAlliance()

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()

    if (!name.trim()) return

    await createAlliance.mutateAsync({
      name: name.trim(),
      server_name: serverName.trim() || null
    })
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>設定同盟</CardTitle>
        <CardDescription>
          請先設定你的同盟資訊，才能開始使用系統
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <AllianceFormFields
            name={name}
            serverName={serverName}
            onNameChange={setName}
            onServerNameChange={setServerName}
            disabled={createAlliance.isPending}
            nameId="alliance-name-setup"
            serverNameId="server-name-setup"
          />

          {createAlliance.isError && (
            <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
              建立同盟失敗，請稍後再試
            </div>
          )}

          <Button
            type="submit"
            className="w-full sm:w-auto sm:min-w-[200px]"
            disabled={createAlliance.isPending || !name.trim()}
          >
            {createAlliance.isPending ? '建立中...' : '建立同盟'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
