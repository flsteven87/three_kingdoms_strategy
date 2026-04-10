# SEO Phase 2: Per-Page Meta Tags + Prerender + PWA Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Generate per-page HTML files at build time so social crawlers (Facebook, LINE, Twitter) see correct meta tags per route, add PWA manifest, and handle 404 gracefully.

**Architecture:** Build-time HTML templating approach — a Node.js script runs after `vite build`, reads a metadata config, and generates route-specific `index.html` files in `dist/`. No SSR runtime, no new frameworks. Nginx's existing `try_files $uri $uri/ /index.html` automatically serves the correct file per route.

**Tech Stack:** Node.js fs (build script), existing Vite + React Router, nginx (no changes needed)

---

## Context for Implementer

### Current State
- `frontend/index.html` has hardcoded meta tags optimized for `/landing`
- All 4 public routes (`/landing`, `/privacy`, `/terms`, `/contact`) get the same `<title>`, `<meta description>`, OG tags, and canonical URL
- Social crawlers (Facebook, LINE, Twitter) don't execute JS — they only read `<head>` from the initial HTML response
- nginx serves `index.html` for all routes via `try_files $uri $uri/ /index.html`

### What This Fixes
- Each public page gets its own `<title>`, description, OG tags, and canonical
- Sharing `/privacy` on LINE/Facebook shows "隱私權政策" instead of "同盟數據，盡在掌握"
- PWA manifest enables "Add to Home Screen" on mobile
- Unknown routes get a clean redirect to `/landing`

### Key Insight: Zero Nginx Changes
nginx's `try_files $uri $uri/ /index.html` checks paths in order:
1. Exact file match (`$uri`)
2. Directory index (`$uri/` → looks for `index.html` inside)
3. Fallback to root `/index.html`

So if we create `dist/landing/index.html`, a request to `/landing` hits rule 2 and serves the per-page HTML. Protected routes like `/analytics` still fall through to rule 3 (root `index.html`).

---

### Task 1: Create Page Metadata Config

**Files:**
- Create: `frontend/src/seo/page-metadata.ts`

**Step 1: Create the metadata config file**

```typescript
// frontend/src/seo/page-metadata.ts

/** SEO metadata per public route. Used by build-time prerender script. */

export interface PageMeta {
  readonly title: string
  readonly description: string
  readonly canonical: string
  readonly og: {
    readonly title: string
    readonly description: string
    readonly image?: string
  }
  readonly structuredData?: object[]
}

const BASE_URL = 'https://tktmanager.com'
const DEFAULT_OG_IMAGE = `${BASE_URL}/assets/og-image.jpg`

export const PAGE_METADATA: Record<string, PageMeta> = {
  '/landing': {
    title: '三國志戰略版 - 同盟管理中心 | 出席追蹤 · 貢獻分析 · 數據管理',
    description: '三國志戰略版同盟管理工具。自動追蹤成員出席、貢獻、活躍度，戰役數據一鍵分析，獎懲有據可查。14 天免費試用。',
    canonical: `${BASE_URL}/landing`,
    og: {
      title: '同盟數據，盡在掌握',
      description: '出席、貢獻、活躍度全自動追蹤。誰該賞、誰該罰，數據替你說話。',
    },
    structuredData: [
      {
        '@context': 'https://schema.org',
        '@type': 'Organization',
        name: '三國志戰略版同盟管理中心',
        url: BASE_URL,
        logo: `${BASE_URL}/assets/logo.svg`,
        contactPoint: {
          '@type': 'ContactPoint',
          email: 'support@tktmanager.com',
          contactType: 'customer support',
        },
      },
      {
        '@context': 'https://schema.org',
        '@type': 'SoftwareApplication',
        name: '三國志戰略版同盟管理中心',
        operatingSystem: 'Web',
        applicationCategory: 'GameApplication',
        description: '三國志戰略版同盟管理工具。自動追蹤成員出席、貢獻、活躍度，戰役數據一鍵分析。',
        offers: {
          '@type': 'Offer',
          price: '999',
          priceCurrency: 'TWD',
          description: '每賽季 NT$999，14 天免費試用',
        },
      },
      {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: [
          {
            '@type': 'Question',
            name: '怎麼取得遊戲的統計資料？',
            acceptedAnswer: {
              '@type': 'Answer',
              text: '在遊戲內進入同盟 → 統計 → 導出 CSV 檔案，再上傳到管理中心即可。系統會自動解析所有成員數據。',
            },
          },
          {
            '@type': 'Question',
            name: '我的資料安全嗎？',
            acceptedAnswer: {
              '@type': 'Answer',
              text: '每個同盟的資料完全獨立隔離，使用資料庫層級的存取控制。只有你授權的幹部能看到資料，我們不會對外分享任何數據。',
            },
          },
          {
            '@type': 'Question',
            name: '可以多位幹部一起管理嗎？',
            acceptedAnswer: {
              '@type': 'Answer',
              text: '可以，透過邀請連結即可加入，不額外收費。所有幹部共享相同的數據視圖，方便協作決策。',
            },
          },
          {
            '@type': 'Question',
            name: '試用期結束後會怎樣？',
            acceptedAnswer: {
              '@type': 'Answer',
              text: '你的資料會完整保留，但分析功能會鎖定。付費後立即恢復所有功能，不會遺失任何歷史數據。',
            },
          },
          {
            '@type': 'Question',
            name: '支援哪些付款方式？',
            acceptedAnswer: {
              '@type': 'Answer',
              text: '支援 VISA、JCB、Mastercard 信用卡，一次性付費，無自動續約。',
            },
          },
        ],
      },
    ],
  },
  '/privacy': {
    title: '隱私權政策 - 三國志戰略版同盟管理中心',
    description: '了解三國志戰略版同盟管理中心如何蒐集、使用、儲存及保護您的個人資料。',
    canonical: `${BASE_URL}/privacy`,
    og: {
      title: '隱私權政策 - 同盟管理中心',
      description: '了解我們如何保護您的個人資料與同盟數據安全。',
    },
  },
  '/terms': {
    title: '服務條款 - 三國志戰略版同盟管理中心',
    description: '三國志戰略版同盟管理中心服務條款，包含付款條款、退款政策、使用規範。',
    canonical: `${BASE_URL}/terms`,
    og: {
      title: '服務條款 - 同盟管理中心',
      description: '使用本服務前請詳閱服務條款，包含付款、退款及使用規範。',
    },
  },
  '/contact': {
    title: '聯繫我們 - 三國志戰略版同盟管理中心',
    description: '有問題或建議？透過聯繫表單與三國志戰略版同盟管理中心團隊聯繫。',
    canonical: `${BASE_URL}/contact`,
    og: {
      title: '聯繫我們 - 同盟管理中心',
      description: '有任何問題或建議歡迎聯繫我們。',
    },
  },
}
```

**Step 2: Commit**

```bash
git add frontend/src/seo/page-metadata.ts
git commit -m "feat(seo): add per-page metadata config for build-time prerender"
```

---

### Task 2: Create Build-Time Prerender Script

**Files:**
- Create: `frontend/scripts/prerender.js`
- Modify: `frontend/package.json` (build script)

**Step 1: Create the prerender script**

This script runs after `vite build` and:
1. Reads `dist/index.html` as a template
2. For each public route, replaces `<head>` meta tags with per-page values
3. Writes to `dist/{route}/index.html`

```javascript
// frontend/scripts/prerender.js

/**
 * Build-time prerender: generates per-route HTML files with correct meta tags.
 *
 * Runs after `vite build`. Reads dist/index.html as template, injects per-page
 * <title>, <meta>, OG tags, canonical URL, and structured data. Nginx's
 * try_files automatically serves the correct file per route.
 *
 * Usage: node scripts/prerender.js
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DIST_DIR = join(__dirname, '..', 'dist')

const BASE_URL = 'https://tktmanager.com'
const DEFAULT_OG_IMAGE = `${BASE_URL}/assets/og-image.jpg`

/** @type {Record<string, { title: string, description: string, canonical: string, og: { title: string, description: string, image?: string }, structuredData?: object[] }>} */
const PAGE_METADATA = {
  '/landing': {
    title: '三國志戰略版 - 同盟管理中心 | 出席追蹤 · 貢獻分析 · 數據管理',
    description: '三國志戰略版同盟管理工具。自動追蹤成員出席、貢獻、活躍度，戰役數據一鍵分析，獎懲有據可查。14 天免費試用。',
    canonical: `${BASE_URL}/landing`,
    og: {
      title: '同盟數據，盡在掌握',
      description: '出席、貢獻、活躍度全自動追蹤。誰該賞、誰該罰，數據替你說話。',
    },
    structuredData: [
      {
        '@context': 'https://schema.org',
        '@type': 'Organization',
        name: '三國志戰略版同盟管理中心',
        url: BASE_URL,
        logo: `${BASE_URL}/assets/logo.svg`,
        contactPoint: { '@type': 'ContactPoint', email: 'support@tktmanager.com', contactType: 'customer support' },
      },
      {
        '@context': 'https://schema.org',
        '@type': 'SoftwareApplication',
        name: '三國志戰略版同盟管理中心',
        operatingSystem: 'Web',
        applicationCategory: 'GameApplication',
        description: '三國志戰略版同盟管理工具。自動追蹤成員出席、貢獻、活躍度，戰役數據一鍵分析。',
        offers: { '@type': 'Offer', price: '999', priceCurrency: 'TWD', description: '每賽季 NT$999，14 天免費試用' },
      },
      {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: [
          { '@type': 'Question', name: '怎麼取得遊戲的統計資料？', acceptedAnswer: { '@type': 'Answer', text: '在遊戲內進入同盟 → 統計 → 導出 CSV 檔案，再上傳到管理中心即可。系統會自動解析所有成員數據。' } },
          { '@type': 'Question', name: '我的資料安全嗎？', acceptedAnswer: { '@type': 'Answer', text: '每個同盟的資料完全獨立隔離，使用資料庫層級的存取控制。只有你授權的幹部能看到資料，我們不會對外分享任何數據。' } },
          { '@type': 'Question', name: '可以多位幹部一起管理嗎？', acceptedAnswer: { '@type': 'Answer', text: '可以，透過邀請連結即可加入，不額外收費。所有幹部共享相同的數據視圖，方便協作決策。' } },
          { '@type': 'Question', name: '試用期結束後會怎樣？', acceptedAnswer: { '@type': 'Answer', text: '你的資料會完整保留，但分析功能會鎖定。付費後立即恢復所有功能，不會遺失任何歷史數據。' } },
          { '@type': 'Question', name: '支援哪些付款方式？', acceptedAnswer: { '@type': 'Answer', text: '支援 VISA、JCB、Mastercard 信用卡，一次性付費，無自動續約。' } },
        ],
      },
    ],
  },
  '/privacy': {
    title: '隱私權政策 - 三國志戰略版同盟管理中心',
    description: '了解三國志戰略版同盟管理中心如何蒐集、使用、儲存及保護您的個人資料。',
    canonical: `${BASE_URL}/privacy`,
    og: {
      title: '隱私權政策 - 同盟管理中心',
      description: '了解我們如何保護您的個人資料與同盟數據安全。',
    },
  },
  '/terms': {
    title: '服務條款 - 三國志戰略版同盟管理中心',
    description: '三國志戰略版同盟管理中心服務條款，包含付款條款、退款政策、使用規範。',
    canonical: `${BASE_URL}/terms`,
    og: {
      title: '服務條款 - 同盟管理中心',
      description: '使用本服務前請詳閱服務條款，包含付款、退款及使用規範。',
    },
  },
  '/contact': {
    title: '聯繫我們 - 三國志戰略版同盟管理中心',
    description: '有問題或建議？透過聯繫表單與三國志戰略版同盟管理中心團隊聯繫。',
    canonical: `${BASE_URL}/contact`,
    og: {
      title: '聯繫我們 - 同盟管理中心',
      description: '有任何問題或建議歡迎聯繫我們。',
    },
  },
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function buildHeadTags(meta) {
  const ogImage = meta.og.image || DEFAULT_OG_IMAGE
  const lines = [
    `    <!-- Primary Meta -->`,
    `    <title>${escapeHtml(meta.title)}</title>`,
    `    <meta name="description" content="${escapeHtml(meta.description)}" />`,
    `    <meta name="author" content="三國志戰略版同盟管理中心" />`,
    ``,
    `    <!-- Canonical -->`,
    `    <link rel="canonical" href="${escapeHtml(meta.canonical)}" />`,
    ``,
    `    <!-- Open Graph -->`,
    `    <meta property="og:type" content="website" />`,
    `    <meta property="og:site_name" content="三國志戰略版 · 同盟管理中心" />`,
    `    <meta property="og:title" content="${escapeHtml(meta.og.title)}" />`,
    `    <meta property="og:description" content="${escapeHtml(meta.og.description)}" />`,
    `    <meta property="og:image" content="${escapeHtml(ogImage)}" />`,
    `    <meta property="og:image:width" content="1200" />`,
    `    <meta property="og:image:height" content="630" />`,
    `    <meta property="og:url" content="${escapeHtml(meta.canonical)}" />`,
    `    <meta property="og:locale" content="zh_TW" />`,
    ``,
    `    <!-- Twitter Card -->`,
    `    <meta name="twitter:card" content="summary_large_image" />`,
    `    <meta name="twitter:title" content="${escapeHtml(meta.og.title)}" />`,
    `    <meta name="twitter:description" content="${escapeHtml(meta.og.description)}" />`,
    `    <meta name="twitter:image" content="${escapeHtml(ogImage)}" />`,
  ]

  if (meta.structuredData) {
    for (const data of meta.structuredData) {
      lines.push(``)
      lines.push(`    <script type="application/ld+json">`)
      lines.push(`    ${JSON.stringify(data, null, 2).split('\n').join('\n    ')}`)
      lines.push(`    </script>`)
    }
  }

  return lines.join('\n')
}

function prerender() {
  const template = readFileSync(join(DIST_DIR, 'index.html'), 'utf-8')

  // Match the replaceable region: from <!-- Primary Meta --> to just before <!-- Favicons -->
  const metaStartMarker = '    <!-- Primary Meta -->'
  const metaEndMarker = '    <!-- Favicons -->'

  const startIdx = template.indexOf(metaStartMarker)
  const endIdx = template.indexOf(metaEndMarker)

  if (startIdx === -1 || endIdx === -1) {
    console.error('ERROR: Could not find meta tag markers in dist/index.html')
    console.error('  Expected "<!-- Primary Meta -->" and "<!-- Favicons -->" comments')
    process.exit(1)
  }

  const before = template.slice(0, startIdx)
  const after = template.slice(endIdx)

  let generated = 0

  for (const [route, meta] of Object.entries(PAGE_METADATA)) {
    const headTags = buildHeadTags(meta)
    const html = before + headTags + '\n\n' + after

    // e.g. /landing → dist/landing/index.html
    const routeDir = join(DIST_DIR, route.slice(1))
    mkdirSync(routeDir, { recursive: true })
    writeFileSync(join(routeDir, 'index.html'), html)
    generated++
    console.log(`  ✓ ${route} → ${route.slice(1)}/index.html`)
  }

  console.log(`\nPrerender complete: ${generated} pages generated`)
}

prerender()
```

**Step 2: Update package.json build script**

In `frontend/package.json`, change the `build` script:

```json
"build": "tsc -b && vite build && node scripts/prerender.js",
```

**Step 3: Run build to verify**

```bash
cd frontend && npm run build
```

Expected output includes:
```
  ✓ /landing → landing/index.html
  ✓ /privacy → privacy/index.html
  ✓ /terms → terms/index.html
  ✓ /contact → contact/index.html

Prerender complete: 4 pages generated
```

**Step 4: Verify generated HTML**

```bash
# Check that each file has the correct <title>
head -10 dist/landing/index.html
head -10 dist/privacy/index.html
head -10 dist/terms/index.html
head -10 dist/contact/index.html
```

Verify:
- `dist/landing/index.html` has `<title>三國志戰略版 - 同盟管理中心...`
- `dist/privacy/index.html` has `<title>隱私權政策 - 三國志戰略版...`
- `dist/terms/index.html` has `<title>服務條款 - 三國志戰略版...`
- `dist/contact/index.html` has `<title>聯繫我們 - 三國志戰略版...`
- `/landing` version has structured data (JSON-LD), others don't
- Each file has correct `<link rel="canonical">` pointing to its own URL

**Step 5: Commit**

```bash
git add frontend/scripts/prerender.js frontend/package.json
git commit -m "feat(seo): add build-time prerender for per-page meta tags"
```

---

### Task 3: Simplify index.html (Template for Prerender)

**Files:**
- Modify: `frontend/index.html`

**Why:** The current `index.html` has hardcoded `/landing` meta tags. After prerender, this file serves as:
1. The **template** for the prerender script (markers must be preserved)
2. The **fallback** for protected routes (should have generic meta tags)

**Step 1: Update index.html to use generic fallback meta tags**

Replace the entire `<!-- Primary Meta -->` through the closing `</script>` of structured data with generic defaults. Keep the `<!-- Primary Meta -->` and `<!-- Favicons -->` comment markers intact so the prerender script can find them.

The new meta section between `<!-- Primary Meta -->` and `<!-- Favicons -->` should be:

```html
    <!-- Primary Meta -->
    <title>三國志戰略版 - 同盟管理中心</title>
    <meta name="description" content="三國志戰略版同盟管理工具。自動追蹤成員出席、貢獻、活躍度，戰役數據一鍵分析。" />
    <meta name="author" content="三國志戰略版同盟管理中心" />

    <!-- Canonical -->
    <link rel="canonical" href="https://tktmanager.com/landing" />

    <!-- Open Graph -->
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="三國志戰略版 · 同盟管理中心" />
    <meta property="og:title" content="三國志戰略版 - 同盟管理中心" />
    <meta property="og:description" content="同盟數據管理工具，出席、貢獻、活躍度全自動追蹤。" />
    <meta property="og:image" content="https://tktmanager.com/assets/og-image.jpg" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:url" content="https://tktmanager.com/landing" />
    <meta property="og:locale" content="zh_TW" />

    <!-- Twitter Card -->
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="三國志戰略版 - 同盟管理中心" />
    <meta name="twitter:description" content="同盟數據管理工具，出席、貢獻、活躍度全自動追蹤。" />
    <meta name="twitter:image" content="https://tktmanager.com/assets/og-image.jpg" />

    <!-- Favicons -->
```

Remove all `<script type="application/ld+json">` blocks — structured data now lives in the prerender script and is only injected into `/landing`.

**Step 2: Run build and verify**

```bash
cd frontend && npm run build
```

Verify that:
- Root `dist/index.html` has the generic fallback meta (no structured data)
- `dist/landing/index.html` has full `/landing` meta with structured data
- Other routes have their specific meta tags

**Step 3: Commit**

```bash
git add frontend/index.html
git commit -m "refactor(seo): simplify index.html to generic fallback, structured data moves to prerender"
```

---

### Task 4: Add Web App Manifest

**Files:**
- Create: `frontend/public/manifest.json`
- Modify: `frontend/index.html` (add manifest link)

**Step 1: Create manifest.json**

```json
{
  "name": "三國志戰略版同盟管理中心",
  "short_name": "同盟管理中心",
  "description": "三國志戰略版同盟管理工具",
  "start_url": "/landing",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#171717",
  "icons": [
    {
      "src": "/favicon-192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "/favicon.svg",
      "sizes": "any",
      "type": "image/svg+xml"
    }
  ]
}
```

**Step 2: Add manifest link to index.html**

Add this line right after the `<link rel="apple-touch-icon">` line in `index.html`:

```html
    <link rel="manifest" href="/manifest.json" />
```

**Step 3: Commit**

```bash
git add frontend/public/manifest.json frontend/index.html
git commit -m "feat(seo): add PWA web app manifest"
```

---

### Task 5: Add 404 Catch-All Route

**Files:**
- Modify: `frontend/src/App.tsx`

**Step 1: Add catch-all route**

In `App.tsx`, add a `<Route path="*">` as the last route inside the top-level `<Routes>`, after the LIFF routes and before the closing `</Routes>`:

```tsx
{/* Catch-all: redirect unknown routes to landing */}
<Route path="*" element={<Navigate to="/landing" replace />} />
```

**Step 2: Run type check**

```bash
cd frontend && npx tsc --noEmit
```

**Step 3: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "fix: add 404 catch-all route redirecting to landing"
```

---

### Task 6: Verify Full Build & Test Social Sharing

**Step 1: Full build**

```bash
cd frontend && npm run build
```

**Step 2: Verify all generated files exist**

```bash
ls -la dist/landing/index.html dist/privacy/index.html dist/terms/index.html dist/contact/index.html
```

**Step 3: Spot-check meta tags**

```bash
# Each should show the correct page-specific title
grep '<title>' dist/index.html dist/landing/index.html dist/privacy/index.html dist/terms/index.html dist/contact/index.html
```

Expected:
```
dist/index.html:    <title>三國志戰略版 - 同盟管理中心</title>
dist/landing/index.html:    <title>三國志戰略版 - 同盟管理中心 | 出席追蹤 · 貢獻分析 · 數據管理</title>
dist/privacy/index.html:    <title>隱私權政策 - 三國志戰略版同盟管理中心</title>
dist/terms/index.html:    <title>服務條款 - 三國志戰略版同盟管理中心</title>
dist/contact/index.html:    <title>聯繫我們 - 三國志戰略版同盟管理中心</title>
```

**Step 4: Verify structured data only on landing**

```bash
grep -c 'application/ld+json' dist/index.html dist/landing/index.html dist/privacy/index.html
```

Expected:
```
dist/index.html:0
dist/landing/index.html:3
dist/privacy/index.html:0
```

**Step 5: Local preview test**

```bash
cd frontend && npm run preview
```

Open http://localhost:4173/landing, /privacy, /terms, /contact — verify SPA still works normally. View page source to confirm meta tags.

---

## Post-Deploy Checklist (Manual Steps After Push)

After deploy completes on Zeabur:

1. **Google Search Console**: Submit sitemap at `https://tktmanager.com/sitemap.xml`
2. **Facebook Sharing Debugger**: https://developers.facebook.com/tools/debug/ — test `/landing`, `/privacy`, `/terms`, `/contact`
3. **Twitter Card Validator**: Verify OG image appears for shared links
4. **LINE**: Share `https://tktmanager.com/landing` in a chat — verify preview shows correct title/image

---

## Summary

| Task | What | Files |
|------|------|-------|
| 1 | Page metadata config (TypeScript) | `src/seo/page-metadata.ts` |
| 2 | Build-time prerender script | `scripts/prerender.js`, `package.json` |
| 3 | Simplify index.html to generic fallback | `index.html` |
| 4 | Web app manifest | `public/manifest.json`, `index.html` |
| 5 | 404 catch-all route | `src/App.tsx` |
| 6 | Verify full build + social sharing | (verification only) |

Total new files: 3 (`page-metadata.ts`, `prerender.js`, `manifest.json`)
Modified files: 3 (`index.html`, `package.json`, `App.tsx`)
