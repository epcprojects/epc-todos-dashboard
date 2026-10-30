import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { setSessionCookie } from '@/lib/server/auth';
import { q, type Row } from '@/lib/server/db';
import { ApiError, body, clientIp, handle, json } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

const schema = z.object({
  username: z.string().trim().min(1, 'Enter your username.').max(40),
  password: z.string().min(1, 'Enter your password.').max(100),
});

const MAX_FAILURES = 10;
// compared against when the username does not exist, so a wrong username and a wrong password take the same time
const DUMMY_HASH = '$2b$10$AUlKab9wxCy.9Zft8xkUmeeyzLIun4ur3U465GILDbWss3.NwzZjm';

export const POST = handle(async (req: Request) => {
  const { username, password } = await body(req, schema);
  const ip = clientIp(req);

  const recent = (await q(`SELECT count(*)::int AS n FROM login_attempts WHERE ip = $1 AND success = false AND at > now() - interval '15 minutes'`, [ip])) as Row[];
  if (Number(recent[0].n) >= MAX_FAILURES) {
    throw new ApiError(429, 'Too many failed attempts. Please wait 15 minutes and try again.');
  }

  const rows = (await q(`SELECT id, username, password_hash, role, version FROM users WHERE lower(username) = lower($1)`, [username])) as Row[];
  const u = rows[0];
  const ok = await bcrypt.compare(password, u ? String(u.password_hash) : DUMMY_HASH);
  await q(`INSERT INTO login_attempts (ip, role, success) VALUES ($1, $2, $3)`, [ip, username.slice(0, 40), !!u && ok]);
  if (Math.random() < 0.05) await q(`DELETE FROM login_attempts WHERE at < now() - interval '1 day'`);
  if (!u || !ok) throw new ApiError(401, 'Wrong username or password.');

  const res = json({ ok: true, role: String(u.role), name: String(u.username) });
  await setSessionCookie(res, { uid: Number(u.id), role: String(u.role), name: String(u.username), pinVersion: Number(u.version) });
  return res;
});
