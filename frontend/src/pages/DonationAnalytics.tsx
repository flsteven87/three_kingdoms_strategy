import { useState } from 'react'
import { Loader2, Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-react'

import { AllianceGuard } from '@/components/alliance/AllianceGuard'
import { RoleGuard } from '@/components/alliance/RoleGuard'
import { DonationCard } from '@/components/donations/DonationCard'
import { ProgressBar } from '@/components/donations/ProgressBar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { useAnalyticsMembers } from '@/hooks/use-analytics'
import {
    useCreateDonation,
    useDeleteDonation,
    useDeleteMemberTargetOverride,
    useDonationDetail,
    useDonations,
    useUpsertMemberTargetOverride,
} from '@/hooks/use-donations'
import { useSeasons } from '@/hooks/use-seasons'
import type { DonationType } from '@/lib/api/donation-api'

function DonationAnalytics() {
    const { data: seasons } = useSeasons()
    const activeSeason = seasons?.find((s) => s.is_active)

    const { data: registeredMembers } = useAnalyticsMembers(activeSeason?.id, true)

    const { data: donations, isLoading } = useDonations(activeSeason?.alliance_id, activeSeason?.id)
    const createMutation = useCreateDonation(activeSeason?.alliance_id, activeSeason?.id)
    const upsertTargetMutation = useUpsertMemberTargetOverride()
    const deleteTargetMutation = useDeleteMemberTargetOverride()
    const deleteDonationMutation = useDeleteDonation()

    const [expandedId, setExpandedId] = useState<string | null>(null)
    const { data: expandedDetail, isLoading: isDetailLoading } = useDonationDetail(expandedId || undefined)

    // Track which donations have their completed members section expanded
    const [expandedCompletedSections, setExpandedCompletedSections] = useState<Record<string, boolean>>({})

    const handleCardClick = (id: string, currentlyOpen: boolean) => {
        setExpandedId(currentlyOpen ? null : id)
    }

    const [dialogOpen, setDialogOpen] = useState(false)
    const [newTitle, setNewTitle] = useState('')
    const [newType, setNewType] = useState<DonationType>('regular')
    const [newAmount, setNewAmount] = useState('')
    const [newDeadline, setNewDeadline] = useState('')

    const [editingDeadlineId, setEditingDeadlineId] = useState<string | null>(null)
    const [selectedMemberId, setSelectedMemberId] = useState('')
    const [memberSearchQuery, setMemberSearchQuery] = useState('')
    const [punishmentAmount, setPunishmentAmount] = useState('')

    const handleOpenDialog = () => {
        const today = new Date().toISOString().slice(0, 10)
        setDialogOpen(true)
        setNewTitle('')
        setNewType('regular')
        setNewAmount('')
        setNewDeadline(today)
    }

    const handleCloseDialog = () => {
        setDialogOpen(false)
        setNewTitle('')
        setNewType('regular')
        setNewAmount('')
        setNewDeadline('')
    }

    const handleAdd = () => {
        if (!newTitle) return alert('請輸入活動標題')
        const amount = Number(newAmount)
        if (newType === 'regular' && (Number.isNaN(amount) || amount <= 0)) return alert('請輸入每名成員的捐獻金額（大於 0）')

        createMutation.mutate({
            title: newTitle,
            type: newType,
            deadline: newDeadline,
            target_amount: newType === 'regular' ? amount : 0,
            description: undefined,
        }, {
            onSuccess: () => {
                handleCloseDialog()
            },
            onError: (error) => {
                alert('新增失敗: ' + (error.message || '未知錯誤'))
            }
        })
    }

    const handleDelete = (id: string) => {
        if (confirm('確定要刪除？所有相關資料將會被永久刪除。')) {
            deleteDonationMutation.mutate(id)
        }
    }

    return (
        <AllianceGuard>
            <div className="space-y-6">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-2xl font-bold tracking-tight">捐獻管理</h2>
                        <p className="text-muted-foreground mt-1">
                            設定成員捐獻目標與截止日
                            {activeSeason && (
                                <span className="ml-2">· 賽季: <span className="font-medium text-foreground">{activeSeason.name}</span></span>
                            )}
                        </p>
                    </div>

                    <RoleGuard requiredRoles={["owner", "collaborator"]}>
                        <Button onClick={handleOpenDialog}>
                            <Plus className="h-4 w-4 mr-2" />
                            新增捐獻
                        </Button>
                    </RoleGuard>
                </div>

                {/* Donations List */}
                {isLoading ? (
                    <Card>
                        <CardContent className="py-8">
                            <div className="text-sm text-muted-foreground text-center">載入中...</div>
                        </CardContent>
                    </Card>
                ) : !donations || donations.length === 0 ? (
                    <Card>
                        <CardHeader className="flex items-center justify-between">
                            <div>
                                <CardTitle>捐獻活動列表</CardTitle>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="text-sm text-muted-foreground">尚無設定的捐獻活動。</div>
                        </CardContent>
                    </Card>
                ) : (
                    <div className="space-y-4">
                        {donations.map((d) => {
                            const tags = d.type === 'penalty'
                                ? [{ id: 'penalty', label: '懲罰' }]
                                : [{ id: 'regular', label: '捐獻' }]

                            const detail = expandedId === d.id ? expandedDetail : null
                            const donationMap: Record<string, number> = {}
                            const targetMap: Record<string, number> = {}
                            let total = 0
                            let targetTotal = 0

                            if (detail?.member_info) {
                                detail.member_info.forEach(info => {
                                    donationMap[info.member_id] = info.donated_amount
                                    targetMap[info.member_id] = info.target_amount
                                    total += info.donated_amount
                                    targetTotal += info.target_amount
                                })
                            }

                            const members = detail?.member_info?.map(info => ({
                                id: info.member_id,
                                display_name: info.member_name,
                                name: info.member_name,
                            })) || []

                            const deadlineDate = new Date(d.deadline)
                            const today = new Date()
                            today.setHours(0, 0, 0, 0)
                            deadlineDate.setHours(0, 0, 0, 0)

                            let displayStatus = d.status
                            if (d.status === 'active' && deadlineDate < today) {
                                displayStatus = 'completed'
                            }

                            return (
                                <div key={d.id}>
                                    <DonationCard
                                        title={d.title}
                                        tags={tags}
                                        deadline={new Date(d.deadline).toLocaleDateString()}
                                        status={displayStatus}
                                        perPersonTarget={d.type === 'regular' ? d.target_amount : undefined}
                                        isOpen={expandedId === d.id}
                                        onToggle={() => handleCardClick(d.id, expandedId === d.id)}
                                        onDelete={() => handleDelete(d.id)}
                                    >
                                        {/* Progress Bar */}
                                        {(total > 0 || targetTotal > 0) && (
                                            <div className="pl-6 pr-6">
                                                <ProgressBar current={total} total={targetTotal} />
                                            </div>
                                        )}

                                        {expandedId === d.id && isDetailLoading && (
                                            <div className="py-8 flex items-center justify-center">
                                                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                                            </div>
                                        )}

                                        {expandedId === d.id && detail && (
                                            <div className="space-y-4">
                                                <div className="space-y-3">
                                                    {d.type === 'regular' && <p className="text-sm font-medium">成員捐獻進度</p>}

                                                    {d.type === 'penalty' && (
                                                        <>
                                                            <div className="flex items-center justify-between">
                                                                {editingDeadlineId !== d.id && (
                                                                    <Button
                                                                        size="sm"
                                                                        onClick={() => {
                                                                            setEditingDeadlineId(d.id)
                                                                        }}
                                                                    >
                                                                        <Plus className="h-3.5 w-3.5 mr-1" />
                                                                        新增懲罰
                                                                    </Button>
                                                                )}
                                                            </div>
                                                            {editingDeadlineId === d.id && (
                                                                <div className="space-y-3 p-3 border rounded-lg bg-muted/30">
                                                                    <p className="text-sm font-medium">新增懲罰</p>
                                                                    <div className="grid grid-cols-3 gap-2">
                                                                        <div className="relative">
                                                                            <Input
                                                                                value={memberSearchQuery}
                                                                                onChange={(e) => {
                                                                                    setMemberSearchQuery(e.target.value)
                                                                                    setSelectedMemberId('')
                                                                                }}
                                                                                placeholder="選擇成員"
                                                                            />
                                                                            {memberSearchQuery && registeredMembers && (
                                                                                <div className="absolute z-10 w-full mt-1 max-h-48 overflow-auto bg-background border rounded-md shadow-lg">
                                                                                    {registeredMembers
                                                                                        .filter((m) => {
                                                                                            const searchLower = memberSearchQuery.toLowerCase()
                                                                                            const displayName = m.name || m.id
                                                                                            return displayName.toLowerCase().includes(searchLower) || m.id.toLowerCase().includes(searchLower)
                                                                                        })
                                                                                        .map((m) => (
                                                                                            <div
                                                                                                key={m.id}
                                                                                                className="px-3 py-2 hover:bg-muted cursor-pointer text-sm"
                                                                                                onClick={() => {
                                                                                                    setSelectedMemberId(m.id)
                                                                                                    setMemberSearchQuery(m.name || m.id)
                                                                                                }}
                                                                                            >
                                                                                                {m.name || m.id}
                                                                                            </div>
                                                                                        ))}
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                        <Input
                                                                            type="number"
                                                                            value={punishmentAmount}
                                                                            onChange={(e) => setPunishmentAmount(e.target.value)}
                                                                            placeholder="總資源量"
                                                                        />
                                                                        <div className="flex gap-1">
                                                                            <Button
                                                                                size="sm"
                                                                                onClick={() => {
                                                                                    if (selectedMemberId && punishmentAmount) {
                                                                                        const amount = Number(punishmentAmount)
                                                                                        if (amount > 0) {
                                                                                            upsertTargetMutation.mutate({
                                                                                                donationId: d.id,
                                                                                                payload: {
                                                                                                    member_id: selectedMemberId,
                                                                                                    target_amount: amount,
                                                                                                }
                                                                                            }, {
                                                                                                onSuccess: () => {
                                                                                                    setSelectedMemberId('')
                                                                                                    setMemberSearchQuery('')
                                                                                                    setPunishmentAmount('')
                                                                                                }
                                                                                            })
                                                                                        }
                                                                                    }
                                                                                }}
                                                                            >
                                                                                新增
                                                                            </Button>
                                                                            <Button
                                                                                size="sm"
                                                                                variant="outline"
                                                                                onClick={() => {
                                                                                    setEditingDeadlineId(null)
                                                                                    setSelectedMemberId('')
                                                                                    setMemberSearchQuery('')
                                                                                    setPunishmentAmount('')
                                                                                }}
                                                                            >
                                                                                取消
                                                                            </Button>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </>
                                                    )}

                                                    {members.length === 0 ? (
                                                        <div className="text-sm text-muted-foreground">
                                                            {d.type === 'penalty' ? '尚無懲罰記錄' : '尚無成員'}
                                                        </div>
                                                    ) : (() => {
                                                        // Split members into completed (100%) and incomplete (<100%)
                                                        const completedMembers: typeof members = []
                                                        const incompleteMembers: typeof members = []

                                                        members.forEach((m) => {
                                                            const amount = donationMap[m.id] || 0
                                                            const memberTarget = (targetMap[m.id] || 0)

                                                            if (amount >= memberTarget) {
                                                                completedMembers.push(m)
                                                            } else {
                                                                incompleteMembers.push(m)
                                                            }
                                                        })

                                                        const isCompletedExpanded = expandedCompletedSections[d.id] || false

                                                        return (
                                                            <Table>
                                                                <TableHeader>
                                                                    <TableRow>
                                                                        <TableHead>成員</TableHead>
                                                                        <TableHead className="text-right">已捐獻 / 目標</TableHead>
                                                                        <TableHead className="text-right">進度</TableHead>
                                                                    </TableRow>
                                                                </TableHeader>
                                                                <TableBody>
                                                                    {/* Incomplete members - always shown first */}
                                                                    {incompleteMembers.map((m) => {
                                                                        const amount = donationMap[m.id] || 0
                                                                        const memberTarget = (targetMap[m.id] || 0)
                                                                        const pct = memberTarget > 0
                                                                            ? Math.min(100, Math.round((amount / memberTarget) * 100))
                                                                            : 0
                                                                        return (
                                                                            <TableRow key={m.id}>
                                                                                <TableCell className="font-medium">{m.display_name || m.name || m.id}</TableCell>
                                                                                <TableCell className="text-right tabular-nums text-muted-foreground">
                                                                                    {amount.toLocaleString('zh-TW')} / {memberTarget.toLocaleString('zh-TW')}
                                                                                </TableCell>
                                                                                <TableCell className="text-right">
                                                                                    <div className="flex items-center justify-end gap-2">
                                                                                        <div className="h-1.5 w-24 rounded-full bg-muted">
                                                                                            <div
                                                                                                className={pct >= 100 ? 'h-1.5 rounded-full bg-emerald-500 transition-all' : 'h-1.5 rounded-full bg-primary/70 transition-all'}
                                                                                                style={{ width: `${pct}%` }}
                                                                                            />
                                                                                        </div>
                                                                                        <span className="w-7 text-right text-xs font-medium tabular-nums">{pct}%</span>
                                                                                    </div>
                                                                                </TableCell>
                                                                                {d.type === 'penalty' &&
                                                                                    <TableCell className="text-right">
                                                                                        <button
                                                                                            onClick={(e) => {
                                                                                                e.stopPropagation()
                                                                                                deleteTargetMutation.mutate({
                                                                                                    donationId: d.id,
                                                                                                    memberId: m.id
                                                                                                })
                                                                                            }}
                                                                                            className="text-destructive hover:text-destructive/80"
                                                                                        >
                                                                                            <Trash2 className="h-4 w-4" />
                                                                                        </button>
                                                                                    </TableCell>
                                                                                }
                                                                            </TableRow>
                                                                        )
                                                                    })}

                                                                    {/* Completed members summary row (collapsible) - shown at the end */}
                                                                    {completedMembers.length > 0 && (
                                                                        <>
                                                                            <TableRow
                                                                                className="cursor-pointer hover:bg-muted/50"
                                                                                onClick={() => {
                                                                                    setExpandedCompletedSections(prev => ({
                                                                                        ...prev,
                                                                                        [d.id]: !prev[d.id]
                                                                                    }))
                                                                                }}
                                                                            >
                                                                                <TableCell className="font-medium flex items-center gap-2">
                                                                                    {isCompletedExpanded ? (
                                                                                        <ChevronUp className="h-4 w-4" />
                                                                                    ) : (
                                                                                        <ChevronDown className="h-4 w-4" />
                                                                                    )}
                                                                                    <span className="text-emerald-600">已完成 ({completedMembers.length}/{members.length})</span>
                                                                                </TableCell>
                                                                                <TableCell className="text-right tabular-nums text-muted-foreground">
                                                                                    -
                                                                                </TableCell>
                                                                                <TableCell className="text-right">
                                                                                    <div className="flex items-center justify-end gap-2">
                                                                                        <div className="h-1.5 w-24 rounded-full bg-muted">
                                                                                            <div
                                                                                                className="h-1.5 rounded-full bg-emerald-500 transition-all"
                                                                                                style={{ width: '100%' }}
                                                                                            />
                                                                                        </div>
                                                                                        <span className="w-7 text-right text-xs font-medium tabular-nums">100%</span>
                                                                                    </div>
                                                                                </TableCell>
                                                                                {d.type === 'penalty' && <TableCell />}
                                                                            </TableRow>

                                                                            {/* Show individual completed members when expanded */}
                                                                            {isCompletedExpanded && completedMembers.map((m) => {
                                                                                const amount = donationMap[m.id] || 0
                                                                                const memberTarget = (targetMap[m.id] || 0)
                                                                                const pct = memberTarget > 0
                                                                                    ? Math.min(100, Math.round((amount / memberTarget) * 100))
                                                                                    : 0
                                                                                return (
                                                                                    <TableRow key={m.id} className="bg-emerald-50/50">
                                                                                        <TableCell className="font-medium pl-10">{m.display_name || m.name || m.id}</TableCell>
                                                                                        <TableCell className="text-right tabular-nums text-muted-foreground">
                                                                                            {amount.toLocaleString('zh-TW')} / {memberTarget.toLocaleString('zh-TW')}
                                                                                        </TableCell>
                                                                                        <TableCell className="text-right">
                                                                                            <div className="flex items-center justify-end gap-2">
                                                                                                <div className="h-1.5 w-24 rounded-full bg-muted">
                                                                                                    <div
                                                                                                        className="h-1.5 rounded-full bg-emerald-500 transition-all"
                                                                                                        style={{ width: `${pct}%` }}
                                                                                                    />
                                                                                                </div>
                                                                                                <span className="w-7 text-right text-xs font-medium tabular-nums">{pct}%</span>
                                                                                            </div>
                                                                                        </TableCell>
                                                                                        {d.type === 'penalty' &&
                                                                                            <TableCell className="text-right">
                                                                                                <button
                                                                                                    onClick={(e) => {
                                                                                                        e.stopPropagation()
                                                                                                        deleteTargetMutation.mutate({
                                                                                                            donationId: d.id,
                                                                                                            memberId: m.id
                                                                                                        })
                                                                                                    }}
                                                                                                    className="text-destructive hover:text-destructive/80"
                                                                                                >
                                                                                                    <Trash2 className="h-4 w-4" />
                                                                                                </button>
                                                                                            </TableCell>
                                                                                        }
                                                                                    </TableRow>
                                                                                )
                                                                            })}
                                                                        </>
                                                                    )}
                                                                </TableBody>
                                                            </Table>
                                                        )
                                                    })()}
                                                </div>
                                            </div>
                                        )}
                                    </DonationCard>
                                </div>
                            )
                        })}
                    </div>
                )}

                {/* Add Deadline Dialog */}
                <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                    <DialogContent className="sm:max-w-[425px]">
                        <DialogHeader>
                            <DialogTitle>新增捐獻</DialogTitle>
                            <DialogDescription>輸入每名成員的捐獻資源總量與截止日</DialogDescription>
                        </DialogHeader>

                        <div className="space-y-4 pt-2">
                            <div className="space-y-2">
                                <Label htmlFor="dialog-title">活動標題</Label>
                                <Input id="dialog-title" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="例如：年度捐獻活動" />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="dialog-type">活動類型</Label>
                                <div>
                                    <select id="dialog-type" value={newType} onChange={(e) => setNewType(e.target.value as DonationType)} className="w-full rounded-md border px-3 py-2">
                                        <option value="regular">同盟捐献</option>
                                        <option value="penalty">懲罰</option>
                                    </select>
                                </div>
                            </div>

                            {newType === 'regular' ? (
                                <div className="space-y-2">
                                    <Label htmlFor="dialog-amount">每名成員捐獻資源總量</Label>
                                    <Input id="dialog-amount" value={newAmount} onChange={(e) => setNewAmount(e.target.value)} placeholder="例如：20000" type="number" />
                                </div>
                            ) : (
                                <div className="p-3 rounded bg-muted text-sm text-muted-foreground">您可以在建立活動後為輸入成員個別的懲罰金額。</div>
                            )}

                            <div className="space-y-2">
                                <Label htmlFor="dialog-deadline">截止日</Label>
                                <Input id="dialog-deadline" value={newDeadline} onChange={(e) => setNewDeadline(e.target.value)} type="date" />
                            </div>
                        </div>

                        <DialogFooter>
                            <Button variant="outline" onClick={handleCloseDialog}>取消</Button>
                            <Button onClick={handleAdd}>新增</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

            </div>
        </AllianceGuard >
    )
}

export { DonationAnalytics }
