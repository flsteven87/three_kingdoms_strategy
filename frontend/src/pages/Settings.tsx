/**
 * Settings Page - Tab-based Settings Management
 *
 * Tab structure:
 * - 同盟管理: Alliance settings + Collaborator management
 * - 賽季額度: Season quota status and purchase (Owner/Collaborator only)
 * - 帳戶設定: Personal account settings
 */

import { useState } from 'react'
import { Users, Coins, User } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card'
import { useAlliance } from '@/hooks/use-alliance'
import { useUserRole } from '@/hooks/use-user-role'
import { AllianceForm } from '@/components/alliance/AllianceForm'
import { AllianceCollaboratorManager } from '@/components/alliance/AllianceCollaboratorManager'
import { SeasonQuotaTab } from '@/components/settings'

function Settings() {
  const { data: alliance } = useAlliance()
  const { data: userRole } = useUserRole()
  const [activeTab, setActiveTab] = useState('alliance')

  // Only Owner and Collaborator can see quota tab
  const canSeeQuotaTab = userRole === 'owner' || userRole === 'collaborator'

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
        <TabsList className={`grid w-full ${canSeeQuotaTab ? 'grid-cols-3' : 'grid-cols-2'}`}>
          <TabsTrigger value="alliance" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            <span>同盟管理</span>
          </TabsTrigger>
          {canSeeQuotaTab && (
            <TabsTrigger value="quota" className="flex items-center gap-2">
              <Coins className="h-4 w-4" />
              <span>賽季額度</span>
            </TabsTrigger>
          )}
          <TabsTrigger value="account" className="flex items-center gap-2">
            <User className="h-4 w-4" />
            <span>帳戶設定</span>
          </TabsTrigger>
        </TabsList>

        {/* Alliance Management Tab (Merged) */}
        <TabsContent value="alliance" className="space-y-4">
          {/* Alliance Settings */}
          <AllianceForm />

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

        {/* Season Quota Tab */}
        {canSeeQuotaTab && (
          <TabsContent value="quota" className="space-y-4">
            <SeasonQuotaTab />
          </TabsContent>
        )}

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

export { Settings }
