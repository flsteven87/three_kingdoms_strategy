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

    const routeDir = join(DIST_DIR, route.slice(1))
    mkdirSync(routeDir, { recursive: true })
    writeFileSync(join(routeDir, 'index.html'), html)
    generated++
    console.log(`  ✓ ${route} → ${route.slice(1)}/index.html`)
  }

  console.log(`\nPrerender complete: ${generated} pages generated`)
}

prerender()
