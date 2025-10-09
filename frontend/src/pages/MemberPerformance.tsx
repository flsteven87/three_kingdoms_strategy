import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Construction } from 'lucide-react'

const MemberPerformance: React.FC = () => {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">成員表現</h2>
        <p className="text-muted-foreground mt-1">
          查看個別成員的詳細表現數據與趨勢分析
        </p>
      </div>

      {/* Under Development Alert */}
      <Alert className="border-blue-500/50 bg-blue-50 dark:bg-blue-950/20">
        <Construction className="h-4 w-4 text-blue-600 dark:text-blue-400" />
        <AlertDescription className="text-blue-900 dark:text-blue-100">
          <strong className="font-semibold">功能開發中</strong>
          <p className="mt-1 text-sm text-blue-800 dark:text-blue-200">
            此頁面正在開發中，即將提供以下功能：成員列表、詳細表現數據、歷史趨勢圖表、排名變化追蹤。
          </p>
        </AlertDescription>
      </Alert>

      {/* Feature Preview Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="text-base">成員列表</CardTitle>
            <CardDescription className="text-xs">即將推出</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              完整的成員資料列表，支援搜尋、篩選與排序功能
            </p>
          </CardContent>
        </Card>

        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="text-base">表現分析</CardTitle>
            <CardDescription className="text-xs">即將推出</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              貢獻、戰功、助攻、捐獻等多維度數據分析
            </p>
          </CardContent>
        </Card>

        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="text-base">趨勢圖表</CardTitle>
            <CardDescription className="text-xs">即將推出</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              成員表現歷史趨勢與週排名變化追蹤
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Placeholder Card */}
      <Card>
        <CardHeader>
          <CardTitle>成員表現總覽</CardTitle>
          <CardDescription>建置中 - Coming Soon</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Construction className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium text-muted-foreground mb-2">
              功能開發中
            </p>
            <p className="text-sm text-muted-foreground max-w-md">
              我們正在努力開發這個功能。完成後，你將能夠查看每個成員的詳細表現數據、歷史趨勢，以及與其他成員的比較分析。
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default MemberPerformance
