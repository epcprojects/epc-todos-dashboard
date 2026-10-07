import { canRead } from '@/lib/perms';
import { requireSession } from '@/lib/server/auth';
import { q, type Row } from '@/lib/server/db';
import { ApiError, handle, json } from '@/lib/server/http';
import { mapHistory } from '@/lib/server/tasks';

export const dynamic = 'force-dynamic';

export const GET = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { session } = await requireSession(req);
  const { id } = await ctx.params;
  const t = (await q(`SELECT team, archived FROM tasks WHERE id = $1`, [id])) as Row[];
  if (!t.length || !canRead(session.role, { team: t[0].team as never, archived: !!t[0].archived })) throw new ApiError(404, 'Task not found.');
  const rows = (await q(
    `SELECT at, actor_name, actor_role, message FROM task_history WHERE task_id = $1 ORDER BY at DESC, id DESC LIMIT 100`,
    [id],
  )) as Row[];
  return json({ history: rows.map(mapHistory) });
});
