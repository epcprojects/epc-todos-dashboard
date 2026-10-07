import { z } from 'zod';
import { requireSession } from '@/lib/server/auth';
import { q, tx } from '@/lib/server/db';
import { body, handle, json } from '@/lib/server/http';
import { PRUNE_DELETED } from '@/lib/server/tasks';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const schema = z.object({ sheetIdx: z.number().int().min(0) });

/** A task is untouched while nobody has worked on it: not started, no notes, no content edits, no content update from a re-upload. */
const UNTOUCHED = `t.import_id = $1 AND t.sheet_idx = $2
  AND t.status = 'not_started' AND t.started_at IS NULL AND t.completed_at IS NULL AND t.last_completed_at IS NULL
  AND t.notes = '' AND t.admin_note = '' AND t.blocked_reason = '' AND t.source_updated_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM task_history h WHERE h.task_id = t.id AND h.message NOT LIKE 'Imported from %' AND h.message NOT LIKE 'Assigned to %')`;

/** Deletes only the untouched rows of one sheet. Rows that were worked on or edited stay. Admin only. */
export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  await requireSession(req, ['admin']);
  const { id } = await ctx.params;
  const { sheetIdx } = await body(req, schema);
  const res = await tx([
    q(
      `INSERT INTO deleted_tasks (task_id, team) SELECT t.id, t.team FROM tasks t WHERE ${UNTOUCHED}
       ON CONFLICT (task_id) DO UPDATE SET deleted_at = now(), team = EXCLUDED.team`,
      [id, sheetIdx],
    ),
    q(`DELETE FROM tasks t WHERE ${UNTOUCHED} RETURNING t.id`, [id, sheetIdx]),
    q(`SELECT count(*)::int AS n FROM tasks WHERE import_id = $1 AND sheet_idx = $2`, [id, sheetIdx]),
    q(PRUNE_DELETED),
  ]);
  return json({ ok: true, deleted: res[1].length, kept: Number(res[2][0].n) });
});
