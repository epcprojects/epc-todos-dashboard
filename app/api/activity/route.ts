import { requireSession } from '@/lib/server/auth';
import { q, type Row } from '@/lib/server/db';
import { handle, json } from '@/lib/server/http';
import { mapHistory } from '@/lib/server/tasks';

export const dynamic = 'force-dynamic';

export const GET = handle(async (req: Request) => {
  await requireSession(req, ['admin']);
  const n = Math.min(50, Math.max(1, Number(new URL(req.url).searchParams.get('limit')) || 12));
  const rows = (await q(
    `SELECT h.at, h.actor_name, h.actor_role, h.message, h.task_id, t.title
       FROM task_history h JOIN tasks t ON t.id = h.task_id
      ORDER BY h.at DESC, h.id DESC LIMIT $1`,
    [n],
  )) as Row[];
  return json({ activity: rows.map(mapHistory) });
});
