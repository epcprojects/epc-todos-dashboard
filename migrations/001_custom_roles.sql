-- =====================================================================
-- Migration 001: admin-created roles (e.g. "Front-end Developer")
-- Run ONCE in the Neon SQL Editor of the database the app uses.
-- Safe to run again.
-- =====================================================================

-- One row per admin-created role. A role works like Designer / Editor:
-- tasks assigned to it (tasks.team = key) are what its members see.
CREATE TABLE IF NOT EXISTS custom_roles (
  key          TEXT PRIMARY KEY CHECK (key ~ '^[a-z0-9][a-z0-9-]{1,29}$'),
  name         TEXT NOT NULL,
  pin_hash     TEXT,
  pin_version  INTEGER NOT NULL DEFAULT 1,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The original schema only allowed the built-in roles in these three columns.
ALTER TABLE tasks         DROP CONSTRAINT IF EXISTS tasks_team_check;
ALTER TABLE import_sheets DROP CONSTRAINT IF EXISTS import_sheets_team_check;
ALTER TABLE task_history  DROP CONSTRAINT IF EXISTS task_history_actor_role_check;
