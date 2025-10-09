/**
 * Settings Page
 *
 * 管理帳戶相關設定，包含同盟設定
 * 符合 CLAUDE.md 🟢: Consistent layout with other pages
 */

import { useAlliance } from '@/hooks/use-alliance'
import { AllianceSetupForm } from '@/components/alliance/AllianceSetupForm'
import { AllianceSettings } from '@/components/alliance/AllianceSettings'
import { AllianceCollaboratorManager } from '@/components/alliance/AllianceCollaboratorManager'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card'

const Settings: React.FC = () => {
  const { data: alliance, isLoading } = useAlliance()

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight">設定</h2>
        <p className="text-muted-foreground mt-1">
          管理你的帳戶與同盟設定
        </p>
      </div>

      {/* Alliance Settings Section */}
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold">同盟設定</h3>
          <p className="text-sm text-muted-foreground mt-1">
            {alliance
              ? '更新你的同盟資訊，包含名稱與伺服器設定'
              : '請先設定同盟資訊以開始使用系統'
            }
          </p>
        </div>

        {isLoading ? (
          <Card>
            <CardContent className="py-12">
              <div className="text-center text-muted-foreground">載入中...</div>
            </CardContent>
          </Card>
        ) : alliance ? (
          <div className="space-y-4">
            <AllianceSettings />
            <AllianceCollaboratorManager allianceId={alliance.id} />
          </div>
        ) : (
          <div className="max-w-2xl">
            <AllianceSetupForm />
          </div>
        )}
      </div>

      {/* Account Settings Section */}
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold">帳戶設定</h3>
          <p className="text-sm text-muted-foreground mt-1">
            管理你的個人資訊與偏好設定
          </p>
        </div>

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
      </div>
    </div>
  )
}

export default Settings
