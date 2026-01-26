# 攻城事件雙排名制實作計畫

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 將攻城 (SIEGE) 事件的貢獻和助攻獨立呈現，支援雙排名、雙 MVP、雙圖表。

**Architecture:**
- Backend: 擴展 EventSummary 支援雙 MVP，EventGroupAnalytics 新增 top_contributors/top_assisters
- Frontend: EventDetail 雙圖表並排，LineReportPreview 兩份 Top 5 排行榜
- 資料庫無需變更 (battle_event_metrics 已分開儲存 contribution_diff 和 assist_diff)

**Tech Stack:** Python/FastAPI, React/TypeScript, Pydantic V2, TanStack Query

---

## Task 1: Backend - 擴展 EventSummary 模型

**Files:**
- Modify: `backend/src/models/battle_event_metrics.py:66-97`

**Step 1: 更新 EventSummary 模型，新增雙 MVP 欄位**

在 `EventSummary` class 中，將單一 MVP 替換為雙 MVP：

```python
class EventSummary(BaseModel):
    """Summary statistics for a battle event"""

    model_config = ConfigDict(from_attributes=True)

    # Participation stats
    total_members: int = Field(..., description="Total members in snapshots")
    participated_count: int = Field(..., description="Members who participated")
    absent_count: int = Field(..., description="Members who didn't participate")
    new_member_count: int = Field(..., description="New members (only in after)")
    participation_rate: float = Field(
        ..., ge=0, le=100, description="Participation rate percentage"
    )

    # Aggregate metrics
    total_merit: int = Field(..., description="Sum of all merit diffs")
    total_assist: int = Field(..., description="Sum of all assist diffs")
    total_contribution: int = Field(..., description="Sum of all contribution diffs")
    avg_merit: float = Field(..., description="Average merit per participant")
    avg_assist: float = Field(..., description="Average assist per participant")
    avg_contribution: float = Field(0, description="Average contribution per participant")

    # MVP info for BATTLE events
    mvp_member_id: UUID | None = Field(None, description="Top performer member ID (BATTLE)")
    mvp_member_name: str | None = Field(None, description="Top performer name (BATTLE)")
    mvp_merit: int | None = Field(None, description="Top performer merit (BATTLE)")

    # Dual MVP for SIEGE events
    contribution_mvp_member_id: UUID | None = Field(None, description="Top contributor ID (SIEGE)")
    contribution_mvp_name: str | None = Field(None, description="Top contributor name (SIEGE)")
    contribution_mvp_score: int | None = Field(None, description="Top contribution score (SIEGE)")

    assist_mvp_member_id: UUID | None = Field(None, description="Top assister ID (SIEGE)")
    assist_mvp_name: str | None = Field(None, description="Top assister name (SIEGE)")
    assist_mvp_score: int | None = Field(None, description="Top assist score (SIEGE)")

    # Legacy fields for backward compatibility (deprecated, will be removed)
    mvp_contribution: int | None = Field(None, description="[Deprecated] Use contribution_mvp_score")
    mvp_assist: int | None = Field(None, description="[Deprecated] Use assist_mvp_score")
    mvp_combined_score: int | None = Field(None, description="[Deprecated] Combined score")

    # Forbidden zone specific
    violator_count: int = Field(0, description="Members with power increase (for FORBIDDEN)")
```

**Step 2: 執行 ruff 檢查**

Run: `cd backend && uv run ruff check src/models/battle_event_metrics.py`
Expected: No errors

---

## Task 2: Backend - 擴展 EventGroupAnalytics 模型

**Files:**
- Modify: `backend/src/models/battle_event_metrics.py:157-178`

**Step 1: 更新 EventGroupAnalytics，新增雙排行榜欄位**

```python
class EventGroupAnalytics(BaseModel):
    """Complete group analytics for a battle event (used in LINE Bot report)"""

    # Event info
    event_id: UUID
    event_name: str
    event_type: EventCategory | None = None
    event_start: datetime | None = None
    event_end: datetime | None = None

    # Overall summary
    summary: EventSummary

    # Group-level statistics (sorted by primary metric desc)
    group_stats: list[GroupEventStats] = []

    # Top performers for BATTLE events (single ranking)
    top_members: list[TopMemberItem] = []

    # Dual rankings for SIEGE events
    top_contributors: list[TopMemberItem] = []
    top_assisters: list[TopMemberItem] = []

    # Violators (for FORBIDDEN events only)
    violators: list[ViolatorItem] = []
```

**Step 2: 執行 ruff 檢查**

Run: `cd backend && uv run ruff check src/models/battle_event_metrics.py`
Expected: No errors

---

## Task 3: Backend - 更新 Service 層 MVP 計算邏輯

**Files:**
- Modify: `backend/src/services/battle_event_service.py` (search for `_calculate_event_summary`)

**Step 1: 找到 _calculate_event_summary 方法並更新 SIEGE 的 MVP 計算**

將原本的單一 MVP 計算改為雙 MVP。搜尋並修改相關邏輯：

```python
# SIEGE: Calculate dual MVPs (contribution MVP + assist MVP)
if event_type == EventCategory.SIEGE:
    # Contribution MVP
    contribution_sorted = sorted(
        [m for m in metrics_data if m.get("contribution_diff", 0) > 0],
        key=lambda x: x.get("contribution_diff", 0),
        reverse=True
    )
    if contribution_sorted:
        top_contributor = contribution_sorted[0]
        summary_data["contribution_mvp_member_id"] = top_contributor.get("member_id")
        summary_data["contribution_mvp_name"] = top_contributor.get("member_name")
        summary_data["contribution_mvp_score"] = top_contributor.get("contribution_diff")

    # Assist MVP
    assist_sorted = sorted(
        [m for m in metrics_data if m.get("assist_diff", 0) > 0],
        key=lambda x: x.get("assist_diff", 0),
        reverse=True
    )
    if assist_sorted:
        top_assister = assist_sorted[0]
        summary_data["assist_mvp_member_id"] = top_assister.get("member_id")
        summary_data["assist_mvp_name"] = top_assister.get("member_name")
        summary_data["assist_mvp_score"] = top_assister.get("assist_diff")

    # Calculate avg_contribution
    if participated_count > 0:
        summary_data["avg_contribution"] = total_contribution / participated_count
```

**Step 2: 執行 ruff 檢查**

Run: `cd backend && uv run ruff check src/services/battle_event_service.py`
Expected: No errors

---

## Task 4: Backend - 更新 Group Analytics 產生雙排行榜

**Files:**
- Modify: `backend/src/services/battle_event_service.py` (search for `get_event_group_analytics`)

**Step 1: 修改 top_members 計算邏輯，為 SIEGE 產生雙排行榜**

```python
# For SIEGE: Generate dual rankings
if event_type == EventCategory.SIEGE:
    # Top contributors (by contribution_diff)
    contribution_ranked = sorted(
        [m for m in metrics_with_member if m.contribution_diff > 0],
        key=lambda x: x.contribution_diff,
        reverse=True
    )[:5]
    top_contributors = [
        TopMemberItem(
            rank=i + 1,
            member_name=m.member_name,
            group_name=m.group_name,
            score=m.contribution_diff,
            contribution_diff=m.contribution_diff,
            assist_diff=m.assist_diff,
        )
        for i, m in enumerate(contribution_ranked)
    ]

    # Top assisters (by assist_diff)
    assist_ranked = sorted(
        [m for m in metrics_with_member if m.assist_diff > 0],
        key=lambda x: x.assist_diff,
        reverse=True
    )[:5]
    top_assisters = [
        TopMemberItem(
            rank=i + 1,
            member_name=m.member_name,
            group_name=m.group_name,
            score=m.assist_diff,
            contribution_diff=m.contribution_diff,
            assist_diff=m.assist_diff,
        )
        for i, m in enumerate(assist_ranked)
    ]

    return EventGroupAnalytics(
        event_id=event.id,
        event_name=event.name,
        event_type=event_type,
        event_start=event.event_start,
        event_end=event.event_end,
        summary=summary,
        group_stats=group_stats,
        top_members=[],  # Empty for SIEGE (use dual rankings instead)
        top_contributors=top_contributors,
        top_assisters=top_assisters,
        violators=[],
    )
```

**Step 2: 執行 ruff 檢查**

Run: `cd backend && uv run ruff check src/services/battle_event_service.py`
Expected: No errors

---

## Task 5: Frontend - 更新 TypeScript 類型定義

**Files:**
- Modify: `frontend/src/types/event.ts:42-67` (EventSummary)
- Modify: `frontend/src/types/event.ts:213-227` (EventGroupAnalytics)

**Step 1: 更新 EventSummary 類型**

```typescript
export interface EventSummary {
  // Participation stats
  readonly total_members: number
  readonly participated_count: number
  readonly absent_count: number
  readonly new_member_count: number
  readonly participation_rate: number

  // Aggregate metrics
  readonly total_merit: number
  readonly total_assist: number
  readonly total_contribution: number
  readonly avg_merit: number
  readonly avg_assist: number
  readonly avg_contribution: number

  // MVP info for BATTLE events
  readonly mvp_member_id: string | null
  readonly mvp_member_name: string | null
  readonly mvp_merit: number | null

  // Dual MVP for SIEGE events
  readonly contribution_mvp_member_id: string | null
  readonly contribution_mvp_name: string | null
  readonly contribution_mvp_score: number | null
  readonly assist_mvp_member_id: string | null
  readonly assist_mvp_name: string | null
  readonly assist_mvp_score: number | null

  // Legacy fields (deprecated)
  readonly mvp_contribution: number | null
  readonly mvp_assist: number | null
  readonly mvp_combined_score: number | null

  // Forbidden zone specific
  readonly violator_count: number
}
```

**Step 2: 更新 EventGroupAnalytics 類型**

```typescript
export interface EventGroupAnalytics {
  readonly event_id: string
  readonly event_name: string
  readonly event_type: EventCategory | null
  readonly event_start: string | null
  readonly event_end: string | null
  readonly summary: EventSummary

  readonly group_stats: readonly GroupEventStats[]

  // Top performers for BATTLE events
  readonly top_members: readonly TopMemberItem[]

  // Dual rankings for SIEGE events
  readonly top_contributors: readonly TopMemberItem[]
  readonly top_assisters: readonly TopMemberItem[]

  // Violators for FORBIDDEN events
  readonly violators: readonly ViolatorItem[]
}
```

**Step 3: 執行 lint 檢查**

Run: `cd frontend && npm run lint`
Expected: No errors

---

## Task 6: Frontend - 更新 EventDetail 頁面 (雙 KPI + 雙 Box Plot)

**Files:**
- Modify: `frontend/src/pages/EventDetail.tsx`

**Step 1: 更新 KPI Grid，為 SIEGE 顯示雙 MVP**

在 KPI Grid 區塊 (約第 639-694 行)，將 SIEGE 的單一 KPI 替換為雙 KPI：

```tsx
{/* SIEGE: 雙 KPI - 貢獻 MVP + 助攻 MVP */}
{event.event_type === 'siege' && (
  <>
    <KpiCard
      title="貢獻 MVP"
      value={summary.contribution_mvp_name ?? '-'}
      subtitle={summary.contribution_mvp_score ? formatNumberCompact(summary.contribution_mvp_score) : undefined}
      icon={<Castle className="h-5 w-5" />}
      highlight
    />
    <KpiCard
      title="助攻 MVP"
      value={summary.assist_mvp_name ?? '-'}
      subtitle={summary.assist_mvp_score ? formatNumberCompact(summary.assist_mvp_score) : undefined}
      icon={<Swords className="h-5 w-5" />}
      highlight
    />
  </>
)}
```

**Step 2: 更新 Box Plot，為 SIEGE 顯示雙圖表並排**

將原本的單一 Box Plot 替換為雙圖表並排：

```tsx
{/* SIEGE: Dual Box Plots */}
{event.event_type === 'siege' && (() => {
  const contributionValues = metrics.filter((m) => m.participated).map((m) => m.contribution_diff)
  const assistValues = metrics.filter((m) => m.participated).map((m) => m.assist_diff)
  const contributionStats = calculateBoxPlotStats(contributionValues)
  const assistStats = calculateBoxPlotStats(assistValues)

  if (!contributionStats && !assistStats) return null

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {contributionStats && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Castle className="h-5 w-5" />
              貢獻分佈
            </CardTitle>
            <CardDescription>參與成員的貢獻統計 (Min / Q1 / Median / Q3 / Max)</CardDescription>
          </CardHeader>
          <CardContent>
            <BoxPlot stats={contributionStats} showLabels={true} />
          </CardContent>
        </Card>
      )}
      {assistStats && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Swords className="h-5 w-5" />
              助攻分佈
            </CardTitle>
            <CardDescription>參與成員的助攻統計 (Min / Q1 / Median / Q3 / Max)</CardDescription>
          </CardHeader>
          <CardContent>
            <BoxPlot stats={assistStats} showLabels={true} />
          </CardContent>
        </Card>
      )}
    </div>
  )
})()}
```

**Step 3: 執行 lint 和 type 檢查**

Run: `cd frontend && npm run lint && npx tsc --noEmit`
Expected: No errors

---

## Task 7: Frontend - 更新 LineReportPreview (雙 Top 5 排行榜)

**Files:**
- Modify: `frontend/src/components/events/LineReportPreview.tsx`

**Step 1: 新增 DualTopRanking 組件**

在 TopRanking 組件下方新增：

```tsx
// ============================================================================
// Dual Top Ranking Section (SIEGE only)
// ============================================================================

interface DualTopRankingProps {
  readonly topContributors: readonly TopMemberItem[]
  readonly topAssisters: readonly TopMemberItem[]
}

function DualTopRanking({ topContributors, topAssisters }: DualTopRankingProps) {
  return (
    <div className="space-y-3">
      {/* Contribution Ranking */}
      {topContributors.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h4 className="font-semibold text-sm text-gray-700 mb-3">🏰 貢獻排行</h4>
          <div className="space-y-2">
            {topContributors.map((member, index) => (
              <div
                key={`contrib-${member.rank}-${member.member_name}`}
                className="flex items-center gap-2 py-1"
              >
                <span className="text-lg w-6 text-center">
                  {MEDAL_EMOJIS[index] || `${member.rank}.`}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-800 truncate">{member.member_name}</p>
                  {member.group_name && (
                    <p className="text-xs text-gray-500 truncate">{member.group_name}</p>
                  )}
                </div>
                <span className="text-sm font-semibold text-gray-700 tabular-nums">
                  {formatNumberCompact(member.score)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Assist Ranking */}
      {topAssisters.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h4 className="font-semibold text-sm text-gray-700 mb-3">⚔️ 助攻排行</h4>
          <div className="space-y-2">
            {topAssisters.map((member, index) => (
              <div
                key={`assist-${member.rank}-${member.member_name}`}
                className="flex items-center gap-2 py-1"
              >
                <span className="text-lg w-6 text-center">
                  {MEDAL_EMOJIS[index] || `${member.rank}.`}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-800 truncate">{member.member_name}</p>
                  {member.group_name && (
                    <p className="text-xs text-gray-500 truncate">{member.group_name}</p>
                  )}
                </div>
                <span className="text-sm font-semibold text-gray-700 tabular-nums">
                  {formatNumberCompact(member.score)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
```

**Step 2: 更新主組件，為 SIEGE 使用 DualTopRanking**

修改主組件的渲染邏輯：

```tsx
{/* BATTLE / SIEGE: Participation-focused content */}
<OverallParticipation
  participationRate={summary.participation_rate}
  participatedCount={summary.participated_count}
  totalMembers={summary.total_members}
  newMemberCount={summary.new_member_count}
/>
<GroupAttendance groups={group_stats} />
<GroupMetricDistribution groups={group_stats} eventType={event_type || 'battle'} />

{/* Category-specific ranking */}
{event_type === 'siege' ? (
  <DualTopRanking
    topContributors={top_contributors}
    topAssisters={top_assisters}
  />
) : (
  <TopRanking topMembers={top_members} eventType={event_type || 'battle'} />
)}
```

**Step 3: 更新 props 解構，取得新欄位**

```tsx
const {
  event_name,
  event_type,
  event_start,
  event_end,
  summary,
  group_stats,
  top_members,
  top_contributors,
  top_assisters,
  violators,
} = analytics
```

**Step 4: 執行 lint 和 type 檢查**

Run: `cd frontend && npm run lint && npx tsc --noEmit`
Expected: No errors

---

## Task 8: 驗證與測試

**Step 1: 啟動 Backend 並測試 API**

Run: `cd backend && uv run python src/main.py`

然後用 curl 測試 group-analytics endpoint：

```bash
curl -H "Authorization: Bearer <token>" \
  "http://localhost:8087/api/v1/events/<siege_event_id>/group-analytics" | jq
```

Expected: Response 包含 `top_contributors` 和 `top_assisters` 陣列

**Step 2: 啟動 Frontend 並驗證 UI**

Run: `cd frontend && npm run dev`

1. 開啟 EventDetail 頁面 (攻城事件)
2. 確認 KPI Grid 顯示「貢獻 MVP」和「助攻 MVP」
3. 確認 Box Plot 區塊顯示雙圖表並排
4. 點擊「LINE 報告預覽」確認顯示兩份 Top 5

**Step 3: 執行完整 lint 檢查**

Run:
```bash
cd backend && uv run ruff check .
cd ../frontend && npm run lint && npx tsc --noEmit
```

Expected: No errors

---

## Task 9: Commit 變更

**Step 1: 確認所有變更檔案**

Run: `git status`

Expected files:
- `backend/src/models/battle_event_metrics.py`
- `backend/src/services/battle_event_service.py`
- `frontend/src/types/event.ts`
- `frontend/src/pages/EventDetail.tsx`
- `frontend/src/components/events/LineReportPreview.tsx`
- `docs/plans/2026-01-26-siege-dual-ranking.md`

**Step 2: 提交變更**

```bash
git add backend/src/models/battle_event_metrics.py \
        backend/src/services/battle_event_service.py \
        frontend/src/types/event.ts \
        frontend/src/pages/EventDetail.tsx \
        frontend/src/components/events/LineReportPreview.tsx \
        docs/plans/2026-01-26-siege-dual-ranking.md

git commit -m "$(cat <<'EOF'
feat(siege): implement dual ranking for contribution and assist

- Add contribution_mvp and assist_mvp to EventSummary model
- Add top_contributors and top_assisters to EventGroupAnalytics
- Update EventDetail with dual KPI cards and side-by-side box plots
- Update LineReportPreview with dual Top 5 rankings for SIEGE events

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | 擴展 EventSummary 模型 | `battle_event_metrics.py` |
| 2 | 擴展 EventGroupAnalytics 模型 | `battle_event_metrics.py` |
| 3 | 更新 Service 層 MVP 計算 | `battle_event_service.py` |
| 4 | 更新 Group Analytics 雙排行榜 | `battle_event_service.py` |
| 5 | 更新 TypeScript 類型 | `event.ts` |
| 6 | 更新 EventDetail 頁面 | `EventDetail.tsx` |
| 7 | 更新 LineReportPreview | `LineReportPreview.tsx` |
| 8 | 驗證與測試 | - |
| 9 | Commit | - |
