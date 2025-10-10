import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/use-auth'
import { Loader2 } from 'lucide-react'
import { ThemeToggle } from '@/components/theme-toggle'
import { WebViewWarning } from '@/components/WebViewWarning'
import { detectWebView } from '@/lib/detect-webview'
import type { Provider } from '@supabase/supabase-js'

const GOOGLE_ICON = (
  <svg className="h-5 w-5" viewBox="0 0 24 24">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC04"/>
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
  </svg>
)

export function Landing() {
  const [isLoading, setIsLoading] = useState<Provider | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [webViewInfo, setWebViewInfo] = useState<ReturnType<typeof detectWebView> | null>(null)
  const { user, loading, signInWithOAuth } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    setWebViewInfo(detectWebView())
  }, [])

  useEffect(() => {
    if (!loading && user) {
      navigate('/dashboard', { replace: true })
    }
  }, [user, loading, navigate])

  const handleOAuthLogin = async (provider: Provider) => {
    try {
      setIsLoading(provider)
      setError(null)
      await signInWithOAuth(provider)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed')
      setIsLoading(null)
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img
              src="/assets/logo.png"
              alt="三國志戰略版"
              className="h-8 w-8 object-contain"
            />
            <span className="font-semibold text-sm">三國志戰略版 · 同盟管理中心</span>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-16">
        <div className="w-full max-w-md space-y-8">
          <div className="flex justify-center">
            <img
              src="/assets/logo.png"
              alt="三國志戰略版"
              className="h-16 w-16 object-contain"
            />
          </div>

          <div className="text-center space-y-3">
            <h1 className="text-3xl font-bold tracking-tight">
              同盟管理中心
            </h1>
            <p className="text-muted-foreground">
              官員專屬的數據管理平台
            </p>
          </div>

          <div className="space-y-4 pt-2">
            {webViewInfo?.isWebView && webViewInfo.platform && (
              <WebViewWarning
                platform={webViewInfo.platform}
                suggestion={webViewInfo.suggestion}
              />
            )}

            {error && (
              <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3">
                <p className="text-sm text-destructive text-center">{error}</p>
              </div>
            )}

            <Button
              size="lg"
              className="w-full"
              onClick={() => handleOAuthLogin('google')}
              disabled={isLoading !== null || webViewInfo?.isWebView}
            >
              {isLoading === 'google' ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  登入中...
                </>
              ) : (
                <>
                  {GOOGLE_ICON}
                  使用 Google 帳戶登入
                </>
              )}
            </Button>

            {!webViewInfo?.isWebView && (
              <p className="text-xs text-center text-muted-foreground">
                登入即表示您同意我們的服務條款和隱私政策
              </p>
            )}
          </div>

          <div className="pt-8 border-t">
            <div className="grid grid-cols-3 gap-6 text-center">
              <div className="space-y-1">
                <div className="text-2xl font-bold text-primary">霸業積分</div>
                <p className="text-xs text-muted-foreground">自動計算排名</p>
              </div>
              <div className="space-y-1">
                <div className="text-2xl font-bold text-primary">圖表分析</div>
                <p className="text-xs text-muted-foreground">找出混水摸魚</p>
              </div>
              <div className="space-y-1">
                <div className="text-2xl font-bold text-primary">多人協作</div>
                <p className="text-xs text-muted-foreground">官員共同管理</p>
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="border-t py-6">
        <div className="container mx-auto px-4">
          <p className="text-center text-xs text-muted-foreground">
            © 2025 三國志戰略版同盟管理中心 · Version 0.1.0
          </p>
        </div>
      </footer>
    </div>
  )
}
