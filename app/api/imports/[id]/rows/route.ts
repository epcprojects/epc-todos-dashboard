import { z } from 'zod';
import { CHUNK_SIZE, TEAMS, type Team } from '@/lib/constants';
import { requireSession } from '@/lib/server/auth';
import { q, tx, type Row } from '@/lib/server/db';
import { ApiError, body, handle, json } from '@/lib/server/http';
import { hasFounderColumn } from '@/lib/server/tasks';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const rowShape = {
  excelRow: z.number().int().min(1),
  vals: z.array(z.string().max(40000)).max(300),
  urls: z.record(z.string(), z.string().max(4000)),
  postDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  dupKey: z.string().max(2000),
  platform: z.string().max(10000),
  title: z.string().max(10000),
  type: z.string().max(10000),
  pillar: z.string().max(10000),
  day: z.string().max(10000),
  time: z.string().max(10000),
};

const schema = z.object({
  sheetIdx: z.number().int().min(0),
  rows: z.array(z.object(rowShape)).max(CHUNK_SIZE).default([]),
  updates: z.array(z.object({ taskId: z.string().min(1).max(200), ...rowShape })).max(CHUNK_SIZE).default([]),
  reset: z.boolean().default(false),
  /** The admin marked this sheet as founder content on the Assign step. */
  founder: z.boolean().default(false),
  /** "Append new rows" to an existing sheet: new task IDs get this suffix so they never collide with earlier rows. */
  appendBatch: z.string().regex(/^[a-z0-9]{3,12}$/).optional(),
  /** Column names / mapping of the file being appended (it may differ from the sheet's original upload). */
  override: z
    .object({
      headers: z.array(z.string().max(2000)).max(300),
      map: z.record(z.string(), z.number().int()),
      dateOrder: z.enum(['dmy', 'mdy']),
    })
    .optional(),
});

/**
 * One chunk (at most 200 rows) of an import. New tasks go in with one multi-row INSERT and their history
 * in the same statement; "update matching" rows change only Excel content and derived fields.
 * Re-sending a chunk after a network error is safe: existing task IDs are left alone.
 */
export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { session } = await requireSession(req, ['admin']);
  const { id: importId } = await ctx.params;
  const b = await body(req, schema);

  const info = (await tx([
    q(`SELECT workbook FROM imports WHERE id = $1`, [importId]),
    q(`SELECT name, team, headers, column_map, date_order FROM import_sheets WHERE import_id = $1 AND sheet_idx = $2`, [importId, b.sheetIdx]),
  ])) as Row[][];
  if (!info[0].length || !info[1].length) throw new ApiError(404, 'Import or sheet not found.');
  const workbook = String(info[0][0].workbook);
  const sheet = info[1][0];
  const headers = JSON.stringify(b.override ? b.override.headers : sheet.headers);
  const map = JSON.stringify(b.override ? b.override.map : sheet.column_map);
  const dateOrder = b.override ? b.override.dateOrder : String(sheet.date_order);

  // Founder content needs migration 002 (tasks.is_founder). Without it, importing as founder content is refused rather than silently ignored.
  const founderCol = await hasFounderColumn();
  if (b.founder && !founderCol) throw new ApiError(409, 'Founder content needs a one-time database update (migrations/002_founder_content.sql). Run it in the Neon SQL Editor, then import again.');
  // appended rows follow the sheet: they are founder content when the rest of the sheet already is
  const founderExpr = !founderCol ? '' : b.appendBatch ? `COALESCE((SELECT bool_or(is_founder) FROM tasks WHERE import_id = $2::text AND sheet_idx = $3::int), false)` : b.founder ? 'true' : 'false';

  const shape = (r: (typeof b.rows)[number]) => ({
    excel_row: r.excelRow,
    vals: r.vals,
    urls: r.urls,
    post_date: r.postDate,
    post_time: r.time,
    post_day: r.day,
    platform: r.platform,
    title: r.title,
    content_type: r.type,
    pillar: r.pillar,
    dup_key: r.dupKey,
  });
  const queries: ReturnType<typeof q>[] = [];

  if (b.rows.length) {
    const items = b.rows.map((r) => ({ id: `${importId}-${b.sheetIdx}-${r.excelRow}${b.appendBatch ? '-' + b.appendBatch : ''}`, ...shape(r) }));
    queries.push(
      q(
        `WITH ins AS (
           INSERT INTO tasks (id, import_id, sheet_idx, sheet, workbook, excel_row, headers, vals, urls, column_map, date_order,
                              post_date, post_time, post_day, platform, title, content_type, pillar, dup_key, team${founderExpr ? ', is_founder' : ''})
           SELECT x.id, $2::text, $3::int, $4::text, $5::text, x.excel_row, $6::jsonb, x.vals, x.urls, $7::jsonb, $8::text, NULLIF(x.post_date, '')::date,
                  x.post_time, x.post_day, x.platform, x.title, x.content_type, x.pillar, x.dup_key, $9::text${founderExpr ? ', ' + founderExpr : ''}
             FROM jsonb_to_recordset($1::jsonb) AS x(id text, excel_row int, vals jsonb, urls jsonb, post_date text, post_time text, post_day text,
                                                     platform text, title text, content_type text, pillar text, dup_key text)
           ON CONFLICT (id) DO NOTHING
           RETURNING id, excel_row, team
         )
         INSERT INTO task_history (task_id, actor_name, actor_role, message)
         SELECT ins.id, $10::text, 'admin', m.msg
           FROM ins CROSS JOIN LATERAL (VALUES (1, 'Imported from ' || $5::text || ' › ' || $4::text || ' (row ' || ins.excel_row || ')'),
                                               (2, 'Assigned to ' || $11::text)) AS m(ord, msg)
          ORDER BY ins.id, m.ord`,
        [JSON.stringify(items), importId, b.sheetIdx, sheet.name, workbook, headers, map, dateOrder, sheet.team, session.name, TEAMS[sheet.team as Team] ?? String(sheet.team)],
      ),
    );
  }

  if (b.updates.length) {
    const items = b.updates.map((r) => ({ task_id: r.taskId, ...shape(r) }));
    queries.push(
      q(
        `WITH upd AS (
           UPDATE tasks t SET
              headers = $2::jsonb, vals = x.vals, urls = x.urls, column_map = $3::jsonb, date_order = $4::text,
              post_date = NULLIF(x.post_date, '')::date, post_time = x.post_time, post_day = x.post_day, platform = x.platform,
              title = x.title, content_type = x.content_type, pillar = x.pillar, dup_key = x.dup_key,
              source_updated_from = $5::text, source_updated_at = now(), updated_at = now(),
              status = CASE WHEN $6::boolean THEN 'not_started' ELSE t.status END,
              completed_at = CASE WHEN $6::boolean THEN NULL ELSE t.completed_at END,
              blocked_reason = CASE WHEN $6::boolean THEN '' ELSE t.blocked_reason END
             FROM jsonb_to_recordset($1::jsonb) AS x(task_id text, excel_row int, vals jsonb, urls jsonb, post_date text, post_time text, post_day text,
                                                     platform text, title text, content_type text, pillar text, dup_key text)
            WHERE t.id = x.task_id
        RETURNING t.id, x.excel_row
         )
         INSERT INTO task_history (task_id, actor_name, actor_role, message)
         SELECT upd.id, $7::text, 'admin',
                'Source content updated from ' || $5::text || ' › ' || $8::text || ' (row ' || upd.excel_row || ')' ||
                CASE WHEN $6::boolean THEN '; status reset to Not Started' ELSE '' END
           FROM upd`,
        [JSON.stringify(items), headers, map, dateOrder, workbook, b.reset, session.name, sheet.name],
      ),
    );
  }

  if (b.appendBatch && b.rows.length) {
    // keep the sheet's counters in step with what is really in the table
    queries.push(
      q(
        `WITH c AS (SELECT count(*)::int AS n FROM tasks WHERE import_id = $1 AND sheet_idx = $2)
         UPDATE import_sheets s SET added = s.added + GREATEST(0, c.n - s.row_count), row_count = GREATEST(c.n, s.row_count)
           FROM c WHERE s.import_id = $1 AND s.sheet_idx = $2`,
        [importId, b.sheetIdx],
      ),
      q(`UPDATE imports SET total_tasks = (SELECT COALESCE(sum(added), 0) FROM import_sheets WHERE import_id = $1) WHERE id = $1`, [importId]),
    );
  }
  if (queries.length) await tx(queries);
  return json({ ok: true, added: b.rows.length, updated: b.updates.length });
});
