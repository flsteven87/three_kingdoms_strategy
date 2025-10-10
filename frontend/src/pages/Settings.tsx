/**
 * Settings Page - Tab-based Settings Management
 *
 * 符合 CLAUDE.md 🔴:
 * - JSX syntax only
 * - Type-safe component
 * - Tab-based navigation for different settings
 */

import React, { useState } from 'react'
import { Settings as SettingsIcon, User, Shield } from 'lucide-react'
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
import { AllianceForm } from '@/components/alliance/AllianceForm'
import { AllianceCollaboratorManager } from '@/components/alliance/AllianceCollaboratorManager'

const Settings: React.FC = () => {
  const { data: alliance } = useAlliance()
  const [activeTab, setActiveTab] = useState('alliance')

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight">設定</h2>
        <p className="text-muted-foreground mt-1">
          管理你的帳戶與同盟設定
        </p>
      </div>

      {/* Tab Navigation */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="alliance" className="flex items-center gap-2">
            <SettingsIcon className="h-4 w-4" />
            <span>同盟設定</span>
          </TabsTrigger>
          <TabsTrigger value="permissions" className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            <span>權限管理</span>
          </TabsTrigger>
          <TabsTrigger value="account" className="flex items-center gap-2">
            <User className="h-4 w-4" />
            <span>帳戶設定</span>
          </TabsTrigger>
        </TabsList>

        {/* Alliance Settings Tab */}
        <TabsContent value="alliance" className="space-y-4">
          <AllianceForm />
        </TabsContent>

        {/* Permissions Management Tab */}
        <TabsContent value="permissions" className="space-y-4">
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
                    請先在「同盟設定」頁面建立同盟
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

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
        </TabsContent>

        {/* Account Settings Tab */}
        <TabsContent value="account" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>個人資料</CardTitle>
              <CardDescription>管理你的個人資訊</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <p className="text-muted-foreground">
                  此功能即將推出
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

export default Settings
