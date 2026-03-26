import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useAuth } from "@/hooks/use-auth";
import {
  Loader2,
  Check,
  UserX,
  Search,
  Scale,
  BarChart3,
  Activity,
  CalendarCheck,
  Link2,
  Trophy,
  Users,
} from "lucide-react";
import { PRICE_PER_SEASON } from "@/constants";
import { ThemeToggle } from "@/components/theme-toggle";
import { PublicFooter } from "@/components/layout/PublicFooter";
import { WebViewWarning } from "@/components/WebViewWarning";
import { detectWebView } from "@/lib/detect-webview";
import type { Provider } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

const GOOGLE_ICON = (
  <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
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

const NAV_LINKS = [
  { label: "功能", href: "#features" },
  { label: "定價", href: "#pricing" },
  { label: "常見問題", href: "#faq" },
] as const;

const PAIN_POINTS = [
  {
    icon: UserX,
    title: "戰役打完了，誰沒來？",
    description:
      "關鍵戰打響點名點不完，事後想查誰缺席翻不到紀錄。",
  },
  {
    icon: Search,
    title: "要找人，遊戲名跟 LINE 對不上？",
    description:
      "想聯絡某個成員，只知道遊戲 ID 不知道 LINE 是誰，還得在群裡喊。",
  },
  {
    icon: Scale,
    title: "獎懲怎麼讓人服氣？",
    description:
      "沒有客觀數據，資源怎麼分配都有人覺得不公平。",
  },
] as const;

const STEPS = [
  {
    title: "匯入同盟數據",
    description: "從遊戲導出統計，上傳到管理中心",
  },
  {
    title: "系統自動分析",
    description: "活躍度、出席率、貢獻排名自動計算",
  },
  {
    title: "獎懲有據可查",
    description: "數據支持每個獎懲決策，公平透明",
  },
] as const;

const FEATURES = [
  {
    icon: Activity,
    title: "活躍度追蹤",
    description: "自動記錄成員貢獻變化，誰在衝、誰停滯，趨勢一眼看清",
  },
  {
    icon: CalendarCheck,
    title: "戰役出席紀錄",
    description: "記錄關鍵戰役出席狀況，告別手動點名",
  },
  {
    icon: Link2,
    title: "LINE 身份對應",
    description: "遊戲帳號直接綁定 LINE，找人一搜就到",
  },
  {
    icon: BarChart3,
    title: "分組表現對比",
    description: "各組出席率、貢獻值並排比較，強弱立見",
  },
  {
    icon: Trophy,
    title: "綜合排名",
    description: "自訂權重計算評分，論功行賞有客觀依據",
  },
  {
    icon: Users,
    title: "幹部共管",
    description: "邀請副盟主、軍師共同查看，決策更有共識",
  },
] as const;

const INCLUDED_FEATURES = [
  "無限次資料匯入",
  "全部分析圖表",
  "綜合排名計算",
  "戰役事件追蹤",
  "LINE 身份綁定",
  "多人協作（免費）",
  "資料永久保存",
] as const;

const FAQ_ITEMS = [
  {
    question: "怎麼取得遊戲的統計資料？",
    answer:
      "在遊戲內進入同盟 → 統計 → 導出 CSV 檔案，再上傳到管理中心即可。系統會自動解析所有成員數據。",
  },
  {
    question: "我的資料安全嗎？",
    answer:
      "每個同盟的資料完全獨立隔離，使用資料庫層級的存取控制。只有你授權的幹部能看到資料，我們不會對外分享任何數據。",
  },
  {
    question: "可以多位幹部一起管理嗎？",
    answer:
      "可以，透過邀請連結即可加入，不額外收費。所有幹部共享相同的數據視圖，方便協作決策。",
  },
  {
    question: "試用期結束後會怎樣？",
    answer:
      "你的資料會完整保留，但分析功能會鎖定。付費後立即恢復所有功能，不會遺失任何歷史數據。",
  },
  {
    question: "支援哪些付款方式？",
    answer:
      "支援 VISA、JCB、Mastercard 信用卡，一次性付費，無自動續約。",
  },
] as const;

function scrollToHero() {
  document.getElementById("hero")?.scrollIntoView({ behavior: "smooth" });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

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
      {/* ── Header (sticky) ── */}
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img
              src="/assets/logo.png"
              alt="三國志戰略版"
              className="h-7 w-7 object-contain"
            />
            <span className="font-semibold text-sm">同盟管理中心</span>
          </div>
          <nav className="hidden sm:flex items-center gap-6">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {link.label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button size="sm" onClick={scrollToHero}>
              免費開始
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* ── 1. Hero ── */}
        <section id="hero" className="scroll-mt-14 px-4 py-20 md:py-28">
          <div className="mx-auto max-w-2xl text-center space-y-8">
            <div className="space-y-4">
              <span className="inline-flex items-center rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                三國志戰略版 · 同盟管理工具
              </span>
              <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-balance">
                讓每一份付出都被看見
              </h1>
              <p className="text-lg text-muted-foreground max-w-xl mx-auto leading-relaxed text-balance">
                出席、貢獻、活躍度全自動追蹤。
                <br className="hidden sm:block" />
                獎懲有據，管理不靠感覺。
              </p>
            </div>

            <div className="max-w-sm mx-auto space-y-4">
              {webViewInfo?.isWebView && webViewInfo.platform && (
                <WebViewWarning
                  platform={webViewInfo.platform}
                  suggestion={webViewInfo.suggestion}
                />
              )}

              {error && (
                <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3">
                  <p className="text-sm text-destructive text-center">
                    {error}
                  </p>
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
                    免費體驗 14 天
                  </>
                )}
              </Button>

              {!webViewInfo?.isWebView && (
                <p className="text-xs text-center text-muted-foreground">
                  使用 Google 帳戶登入 · 同意
                  <Link to="/terms" className="text-primary hover:underline">
                    服務條款
                  </Link>
                  及
                  <Link to="/privacy" className="text-primary hover:underline">
                    隱私政策
                  </Link>
                </p>
              )}
            </div>
          </div>
        </section>

        {/* ── 2. Pain Points ── */}
        <section className="px-4 py-20 border-t bg-muted/30">
          <div className="mx-auto max-w-4xl">
            <div className="grid gap-10 md:grid-cols-3">
              {PAIN_POINTS.map((pain) => (
                <div key={pain.title} className="space-y-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-destructive/10">
                    <pain.icon className="h-5 w-5 text-destructive" />
                  </div>
                  <h3 className="font-semibold">{pain.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {pain.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── 3. How It Works ── */}
        <section className="px-4 py-20 border-t">
          <div className="mx-auto max-w-3xl space-y-12">
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-bold tracking-tight text-balance">三步開始</h2>
              <p className="text-sm text-muted-foreground">
                簡單上手，立刻掌握同盟全局
              </p>
            </div>
            <div className="grid gap-8 md:grid-cols-3">
              {STEPS.map((step, i) => (
                <div key={step.title} className="text-center space-y-3">
                  <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold text-sm">
                    {i + 1}
                  </div>
                  <h3 className="font-semibold">{step.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed text-balance">
                    {step.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── 4. Features ── */}
        <section id="features" className="scroll-mt-14 px-4 py-20 border-t">
          <div className="mx-auto max-w-4xl space-y-12">
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-bold tracking-tight">核心功能</h2>
              <p className="text-sm text-muted-foreground">
                專為三國志戰略版同盟官員打造
              </p>
            </div>
            <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((f) => (
                <div key={f.title} className="space-y-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <f.icon className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="font-medium">{f.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {f.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── 5. Pricing ── */}
        <section
          id="pricing"
          className="scroll-mt-14 px-4 py-20 border-t bg-muted/30"
        >
          <div className="mx-auto max-w-md space-y-10">
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-bold tracking-tight">
                一個價格，全部功能
              </h2>
              <p className="text-sm text-muted-foreground">
                14 天免費體驗，不滿意不用付錢
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
                <div className="text-sm text-muted-foreground">
                  / 賽季（一次性購買）
                </div>
              </div>

              <ul className="space-y-2.5">
                {INCLUDED_FEATURES.map((feature) => (
                  <li
                    key={feature}
                    className="flex items-center gap-2.5 text-sm"
                  >
                    <Check className="h-4 w-4 flex-shrink-0 text-primary" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <Button size="lg" className="w-full" onClick={scrollToHero}>
                免費開始
              </Button>

              <p className="text-center text-xs text-muted-foreground">
                無自動續費 · VISA / JCB / Mastercard
              </p>
            </div>
          </div>
        </section>

        {/* ── 6. FAQ ── */}
        <section id="faq" className="scroll-mt-14 px-4 py-20 border-t">
          <div className="mx-auto max-w-2xl space-y-10">
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-bold tracking-tight">常見問題</h2>
            </div>
            <Accordion type="single" collapsible className="w-full">
              {FAQ_ITEMS.map((item) => (
                <AccordionItem key={item.question} value={item.question}>
                  <AccordionTrigger>{item.question}</AccordionTrigger>
                  <AccordionContent>
                    <p className="text-muted-foreground leading-relaxed">
                      {item.answer}
                    </p>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </section>

        {/* ── 7. Final CTA ── */}
        <section className="px-4 py-20 border-t bg-muted/30">
          <div className="mx-auto max-w-md text-center space-y-6">
            <h2 className="text-2xl font-bold tracking-tight text-balance">
              準備好用數據管理你的同盟了嗎？
            </h2>
            <Button size="lg" onClick={scrollToHero}>
              免費體驗 14 天
            </Button>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
