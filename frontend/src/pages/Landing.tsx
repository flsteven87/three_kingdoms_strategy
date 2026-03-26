import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import {
  Loader2,
  BarChart3,
  Trophy,
  Users,
  Upload,
  Shield,
  Bell,
  Check,
} from "lucide-react";
import { PRICE_PER_SEASON } from "@/constants";
import { ThemeToggle } from "@/components/theme-toggle";
import { PublicFooter } from "@/components/layout/PublicFooter";
import { WebViewWarning } from "@/components/WebViewWarning";
import { detectWebView } from "@/lib/detect-webview";
import type { Provider } from "@supabase/supabase-js";

const GOOGLE_ICON = (
  <svg className="h-5 w-5" viewBox="0 0 24 24">
    <path
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      fill="#4285F4"
    />
    <path
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      fill="#34A853"
    />
    <path
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      fill="#FBBC04"
    />
    <path
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      fill="#EA4335"
    />
  </svg>
);

const FEATURES = [
  {
    icon: Upload,
    title: "CSV 一鍵匯入",
    description: "上傳遊戲統計 CSV，自動解析成員數據",
  },
  {
    icon: BarChart3,
    title: "趨勢分析",
    description: "成員貢獻、戰功、助攻的視覺化圖表",
  },
  {
    icon: Trophy,
    title: "霸業積分",
    description: "自訂權重計算綜合排名，找出 MVP",
  },
  {
    icon: Users,
    title: "多人協作",
    description: "邀請同盟幹部共同管理，免額外付費",
  },
  {
    icon: Shield,
    title: "資料隔離",
    description: "每個同盟資料獨立加密，僅授權者可存取",
  },
  {
    icon: Bell,
    title: "LINE 通知",
    description: "綁定 LINE Bot，即時推送賽季動態",
  },
] as const;

const HERO_FEATURES = FEATURES.slice(0, 3);

const INCLUDED_FEATURES = [
  "無限次 CSV 上傳",
  "全部分析圖表",
  "霸業積分計算",
  "戰役事件追蹤",
  "多人協作（免費）",
  "LINE Bot 通知",
  "資料永久保存",
] as const;

export function Landing() {
  const [isLoading, setIsLoading] = useState<Provider | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [webViewInfo, setWebViewInfo] = useState<ReturnType<
    typeof detectWebView
  > | null>(null);
  const { user, loading, signInWithOAuth } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    setWebViewInfo(detectWebView());
  }, []);

  useEffect(() => {
    if (!loading && user) {
      navigate("/analytics", { replace: true });
    }
  }, [user, loading, navigate]);

  const handleOAuthLogin = async (provider: Provider) => {
    try {
      setIsLoading(provider);
      setError(null);
      await signInWithOAuth(provider);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
      setIsLoading(null);
    }
  };

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
            <span className="font-semibold text-sm">
              三國志戰略版 · 同盟管理中心
            </span>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="flex-1">
        {/* Hero Section */}
        <section
          id="hero"
          className="flex items-center justify-center px-4 py-16 min-h-[calc(100vh-4rem)]"
        >
          <div className="w-full max-w-md space-y-8">
            <div className="flex justify-center">
              <img
                src="/assets/logo.png"
                alt="三國志戰略版"
                className="h-16 w-16 object-contain"
              />
            </div>

            <div className="text-center space-y-3">
              <h1 className="text-3xl font-bold tracking-tight">同盟管理中心</h1>
              <p className="text-muted-foreground">官員專屬的數據管理平台</p>
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
                onClick={() => handleOAuthLogin("google")}
                disabled={isLoading !== null || webViewInfo?.isWebView}
              >
                {isLoading === "google" ? (
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
                  登入即表示您同意我們的
                  <Link to="/terms" className="text-primary hover:underline">服務條款</Link>
                  和
                  <Link to="/privacy" className="text-primary hover:underline">隱私政策</Link>
                </p>
              )}
            </div>

            <div className="pt-8 border-t">
              <div className="grid grid-cols-3 gap-4 text-center">
                {HERO_FEATURES.map((f) => (
                  <div key={f.title} className="space-y-1.5">
                    <f.icon className="h-5 w-5 mx-auto text-primary" />
                    <div className="text-sm font-medium">{f.title}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section className="px-4 py-20 border-t bg-muted/30">
          <div className="mx-auto max-w-2xl space-y-10">
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-bold tracking-tight">功能特色</h2>
              <p className="text-sm text-muted-foreground">
                專為三國志戰略版同盟設計的數據管理工具
              </p>
            </div>
            <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
              {FEATURES.map((f) => (
                <div key={f.title} className="space-y-2 text-center">
                  <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <f.icon className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="text-sm font-medium">{f.title}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {f.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Pricing Section */}
        <section id="pricing" className="px-4 py-20">
          <div className="mx-auto max-w-md space-y-10">
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-bold tracking-tight">簡單定價</h2>
              <p className="text-sm text-muted-foreground">
                免費試用，滿意再買
              </p>
            </div>

            <div className="rounded-2xl border bg-card p-8 shadow-sm space-y-6">
              <div className="flex justify-center">
                <span className="inline-flex items-center rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                  免費試用 14 天
                </span>
              </div>

              <div className="text-center space-y-1">
                <div className="text-4xl font-bold tracking-tight">
                  NT$ {PRICE_PER_SEASON.toLocaleString()}
                </div>
                <div className="text-sm text-muted-foreground">/ 賽季（一次性購買）</div>
              </div>

              <ul className="space-y-2.5">
                {INCLUDED_FEATURES.map((feature) => (
                  <li key={feature} className="flex items-center gap-2.5 text-sm">
                    <Check className="h-4 w-4 flex-shrink-0 text-primary" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <Button
                size="lg"
                className="w-full"
                onClick={() => document.getElementById("hero")?.scrollIntoView({ behavior: "smooth" })}
              >
                免費開始
              </Button>

              <p className="text-center text-xs text-muted-foreground">
                無自動續費 · VISA / JCB
              </p>
            </div>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
