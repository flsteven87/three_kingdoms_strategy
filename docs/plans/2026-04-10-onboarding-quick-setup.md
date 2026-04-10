# Onboarding Quick Setup + Checklist

> Decided: 2026-04-10 | Status: Ready to implement

## Summary

New users get a streamlined Quick Setup page (2 fields) that creates alliance + season in one step, then a persistent sidebar checklist guides remaining steps. Non-blocking — users can skip or dismiss at any time.

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Approach | Quick Setup + Checklist (Option C) | Fastest time-to-value without being restrictive |
| Setup scope | 2 fields: alliance name + season name | Minimal friction, defaults for everything else |
| After setup | Redirect to /data | Guide toward first CSV upload (aha moment) |
| Checklist location | Sidebar, below SeasonSelector | Natural placement, collapsible |
| Checklist steps | 4 steps (alliance, season, upload, analytics) | Core path only, no advanced features |
| Checklist behavior | Non-blocking, dismissible | Users can skip steps, close anytime |

## Quick Setup Page

- **Route**: `/setup` (standalone, not inside DashboardLayout)
- **Trigger**: `AllianceGuard` redirects to `/setup` when no alliance exists
- **Fields**: Alliance name (required), Season name (required)
- **Defaults**: start_date=today, no end_date, no description, no game season tag
- **Submit flow**: create alliance → create season (draft) → activate season → navigate to `/data`
- **Footer text**: "14 天免費試用・無需信用卡"

## Onboarding Checklist

### State derivation (no extra DB fields)

| Step | Label | Complete when | Data source |
|------|-------|---------------|-------------|
| 1 | 建立同盟 | alliance exists | `useAlliance()` |
| 2 | 建立賽季 | ≥1 activated season | `useSeasons()` |
| 3 | 上傳第一份資料 | ≥1 csv_upload | `useCsvUploads()` |
| 4 | 查看數據分析 | visited /analytics | `localStorage` flag |

### UI behavior

- Current pending step highlighted with `→` and link button
- All steps clickable regardless of completion (non-blocking)
- Collapsible via header toggle
- `✕` button to dismiss permanently (writes `localStorage`)
- All complete → celebration animation → auto-fade 3s → writes `localStorage`

## File Changes

### New files
- `frontend/src/pages/QuickSetup.tsx` — standalone setup page
- `frontend/src/components/layout/OnboardingChecklist.tsx` — sidebar checklist

### Modified files
- `frontend/src/App.tsx` — add `/setup` route (outside DashboardLayout)
- `frontend/src/components/alliance/AllianceGuard.tsx` — redirect to `/setup` instead of inline form
- `frontend/src/pages/Sidebar.tsx` — insert OnboardingChecklist below SeasonSelector

### Unchanged
- Backend API — chain existing endpoints (create alliance, create season, activate season)
- `AllianceSetupForm.tsx` — kept but no longer used by AllianceGuard

## Data Flow

```
QuickSetup submit
  → useCreateAlliance(name)
  → useCreateSeason(allianceId, { name, start_date: today, status: 'draft' })
  → useActivateSeason(seasonId)
  → navigate('/data')
```
