# Endpoint Clients – Social Media Production Dashboard

Production version of the dashboard: a **Next.js (App Router, TypeScript)** app that runs on **Vercel's free Hobby plan** and stores its data in **Neon Postgres (free plan)**.

* Excel files are read **in the browser** (SheetJS). The workbook is never uploaded or stored – only the parsed rows are sent to the server, 200 rows per request.
* Roles come from a **PIN login** (Admin, Graphic Designer, Video Editor). The **server** enforces what each role may read and change.
* Browsers stay up to date by **polling every 15 seconds** while the tab is visible (Neon has no push).

---

## 1. Local setup

You need Node.js 20.9 or newer and a Neon project (see section 3).

```bash
npm install
cp .env.example .env.local      # then edit .env.local (see section 2)
npm run dev
```

Open <http://localhost:3000>. The first person to open the site sets the Admin PIN (section 5).

Other commands:

```bash
npm test            # unit tests (Vitest)
npm run typecheck   # TypeScript, no emit
npm run build       # production build (also type-checks)
npm start           # run the production build locally
```

## 2. Environment variables

Only two are needed (see `.env.example`):

| Name | What it is |
|---|---|
| `DATABASE_URL` | Neon **pooled** connection string (`…-pooler…neon.tech…?sslmode=require`) |
| `SESSION_SECRET` | Random string, **at least 32 characters**, used to sign the login cookie. Generate one with `openssl rand -base64 32` |

Nothing else is required: no file storage, realtime service, email, cron or paid service.

## 3. Create the database tables (once)

The app never creates or migrates tables. You create them once yourself:

1. Sign in at <https://neon.tech>, create a project (pick the region closest to your team).
2. Open **SQL Editor**, paste the whole of [`neon_schema.sql`](neon_schema.sql) and press **Run**. Running it again is safe – it only creates what is missing.
3. Open **Dashboard → Connect**, switch **Pooled connection** on and copy the connection string. That is your `DATABASE_URL`.

### Optional: admin-created roles (migration 001)

To let the admin create extra roles (for example "Front-end Developer") with their own PINs, run [`migrations/001_custom_roles.sql`](migrations/001_custom_roles.sql) once in the Neon SQL Editor of the database the app uses. It adds a `custom_roles` table and removes the three CHECK constraints that only allowed Designer/Editor. Until it is run, everything else works and *Settings → Team roles* shows an explanatory error when you try to create a role.

### Optional: file manager (S3)

**Content Manage** is a file explorer for the bucket folder `Automation-Folder`. LinkedIn, Facebook, Instagram, TikTok and YouTube are always shown at the top level; every role can create new folders (at the top level or inside any folder), and view, download, upload, rename and delete files. Folders made in the S3 console show up too. Add four more environment variables (see `.env.example`): `AWS_BUCKET`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`.

The IAM user needs `s3:ListBucket` on the bucket and `s3:GetObject`, `s3:PutObject`, `s3:DeleteObject` on `arn:aws:s3:::<bucket>/Automation-Folder/*` (folders are created as zero-byte `name/` objects with `PutObject`, rename is copy + delete). Browser uploads also need the bucket CORS rule from the earlier setup.

* **IAM permissions** needed: `s3:ListBucket` on the bucket, and `s3:GetObject`, `s3:PutObject`, `s3:DeleteObject` on `bucket/Automation-Folder/*`.
* **Uploads go straight from the browser to S3** with a short-lived presigned POST, so Vercel's 4.5 MB body limit never applies. S3 itself enforces the 5 GiB per-file limit.
* **One-time bucket CORS** (S3 console → bucket → Permissions → Cross-origin resource sharing). Add your site address(es):

  ```json
  [
    {
      "AllowedHeaders": ["*"],
      "AllowedMethods": ["POST", "GET", "HEAD"],
      "AllowedOrigins": ["https://epc-production-dashboard.vercel.app", "http://localhost:3000"],
      "ExposeHeaders": ["ETag"],
      "MaxAgeSeconds": 3000
    }
  ]
  ```
* **Settings** live in `lib/manage-config.ts`: the folder list, `MAX_FILE_BYTES` (5 GiB) and **`ALLOWED_EXTENSIONS`**. An empty list allows every file type; put extensions in it (for example `['jpg', 'png', 'mp4', 'pdf']`) to restrict uploads. Both the browser and the server enforce it.
* A file whose name already exists is saved as `name (1).ext`. Files are never overwritten; folders cannot be created or deleted from the app.

## 4. Deploy to Vercel

1. Push this folder to a Git repository (GitHub, GitLab or Bitbucket).
2. In Vercel choose **Add New… → Project** and import the repository. The framework preset (Next.js) is detected automatically – keep the defaults.
3. Under **Environment Variables** add `DATABASE_URL` and `SESSION_SECRET` (the same values as in `.env.local`).
4. Click **Deploy**.
5. Open the deployed URL **immediately** and set the Admin PIN (the first visitor sets it).

Notes for the Hobby plan: every API response is far below Vercel's 4.5 MB limit (task lists are sent in pages of 300, imports in chunks of 200 rows) and import routes set `maxDuration = 60`.

## 5. First-time Admin PIN, other PINs, forgotten PIN

* **First-time setup** – the first visit shows *Set up dashboard access*: enter the Admin PIN twice (4–8 digits) and your name. This works only while no Admin PIN exists.
* **Designer and Editor PINs** – log in as Admin → **Settings → Access PINs**. Everyone opens the same link and picks a role + PIN. The name typed at login is shown in the activity history.
* **Changing a PIN logs out everyone using that role** (each role has a `pin_version`; sessions with an older version get `401`). Changing your own Admin PIN keeps you logged in.
* **Forgot the Admin PIN?** Run this in the Neon SQL Editor, then open the site – it shows the setup screen again:

  ```sql
  UPDATE settings SET admin_pin_hash = NULL, admin_pin_version = admin_pin_version + 1 WHERE id = 1;
  ```

  (It is also at the bottom of `neon_schema.sql`.)
* After 10 failed logins from one IP within 15 minutes, login returns `429` for that IP.

---

## How roles are enforced (server side)

| Action | Admin | Graphic Designer | Video Editor |
|---|---|---|---|
| Read tasks | all | only `team = 'designer'`, not archived | only `team = 'editor'`, not archived |
| Status, blocked reason, production notes | any task | own team | own team |
| Excel content fields | yes | only if *allow team edit* is on, own team | same |
| Assign, admin note, archive/restore, bulk actions | yes | no (403) | no (403) |
| Delete task / import | yes | no (403) | no (403) |
| Imports, settings, PINs, reports, activity | yes | no (403) | no (403) |

* The session is a signed JWT (HS256) in an `httpOnly`, `SameSite=Lax` cookie (`Secure` in production), valid 30 days. Every API request re-checks the role's `pin_version` in the database.
* PIN hashes (bcrypt) never leave the server. `/api/settings` returns only the target buffer, the team-edit switch and which roles have a PIN.
* Timestamps (`completed_at`, `started_at`, `last_completed_at`, `updated_at`) are set from the database clock; a browser cannot send its own.
* All SQL is parameterised; request bodies are validated with zod.

## Keeping browsers up to date

* `GET /api/tasks` returns the caller's tasks (in pages of 300 – the client follows `nextCursor`).
* `GET /api/tasks?since=<ISO>` returns only tasks changed since then, the IDs removed from the caller's scope (deleted, archived, or reassigned to the other team) and `serverTime` for the next poll.
* Deletes write to `deleted_tasks` in the same transaction (entries older than 7 days are pruned).
* The browser polls every 15 s while the tab is visible, pauses when it is hidden, catches up when it becomes visible again, and polls after every write. Edits are optimistic: the UI changes immediately and is reconciled with the server response (an error toast appears if saving fails). Text you are typing in the drawer is kept as a draft, so a poll never overwrites it.
* `post_date` is selected as `post_date::text`, so it is always `YYYY-MM-DD` and never shifts by a day. "Today", overdue, days-ahead and report periods are computed in the browser's local timezone.

## Project layout

```
app/
  layout.tsx, page.tsx, globals.css      Manrope via next/font, plain CSS (tokens, light/dark, print)
  api/
    auth/{setup,login,logout,session}    PIN setup / login (rate-limited) / logout / session info
    settings, settings/pin               target buffer, team-edit switch, PINs (admin)
    tasks, tasks/[id], tasks/[id]/history, tasks/bulk, activity
    imports, imports/[id]/{rows,finish,archive,restore,fix-headers}
components/
  App.tsx, Shell.tsx, store.tsx          provider: session, task cache, optimistic writes, polling
  Drawer.tsx, TaskTable.tsx, Wizard.tsx, Dialogs.tsx, parts.tsx, ui.tsx
  views/                                 Dashboard, TeamView, Distribution, Calendar, Reports, Imports, Settings, ImportPage, Login
lib/
  constants.ts, dates.ts, text.ts        shared helpers (dates, platform parsing, dup keys, derived fields)
  metrics.ts                             coverage(), covAll(), health(), periodRange(), pm()
  excel.ts, mapping.ts                   readGrid, header detection, analyze, guessMap, cellISO (browser only)
  status.ts                              statusPatch (used by the server; mirrored in the browser for optimistic UI)
  tasks.ts, perms.ts                     filtering/sorting/export rows, permission rules
  client/{api,export}.ts                 fetch wrapper, CSV/Excel Blob downloads
  server/{db,auth,http,tasks}.ts         Neon driver, session, errors, shared SQL operations
tests/                                   Vitest: coverage, dates, headers, duplicate keys, status, permissions
neon_schema.sql                          the schema you run once in Neon
```

## Exports

CSV and Excel exports run in the browser (SheetJS + `Blob` download) with the same columns as the prototype. **Reports → Export report (PDF)** opens the browser's print dialog with a print stylesheet that shows only the report; choose *Save as PDF*.

## Troubleshooting

* *"Database setup problem: the tables are missing"* – run `neon_schema.sql` (section 3).
* *"Server setup problem: DATABASE_URL…/SESSION_SECRET…"* – the environment variable is missing or too short; in Vercel, add it and redeploy.
* Logged out unexpectedly – the PIN for that role was changed, or the cookie expired (30 days).
