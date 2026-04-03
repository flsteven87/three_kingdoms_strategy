-- Migration: Create line_group_members table
-- Purpose: Track which LINE users are currently in which LINE groups,
--          populated from webhook events (memberJoined, memberLeft, message).
-- Date: 2026-04-03
--
-- Run this in Supabase SQL Editor.

CREATE TABLE line_group_members (
    line_group_id VARCHAR NOT NULL,
    line_user_id VARCHAR NOT NULL,
    tracked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (line_group_id, line_user_id)
);

COMMENT ON TABLE line_group_members IS
    'Tracks LINE group membership via webhook events. Used to filter registered members admin view.';
COMMENT ON COLUMN line_group_members.tracked_at IS
    'Last time this user was seen in this group (join event or message).';

-- Index for reverse lookup: which groups is a user in?
CREATE INDEX idx_line_group_members_user ON line_group_members (line_user_id);
