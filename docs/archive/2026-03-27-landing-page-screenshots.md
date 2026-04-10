# Landing Page Screenshot Showcase Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a product screenshot showcase section to the Landing page, displaying 6 real app screenshots between the "How It Works" and "Features" sections.

**Architecture:** Add a new `<section>` with a horizontal scrollable carousel of screenshots. Each screenshot has a title and short description. On desktop, show 2-3 visible at a time with scroll snap. On mobile, show 1 at a time with swipe. Pure CSS scroll-snap — no library needed.

**Tech Stack:** React, Tailwind CSS, existing shadcn/ui components

---

### Task 1: Add screenshot data constant

**Files:**
- Modify: `frontend/src/pages/Landing.tsx` (after `STEPS` constant, ~line 96)

**Step 1: Add the SCREENSHOTS constant**

Add after `STEPS` (line 96), before `FEATURES` (line 98):

```typescript
const SCREENSHOTS = [
  {
    src: "/assets/screenshots/alliance-analytics.png",
    title: "同盟整體分析",
    description: "貢獻趨勢、戰功分佈，同盟全局一眼掌握",
  },
  {
    src: "/assets/screenshots/member-analytics.png",
    title: "成員表現分析",
    description: "五維能力雷達圖，個人趨勢完整追蹤",
  },
  {
    src: "/assets/screenshots/group-analytics.png",
    title: "組別對比分析",
    description: "各組排名、參與率並排比較，強弱立見",
  },
  {
    src: "/assets/screenshots/battle-events.png",
    title: "戰役事件追蹤",
    description: "參與率、戰功分佈、缺席名單一目瞭然",
  },
  {
    src: "/assets/screenshots/line-report-preview.png",
    title: "LINE 戰報推送",
    description: "戰役結束自動產出報告，直送 LINE 群組",
  },
  {
    src: "/assets/screenshots/hegemony-weights.png",
    title: "霸業權重配置",
    description: "自訂貢獻、戰功、助攻權重，排名公式你決定",
  },
] as const;
```

**Step 2: Verify no lint errors**

Run: `cd frontend && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors (data is not yet used, but should compile fine)

---

### Task 2: Add screenshot showcase section to JSX

**Files:**
- Modify: `frontend/src/pages/Landing.tsx` (between "How It Works" section end ~line 361 and "Features" section start ~line 363)

**Step 1: Insert the Screenshot Showcase section**

Add between the `{/* ── 3. How It Works ── */}` section closing `</section>` (line 361) and `{/* ── 4. Features ── */}` comment (line 363):

```tsx
        {/* ── 3.5. Screenshot Showcase ── */}
        <section className="px-4 py-20 border-t bg-muted/30">
          <div className="mx-auto max-w-6xl space-y-12">
            <div className="text-center space-y-2">
              <h2 className="text-3xl font-bold tracking-tight">
                實際畫面
              </h2>
              <p className="text-base text-muted-foreground">
                真實後台截圖，所見即所得
              </p>
            </div>

            <div className="flex gap-6 overflow-x-auto snap-x snap-mandatory pb-4 scrollbar-hide">
              {SCREENSHOTS.map((screenshot) => (
                <div
                  key={screenshot.title}
                  className="flex-none w-[85vw] sm:w-[70vw] md:w-[45vw] lg:w-[40vw] snap-center"
                >
                  <div className="rounded-xl border bg-card overflow-hidden shadow-sm">
                    <div className="overflow-hidden">
                      <img
                        src={screenshot.src}
                        alt={screenshot.title}
                        className="w-full h-auto"
                        loading="lazy"
                      />
                    </div>
                    <div className="p-4 space-y-1">
                      <h3 className="text-base font-semibold">
                        {screenshot.title}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {screenshot.description}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
```

**Step 2: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

---

### Task 3: Add scrollbar-hide utility CSS

**Files:**
- Modify: `frontend/src/index.css` (add at end of file)

**Step 1: Check if scrollbar-hide already exists**

Run: `grep -r "scrollbar-hide" frontend/src/`
Expected: No matches (we need to add it)

**Step 2: Add the utility class**

Append to `frontend/src/index.css`:

```css
/* Hide scrollbar for screenshot carousel */
.scrollbar-hide {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
.scrollbar-hide::-webkit-scrollbar {
  display: none;
}
```

**Step 3: Verify build works**

Run: `cd frontend && npm run build 2>&1 | tail -5`
Expected: Build succeeds

---

### Task 4: Verify visually and commit

**Step 1: Run lint**

Run: `cd frontend && npm run lint 2>&1 | head -20`
Expected: No errors

**Step 2: Verify TypeScript**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add frontend/src/pages/Landing.tsx frontend/src/index.css frontend/public/assets/screenshots/
git commit -m "feat: add product screenshot showcase to landing page

Add 6 real app screenshots (alliance/member/group analytics, battle events,
LINE report preview, hegemony weights) in a horizontal scroll carousel
between How It Works and Features sections.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```
