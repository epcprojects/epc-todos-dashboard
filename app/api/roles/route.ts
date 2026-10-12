import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { BASE_TEAMS, RESERVED_ROLE_KEYS } from '@/lib/constants';
import { publicRoles, readSettings, requireSession } from '@/lib/server/auth';
import { q } from '@/lib/server/db';
import { ApiError, body, handle, json } from '@/lib/server/http';
import { readCustomRoles } from '@/lib/server/roles';

export const dynamic = 'force-dynamic';

const schema = z.object({
  name: z.string().trim().min(2, 'Give the role a name (at least 2 characters).').max(40),
  pin: z.string().regex(/^\d{4,8}$/, 'Use 4 to 8 digits for the PIN.'),
});

const slug = (name: string) =>
  name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 28);

/** Admin creates a role with its own PIN. Members of the role see only the tasks assigned to it. */
export const POST = handle(async (req: Request) => {
  await requireSession(req, ['admin']);
  const { name, pin } = await body(req, schema);
  let key = slug(name);
  if (key.length < 2) throw new ApiError(400, 'Invalid request: the name needs letters or digits.');
  const existing = await readCustomRoles();
  if (['admin', 'administrator', 'designer', 'graphic designer', 'editor', 'video editor', 'unassigned', 'admin only'].includes(name.toLowerCase())) {
    throw new ApiError(409, 'That name is already used by a built-in role. Choose a different name.');
  }
  if (RESERVED_ROLE_KEYS.includes(key) || key in BASE_TEAMS) key = key + '-team';
  if (existing.some((r) => r.name.toLowerCase() === name.toLowerCase())) throw new ApiError(409, 'A role with this name already exists.');
  const keys = new Set(existing.map((r) => r.key));
  let k = key;
  for (let i = 2; keys.has(k); i++) k = `${key}-${i}`;
  try {
    await q(`INSERT INTO custom_roles (key, name, pin_hash) VALUES ($1, $2, $3)`, [k, name, await bcrypt.hash(pin, 10)]);
  } catch (e) {
    if ((e as { code?: string })?.code === '42P01') {
      throw new ApiError(500, 'Custom roles need a one-time database update: run migrations/001_custom_roles.sql in the Neon SQL Editor, then try again.');
    }
    throw e;
  }
  return json({ ok: true, key: k, roles: publicRoles(await readSettings()) });
});
