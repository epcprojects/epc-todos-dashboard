import { requireSession } from '@/lib/server/auth';
import { q, type Row } from '@/lib/server/db';
import { handle, json } from '@/lib/server/http';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Archives every active task of the import (they leave team views and reports but can be restored). */
export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { session } = await requireSession(req, ['admin']);
  const { id } = await ctx.params;
  const rows = (await q(
    `WITH a AS (UPDATE tasks SET archived = true, updated_at = now() WHERE import_id = $1 AND NOT archived RETURNING id)
     INSERT INTO task_history (task_id, actor_name, actor_role, message) SELECT id, $2::text, 'admin', 'Archived with import' FROM a RETURNING task_id`,
    [id, session.name],
  )) as Row[];
  return json({ ok: true, count: rows.length });
});
