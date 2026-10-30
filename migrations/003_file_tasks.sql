-- =====================================================================
-- Migration 003: attach a task to an uploaded file (Content Manage)
-- Run ONCE in the Neon SQL Editor of the database the app uses.
-- Safe to run again. Only adds a new table.
-- =====================================================================

-- One row per file that has a task attached. s3_key is the file's full key in the bucket
-- ("Automation-Folder/Linkedin/post.png"). The file's caption is read from the task, so it stays current.
-- Deleting the task removes the link (the file itself is untouched).
CREATE TABLE IF NOT EXISTS file_tasks (
  s3_key       TEXT PRIMARY KEY,
  task_id      TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  attached_by  TEXT NOT NULL DEFAULT '',
  attached_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS file_tasks_task_idx ON file_tasks (task_id);
