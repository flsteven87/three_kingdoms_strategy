import { Badge } from '@/components/ui/badge'

export type StatusType = 'completed' | 'expired' | 'in-progress'

export function StatusBadge({ status }: { status: StatusType }) {
    if (status === 'completed') {
        return (
            <Badge className="text-xs bg-emerald-500 text-white">完成</Badge>
        )
    }

    if (status === 'expired') {
        return (
            <Badge className="text-xs bg-destructive text-white">已過期</Badge>
        )
    }

    return <Badge className="text-xs">進行中</Badge>
}
