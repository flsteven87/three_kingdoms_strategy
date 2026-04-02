-- Migration: Add group_binding_id to member_line_bindings
-- Purpose: Track which group binding each member registration came from,
--          so the admin list only shows members from the current active group.
-- Date: 2026-04-02
--
-- Run this in Supabase SQL Editor or via supabase db push.

ALTER TABLE member_line_bindings
ADD COLUMN group_binding_id UUID REFERENCES line_group_bindings(id) ON DELETE SET NULL;

COMMENT ON COLUMN member_line_bindings.group_binding_id IS
  'FK to line_group_bindings. NULL for historical records created before this migration.';
