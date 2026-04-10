import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'

const AUTH_TIMEOUT_MS = 10_000

export function AuthCallback() {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        navigate('/analytics', { replace: true })
      }
    })

    const timer = setTimeout(() => {
      setError('登入逾時，請重新嘗試')
    }, AUTH_TIMEOUT_MS)

    return () => {
      subscription.unsubscribe()
      clearTimeout(timer)
    }
  }, [navigate])

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="h-12 w-12 text-destructive mx-auto" />
          <h2 className="mt-4 text-lg font-semibold">{error}</h2>
          <Button
            variant="link"
            onClick={() => navigate('/landing', { replace: true })}
            className="mt-4"
          >
            返回登入頁面
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
        <h2 className="mt-4 text-lg font-semibold">登入中...</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          請稍候，正在處理您的登入請求
        </p>
      </div>
    </div>
  )
}
