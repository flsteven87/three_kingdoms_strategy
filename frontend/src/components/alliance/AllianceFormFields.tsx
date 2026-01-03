/**
 * Reusable Alliance Form Fields Component
 *
 * Shared form fields for alliance creation and editing
 * 符合 CLAUDE.md 🟢: Component reusability and DRY principle
 */

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface AllianceFormFieldsProps {
  readonly name: string
  readonly serverName: string
  readonly onNameChange: (value: string) => void
  readonly onServerNameChange: (value: string) => void
  readonly disabled?: boolean
  readonly nameId?: string
  readonly serverNameId?: string
}

export function AllianceFormFields({
  name,
  serverName,
  onNameChange,
  onServerNameChange,
  disabled = false,
  nameId = 'alliance-name',
  serverNameId = 'server-name',
}: AllianceFormFieldsProps) {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor={nameId}>
          同盟名稱 <span className="text-destructive">*</span>
        </Label>
        <Input
          id={nameId}
          type="text"
          placeholder="請輸入同盟名稱"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          required
          maxLength={100}
          disabled={disabled}
        />
        <p className="text-xs text-muted-foreground">
          最多 100 個字元
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor={serverNameId}>伺服器名稱（選填）</Label>
        <Input
          id={serverNameId}
          type="text"
          placeholder="例如：S1 魏興"
          value={serverName}
          onChange={(e) => onServerNameChange(e.target.value)}
          maxLength={100}
          disabled={disabled}
        />
        <p className="text-xs text-muted-foreground">
          幫助你識別不同賽季或伺服器
        </p>
      </div>
    </div>
  )
}
