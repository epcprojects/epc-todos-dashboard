-- =====================================================================
-- Migration 002: founder content
-- Run ONCE in the Neon SQL Editor of the database the app uses.
-- Safe to run again. Only adds a column with a default; no existing row changes.
-- =====================================================================

-- Tasks imported from a sheet that the admin marked as "Founder content".
-- They appear in the separate "Founder content" tab of the team page they are assigned to.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS is_founder BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS tasks_founder_idx ON tasks (team) WHERE is_founder;
