import { Badge } from '@/components/ui/badge'

export type StatusType = 'active' | 'completed' | 'cancelled'

export function StatusBadge({ status }: { status: StatusType }) {
    if (status === 'completed') {
        return (
            <Badge className="text-xs bg-gray-500 text-white">完成</Badge>
        )
    }

    if (status === 'cancelled') {
        return (
            <Badge className="text-xs bg-destructive text-white">已過期</Badge>
        )
    }

    return <Badge className="text-xs">進行中</Badge>
}
