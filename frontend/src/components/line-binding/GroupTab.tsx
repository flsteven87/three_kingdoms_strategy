import { useCountdown } from '@/hooks/use-line-binding'
import { GroupBindingCard } from '@/components/line-binding/GroupBindingCard'
import { PendingCodeCard } from '@/components/line-binding/PendingCodeCard'
import { UnboundCard } from '@/components/line-binding/UnboundCard'
import type { LineGroupBinding, LineBindingCode } from '@/types/line-binding'
import type { QueryError } from '@/types/api'

interface GroupTabProps {
  readonly binding: LineGroupBinding | undefined
  readonly pendingCode: LineBindingCode | null
  readonly isTest: boolean
  readonly canUpdate: boolean
  readonly onGenerateCode: () => void
  readonly onUnbind: () => void
  readonly isGenerating: boolean
  readonly isUnbinding: boolean
  readonly generateError: QueryError | null
}

export function GroupTab({
  binding,
  pendingCode,
  isTest,
  canUpdate,
  onGenerateCode,
  onUnbind,
  isGenerating,
  isUnbinding,
  generateError
}: GroupTabProps) {
  const { isExpired, formatted, isUrgent } = useCountdown(pendingCode?.expires_at)

  if (binding) {
    return (
      <GroupBindingCard
        binding={binding}
        canUpdate={canUpdate}
        isTest={isTest}
        onUnbind={onUnbind}
        isUnbinding={isUnbinding}
      />
    )
  }

  if (pendingCode && !isExpired) {
    return (
      <PendingCodeCard
        pendingCode={pendingCode}
        isTest={isTest}
        canUpdate={canUpdate}
        onRegenerate={onGenerateCode}
        isRegenerating={isGenerating}
        countdown={formatted ?? "00:00"}
        isUrgent={isUrgent}
      />
    )
  }

  return (
    <UnboundCard
      isTest={isTest}
      canUpdate={canUpdate}
      onGenerate={onGenerateCode}
      isGenerating={isGenerating}
      error={generateError}
    />
  )
}
