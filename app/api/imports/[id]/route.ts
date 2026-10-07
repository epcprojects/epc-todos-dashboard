import { requireSession } from '@/lib/server/auth';
import { q, tx } from '@/lib/server/db';
import { ApiError, handle, json } from '@/lib/server/http';
import { PRUNE_DELETED } from '@/lib/server/tasks';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Permanently deletes an import with its sheets, tasks and history (ON DELETE CASCADE). Admin only. */
export const DELETE = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  await requireSession(req, ['admin']);
  const { id } = await ctx.params;
  const res = await tx([
    q(
      `INSERT INTO deleted_tasks (task_id, team) SELECT id, team FROM tasks WHERE import_id = $1
       ON CONFLICT (task_id) DO UPDATE SET deleted_at = now(), team = EXCLUDED.team RETURNING task_id`,
      [id],
    ),
    q(`DELETE FROM imports WHERE id = $1 RETURNING id`, [id]),
    q(PRUNE_DELETED),
  ]);
  if (!res[1].length) throw new ApiError(404, 'Import not found.');
  return json({ ok: true, removedTasks: res[0].length });
});
