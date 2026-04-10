import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Check, ChevronDown, Circle, ArrowRight, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAlliance } from '@/hooks/use-alliance'
import { useSeasons, useCurrentSeason } from '@/hooks/use-seasons'
import { useCsvUploads } from '@/hooks/use-csv-uploads'

const DISMISSED_KEY = 'onboarding-checklist-dismissed'
const ANALYTICS_VISITED_KEY = 'onboarding-analytics-visited'

interface ChecklistStep {
  readonly label: string
  readonly href: string
  readonly completed: boolean
}

function useOnboardingSteps(): ChecklistStep[] | null {
  const { data: alliance, isLoading: allianceLoading } = useAlliance()
  const { data: seasons, isLoading: seasonsLoading } = useSeasons()
  const { data: currentSeason } = useCurrentSeason()
  const { data: uploads } = useCsvUploads(currentSeason?.id ?? '')
  const { pathname } = useLocation()
  const [analyticsVisited, setAnalyticsVisited] = useState(() => {
    try { return localStorage.getItem(ANALYTICS_VISITED_KEY) === 'true' } catch { return false }
  })

  // Mark analytics as visited when user navigates there
  useEffect(() => {
    if (pathname === '/analytics' && !analyticsVisited) {
      try { localStorage.setItem(ANALYTICS_VISITED_KEY, 'true') } catch { /* noop */ }
      setAnalyticsVisited(true)
    }
  }, [pathname, analyticsVisited])

  // Still loading core data
  if (allianceLoading || seasonsLoading) return null

  const hasAlliance = !!alliance
  const hasActivatedSeason = seasons?.some(s => s.activation_status === 'activated' || s.activation_status === 'completed') ?? false
  const hasUploads = (uploads?.length ?? 0) > 0

  return [
    { label: '建立同盟', href: '/setup', completed: hasAlliance },
    { label: '建立賽季', href: '/seasons', completed: hasActivatedSeason },
    { label: '上傳第一份資料', href: '/data', completed: hasUploads },
    { label: '查看數據分析', href: '/analytics', completed: analyticsVisited },
  ]
}

export function OnboardingChecklist() {
  const steps = useOnboardingSteps()
  const [collapsed, setCollapsed] = useState(false)
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(DISMISSED_KEY) === 'true' } catch { return false }
  })

  const completedCount = steps?.filter(s => s.completed).length ?? 0
  const allDone = steps !== null && completedCount === steps.length

  // Auto-dismiss after all steps complete
  useEffect(() => {
    if (!allDone || dismissed) return
    const timer = setTimeout(() => {
      try { localStorage.setItem(DISMISSED_KEY, 'true') } catch { /* noop */ }
      setDismissed(true)
    }, 5000)
    return () => clearTimeout(timer)
  }, [allDone, dismissed])

  if (dismissed || !steps) return null

  const handleDismiss = () => {
    try { localStorage.setItem(DISMISSED_KEY, 'true') } catch { /* noop */ }
    setDismissed(true)
  }

  // Find the first incomplete step
  const nextStepIndex = steps.findIndex(s => !s.completed)

  return (
    <div className="px-3 py-2">
      <div className="rounded-lg border border-border bg-muted/30 overflow-hidden">
        {/* Header */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex w-full items-center justify-between px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <span>{allDone ? '設定完成！' : '開始使用'}</span>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] tabular-nums">{completedCount}/{steps.length}</span>
            <button
              onClick={(e) => { e.stopPropagation(); handleDismiss() }}
              className="p-0.5 rounded hover:bg-accent"
              title="關閉引導"
            >
              <X className="h-3 w-3" />
            </button>
            <ChevronDown className={cn(
              'h-3 w-3 transition-transform duration-200',
              collapsed && '-rotate-90'
            )} />
          </div>
        </button>

        {/* Steps */}
        {!collapsed && (
          <div className="px-3 pb-2.5 space-y-1">
            {steps.map((step, index) => {
              const isNext = index === nextStepIndex

              return (
                <Link
                  key={step.label}
                  to={step.href}
                  className={cn(
                    'flex items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors',
                    step.completed
                      ? 'text-muted-foreground'
                      : isNext
                        ? 'text-foreground bg-primary/5 font-medium'
                        : 'text-muted-foreground'
                  )}
                >
                  {step.completed ? (
                    <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                  ) : isNext ? (
                    <ArrowRight className="h-3.5 w-3.5 text-primary shrink-0" />
                  ) : (
                    <Circle className="h-3.5 w-3.5 shrink-0" />
                  )}
                  <span className="flex-1">{step.label}</span>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
