# SEO Optimization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Bring the SPA from SEO score 3/10 to 8/10 — adding OG tags, structured data, robots.txt, sitemap, canonical URLs, route code splitting, and favicon completion.

**Architecture:** Static SEO tags in `index.html` for crawler-friendly defaults + route-based code splitting via `React.lazy()`. No SSR or prerender plugin (overkill for single-landing-page SaaS). JSON-LD structured data injected inline in `index.html`.

**Tech Stack:** Vite, React 19, React Router DOM, existing HTML head

---

## Context

### Production Domain
- Frontend: `https://tktmanager.com`
- Backend API: `https://api.tktmanager.com`

### Public Routes (SEO-relevant)
- `/landing` — Main landing page (hero, features, pricing, FAQ)
- `/privacy` — Privacy policy
- `/terms` — Terms of service
- `/contact` — Contact form

### Protected Routes (should NOT be indexed)
- `/analytics`, `/seasons`, `/data`, `/members`, `/groups`, `/events/*`
- `/hegemony`, `/copper-mines`, `/donations`, `/line-binding`
- `/purchase`, `/settings`

### Existing Favicon Files
- `favicon.svg` (primary), `favicon.png`, `favicon-16.png`, `favicon-32.png`, `favicon-192.png`

### Existing Screenshots (for OG image)
- 11 JPG files in `/public/assets/screenshots/`
- `alliance-overview.jpg` is the best candidate for OG image (dashboard overview)

---

## Task 1: Add Complete Meta Tags to index.html

**Files:**
- Modify: `frontend/index.html`

**Step 1: Replace the `<head>` content with full SEO meta tags**

```html
<!doctype html>
<html lang="zh-TW">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />

    <!-- Primary Meta -->
    <title>三國志戰略版 - 同盟管理中心 | 出席追蹤 · 貢獻分析 · 數據管理</title>
    <meta name="description" content="三國志戰略版同盟管理工具。自動追蹤成員出席、貢獻、活躍度，戰役數據一鍵分析，獎懲有據可查。14 天免費試用。" />
    <meta name="author" content="三國志戰略版同盟管理中心" />

    <!-- Canonical -->
    <link rel="canonical" href="https://tktmanager.com/landing" />

    <!-- Open Graph -->
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="三國志戰略版 · 同盟管理中心" />
    <meta property="og:title" content="同盟數據，盡在掌握" />
    <meta property="og:description" content="出席、貢獻、活躍度全自動追蹤。誰該賞、誰該罰，數據替你說話。" />
    <meta property="og:image" content="https://tktmanager.com/assets/og-image.jpg" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:url" content="https://tktmanager.com/landing" />
    <meta property="og:locale" content="zh_TW" />

    <!-- Twitter Card -->
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="三國志戰略版 - 同盟管理中心" />
    <meta name="twitter:description" content="出席、貢獻、活躍度全自動追蹤。誰該賞、誰該罰，數據替你說話。" />
    <meta name="twitter:image" content="https://tktmanager.com/assets/og-image.jpg" />

    <!-- Favicons -->
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />
    <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16.png" />
    <link rel="apple-touch-icon" sizes="192x192" href="/favicon-192.png" />

    <!-- Structured Data: Organization -->
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      "name": "三國志戰略版同盟管理中心",
      "url": "https://tktmanager.com",
      "logo": "https://tktmanager.com/assets/logo.svg",
      "contactPoint": {
        "@type": "ContactPoint",
        "email": "support@tktmanager.com",
        "contactType": "customer support"
      }
    }
    </script>

    <!-- Structured Data: SoftwareApplication + Product -->
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      "name": "三國志戰略版同盟管理中心",
      "operatingSystem": "Web",
      "applicationCategory": "GameApplication",
      "description": "三國志戰略版同盟管理工具。自動追蹤成員出席、貢獻、活躍度，戰役數據一鍵分析。",
      "offers": {
        "@type": "Offer",
        "price": "999",
        "priceCurrency": "TWD",
        "description": "每賽季 NT$999，14 天免費試用"
      },
      "aggregateRating": null
    }
    </script>

    <!-- Structured Data: FAQPage (matches Landing FAQ) -->
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "怎麼取得遊戲的統計資料？",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "在遊戲內進入同盟 → 統計 → 導出 CSV 檔案，再上傳到管理中心即可。系統會自動解析所有成員數據。"
          }
        },
        {
          "@type": "Question",
          "name": "我的資料安全嗎？",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "每個同盟的資料完全獨立隔離，使用資料庫層級的存取控制。只有你授權的幹部能看到資料，我們不會對外分享任何數據。"
          }
        },
        {
          "@type": "Question",
          "name": "可以多位幹部一起管理嗎？",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "可以，透過邀請連結即可加入，不額外收費。所有幹部共享相同的數據視圖，方便協作決策。"
          }
        },
        {
          "@type": "Question",
          "name": "試用期結束後會怎樣？",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "你的資料會完整保留，但分析功能會鎖定。付費後立即恢復所有功能，不會遺失任何歷史數據。"
          }
        },
        {
          "@type": "Question",
          "name": "支援哪些付款方式？",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "支援 VISA、JCB、Mastercard 信用卡，一次性付費，無自動續約。"
          }
        }
      ]
    }
    </script>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

**Step 2: Verify the HTML is valid**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS (index.html changes don't affect TS)

**Step 3: Commit**

```bash
git add frontend/index.html
git commit -m "feat(seo): add OG tags, Twitter Cards, canonical, JSON-LD structured data"
```

---

## Task 2: Create OG Image

**Files:**
- Create: `frontend/public/assets/og-image.jpg`

The OG image must be **1200x630px** for optimal display on LINE, Facebook, Twitter.

**Step 1: Create a composite OG image**

Use the best dashboard screenshot (`alliance-overview.jpg`) as the base. Resize/crop to 1200x630. If `sips` (macOS built-in) can handle it:

```bash
cd frontend/public/assets
# Copy the best screenshot as OG base
cp screenshots/alliance-overview.jpg og-image.jpg
# Resize to 1200px wide, maintaining aspect ratio, then crop to 630px height
sips --resampleWidth 1200 og-image.jpg
sips --cropToHeightWidth 630 1200 og-image.jpg
```

If the aspect ratio doesn't work well with a screenshot, an alternative is to create a simple branded image using the logo + tagline. But screenshot-based is more compelling for social sharing.

**Step 2: Verify dimensions**

```bash
sips --getProperty pixelWidth --getProperty pixelHeight frontend/public/assets/og-image.jpg
```

Expected: `pixelWidth: 1200`, `pixelHeight: 630`

**Step 3: Commit**

```bash
git add frontend/public/assets/og-image.jpg
git commit -m "feat(seo): add 1200x630 OG image for social sharing"
```

---

## Task 3: Create robots.txt

**Files:**
- Create: `frontend/public/robots.txt`

**Step 1: Write robots.txt**

```
User-agent: *
Allow: /landing
Allow: /privacy
Allow: /terms
Allow: /contact
Disallow: /analytics
Disallow: /seasons
Disallow: /data
Disallow: /members
Disallow: /groups
Disallow: /events
Disallow: /hegemony
Disallow: /copper-mines
Disallow: /donations
Disallow: /line-binding
Disallow: /purchase
Disallow: /settings
Disallow: /auth
Disallow: /liff
Disallow: /api/

Sitemap: https://tktmanager.com/sitemap.xml
```

**Step 2: Verify file is served correctly**

```bash
# After dev server is running:
curl -s http://localhost:5187/robots.txt | head -5
```

Expected: Shows `User-agent: *` and `Allow: /landing`

**Step 3: Commit**

```bash
git add frontend/public/robots.txt
git commit -m "feat(seo): add robots.txt with crawl rules for public/protected routes"
```

---

## Task 4: Create sitemap.xml

**Files:**
- Create: `frontend/public/sitemap.xml`

**Step 1: Write static sitemap**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://tktmanager.com/landing</loc>
    <lastmod>2026-03-27</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://tktmanager.com/privacy</loc>
    <lastmod>2026-03-27</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.3</priority>
  </url>
  <url>
    <loc>https://tktmanager.com/terms</loc>
    <lastmod>2026-03-27</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.3</priority>
  </url>
  <url>
    <loc>https://tktmanager.com/contact</loc>
    <lastmod>2026-03-27</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.3</priority>
  </url>
</urlset>
```

**Step 2: Validate XML syntax**

```bash
xmllint --noout frontend/public/sitemap.xml && echo "Valid XML"
```

Expected: `Valid XML`

**Step 3: Commit**

```bash
git add frontend/public/sitemap.xml
git commit -m "feat(seo): add sitemap.xml for public routes"
```

---

## Task 5: Route-Based Code Splitting with React.lazy()

**Files:**
- Modify: `frontend/src/App.tsx`

Currently all 18 pages are eagerly imported. Protected dashboard pages should be lazy-loaded — they're never needed on first visit (user sees Landing first).

**Step 1: Convert protected page imports to lazy imports**

Replace the top of `App.tsx`:

```tsx
import { Suspense, lazy } from 'react'
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { Toaster } from 'sonner'
import { AuthProvider } from './contexts/AuthContext'
import { useAuth } from './hooks/use-auth'

// Public pages — eagerly loaded (SEO + first paint)
import { Landing } from './pages/Landing'
import { AuthCallback } from './pages/AuthCallback'
import { PrivacyPolicy } from './pages/PrivacyPolicy'
import { TermsOfService } from './pages/TermsOfService'
import { Contact } from './pages/Contact'
import { PublicLayout } from './components/layout/PublicLayout'

// LIFF — eagerly loaded (separate entry point)
import { LiffLayout } from './liff/components/LiffLayout'
import { LiffHome } from './liff/pages/LiffHome'

// Protected pages — lazy loaded (only after auth)
const DashboardLayout = lazy(() => import('./components/layout/DashboardLayout').then(m => ({ default: m.DashboardLayout })))
const Seasons = lazy(() => import('./pages/Seasons').then(m => ({ default: m.Seasons })))
const DataManagement = lazy(() => import('./pages/DataManagement').then(m => ({ default: m.DataManagement })))
const HegemonyWeights = lazy(() => import('./pages/HegemonyWeights').then(m => ({ default: m.HegemonyWeights })))
const MemberPerformance = lazy(() => import('./pages/MemberPerformance').then(m => ({ default: m.MemberPerformance })))
const AllianceAnalytics = lazy(() => import('./pages/AllianceAnalytics').then(m => ({ default: m.AllianceAnalytics })))
const GroupAnalytics = lazy(() => import('./pages/GroupAnalytics').then(m => ({ default: m.GroupAnalytics })))
const EventAnalytics = lazy(() => import('./pages/EventAnalytics').then(m => ({ default: m.EventAnalytics })))
const EventDetail = lazy(() => import('./pages/EventDetail').then(m => ({ default: m.EventDetail })))
const DonationAnalytics = lazy(() => import('./pages/DonationAnalytics').then(m => ({ default: m.DonationAnalytics })))
const Settings = lazy(() => import('./pages/Settings').then(m => ({ default: m.Settings })))
const PurchaseSeason = lazy(() => import('./pages/PurchaseSeason').then(m => ({ default: m.PurchaseSeason })))
const LineBinding = lazy(() => import('./pages/LineBinding').then(m => ({ default: m.LineBinding })))
const CopperMines = lazy(() => import('./pages/CopperMines').then(m => ({ default: m.CopperMines })))
```

**Step 2: Wrap protected routes with Suspense**

In the `App` component, wrap the `<ProtectedRoute />` with a Suspense boundary:

```tsx
function DashboardFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-muted-foreground">載入中...</p>
    </div>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Toaster position="top-center" richColors />
        <Routes>
          <Route path="/landing" element={<Landing />} />
          <Route path="/auth/callback" element={<AuthCallback />} />

          {/* Public legal pages */}
          <Route element={<PublicLayout />}>
            <Route path="/privacy" element={<PrivacyPolicy />} />
            <Route path="/terms" element={<TermsOfService />} />
            <Route path="/contact" element={<Contact />} />
          </Route>

          {/* LIFF Routes */}
          <Route path="/liff" element={<LiffLayout />}>
            <Route index element={<LiffHome />} />
          </Route>

          {/* Protected dashboard — lazy loaded */}
          <Route element={<ProtectedRoute />}>
            <Route element={
              <Suspense fallback={<DashboardFallback />}>
                <DashboardLayout />
              </Suspense>
            }>
              <Route index element={<Navigate to="/analytics" replace />} />
              <Route path="dashboard" element={<Navigate to="/analytics" replace />} />
              <Route path="seasons" element={<Seasons />} />
              <Route path="data" element={<DataManagement />} />
              <Route path="hegemony" element={<HegemonyWeights />} />
              <Route path="copper-mines" element={<CopperMines />} />
              <Route path="donations" element={<DonationAnalytics />} />
              <Route path="members" element={<MemberPerformance />} />
              <Route path="analytics" element={<AllianceAnalytics />} />
              <Route path="groups" element={<GroupAnalytics />} />
              <Route path="events" element={<EventAnalytics />} />
              <Route path="events/:eventId" element={<EventDetail />} />
              <Route path="line-binding" element={<LineBinding />} />
              <Route path="purchase" element={<PurchaseSeason />} />
              <Route path="settings" element={<Settings />} />
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
```

**Step 3: Run type check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: PASS

**Step 4: Run lint**

```bash
cd frontend && npm run lint
```

Expected: No new errors

**Step 5: Build and verify chunk splitting**

```bash
cd frontend && npm run build 2>&1 | tail -30
```

Expected: New chunks appear for lazy-loaded pages (e.g., `Seasons-XXXX.js`, `MemberPerformance-XXXX.js`). The main bundle should be noticeably smaller.

**Step 6: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "perf: lazy-load protected dashboard pages for faster landing page load"
```

---

## Task 6: Add Semantic HTML Improvements to Landing Page

**Files:**
- Modify: `frontend/src/pages/Landing.tsx`

Small but impactful changes for SEO crawlers.

**Step 1: Add `<article>` wrapper and improve image alt text**

In the Landing component, the screenshot images should have more descriptive alt text for Google Image Search indexing. Update the `SCREENSHOTS` array alt text to be more keyword-rich:

Change the carousel `<img>` from:
```tsx
alt={screenshot.title}
```
To:
```tsx
alt={`三國志戰略版管理系統 - ${screenshot.title}`}
```

Also add `width` and `height` attributes to the logo to prevent CLS:
```tsx
<img
  src="/assets/logo.svg"
  alt="三國志戰略版同盟管理中心"
  className="h-12 w-12 object-contain"
  width={48}
  height={48}
/>
```

**Step 2: Run lint**

```bash
cd frontend && npm run lint
```

Expected: No new errors

**Step 3: Commit**

```bash
git add frontend/src/pages/Landing.tsx
git commit -m "feat(seo): improve image alt text and add dimensions for CLS prevention"
```

---

## Task 7: Final Verification

**Step 1: Full build test**

```bash
cd frontend && npm run build
```

Expected: Build succeeds. Check that `dist/` contains:
- `index.html` with all meta tags
- `robots.txt`
- `sitemap.xml`
- `assets/og-image.jpg`
- Multiple JS chunks (evidence of code splitting)

**Step 2: Verify robots.txt and sitemap in dist**

```bash
cat frontend/dist/robots.txt
cat frontend/dist/sitemap.xml
```

Expected: Both files present and intact

**Step 3: Verify meta tags in built HTML**

```bash
grep -c 'og:title\|og:image\|twitter:card\|application/ld+json\|canonical' frontend/dist/index.html
```

Expected: 6+ matches (OG title, OG image, twitter card, 3 JSON-LD blocks, canonical)

**Step 4: Final commit (if any remaining changes)**

```bash
git add -A
git commit -m "chore(seo): verify build output and finalize SEO optimization"
```

---

## Summary of Changes

| Task | Impact | Files |
|------|--------|-------|
| 1. Meta tags | 🔴 Social sharing + crawler indexing | `index.html` |
| 2. OG image | 🔴 LINE/FB 分享預覽圖 | `og-image.jpg` |
| 3. robots.txt | 🔴 Crawler guidance | `robots.txt` |
| 4. sitemap.xml | 🔴 Route discovery | `sitemap.xml` |
| 5. Code splitting | 🟡 Landing page load speed | `App.tsx` |
| 6. Semantic HTML | 🟡 Image SEO + CLS | `Landing.tsx` |
| 7. Verification | - | Build check |

## Out of Scope (Future P2/P3)

- **SSR/Prerender** — Not needed now. Single landing page, Google renders JS fine for SPAs since 2024.
- **web-vitals monitoring** — Add after go-live when there's real traffic data.
- **manifest.json (PWA)** — Low priority, game management tool doesn't need offline.
- **Google Search Console** — Manual setup after deploy, not code change.
- **WebP conversion** — Screenshots already optimized as JPG (compressed from PNG). WebP marginal gain.
