/**
 * CopperMineListCard - Copper mine ownership list for current season
 *
 * Displays all copper mine records with filtering by group.
 * Collaborators can add/delete records, all members can view.
 */

import { useState, useMemo, Fragment } from 'react'
import { Plus, Trash2, Loader2, Filter, ArrowRightLeft } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHead,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { DeleteConfirmDialog } from '@/components/ui/delete-confirm-dialog'
import { CopperMineFormDialog } from './CopperMineFormDialog'
import { TransferCopperMineDialog } from './TransferCopperMineDialog'
import {
  useCopperMineOwnerships,
  useDeleteCopperMineOwnership,
  useUpdateCopperMineOwnership,
} from '@/hooks/use-copper-mines'
import { useCanManageWeights } from '@/hooks/use-user-role'
import type { CopperMineOwnership } from '@/types/copper-mine'

interface CopperMineListCardProps {
  readonly seasonId: string
  readonly seasonName: string
}

function formatCalendarDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric' })
}

function formatIntraday(dateString: string): string {
  return new Date(dateString).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })
}

function formatCoord(x: number, y: number): string {
  return `(${x}, ${y})`
}

export function CopperMineListCard({ seasonId, seasonName }: CopperMineListCardProps) {
  const canManage = useCanManageWeights()
  const { data: ownerships, isLoading } = useCopperMineOwnerships(seasonId)
  const deleteMutation = useDeleteCopperMineOwnership()
  const updateMutation = useUpdateCopperMineOwnership()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [transferDialogOpen, setTransferDialogOpen] = useState(false)
  const [deletingOwnership, setDeletingOwnership] = useState<CopperMineOwnership | null>(null)
  const [transferringOwnership, setTransferringOwnership] = useState<CopperMineOwnership | null>(null)
  const [groupFilter, setGroupFilter] = useState<string>('all')

  // Extract unique groups for filter dropdown
  const groups = useMemo(() => {
    if (!ownerships) return []
    const uniqueGroups = new Set(
      ownerships.map((o) => o.member_group).filter((g): g is string => g !== null)
    )
    return Array.from(uniqueGroups).sort()
  }, [ownerships])

  // Filter and sort ownerships
  const filteredOwnerships = useMemo(() => {
    if (!ownerships) return []
    let result = [...ownerships]

    // Apply group filter
    if (groupFilter !== 'all') {
      result = result.filter((o) => o.member_group === groupFilter)
    }

    // Sort by applied_at descending (newest first)
    result.sort((a, b) => new Date(b.applied_at).getTime() - new Date(a.applied_at).getTime())

    return result
  }, [ownerships, groupFilter])

  // Group by date (YYYY-MM-DD) and keep newest first
  const groupedByDate = useMemo(() => {
    if (!filteredOwnerships) return { keys: [], groupsMap: new Map<string, CopperMineOwnership[]>() }

    const groupsMap = new Map<string, CopperMineOwnership[]>()
    for (const o of filteredOwnerships) {
      const key = new Date(o.applied_at).toLocaleDateString('en-CA') // YYYY-MM-DD in local timezone
      const arr = groupsMap.get(key) || []
      arr.push(o)
      groupsMap.set(key, arr)
    }

    // Sort date keys descending (newest first)
    const keys = Array.from(groupsMap.keys()).sort((a, b) => (a < b ? 1 : -1))

    return { keys, groupsMap }
  }, [filteredOwnerships])

  function handleDeleteClick(ownership: CopperMineOwnership) {
    setDeletingOwnership(ownership)
    setDeleteDialogOpen(true)
  }

  function handleTransferClick(ownership: CopperMineOwnership) {
    setTransferringOwnership(ownership)
    setTransferDialogOpen(true)
  }

  async function handleDeleteConfirm() {
    if (!deletingOwnership) return
    await deleteMutation.mutateAsync({
      ownershipId: deletingOwnership.id,
      seasonId,
    })
    setDeleteDialogOpen(false)
    setDeletingOwnership(null)
  }

  async function handleTransferConfirm(ownershipId: string, memberId: string) {
    await updateMutation.mutateAsync({
      ownershipId,
      seasonId,
      data: { member_id: memberId },
    })
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">銅礦擁有列表</CardTitle>
              <CardDescription>
                {seasonName} - 共 {ownerships?.length ?? 0} 座銅礦
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {/* Group Filter */}
              {groups.length > 0 && (
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Filter className="h-4 w-4 text-muted-foreground" />
                    <Select value={groupFilter} onValueChange={setGroupFilter}>
                      <SelectTrigger className="w-[120px]">
                        <SelectValue placeholder="篩選組別" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">全部組別</SelectItem>
                        <SelectItem value="divider" disabled>
                          — 組別 —
                        </SelectItem>
                        {groups.map((group) => (
                          <SelectItem key={group} value={group}>
                            {group}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {/* Add Button */}
              {canManage && (
                <Button size="sm" onClick={() => setDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-1" />
                  新增
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredOwnerships.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {groupFilter !== 'all' ? (
                <p>該組別沒有銅礦記錄</p>
              ) : (
                <>
                  <p>尚無銅礦記錄</p>
                  {canManage && <p className="text-sm mt-1">點擊「新增」開始登記</p>}
                </>
              )}
            </div>
          ) : (
            <div>
              <div className="overflow-hidden rounded-md">
                <Table className="w-full table-fixed">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[100px] pl-6">座標</TableHead>
                      <TableHead className="w-[20%] min-w-[100px]">遊戲 ID</TableHead>
                      <TableHead className="w-[20%] min-w-[100px] hidden sm:table-cell">LINE 名稱</TableHead>
                      <TableHead className="w-[70px] text-center">等級</TableHead>
                      <TableHead className="w-[80px] text-center">組別</TableHead>
                      <TableHead className="w-[80px] hidden md:table-cell">申請日期</TableHead>
                      {canManage && <TableHead className="w-[50px] pr-6 text-right">操作</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {groupedByDate.keys.map((dateKey) => (
                      <Fragment key={dateKey}>
                        <TableRow className="bg-muted/10">
                          <TableCell colSpan={canManage ? 7 : 6} className="border-t border-muted-foreground/10 py-3">
                            <div className="flex items-center justify-between">
                              <div className="text-sm font-medium">{formatCalendarDate(dateKey)}</div>
                              <div className="text-sm text-muted-foreground">{groupedByDate.groupsMap.get(dateKey)?.length ?? 0} 筆</div>
                            </div>
                          </TableCell>
                        </TableRow>

                        {groupedByDate.groupsMap.get(dateKey)?.map((ownership) => (
                          <TableRow key={ownership.id}>
                            <TableCell className="font-mono text-sm whitespace-nowrap pl-6">
                              {formatCoord(ownership.coord_x, ownership.coord_y)}
                            </TableCell>
                            <TableCell className="font-medium truncate max-w-[150px]">
                              {ownership.member_name}
                            </TableCell>
                            <TableCell className="text-muted-foreground truncate max-w-[150px] hidden sm:table-cell">
                              {ownership.line_display_name || '-'}
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge variant={ownership.level === 10 ? 'default' : 'secondary'} className="whitespace-nowrap">
                                {ownership.level} 級
                              </Badge>
                            </TableCell>
                            <TableCell className="text-center">
                              {ownership.member_group ? (
                                <Badge variant="outline" className="whitespace-nowrap">
                                  {ownership.member_group}
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </TableCell>
                            <TableCell className="text-sm hidden md:table-cell">
                              {formatIntraday(ownership.applied_at)}
                            </TableCell>
                            {canManage && (
                              <TableCell className="text-right pr-6">
                                <div className="flex items-center justify-end gap-1">
                                  {/* Transfer button - only show for reserved mines */}
                                  {!ownership.member_id && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                      onClick={() => handleTransferClick(ownership)}
                                      title="轉移給成員"
                                    >
                                      <ArrowRightLeft className="h-4 w-4" />
                                    </Button>
                                  )}
                                  {/* Delete button */}
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-destructive hover:text-destructive"
                                    onClick={() => handleDeleteClick(ownership)}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            )}
                          </TableRow>
                        ))}
                      </Fragment>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Form Dialog */}
      <CopperMineFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        seasonId={seasonId}
      />

      {/* Transfer Dialog */}
      <TransferCopperMineDialog
        open={transferDialogOpen}
        onOpenChange={setTransferDialogOpen}
        seasonId={seasonId}
        ownership={transferringOwnership}
        onTransfer={handleTransferConfirm}
        isTransferring={updateMutation.isPending}
      />

      {/* Delete Confirm Dialog */}
      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleDeleteConfirm}
        title="刪除銅礦記錄"
        description={
          deletingOwnership
            ? `確定要刪除 ${deletingOwnership.member_name} 位於 ${formatCoord(deletingOwnership.coord_x, deletingOwnership.coord_y)} 的銅礦記錄嗎？`
            : ''
        }
        isDeleting={deleteMutation.isPending}
      />
    </>
  )
}
