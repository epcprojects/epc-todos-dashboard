import { z } from 'zod';
import { requireSession } from '@/lib/server/auth';
import { iso, q, tx, type Row } from '@/lib/server/db';
import { ApiError, handle, json } from '@/lib/server/http';
import { mapTask, PRUNE_DELETED, TASK_COLS } from '@/lib/server/tasks';

export const dynamic = 'force-dynamic';

const PAGE = 300; // keeps every response well under Vercel's 4.5 MB limit
const SINCE_LIMIT = 400;

/** $1 = caller's role. Admin sees everything; a team sees only its own, non-archived tasks. */
const IN_SCOPE = `($1::text = 'admin' OR (team = $1::text AND NOT archived))`;

const query = z.object({
  since: z.string().optional(),
  cursor: z.string().max(200).optional(),
});

/**
 * GET /api/tasks                -> first page of the caller's scope (follow `nextCursor` for the rest)
 * GET /api/tasks?since=<ISO>    -> only tasks changed since then, plus removed IDs and the next serverTime
 */
export const GET = handle(async (req: Request) => {
  const { session } = await requireSession(req);
  const sp = new URL(req.url).searchParams;
  const parsed = query.parse({ since: sp.get('since') ?? undefined, cursor: sp.get('cursor') ?? undefined });
  const role = session.role;

  if (parsed.since) {
    const d = new Date(parsed.since);
    if (Number.isNaN(d.getTime())) throw new ApiError(400, 'Invalid request: since must be an ISO timestamp');
    const since = d.toISOString();
    const res = await tx([
      q(`SELECT ${TASK_COLS} FROM tasks WHERE ${IN_SCOPE} AND updated_at > $2::timestamptz ORDER BY updated_at LIMIT ${SINCE_LIMIT + 1}`, [role, since]),
      // Tasks that changed but are no longer in this caller's scope (reassigned to the other team, or archived).
      q(`SELECT id FROM tasks WHERE updated_at > $2::timestamptz AND NOT ${IN_SCOPE}`, [role, since]),
      q(`SELECT task_id FROM deleted_tasks WHERE deleted_at > $2::timestamptz AND ($1::text = 'admin' OR team = $1::text)`, [role, since]),
      q(`SELECT now() AS t`),
    ]);
    if (Math.random() < 0.05) await q(PRUNE_DELETED);
    const changed = res[0] as Row[];
    const serverTime = iso(res[3][0].t) as string;
    if (changed.length > SINCE_LIMIT) return json({ reload: true, serverTime });
    return json({
      tasks: changed.map(mapTask),
      deleted: res[2].map((r) => String(r.task_id)),
      // deleted + moved to the other team + archived: everything the caller must drop from its local list
      removed: [...new Set([...res[1].map((r) => String(r.id)), ...res[2].map((r) => String(r.task_id))])],
      serverTime,
    });
  }

  const cursor = parsed.cursor ?? '';
  const res = await tx([
    q(`SELECT ${TASK_COLS} FROM tasks WHERE ${IN_SCOPE} AND id > $2 ORDER BY id LIMIT ${PAGE + 1}`, [role, cursor]),
    q(`SELECT now() AS t`),
  ]);
  const rows = res[0] as Row[];
  const more = rows.length > PAGE;
  const page = more ? rows.slice(0, PAGE) : rows;
  return json({
    tasks: page.map(mapTask),
    nextCursor: more ? String(page[page.length - 1].id) : null,
    serverTime: iso(res[1][0].t),
  });
});
