import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { ROLES } from '@/lib/constants';
import { isBaseRole, readCustomRoles } from '@/lib/server/roles';
import { setSessionCookie } from '@/lib/server/auth';
import { q, type Row } from '@/lib/server/db';
import { ApiError, body, clientIp, handle, json } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

const schema = z.object({
  role: z.string().min(1).max(40),
  pin: z.string().min(1).max(32),
  name: z.string().trim().max(40).default(''),
});

const MAX_FAILURES = 10;

export const POST = handle(async (req: Request) => {
  const { role, pin, name } = await body(req, schema);
  const ip = clientIp(req);

  const recent = (await q(`SELECT count(*)::int AS n FROM login_attempts WHERE ip = $1 AND success = false AND at > now() - interval '15 minutes'`, [ip])) as Row[];
  if (Number(recent[0].n) >= MAX_FAILURES) {
    throw new ApiError(429, 'Too many failed attempts. Please wait 15 minutes and try again.');
  }

  let hash: string | null = null;
  let version = 0;
  let label: string = role;
  if (isBaseRole(role)) {
    const rows = (await q(
      `SELECT admin_pin_hash, designer_pin_hash, editor_pin_hash, admin_pin_version, designer_pin_version, editor_pin_version FROM settings WHERE id = 1`,
    )) as Row[];
    const srow = rows[0];
    hash = srow ? (srow[`${role}_pin_hash`] as string | null) : null;
    version = srow ? Number(srow[`${role}_pin_version`]) : 0;
    label = ROLES[role];
  } else {
    const found = (await readCustomRoles()).find((r) => r.key === role);
    if (!found) throw new ApiError(400, 'That role does not exist.');
    const rows = (await q(`SELECT pin_hash, pin_version FROM custom_roles WHERE key = $1`, [role])) as Row[];
    hash = rows[0] ? (rows[0].pin_hash as string | null) : null;
    version = rows[0] ? Number(rows[0].pin_version) : 0;
    label = found.name;
  }
  if (!hash) throw new ApiError(400, `No PIN has been set for ${label} yet. Ask the admin to set one in Settings → Access PINs.`);

  const ok = await bcrypt.compare(pin, hash);
  await q(`INSERT INTO login_attempts (ip, role, success) VALUES ($1, $2, $3)`, [ip, role, ok]);
  if (Math.random() < 0.05) await q(`DELETE FROM login_attempts WHERE at < now() - interval '1 day'`);
  if (!ok) throw new ApiError(401, `That PIN is not correct for ${label}.`);

  const res = json({ ok: true, role, name });
  await setSessionCookie(res, { role, name, pinVersion: version });
  return res;
});
