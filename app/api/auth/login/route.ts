import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { ROLES } from '@/lib/constants';
import { setSessionCookie } from '@/lib/server/auth';
import { q, type Row } from '@/lib/server/db';
import { ApiError, body, clientIp, handle, json } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

const schema = z.object({
  role: z.enum(['admin', 'designer', 'editor']),
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

  const rows = (await q(
    `SELECT admin_pin_hash, designer_pin_hash, editor_pin_hash, admin_pin_version, designer_pin_version, editor_pin_version FROM settings WHERE id = 1`,
  )) as Row[];
  const s = rows[0];
  const hash = s ? (s[`${role}_pin_hash`] as string | null) : null;
  const version = s ? Number(s[`${role}_pin_version`]) : 0;
  if (!hash) throw new ApiError(400, `No PIN has been set for ${ROLES[role]} yet. Ask the admin to set one in Settings → Access PINs.`);

  const ok = await bcrypt.compare(pin, hash);
  await q(`INSERT INTO login_attempts (ip, role, success) VALUES ($1, $2, $3)`, [ip, role, ok]);
  if (Math.random() < 0.05) await q(`DELETE FROM login_attempts WHERE at < now() - interval '1 day'`);
  if (!ok) throw new ApiError(401, `That PIN is not correct for ${ROLES[role]}.`);

  const res = json({ ok: true, role, name });
  await setSessionCookie(res, { role, name, pinVersion: version });
  return res;
});
