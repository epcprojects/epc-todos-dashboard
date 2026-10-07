import { z } from 'zod';
import { requireSession } from '@/lib/server/auth';
import { q, tx, type Row } from '@/lib/server/db';
import { body, handle, json } from '@/lib/server/http';
import { mapImports } from '@/lib/server/tasks';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export const GET = handle(async (req: Request) => {
  await requireSession(req, ['admin']);
  const res = await tx([q(`SELECT * FROM imports ORDER BY uploaded_at DESC`), q(`SELECT * FROM import_sheets ORDER BY import_id, sheet_idx`)]);
  return json({ imports: mapImports(res[0] as Row[], res[1] as Row[]) });
});

const mapSchema = z.object({
  date: z.number().int(),
  time: z.number().int(),
  day: z.number().int(),
  platform: z.number().int(),
  title: z.number().int(),
  type: z.number().int(),
  pillar: z.number().int(),
});

const schema = z.object({
  workbook: z.string().trim().min(1).max(300),
  mode: z.enum(['skip', 'update', 'new']),
  sheets: z
    .array(
      z.object({
        idx: z.number().int().min(0),
        name: z.string().min(1).max(300),
        team: z.enum(['designer', 'editor', 'admin', 'unassigned']),
        rows: z.number().int().min(0),
        added: z.number().int().min(0),
        updated: z.number().int().min(0),
        skipped: z.number().int().min(0),
        headers: z.array(z.string().max(2000)).max(300),
        map: mapSchema,
        dateOrder: z.enum(['dmy', 'mdy']),
      }),
    )
    .min(1)
    .max(100),
});

/** Creates the import and its sheet rows. The workbook itself is never uploaded. Returns the new import ID. */
export const POST = handle(async (req: Request) => {
  const { session } = await requireSession(req, ['admin']);
  const b = await body(req, schema);
  const id = 'i' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const total = b.sheets.reduce((a, s) => a + s.added, 0);
  await tx([
    q(`INSERT INTO imports (id, workbook, mode, status, total_tasks, uploaded_by) VALUES ($1, $2, $3, 'importing', $4, $5)`, [id, b.workbook, b.mode, total, session.name]),
    q(
      `INSERT INTO import_sheets (import_id, sheet_idx, name, team, row_count, added, updated, skipped, headers, column_map, date_order)
       SELECT $1, x.idx, x.name, x.team, x.rows, x.added, x.updated, x.skipped, x.headers, x.map, x."dateOrder"
         FROM jsonb_to_recordset($2::jsonb) AS x(idx int, name text, team text, rows int, added int, updated int, skipped int, headers jsonb, map jsonb, "dateOrder" text)`,
      [id, JSON.stringify(b.sheets)],
    ),
  ]);
  return json({ id });
});
