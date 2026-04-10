/**
 * Settings Page - Tab-based Settings Management
 *
 * Tab structure:
 * - 同盟管理: Alliance settings + Collaborator management
 * - 帳戶設定: Personal profile (read-only) + Season quota display
 */

import { useState } from 'react'
import { Users, User } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { useAlliance } from '@/hooks/use-alliance'
import { useAuth } from '@/hooks/use-auth'
import { useSeasonQuota } from '@/hooks/use-season-quota'
import { AllianceForm } from '@/components/alliance/AllianceForm'
import { AllianceCollaboratorManager } from '@/components/alliance/AllianceCollaboratorManager'

function Settings() {
  const { data: alliance } = useAlliance()
  const { user } = useAuth()
  const { data: quota } = useSeasonQuota()
  const [activeTab, setActiveTab] = useState('alliance')

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight">設定</h2>
        <p className="text-muted-foreground mt-1">
          管理你的同盟與帳戶設定
        </p>
      </div>

      {/* Tab Navigation */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="alliance" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            <span>同盟管理</span>
          </TabsTrigger>
          <TabsTrigger value="account" className="flex items-center gap-2">
            <User className="h-4 w-4" />
            <span>帳戶設定</span>
          </TabsTrigger>
        </TabsList>

        {/* Alliance Management Tab (Merged) */}
        <TabsContent value="alliance" className="space-y-4">
          {/* Alliance Settings */}
          <AllianceForm />

          {/* Permissions Documentation */}
          <Card>
            <CardHeader>
              <CardTitle>角色權限說明</CardTitle>
              <CardDescription>
                了解不同角色在系統中的權限與功能
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Role Descriptions */}
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <Badge variant="default" className="mt-1">👑 擁有者</Badge>
                  <div className="flex-1">
                    <p className="text-sm text-muted-foreground">
                      同盟的建立者，擁有最高權限。可以管理協作成員、修改同盟設定、刪除同盟等。
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Badge variant="secondary" className="mt-1">🤝 協作者</Badge>
                  <div className="flex-1">
                    <p className="text-sm text-muted-foreground">
                      協助管理同盟的成員，可以上傳數據、管理賽季、設定權重等，但無法管理其他成員或刪除同盟。
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Badge variant="outline" className="mt-1">👤 成員</Badge>
                  <div className="flex-1">
                    <p className="text-sm text-muted-foreground">
                      一般成員，只能查看數據與分析結果，無法進行任何修改操作。
                    </p>
                  </div>
                </div>
              </div>

              {/* Permissions Table */}
              <div>
                <h4 className="font-semibold mb-3">功能權限對照表</h4>
                <div className="border rounded-lg">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[40%]">功能</TableHead>
                        <TableHead className="text-center">擁有者</TableHead>
                        <TableHead className="text-center">協作者</TableHead>
                        <TableHead className="text-center">成員</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell className="font-medium">查看數據與分析</TableCell>
                        <TableCell className="text-center">✅</TableCell>
                        <TableCell className="text-center">✅</TableCell>
                        <TableCell className="text-center">✅</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">上傳 CSV 數據</TableCell>
                        <TableCell className="text-center">✅</TableCell>
                        <TableCell className="text-center">✅</TableCell>
                        <TableCell className="text-center">❌</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">管理賽季</TableCell>
                        <TableCell className="text-center">✅</TableCell>
                        <TableCell className="text-center">✅</TableCell>
                        <TableCell className="text-center">❌</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">設定霸業權重</TableCell>
                        <TableCell className="text-center">✅</TableCell>
                        <TableCell className="text-center">✅</TableCell>
                        <TableCell className="text-center">❌</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">更新同盟設定</TableCell>
                        <TableCell className="text-center">✅</TableCell>
                        <TableCell className="text-center">✅</TableCell>
                        <TableCell className="text-center">❌</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">管理協作成員</TableCell>
                        <TableCell className="text-center">✅</TableCell>
                        <TableCell className="text-center">❌</TableCell>
                        <TableCell className="text-center">❌</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">刪除同盟</TableCell>
                        <TableCell className="text-center">✅</TableCell>
                        <TableCell className="text-center">❌</TableCell>
                        <TableCell className="text-center">❌</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Collaborator Manager */}
          {alliance ? (
            <AllianceCollaboratorManager allianceId={alliance.id} />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>協作成員管理</CardTitle>
                <CardDescription>邀請其他使用者加入你的同盟</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <p className="text-muted-foreground">
                    請先建立同盟
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Account Settings Tab */}
        <TabsContent value="account" className="space-y-4">
          {/* Personal Profile */}
          <Card>
            <CardHeader>
              <CardTitle>個人資料</CardTitle>
              <CardDescription>你的帳戶基本資訊</CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-sm">
                <dt className="text-muted-foreground">顯示名稱</dt>
                <dd>{user?.user_metadata?.full_name ?? user?.user_metadata?.name ?? '—'}</dd>
                <dt className="text-muted-foreground">電子信箱</dt>
                <dd>{user?.email ?? '—'}</dd>
                <dt className="text-muted-foreground">登入方式</dt>
                <dd className="capitalize">{user?.app_metadata?.provider ?? '—'}</dd>
              </dl>
            </CardContent>
          </Card>

          {/* Season Quota */}
          <Card>
            <CardHeader>
              <CardTitle>賽季額度</CardTitle>
              <CardDescription>
                {alliance ? `${alliance.name} 的賽季使用狀況` : '所屬同盟的賽季使用狀況'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {quota ? (
                <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-sm">
                  <dt className="text-muted-foreground">已購買</dt>
                  <dd>{quota.purchased_seasons} 季</dd>
                  <dt className="text-muted-foreground">已使用</dt>
                  <dd>{quota.used_seasons} 季</dd>
                  <dt className="text-muted-foreground">剩餘可用</dt>
                  <dd>
                    <span className={quota.available_seasons > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                      {quota.available_seasons} 季
                    </span>
                  </dd>
                  {quota.current_season_is_trial && quota.trial_days_remaining !== null && (
                    <>
                      <dt className="text-muted-foreground">試用期剩餘</dt>
                      <dd>
                        <Badge variant={quota.trial_days_remaining <= 3 ? 'destructive' : 'secondary'}>
                          {quota.trial_days_remaining} 天
                        </Badge>
                      </dd>
                    </>
                  )}
                </dl>
              ) : (
                <p className="text-sm text-muted-foreground">尚未建立同盟</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

export { Settings }
