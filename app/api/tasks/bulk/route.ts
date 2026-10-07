import { z } from 'zod';
import { requireSession } from '@/lib/server/auth';
import { q } from '@/lib/server/db';
import { body, clientTz, handle, json } from '@/lib/server/http';
import { assignTeam, changeStatuses, deleteTasks, fetchLite, setArchived } from '@/lib/server/tasks';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const ids = z.array(z.string().min(1).max(200)).min(1).max(5000);

const schema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('assign'),
    ids,
    team: z.enum(['designer', 'editor', 'admin', 'unassigned']),
    // "Reassign an entire sheet" also moves the sheet's own assignment.
    sheet: z.object({ importId: z.string().max(100), sheetIdx: z.number().int() }).optional(),
  }),
  z.object({ action: z.literal('status'), ids, status: z.enum(['not_started', 'in_progress', 'completed', 'blocked']) }),
  z.object({ action: z.literal('archive'), ids, message: z.string().max(100).optional() }),
  z.object({ action: z.literal('restore'), ids }),
  z.object({ action: z.literal('delete'), ids }),
]);

/** Admin only: assign | status | archive | restore | delete on a list of task IDs (processed in slices). */
export const POST = handle(async (req: Request) => {
  const { session } = await requireSession(req, ['admin']);
  const b = await body(req, schema);
  const actor = { role: session.role, name: session.name };
  const tz = clientTz(req);

  if (b.action === 'delete') {
    return json({ ok: true, count: await deleteTasks(b.ids) });
  }
  const rows = await fetchLite(b.ids);
  switch (b.action) {
    case 'assign':
      await assignTeam(rows, b.team, actor, b.sheet ? 'Reassigned with sheet' : 'Reassigned');
      if (b.sheet) {
        await q(`UPDATE import_sheets SET team = $3 WHERE import_id = $1 AND sheet_idx = $2`, [b.sheet.importId, b.sheet.sheetIdx, b.team]);
      }
      break;
    case 'status':
      await changeStatuses(rows, b.status, actor, tz);
      break;
    case 'archive':
      await setArchived(rows, true, actor, b.message);
      break;
    case 'restore':
      await setArchived(rows, false, actor);
      break;
  }
  return json({ ok: true, count: rows.length });
});
