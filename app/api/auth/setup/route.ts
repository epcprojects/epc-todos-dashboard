import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { setSessionCookie } from '@/lib/server/auth';
import { q, type Row } from '@/lib/server/db';
import { ApiError, body, handle, json } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

const schema = z.object({
  pin: z.string().regex(/^\d{4,8}$/, 'Use 4 to 8 digits for the PIN.'),
  name: z.string().trim().max(40).default(''),
});

/** First-time setup: only works while no Admin PIN exists. The UPDATE is atomic, so only one caller can win. */
export const POST = handle(async (req: Request) => {
  const { pin, name } = await body(req, schema);
  const hash = await bcrypt.hash(pin, 10);
  const rows = (await q(
    `UPDATE settings SET admin_pin_hash = $1, updated_at = now() WHERE id = 1 AND admin_pin_hash IS NULL RETURNING admin_pin_version`,
    [hash],
  )) as Row[];
  if (!rows.length) throw new ApiError(409, 'The dashboard is already set up. Log in with the Admin PIN.');
  const res = json({ ok: true });
  await setSessionCookie(res, { role: 'admin', name, pinVersion: Number(rows[0].admin_pin_version) });
  return res;
});
