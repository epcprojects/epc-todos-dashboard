import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { requireSession, setSessionCookie } from '@/lib/server/auth';
import { q, type Row } from '@/lib/server/db';
import { ApiError, body, handle, json } from '@/lib/server/http';
import { assertRole } from '../route';

export const dynamic = 'force-dynamic';

const patch = z.object({
  password: z.string().min(6, 'The password needs at least 6 characters.').max(100).optional(),
  role: z.string().min(1).max(40).optional(),
});

const list = async () => {
  const rows = (await q(`SELECT id, username, role, created_at FROM users ORDER BY (role = 'admin') DESC, lower(username)`)) as Row[];
  return rows.map((r) => ({ id: Number(r.id), username: String(r.username), role: String(r.role), createdAt: String(r.created_at) }));
};

const adminCount = async () => Number(((await q(`SELECT count(*)::int AS n FROM users WHERE role = 'admin'`)) as Row[])[0].n);

/** Reset a password and/or change a role. A new password logs that person out everywhere. */
export const PATCH = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { session } = await requireSession(req, ['admin']);
  const id = Number((await ctx.params).id);
  const b = await body(req, patch);
  if (!b.password && !b.role) throw new ApiError(400, 'Nothing to change.');
  const cur = (await q(`SELECT role FROM users WHERE id = $1`, [id])) as Row[];
  if (!cur.length) throw new ApiError(404, 'That user does not exist.');
  if (b.role) {
    await assertRole(b.role);
    if (cur[0].role === 'admin' && b.role !== 'admin' && (await adminCount()) < 2) throw new ApiError(409, 'There must be at least one admin.');
  }
  const hash = b.password ? await bcrypt.hash(b.password, 10) : null;
  const rows = (await q(
    `UPDATE users SET role = COALESCE($2, role), password_hash = COALESCE($3, password_hash), version = version + ($3::text IS NOT NULL)::int WHERE id = $1 RETURNING id, username, role, version`,
    [id, b.role ?? null, hash],
  )) as Row[];
  const res = json({ ok: true, users: await list() });
  // changing your own password would log you out of this browser: keep this session alive
  if (id === session.uid) await setSessionCookie(res, { uid: id, role: String(rows[0].role), name: String(rows[0].username), pinVersion: Number(rows[0].version) });
  return res;
});

export const DELETE = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { session } = await requireSession(req, ['admin']);
  const id = Number((await ctx.params).id);
  if (id === session.uid) throw new ApiError(409, 'You cannot delete your own account.');
  const rows = (await q(`DELETE FROM users WHERE id = $1 RETURNING id`, [id])) as Row[];
  if (!rows.length) throw new ApiError(404, 'That user does not exist.');
  return json({ ok: true, users: await list() });
});
