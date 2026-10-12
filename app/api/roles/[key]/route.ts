import { z } from 'zod';
import { publicRoles, readSettings, requireSession } from '@/lib/server/auth';
import { q, type Row } from '@/lib/server/db';
import { ApiError, body, handle, json } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

const rename = z.object({ name: z.string().trim().min(2).max(40) });

export const PATCH = handle(async (req: Request, ctx: { params: Promise<{ key: string }> }) => {
  await requireSession(req, ['admin']);
  const { key } = await ctx.params;
  const { name } = await body(req, rename);
  const dup = (await q(`SELECT 1 FROM custom_roles WHERE lower(name) = lower($1) AND key <> $2`, [name, key])) as Row[];
  if (dup.length) throw new ApiError(409, 'A role with this name already exists.');
  const rows = (await q(`UPDATE custom_roles SET name = $1 WHERE key = $2 RETURNING key`, [name, key])) as Row[];
  if (!rows.length) throw new ApiError(404, 'That role does not exist.');
  return json({ ok: true, roles: publicRoles(await readSettings()) });
});

/** A role can only be removed once no task is assigned to it (otherwise those tasks would vanish from every team view). */
export const DELETE = handle(async (req: Request, ctx: { params: Promise<{ key: string }> }) => {
  await requireSession(req, ['admin']);
  const { key } = await ctx.params;
  const n = (await q(`SELECT count(*)::int AS n FROM tasks WHERE team = $1`, [key])) as Row[];
  if (Number(n[0].n) > 0) {
    throw new ApiError(409, `${n[0].n} tasks are still assigned to this role. Reassign them in Task Distribution first.`);
  }
  await q(`UPDATE import_sheets SET team = 'unassigned' WHERE team = $1`, [key]);
  const rows = (await q(`DELETE FROM custom_roles WHERE key = $1 RETURNING key`, [key])) as Row[];
  if (!rows.length) throw new ApiError(404, 'That role does not exist.');
  return json({ ok: true, roles: publicRoles(await readSettings()) });
});
