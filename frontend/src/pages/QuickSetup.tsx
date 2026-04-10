import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useCreateAlliance } from '@/hooks/use-alliance'
import { useCreateSeason, useActivateSeason } from '@/hooks/use-seasons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function QuickSetup() {
  const navigate = useNavigate()
  const [allianceName, setAllianceName] = useState('')
  const [seasonName, setSeasonName] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const createAlliance = useCreateAlliance()
  const createSeason = useCreateSeason()
  const activateSeason = useActivateSeason()

  const canSubmit = allianceName.trim() && seasonName.trim() && !isSubmitting

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return

    setIsSubmitting(true)

    try {
      // Step 1: Create alliance
      const alliance = await createAlliance.mutateAsync({
        name: allianceName.trim(),
      })

      // Step 2: Create season as draft
      const season = await createSeason.mutateAsync({
        alliance_id: alliance.id,
        name: seasonName.trim(),
        start_date: new Date().toISOString().split('T')[0],
      })

      // Step 3: Activate season (starts trial)
      await activateSeason.mutateAsync(season.id)

      toast.success('設定完成！開始上傳資料吧')
      navigate('/data', { replace: true })
    } catch {
      toast.error('設定失敗，請稍後再試')
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-8">
        {/* Branding */}
        <div className="flex flex-col items-center gap-4">
          <img
            src="/assets/logo.svg"
            alt="三國志戰略版"
            className="h-16 w-16 object-contain"
          />
          <div className="text-center space-y-1">
            <h1 className="text-2xl font-bold tracking-tight">歡迎使用同盟管理中心</h1>
            <p className="text-muted-foreground">3 秒完成初始設定</p>
          </div>
        </div>

        {/* Setup Form */}
        <form onSubmit={handleSubmit} className="space-y-6 rounded-xl border border-border bg-card p-6 shadow-sm">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="alliance-name">同盟名稱</Label>
              <Input
                id="alliance-name"
                placeholder="例如：天下無雙"
                value={allianceName}
                onChange={(e) => setAllianceName(e.target.value)}
                disabled={isSubmitting}
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="season-name">賽季名稱</Label>
              <Input
                id="season-name"
                placeholder="例如：S1 賽季"
                value={seasonName}
                onChange={(e) => setSeasonName(e.target.value)}
                disabled={isSubmitting}
              />
            </div>
          </div>

          <Button
            type="submit"
            className="w-full"
            disabled={!canSubmit}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                設定中...
              </>
            ) : (
              '開始使用'
            )}
          </Button>
        </form>

        <p className="text-center text-xs text-muted-foreground">
          14 天免費試用 · 無需信用卡
        </p>
      </div>
    </div>
  )
}
