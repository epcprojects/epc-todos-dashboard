import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { readSettings, requireSession } from '@/lib/server/auth';
import { q, type Row } from '@/lib/server/db';
import { ApiError, body, handle, json } from '@/lib/server/http';
import { isBaseRole } from '@/lib/server/roles';

export const dynamic = 'force-dynamic';

const USERNAME = /^[a-z0-9][a-z0-9._-]{1,29}$/;

export const createSchema = z.object({
  username: z.string().trim().toLowerCase().regex(USERNAME, 'Username: 2–30 letters, digits, dot, dash or underscore.'),
  password: z.string().min(6, 'The password needs at least 6 characters.').max(100),
  role: z.string().min(1).max(40),
});

const list = async () => {
  const rows = (await q(`SELECT id, username, role, created_at FROM users ORDER BY (role = 'admin') DESC, lower(username)`)) as Row[];
  return rows.map((r) => ({ id: Number(r.id), username: String(r.username), role: String(r.role), createdAt: String(r.created_at) }));
};

/** Only the admin may see or manage accounts. Hashes never leave the server. */
export const GET = handle(async (req: Request) => {
  await requireSession(req, ['admin']);
  return json({ users: await list() });
});

export async function assertRole(role: string) {
  if (isBaseRole(role)) return;
  const { custom } = await readSettings();
  if (!custom.some((c) => c.key === role)) throw new ApiError(400, 'That role does not exist.');
}

export const POST = handle(async (req: Request) => {
  await requireSession(req, ['admin']);
  const { username, password, role } = await body(req, createSchema);
  await assertRole(role);
  try {
    await q(`INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3)`, [username, await bcrypt.hash(password, 10), role]);
  } catch (e) {
    if ((e as { code?: string })?.code === '23505') throw new ApiError(409, 'That username is already taken.');
    if ((e as { code?: string })?.code === '42P01') throw new ApiError(500, 'Accounts need a one-time database update: run migrations/004_users.sql in the Neon SQL Editor.');
    throw e;
  }
  return json({ ok: true, users: await list() });
});
