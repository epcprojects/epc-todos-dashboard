import { z } from 'zod';
import { FIELDS, type ColumnMap } from '@/lib/constants';
import { parseDateText, type DateOrder } from '@/lib/dates';
import { guessMap } from '@/lib/mapping';
import { dupKey, deriveFields, genericHeads, headersFromValues } from '@/lib/text';
import { requireSession } from '@/lib/server/auth';
import { q, tx, type Row } from '@/lib/server/db';
import { ApiError, body, handle, json } from '@/lib/server/http';
import { historyQuery, PRUNE_DELETED } from '@/lib/server/tasks';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const schema = z.object({ sheetIdx: z.number().int().min(0) });

/**
 * The "Use row N as column names" repair: the first task of a sheet imported without column names actually holds
 * the headers. Rename the columns on every task of the sheet and remove that extra task.
 */
export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { session } = await requireSession(req, ['admin']);
  const { id: importId } = await ctx.params;
  const { sheetIdx } = await body(req, schema);

  const res = (await tx([
    q(`SELECT headers, column_map FROM import_sheets WHERE import_id = $1 AND sheet_idx = $2`, [importId, sheetIdx]),
    q(`SELECT id, excel_row, vals, post_date::text AS post_date, date_order, sheet FROM tasks WHERE import_id = $1 AND sheet_idx = $2 ORDER BY excel_row`, [importId, sheetIdx]),
  ])) as Row[][];
  if (!res[0].length) throw new ApiError(404, 'Sheet not found.');
  if (!genericHeads(res[0][0].headers)) throw new ApiError(409, 'This sheet already has column names.');
  const tasks = res[1];
  if (!tasks.length) throw new ApiError(404, 'There is no task to take the column names from.');

  const head = tasks[0];
  const heads = headersFromValues((head.vals as string[]) || []);
  const guessed = guessMap(heads);
  const old = (res[0][0].column_map || {}) as Partial<ColumnMap>;
  const map = {} as ColumnMap;
  FIELDS.forEach((f) => {
    map[f.k] = old[f.k] != null && (old[f.k] as number) >= 0 ? (old[f.k] as number) : guessed[f.k];
  });

  const others = tasks.slice(1);
  const items = others.map((t) => {
    const vals = (t.vals as string[]) || [];
    const d = deriveFields(vals, map);
    let postDate: string | null = t.post_date ? String(t.post_date) : null;
    if (!postDate && map.date >= 0) postDate = parseDateText(vals[map.date], (t.date_order as DateOrder) || 'dmy');
    return {
      id: String(t.id),
      post_date: postDate,
      post_time: d.time,
      post_day: d.day,
      platform: d.platform,
      title: d.title,
      content_type: d.type,
      pillar: d.pillar,
      dup_key: dupKey(String(t.sheet), postDate, d.platform, d.title, vals),
    };
  });
  const headId = String(head.id);
  const headRow = Number(head.excel_row);
  const headersJson = JSON.stringify(heads);
  const mapJson = JSON.stringify(map);

  const queries = [
    q(
      `UPDATE tasks t SET headers = $2::jsonb, column_map = $3::jsonb, post_date = NULLIF(x.post_date, '')::date, post_time = x.post_time, post_day = x.post_day,
              platform = x.platform, title = x.title, content_type = x.content_type, pillar = x.pillar, dup_key = x.dup_key, updated_at = now()
         FROM jsonb_to_recordset($1::jsonb) AS x(id text, post_date text, post_time text, post_day text, platform text, title text, content_type text, pillar text, dup_key text)
        WHERE t.id = x.id`,
      [JSON.stringify(items), headersJson, mapJson],
    ),
    historyQuery(items.map((i) => ({ id: i.id, msg: `Column names taken from Excel row ${headRow}` })), { role: 'admin', name: session.name }),
    q(`INSERT INTO deleted_tasks (task_id, team) SELECT id, team FROM tasks WHERE id = $1 ON CONFLICT (task_id) DO UPDATE SET deleted_at = now()`, [headId]),
    q(`DELETE FROM tasks WHERE id = $1`, [headId]),
    q(
      `UPDATE import_sheets SET headers = $3::jsonb, column_map = $4::jsonb, row_count = GREATEST(0, row_count - 1), added = GREATEST(0, added - 1)
        WHERE import_id = $1 AND sheet_idx = $2`,
      [importId, sheetIdx, headersJson, mapJson],
    ),
    q(`UPDATE imports SET total_tasks = GREATEST(0, total_tasks - 1) WHERE id = $1`, [importId]),
    q(PRUNE_DELETED),
  ];
  await tx(queries);
  return json({ ok: true, renamed: items.length, removedTask: headId });
});
