import { useState, useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { RankChangeIndicator } from './RankChangeIndicator'
import type { ViewMode } from './ViewModeToggle'
import { formatNumber, formatNumberCompact } from '@/lib/chart-utils'
import type { GroupMember } from '@/types/analytics'

interface GroupMembersTabProps {
    readonly members: readonly GroupMember[]
    readonly viewMode: ViewMode
    readonly memberParticipation: Map<string, number>
}

export function GroupMembersTab({ members, viewMode, memberParticipation }: GroupMembersTabProps) {
    const [sortBy, setSortBy] = useState<'rank' | 'merit' | 'assist' | 'participation'>('rank')
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

    const sortedMembers = useMemo(() => {
        const sorted = [...members].sort((a, b) => {
            let aVal: number
            let bVal: number

            switch (sortBy) {
                case 'rank':
                    aVal = a.contribution_rank
                    bVal = b.contribution_rank
                    break
                case 'merit':
                    aVal = a.daily_merit
                    bVal = b.daily_merit
                    break
                case 'assist':
                    aVal = a.daily_assist
                    bVal = b.daily_assist
                    break
                case 'participation':
                    aVal = memberParticipation.get(a.name) ?? 0
                    bVal = memberParticipation.get(b.name) ?? 0
                    break
                default:
                    return 0
            }

            return sortDir === 'desc' ? bVal - aVal : aVal - bVal
        })
        return sorted
    }, [members, sortBy, sortDir, memberParticipation])

    const handleSort = (column: typeof sortBy) => {
        if (sortBy === column) {
            setSortDir(sortDir === 'desc' ? 'asc' : 'desc')
        } else {
            setSortBy(column)
            setSortDir(column === 'rank' ? 'asc' : 'desc')
        }
    }

    return (
        <div className="space-y-6">
            {/* Members Table */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">組內成員列表</CardTitle>
                    <CardDescription>點擊欄位標題排序</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b">
                                    <th className="text-left py-2 px-2 font-medium">成員</th>
                                    <th className="text-right py-2 px-2 font-medium text-muted-foreground">勢力值</th>
                                    <th
                                        className="text-right py-2 px-2 font-medium cursor-pointer hover:text-primary"
                                        onClick={() => handleSort('rank')}
                                    >
                                        貢獻排名 {sortBy === 'rank' && (sortDir === 'asc' ? '↑' : '↓')}
                                    </th>
                                    {viewMode === 'latest' && (
                                        <th className="text-right py-2 px-2 font-medium text-muted-foreground">變化</th>
                                    )}
                                    <th
                                        className="text-right py-2 px-2 font-medium cursor-pointer hover:text-primary"
                                        onClick={() => handleSort('merit')}
                                    >
                                        日均戰功 {sortBy === 'merit' && (sortDir === 'desc' ? '↓' : '↑')}
                                    </th>
                                    {viewMode === 'latest' && (
                                        <th className="text-right py-2 px-2 font-medium text-muted-foreground">變化</th>
                                    )}
                                    <th
                                        className="text-right py-2 px-2 font-medium cursor-pointer hover:text-primary"
                                        onClick={() => handleSort('assist')}
                                    >
                                        日均助攻 {sortBy === 'assist' && (sortDir === 'desc' ? '↓' : '↑')}
                                    </th>
                                    <th
                                        className="text-right py-2 px-2 font-medium cursor-pointer hover:text-primary"
                                        onClick={() => handleSort('participation')}
                                    >
                                        參戰率 {sortBy === 'participation' && (sortDir === 'desc' ? '↓' : '↑')}
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {sortedMembers.map((member) => (
                                    <tr key={member.id} className="border-b last:border-0">
                                        <td className="py-2 px-2 font-medium">{member.name}</td>
                                        <td className="py-2 px-2 text-right tabular-nums text-muted-foreground">
                                            {formatNumberCompact(member.power)}
                                        </td>
                                        <td className="py-2 px-2 text-right tabular-nums">#{member.contribution_rank}</td>
                                        {viewMode === 'latest' && (
                                            <td className="py-2 px-2">
                                                <div className="flex justify-end">
                                                    <RankChangeIndicator change={member.rank_change} showNewLabel={false} size="sm" />
                                                </div>
                                            </td>
                                        )}
                                        <td className="py-2 px-2 text-right tabular-nums">{formatNumber(member.daily_merit)}</td>
                                        {viewMode === 'latest' && (
                                            <td className="py-2 px-2 text-right text-xs tabular-nums">
                                                {member.merit_change === null ? (
                                                    <span className="text-muted-foreground">新</span>
                                                ) : member.merit_change > 0 ? (
                                                    <span className="text-primary">+{formatNumberCompact(member.merit_change)}</span>
                                                ) : member.merit_change < 0 ? (
                                                    <span className="text-destructive">{formatNumberCompact(member.merit_change)}</span>
                                                ) : (
                                                    <span className="text-muted-foreground">—</span>
                                                )}
                                            </td>
                                        )}
                                        <td className="py-2 px-2 text-right tabular-nums">{Math.round(member.daily_assist)}</td>
                                        <td className="py-2 px-2 text-right tabular-nums">
                                            <span className={(memberParticipation.get(member.name) ?? 0) < 66.67 ? 'text-red-500 font-semibold' : ''}>
                                                {(memberParticipation.get(member.name) ?? 0).toFixed(1)}%
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
