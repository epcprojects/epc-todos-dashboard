-- =====================================================================
-- Endpoint Clients – Social Media Production Dashboard
-- Neon Postgres schema (run once)
-- =====================================================================
--
-- HOW TO SET UP THE DATABASE (about 5 minutes)
--
-- 1. Go to https://neon.tech and sign up for a free account.
-- 2. Create a new project, e.g. "epc-production". Pick the region closest
--    to your team (for Pakistan: AWS Asia Pacific (Singapore) or Mumbai if offered).
-- 3. In the project, open "SQL Editor" from the left menu.
-- 4. Paste this ENTIRE file into the editor and press "Run".
--    You should see "Success" and the tables appear under "Tables".
-- 5. Open "Dashboard" → "Connect" (Connection Details). Copy the connection
--    string with "Pooled connection" turned ON. It looks like:
--    postgresql://USER:PASSWORD@ep-xxxx-pooler.REGION.aws.neon.tech/neondb?sslmode=require
--    This is your DATABASE_URL.
-- 6. In Vercel → your project → Settings → Environment Variables, add:
--      DATABASE_URL   = (the pooled connection string from step 5)
--      SESSION_SECRET = (a random string of at least 32 characters;
--                        generate one at https://generate-secret.vercel.app/32
--                        or run:  openssl rand -base64 32)
--    Add the same two values to a local .env.local file for development.
-- 7. Deploy. Open the site immediately and set the Admin PIN on the
--    first-time setup screen (the first person to open the site sets it).
--
-- Running this file again is safe: it only creates what is missing.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Settings: exactly one row (id = 1)
-- PINs are stored as bcrypt hashes. pin_version increments whenever a PIN
-- changes, which logs out everyone using that role.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS settings (
  id                     INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  target_buffer_days     INTEGER NOT NULL DEFAULT 7 CHECK (target_buffer_days BETWEEN 1 AND 60),
  allow_team_edit        BOOLEAN NOT NULL DEFAULT FALSE,
  admin_pin_hash         TEXT,
  designer_pin_hash      TEXT,
  editor_pin_hash        TEXT,
  admin_pin_version      INTEGER NOT NULL DEFAULT 1,
  designer_pin_version   INTEGER NOT NULL DEFAULT 1,
  editor_pin_version     INTEGER NOT NULL DEFAULT 1,
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------
-- Imports: one row per uploaded workbook
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS imports (
  id             TEXT PRIMARY KEY,                       -- e.g. 'i' + base36 timestamp
  workbook       TEXT NOT NULL,                          -- original file name
  mode           TEXT NOT NULL DEFAULT 'skip'
                 CHECK (mode IN ('skip','update','new')),-- duplicate handling chosen
  status         TEXT NOT NULL DEFAULT 'importing'
                 CHECK (status IN ('importing','complete','incomplete')),
  errors         INTEGER NOT NULL DEFAULT 0,
  total_tasks    INTEGER NOT NULL DEFAULT 0,
  uploaded_by    TEXT,                                   -- name typed at login
  uploaded_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at    TIMESTAMPTZ
);

-- ---------------------------------------------------------------------
-- Import sheets: one row per worksheet imported from a workbook
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS import_sheets (
  id           BIGSERIAL PRIMARY KEY,
  import_id    TEXT NOT NULL REFERENCES imports(id) ON DELETE CASCADE,
  sheet_idx    INTEGER NOT NULL,                         -- position in the workbook
  name         TEXT NOT NULL,                            -- worksheet name
  team         TEXT NOT NULL CHECK (team IN ('designer','editor','admin','unassigned')),
  row_count    INTEGER NOT NULL DEFAULT 0,
  added        INTEGER NOT NULL DEFAULT 0,
  updated      INTEGER NOT NULL DEFAULT 0,
  skipped      INTEGER NOT NULL DEFAULT 0,
  headers      JSONB NOT NULL DEFAULT '[]'::jsonb,       -- column names exactly as in Excel
  column_map   JSONB NOT NULL DEFAULT '{}'::jsonb,       -- {date,time,day,platform,title,type,pillar: column index or -1}
  date_order   TEXT NOT NULL DEFAULT 'dmy' CHECK (date_order IN ('dmy','mdy')),
  UNIQUE (import_id, sheet_idx)
);

-- ---------------------------------------------------------------------
-- Tasks: one row per Excel row (the original row is preserved in full)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tasks (
  id                   TEXT PRIMARY KEY,                 -- '{importId}-{sheetIdx}-{excelRow}'
  import_id            TEXT NOT NULL REFERENCES imports(id) ON DELETE CASCADE,
  sheet_idx            INTEGER NOT NULL,
  sheet                TEXT NOT NULL,                    -- worksheet name
  workbook             TEXT NOT NULL,                    -- workbook file name
  excel_row            INTEGER NOT NULL,                 -- row number in Excel (source traceability)

  -- Original Excel content, never summarised or truncated
  headers              JSONB NOT NULL DEFAULT '[]'::jsonb,  -- ["Type","Content Pillar",...]
  vals                 JSONB NOT NULL DEFAULT '[]'::jsonb,  -- cell text aligned with headers
  urls                 JSONB NOT NULL DEFAULT '{}'::jsonb,  -- {"7":"https://..."} hyperlinks by column index
  column_map           JSONB NOT NULL DEFAULT '{}'::jsonb,
  date_order           TEXT NOT NULL DEFAULT 'dmy' CHECK (date_order IN ('dmy','mdy')),

  -- Fields derived from the mapped columns (for filtering, sorting, reports)
  post_date            DATE,                             -- publishing date (NOT the completion date)
  post_time            TEXT NOT NULL DEFAULT '',
  post_day             TEXT NOT NULL DEFAULT '',
  platform             TEXT NOT NULL DEFAULT '',
  title                TEXT NOT NULL DEFAULT '',
  content_type         TEXT NOT NULL DEFAULT '',
  pillar               TEXT NOT NULL DEFAULT '',
  dup_key              TEXT NOT NULL DEFAULT '',         -- sheet|date|platform|title, for duplicate detection

  -- Production tracking
  team                 TEXT NOT NULL DEFAULT 'unassigned'
                       CHECK (team IN ('designer','editor','admin','unassigned')),
  status               TEXT NOT NULL DEFAULT 'not_started'
                       CHECK (status IN ('not_started','in_progress','completed','blocked')),
  blocked_reason       TEXT NOT NULL DEFAULT '',
  notes                TEXT NOT NULL DEFAULT '',         -- production notes (team)
  admin_note           TEXT NOT NULL DEFAULT '',         -- feedback from admin to the team
  archived             BOOLEAN NOT NULL DEFAULT FALSE,
  is_founder           BOOLEAN NOT NULL DEFAULT FALSE,   -- imported from a sheet marked as founder content

  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  imported_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at           TIMESTAMPTZ,
  completed_at         TIMESTAMPTZ,                      -- set automatically when status -> completed
  last_completed_at    TIMESTAMPTZ,                      -- kept when a completed task is reopened
  source_updated_from  TEXT,                             -- workbook that last updated the content
  source_updated_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS tasks_team_idx        ON tasks (team);
CREATE INDEX IF NOT EXISTS tasks_post_date_idx   ON tasks (post_date);
CREATE INDEX IF NOT EXISTS tasks_status_idx      ON tasks (status);
CREATE INDEX IF NOT EXISTS tasks_import_idx      ON tasks (import_id, sheet_idx);
CREATE INDEX IF NOT EXISTS tasks_dup_key_idx     ON tasks (dup_key);
CREATE INDEX IF NOT EXISTS tasks_updated_at_idx  ON tasks (updated_at);
CREATE INDEX IF NOT EXISTS tasks_completed_idx   ON tasks (completed_at);
CREATE INDEX IF NOT EXISTS tasks_founder_idx     ON tasks (team) WHERE is_founder;

-- ---------------------------------------------------------------------
-- Task history: lightweight activity log
-- (imported, assigned, status changed, completed, reassigned, archived, notes...)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS task_history (
  id           BIGSERIAL PRIMARY KEY,
  task_id      TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_name   TEXT NOT NULL DEFAULT '',                 -- name typed at login
  actor_role   TEXT NOT NULL CHECK (actor_role IN ('admin','designer','editor')),
  message      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS task_history_task_idx ON task_history (task_id, at DESC);
CREATE INDEX IF NOT EXISTS task_history_at_idx   ON task_history (at DESC);

-- ---------------------------------------------------------------------
-- Deleted task log: lets browsers that poll for changes remove tasks
-- that were deleted since their last check. Rows older than 7 days can
-- be pruned by the app.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS deleted_tasks (
  task_id      TEXT PRIMARY KEY,
  team         TEXT NOT NULL,
  deleted_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS deleted_tasks_at_idx ON deleted_tasks (deleted_at);

-- ---------------------------------------------------------------------
-- Login attempts: basic protection against guessing PINs
-- (the app blocks an IP after 10 failed attempts in 15 minutes)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS login_attempts (
  id           BIGSERIAL PRIMARY KEY,
  ip           TEXT NOT NULL,
  role         TEXT NOT NULL,
  success      BOOLEAN NOT NULL,
  at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS login_attempts_ip_idx ON login_attempts (ip, at DESC);

-- =====================================================================
-- Useful maintenance queries (do NOT run with the setup; use when needed)
-- =====================================================================
-- Forgot the Admin PIN? Clear it, then open the site to set a new one:
--   UPDATE settings SET admin_pin_hash = NULL, admin_pin_version = admin_pin_version + 1 WHERE id = 1;
--
-- See how many tasks each team has:
--   SELECT team, status, count(*) FROM tasks WHERE NOT archived GROUP BY 1,2 ORDER BY 1,2;
--
-- Start completely fresh (deletes ALL imports, tasks and history):
--   TRUNCATE imports, deleted_tasks, login_attempts CASCADE;
