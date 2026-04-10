# Supabase Production Hardening Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix all security vulnerabilities, clean dirty data, and optimize performance before public launch.

**Architecture:** Pure SQL DDL/DML changes executed via Supabase MCP. No backend code changes needed. All security fixes are idempotent (DROP IF EXISTS + CREATE). Data cleanup uses soft deletes or status updates where possible.

**Tech Stack:** PostgreSQL 17 (Supabase), RLS policies, PL/pgSQL functions

**Context:** Full audit completed 2026-04-10. DB size 32MB, 25 auth users, 5 alliances (1 active + 4 empty test + 1 test). Key risk: `copper_mines` table is fully open to anon.

---

## Phase 1: Security Fixes (Critical)

### Task 1: Fix `copper_mines` RLS policy — anon full access vulnerability

The `copper_mines` table has a single policy `Service key full access` with `roles={public}` and `USING(true)`. This means **any unauthenticated user can read, write, and delete all copper mine data** via PostgREST.

**Root cause:** Policy was intended for service_role only, but was created with `TO public` instead of checking `auth.role() = 'service_role'`.

**Files:** None (SQL only)

**Step 1: Verify current state**

```sql
SELECT policyname, roles, cmd, qual FROM pg_policies WHERE tablename = 'copper_mines';
```

Expected: 1 policy, `Service key full access`, roles=`{public}`, qual=`true`

**Step 2: Replace with proper policies**

```sql
-- Drop the dangerous policy
DROP POLICY IF EXISTS "Service key full access" ON copper_mines;

-- Service role: full CRUD (for backend LINE bot operations)
CREATE POLICY "Service role full access" ON copper_mines
  FOR ALL
  TO authenticated
  USING ((SELECT auth.role()) = 'service_role')
  WITH CHECK ((SELECT auth.role()) = 'service_role');

-- Alliance members: read-only (for frontend display)
CREATE POLICY "Alliance members can view copper mines" ON copper_mines
  FOR SELECT
  TO authenticated
  USING (alliance_id IN (
    SELECT ac.alliance_id FROM alliance_collaborators ac
    WHERE ac.user_id = (SELECT auth.uid())
  ));
```

**Step 3: Verify fix**

```sql
SELECT policyname, roles, cmd, qual FROM pg_policies WHERE tablename = 'copper_mines';
```

Expected: 2 policies, neither using `true` as qual.

---

### Task 2: Enable RLS on `line_user_notifications` and `line_group_members`

Both tables have RLS **disabled**. They're exposed via PostgREST — any anon/authenticated user can read LINE user IDs and group membership. Backend accesses via service_role (bypasses RLS), so enabling RLS won't break anything.

**Step 1: Enable RLS + add service-role-only policy**

```sql
-- line_user_notifications
ALTER TABLE line_user_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role only" ON line_user_notifications
  FOR ALL
  TO authenticated
  USING ((SELECT auth.role()) = 'service_role')
  WITH CHECK ((SELECT auth.role()) = 'service_role');

-- line_group_members
ALTER TABLE line_group_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role only" ON line_group_members
  FOR ALL
  TO authenticated
  USING ((SELECT auth.role()) = 'service_role')
  WITH CHECK ((SELECT auth.role()) = 'service_role');
```

**Step 2: Verify**

```sql
SELECT tablename, rowsecurity FROM pg_tables
WHERE tablename IN ('line_user_notifications', 'line_group_members');
```

Expected: both `true`.

---

### Task 3: Fix `check_user_role` search_path — affects 20 RLS policies

This function is `SECURITY DEFINER` without `SET search_path`. It's used by **20 RLS policies across 9 tables** (alliances, alliance_collaborators, seasons, csv_uploads, members, member_snapshots, hegemony_weights, pending_invitations). A search_path injection could bypass all permission checks.

**Step 1: Fix check_user_role**

```sql
CREATE OR REPLACE FUNCTION public.check_user_role(
  p_alliance_id uuid,
  p_user_id uuid,
  p_required_roles text[]
)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM alliance_collaborators
    WHERE alliance_id = p_alliance_id
      AND user_id = p_user_id
      AND role = ANY(p_required_roles)
  );
END;
$function$;
```

**Step 2: Fix get_user_role** (not used in RLS but still SECURITY DEFINER)

```sql
CREATE OR REPLACE FUNCTION public.get_user_role(
  p_alliance_id uuid,
  p_user_id uuid
)
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  v_role TEXT;
BEGIN
  SELECT role INTO v_role
  FROM alliance_collaborators
  WHERE alliance_id = p_alliance_id
    AND user_id = p_user_id
  LIMIT 1;
  
  RETURN v_role;
END;
$function$;
```

**Step 3: Verify**

```sql
SELECT proname, proconfig
FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public' AND p.proname IN ('check_user_role', 'get_user_role');
```

Expected: both show `search_path=public` in proconfig.

---

### Task 4: Drop `execute_ai_readonly_query` — unused SECURITY DEFINER function

This function accepts arbitrary SQL text, wraps it in `format() + EXECUTE`, and runs as SECURITY DEFINER with no search_path. **Backend code does not use it at all** — it's dead code from an experiment. Even with the SELECT-only validation, the pattern is inherently dangerous.

**Step 1: Confirm not used**

```bash
cd /Users/po-chi/Desktop/three_kingdoms_strategy
grep -r "execute_ai_readonly" backend/src/ frontend/src/
```

Expected: No matches.

**Step 2: Drop function**

```sql
DROP FUNCTION IF EXISTS public.execute_ai_readonly_query(text, uuid);
```

**Step 3: Verify**

```sql
SELECT proname FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public' AND p.proname = 'execute_ai_readonly_query';
```

Expected: 0 rows.

---

### Task 5: Enable Leaked Password Protection

**Step 1:** Go to Supabase Dashboard → Authentication → Settings → Security → Enable "Leaked Password Protection"

This is a UI-only setting, no SQL needed. Inform the user to do this manually.

---

## Phase 2: Data Cleanup

### Task 6: Clean expired invitations and binding codes

**Step 1: Mark expired invitations**

```sql
UPDATE pending_invitations
SET status = 'expired'
WHERE status = 'pending' AND expires_at < now();
```

Expected: 3 rows updated.

**Step 2: Delete expired binding codes**

```sql
DELETE FROM line_binding_codes
WHERE used_at IS NULL AND expires_at < now();
```

Expected: 4 rows deleted.

**Step 3: Verify**

```sql
SELECT 'pending_expired' as check, count(*) FROM pending_invitations WHERE status = 'pending' AND expires_at < now()
UNION ALL
SELECT 'codes_expired', count(*) FROM line_binding_codes WHERE used_at IS NULL AND expires_at < now();
```

Expected: both 0.

---

### Task 7: Handle orphan members (44 records, no snapshots)

44 members exist with no associated snapshots. All created on 2026-01-22 (early testing batch). 38 have zero references anywhere. 6 have `member_line_bindings` references.

**Step 1: Mark truly orphaned members as inactive** (38 with zero refs)

```sql
UPDATE members
SET is_active = false, updated_at = now()
WHERE NOT EXISTS (SELECT 1 FROM member_snapshots ms WHERE ms.member_id = members.id)
  AND NOT EXISTS (SELECT 1 FROM member_line_bindings mlb WHERE mlb.member_id = members.id)
  AND NOT EXISTS (SELECT 1 FROM battle_event_metrics bem WHERE bem.member_id = members.id)
  AND NOT EXISTS (SELECT 1 FROM member_period_metrics mpm WHERE mpm.member_id = members.id)
  AND NOT EXISTS (SELECT 1 FROM copper_mines cm WHERE cm.member_id = members.id)
  AND NOT EXISTS (SELECT 1 FROM donation_targets dt WHERE dt.member_id = members.id);
```

Expected: 38 rows updated.

**Step 2: Verify remaining orphans** (should be 6 with line_bindings)

```sql
SELECT count(*) FROM members m
WHERE NOT EXISTS (SELECT 1 FROM member_snapshots ms WHERE ms.member_id = m.id)
  AND m.is_active = true;
```

Expected: 6 (these have LINE bindings, keep active for now).

---

### Task 8: Clean test webhook events

4 webhook_events with `alliance_id = NULL` — all from early testing (2026-03-26), including 2 explicitly named `evt_test_*`.

**Step 1: Delete test webhook events**

```sql
DELETE FROM webhook_events
WHERE alliance_id IS NULL
  AND (event_id LIKE 'evt_test_%' OR processed_at < '2026-04-01');
```

Expected: 4 rows deleted.

---

### Task 9: Assess empty alliances

6 alliances with no members/data. Decision matrix:

| Alliance | Created | purchased_seasons | Action |
|----------|---------|-------------------|--------|
| 乃霸 (x3) | 2025-10 ~ 2026-01 | 0 | Delete — test data |
| 1 | 2026-01-12 | 0 | Delete — test data |
| 武裝農夫 | 2026-02-05 | 0 | **Ask user** — might be real user |
| 測試同盟 | 2026-04-10 | 1 | **Keep** — has purchased_seasons |

**Step 1: Delete obvious test alliances** (confirm with user first)

```sql
-- Only after user confirmation!
-- First check for any FK references
SELECT a.id, a.name,
  (SELECT count(*) FROM seasons s WHERE s.alliance_id = a.id) as seasons,
  (SELECT count(*) FROM alliance_collaborators ac WHERE ac.alliance_id = a.id) as collabs
FROM alliances a
WHERE a.id IN (
  'b236dc06-2861-4e2a-8ee6-4021d18c90e2',
  'c34870ae-678e-4877-93a1-afd5b357034b',
  '37f0557e-631f-4a2a-a87d-3e76dfcde75a',
  'c99e0868-2339-4edd-90e8-ddad502aba07'
);
```

**Step 2: Delete if safe** (no FK references)

```sql
-- Delete collaborators first (FK constraint)
DELETE FROM alliance_collaborators
WHERE alliance_id IN (
  'b236dc06-2861-4e2a-8ee6-4021d18c90e2',
  'c34870ae-678e-4877-93a1-afd5b357034b',
  '37f0557e-631f-4a2a-a87d-3e76dfcde75a',
  'c99e0868-2339-4edd-90e8-ddad502aba07'
);

-- Then delete seasons if any
DELETE FROM seasons
WHERE alliance_id IN (
  'b236dc06-2861-4e2a-8ee6-4021d18c90e2',
  'c34870ae-678e-4877-93a1-afd5b357034b',
  '37f0557e-631f-4a2a-a87d-3e76dfcde75a',
  'c99e0868-2339-4edd-90e8-ddad502aba07'
);

-- Finally delete alliances
DELETE FROM alliances
WHERE id IN (
  'b236dc06-2861-4e2a-8ee6-4021d18c90e2',
  'c34870ae-678e-4877-93a1-afd5b357034b',
  '37f0557e-631f-4a2a-a87d-3e76dfcde75a',
  'c99e0868-2339-4edd-90e8-ddad502aba07'
);
```

---

## Phase 3: Performance Optimization

### Task 10: Merge duplicate permissive RLS policies

4 tables have redundant SELECT policies that already overlap with their ALL policy. Each extra permissive policy causes additional evaluation on every query.

**Affected tables:** `line_group_bindings`, `member_line_bindings`, `member_period_metrics`, `periods`

**Step 1: Fix line_group_bindings** — merge "admins manage" (ALL) + "members view" (SELECT) into proper separate policies

```sql
-- Drop redundant SELECT (ALL already covers it for admins)
DROP POLICY IF EXISTS "Alliance members can view group bindings" ON line_group_bindings;
DROP POLICY IF EXISTS "Alliance admins can manage group bindings" ON line_group_bindings;

-- Recreate as non-overlapping: SELECT for all members, CUD for admins only
CREATE POLICY "Alliance members can view group bindings" ON line_group_bindings
  FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM alliance_collaborators ac
    WHERE ac.alliance_id = line_group_bindings.alliance_id
      AND ac.user_id = (SELECT auth.uid())
  ));

CREATE POLICY "Alliance admins can manage group bindings" ON line_group_bindings
  FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM alliance_collaborators ac
    WHERE ac.alliance_id = line_group_bindings.alliance_id
      AND ac.user_id = (SELECT auth.uid())
      AND ac.role::text = ANY(ARRAY['owner', 'collaborator'])
  ));
```

**Step 2: Fix member_line_bindings** (same pattern)

```sql
DROP POLICY IF EXISTS "Alliance members can view line bindings" ON member_line_bindings;
DROP POLICY IF EXISTS "Alliance admins can manage line bindings" ON member_line_bindings;

CREATE POLICY "Alliance members can view line bindings" ON member_line_bindings
  FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM alliance_collaborators ac
    WHERE ac.alliance_id = member_line_bindings.alliance_id
      AND ac.user_id = (SELECT auth.uid())
  ));

CREATE POLICY "Alliance admins can manage line bindings" ON member_line_bindings
  FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM alliance_collaborators ac
    WHERE ac.alliance_id = member_line_bindings.alliance_id
      AND ac.user_id = (SELECT auth.uid())
      AND ac.role::text = ANY(ARRAY['owner', 'collaborator'])
  ));
```

**Step 3: Fix member_period_metrics** — service role ALL + user SELECT overlap

```sql
DROP POLICY IF EXISTS "Service role can manage metrics" ON member_period_metrics;
DROP POLICY IF EXISTS "Users can view metrics of their alliances" ON member_period_metrics;

-- Service role: write operations only (SELECT not needed, service_role bypasses RLS)
-- Actually service_role bypasses RLS entirely, so this policy is unnecessary.
-- Keep only the user-facing SELECT policy.
CREATE POLICY "Users can view metrics of their alliances" ON member_period_metrics
  FOR SELECT
  TO authenticated
  USING (alliance_id IN (
    SELECT ac.alliance_id FROM alliance_collaborators ac
    WHERE ac.user_id = (SELECT auth.uid())
  ));
```

**Step 4: Fix periods** (same as member_period_metrics)

```sql
DROP POLICY IF EXISTS "Service role can manage periods" ON periods;
DROP POLICY IF EXISTS "Users can view periods of their alliances" ON periods;

CREATE POLICY "Users can view periods of their alliances" ON periods
  FOR SELECT
  TO authenticated
  USING (alliance_id IN (
    SELECT ac.alliance_id FROM alliance_collaborators ac
    WHERE ac.user_id = (SELECT auth.uid())
  ));
```

---

### Task 11: Add missing FK indexes (high-impact only)

8 foreign keys lack covering indexes. Focus on the ones that could impact JOIN performance as data grows.

**Step 1: Add indexes for frequently joined FKs**

```sql
-- battle_event_metrics: snapshot lookups during event analysis
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_battle_event_metrics_start_snapshot
  ON battle_event_metrics (start_snapshot_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_battle_event_metrics_end_snapshot
  ON battle_event_metrics (end_snapshot_id);

-- webhook_events: alliance lookup during webhook processing
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_webhook_events_alliance
  ON webhook_events (alliance_id);

-- member_line_bindings: group binding lookup
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_member_line_bindings_group_binding
  ON member_line_bindings (group_binding_id);
```

**Step 2: Skip low-impact FKs** (invited_by, created_by — rarely queried by these columns)

---

### Task 12: Review unused indexes (21 total) — defer to post-launch

21 indexes have never been used according to `pg_stat_user_indexes`. However, the current usage is from testing/beta with limited data and query patterns. **Do NOT drop these before launch** — real production traffic may use different query patterns.

**Action:** Revisit after 2 weeks of production traffic. Create a monitoring query:

```sql
-- Run this after 2 weeks of production to re-check
SELECT indexrelname, idx_scan, pg_size_pretty(pg_relation_size(i.indexrelid)) as size
FROM pg_stat_user_indexes i
JOIN pg_index ix ON i.indexrelid = ix.indexrelid
WHERE i.schemaname = 'public'
  AND idx_scan = 0
  AND NOT ix.indisunique
ORDER BY pg_relation_size(i.indexrelid) DESC;
```

---

## Phase 4: Minor Improvements

### Task 13: Move pg_trgm to extensions schema

```sql
-- Note: This requires dropping and recreating dependent objects.
-- The find_similar_members and get_member_candidates functions depend on pg_trgm.
-- Defer this to a maintenance window as it's low risk and low impact.
```

**Action:** Defer to post-launch. Document as tech debt.

---

## Execution Checklist

| Phase | Task | Priority | Risk | Reversible |
|-------|------|----------|------|------------|
| 1 | Fix copper_mines RLS | 🔴 Critical | High impact | Yes (recreate old policy) |
| 1 | Enable RLS on LINE tables | 🔴 Critical | Low risk | Yes (ALTER TABLE DISABLE) |
| 1 | Fix check/get_user_role search_path | 🔴 Critical | Low risk | Yes (CREATE OR REPLACE) |
| 1 | Drop execute_ai_readonly_query | 🔴 Critical | Zero risk | Yes (recreate) |
| 1 | Enable Leaked Password Protection | 🟡 Manual | Zero risk | Yes (toggle) |
| 2 | Clean expired invitations/codes | 🟡 Cleanup | Zero risk | No (DELETE) |
| 2 | Mark orphan members inactive | 🟡 Cleanup | Low risk | Yes (UPDATE back) |
| 2 | Delete test webhooks | 🟡 Cleanup | Zero risk | No |
| 2 | Delete empty test alliances | 🟡 Cleanup | Low risk | No |
| 3 | Merge duplicate RLS policies | 🟡 Performance | Medium risk | Yes (recreate) |
| 3 | Add FK indexes | 🟢 Performance | Zero risk | Yes (DROP INDEX) |
| 3 | Review unused indexes | 🟢 Deferred | N/A | N/A |
| 4 | Move pg_trgm | 🟢 Deferred | N/A | N/A |
