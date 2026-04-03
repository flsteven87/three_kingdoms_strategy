import { useState } from 'react'
import { Users, CheckCircle2, AlertCircle, UserX, ChevronDown } from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useRegisteredMembers } from '@/hooks/use-line-binding'
import { formatDateTW } from '@/lib/date-utils'

export function RegisteredMembersCard() {
  const { data: membersData, isLoading: membersLoading } = useRegisteredMembers(true)
  const [verifiedOpen, setVerifiedOpen] = useState(false)
  const [unverifiedOpen, setUnverifiedOpen] = useState(true)
  const [unregisteredOpen, setUnregisteredOpen] = useState(true)

  const verifiedMembers = membersData?.members.filter(m => m.is_verified) ?? []
  const unverifiedMembers = membersData?.members.filter(m => !m.is_verified) ?? []
  const unregisteredMembers = membersData?.unregistered ?? []

  const hasAnyMembers = (membersData?.total ?? 0) > 0 || unregisteredMembers.length > 0

  return (
    <Card>
      <CardHeader>
        <CardTitle>群組成員狀態</CardTitle>
        <CardDescription>LINE 群組成員的註冊與驗證狀況</CardDescription>
      </CardHeader>
      <CardContent>
        {membersLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="flex items-center gap-2 text-muted-foreground">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <span>載入中...</span>
            </div>
          </div>
        ) : !hasAnyMembers ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Users className="h-12 w-12 text-muted-foreground/50 mb-3" />
            <p className="text-muted-foreground">尚無成員資料</p>
            <p className="text-sm text-muted-foreground/70 mt-1">
              盟友在 LINE 群組中活動後將自動出現
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Statistics Metrics */}
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-lg border bg-muted/30 p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                    <UserX className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">未登記</p>
                    <p className="text-2xl font-bold text-muted-foreground">
                      {unregisteredMembers.length}
                    </p>
                  </div>
                </div>
              </div>
              <div className="rounded-lg border bg-orange-50 dark:bg-orange-950/20 p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-100 dark:bg-orange-900/30">
                    <AlertCircle className="h-5 w-5 text-orange-600 dark:text-orange-500" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">待驗證</p>
                    <p className="text-2xl font-bold text-orange-600 dark:text-orange-500">
                      {unverifiedMembers.length}
                    </p>
                  </div>
                </div>
              </div>
              <div className="rounded-lg border bg-green-50 dark:bg-green-950/20 p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
                    <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-500" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">已驗證</p>
                    <p className="text-2xl font-bold text-green-600 dark:text-green-500">
                      {verifiedMembers.length}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Members Table */}
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/30 text-left text-sm text-muted-foreground">
                    <th className="p-3 font-medium">LINE 名稱</th>
                    <th className="p-3 font-medium">遊戲 ID</th>
                    <th className="p-3 font-medium">狀態</th>
                    <th className="p-3 font-medium text-right">日期</th>
                  </tr>
                </thead>
                <tbody className="text-sm">
                  {/* Unregistered Members Section */}
                  {unregisteredMembers.length > 0 && (
                    <>
                      <tr
                        className="border-b bg-muted/30 hover:bg-muted/50 cursor-pointer"
                        onClick={() => setUnregisteredOpen(!unregisteredOpen)}
                      >
                        <td colSpan={4} className="p-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <UserX className="h-4 w-4 text-muted-foreground" />
                              <span className="font-medium">未登記成員</span>
                              <Badge variant="outline" className="ml-2">
                                {unregisteredMembers.length}
                              </Badge>
                            </div>
                            <ChevronDown className={`h-4 w-4 transition-transform ${unregisteredOpen ? 'rotate-180' : ''}`} />
                          </div>
                        </td>
                      </tr>
                      {unregisteredOpen && unregisteredMembers.map((member) => (
                        <tr key={`unreg-${member.line_user_id}`} className="border-b hover:bg-muted/20">
                          <td className="p-3">
                            {member.line_display_name ?? (
                              <span className="text-muted-foreground italic">未知</span>
                            )}
                          </td>
                          <td className="p-3 text-muted-foreground">—</td>
                          <td className="p-3">
                            <Badge variant="outline" className="text-xs">未登記</Badge>
                          </td>
                          <td className="p-3 text-right tabular-nums text-muted-foreground">
                            {formatDateTW(member.tracked_at, { padded: true })}
                          </td>
                        </tr>
                      ))}
                    </>
                  )}

                  {/* Unverified Members Section */}
                  {unverifiedMembers.length > 0 && (
                    <>
                      <tr
                        className="border-b bg-muted/30 hover:bg-muted/50 cursor-pointer"
                        onClick={() => setUnverifiedOpen(!unverifiedOpen)}
                      >
                        <td colSpan={4} className="p-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <AlertCircle className="h-4 w-4 text-orange-600" />
                              <span className="font-medium">待驗證成員</span>
                              <Badge variant="secondary" className="ml-2">
                                {unverifiedMembers.length}
                              </Badge>
                            </div>
                            <ChevronDown className={`h-4 w-4 transition-transform ${unverifiedOpen ? 'rotate-180' : ''}`} />
                          </div>
                        </td>
                      </tr>
                      {unverifiedOpen && unverifiedMembers.map((member) => (
                        <tr key={`unverified-${member.line_user_id}-${member.game_id}`} className="border-b hover:bg-muted/20">
                          <td className="p-3">{member.line_display_name}</td>
                          <td className="p-3 font-medium">{member.game_id}</td>
                          <td className="p-3">
                            <Badge variant="secondary" className="text-xs">待驗證</Badge>
                          </td>
                          <td className="p-3 text-right tabular-nums text-muted-foreground">
                            {formatDateTW(member.registered_at, { padded: true })}
                          </td>
                        </tr>
                      ))}
                    </>
                  )}

                  {/* Verified Members Section */}
                  {verifiedMembers.length > 0 && (
                    <>
                      <tr
                        className="border-b bg-muted/30 hover:bg-muted/50 cursor-pointer"
                        onClick={() => setVerifiedOpen(!verifiedOpen)}
                      >
                        <td colSpan={4} className="p-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <CheckCircle2 className="h-4 w-4 text-green-600" />
                              <span className="font-medium">已驗證成員</span>
                              <Badge variant="secondary" className="ml-2">
                                {verifiedMembers.length}
                              </Badge>
                            </div>
                            <ChevronDown className={`h-4 w-4 transition-transform ${verifiedOpen ? 'rotate-180' : ''}`} />
                          </div>
                        </td>
                      </tr>
                      {verifiedOpen && verifiedMembers.map((member) => (
                        <tr key={`verified-${member.line_user_id}-${member.game_id}`} className="border-b hover:bg-muted/20">
                          <td className="p-3">{member.line_display_name}</td>
                          <td className="p-3 font-medium">{member.game_id}</td>
                          <td className="p-3">
                            <Badge variant="default" className="bg-green-600 text-xs">已驗證</Badge>
                          </td>
                          <td className="p-3 text-right tabular-nums text-muted-foreground">
                            {formatDateTW(member.registered_at, { padded: true })}
                          </td>
                        </tr>
                      ))}
                    </>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
