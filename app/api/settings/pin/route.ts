import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { publicRoles, readSettings, requireSession, setSessionCookie } from '@/lib/server/auth';
import { q, type Row } from '@/lib/server/db';
import { ApiError, body, handle, json } from '@/lib/server/http';
import { isBaseRole } from '@/lib/server/roles';

export const dynamic = 'force-dynamic';

const schema = z.object({
  role: z.string().min(1).max(40),
  pin: z.string().regex(/^\d{4,8}$/, 'Use 4 to 8 digits for the PIN.'),
});

/** Changing a PIN bumps its version, which logs out everyone using that role. */
export const POST = handle(async (req: Request) => {
  const { session } = await requireSession(req, ['admin']);
  const { role, pin } = await body(req, schema);
  const hash = await bcrypt.hash(pin, 10);
  // Column names come from this fixed map, never from the request.
  const sqlByRole = {
    admin: `UPDATE settings SET admin_pin_hash = $1, admin_pin_version = admin_pin_version + 1, updated_at = now() WHERE id = 1 RETURNING admin_pin_version AS v`,
    designer: `UPDATE settings SET designer_pin_hash = $1, designer_pin_version = designer_pin_version + 1, updated_at = now() WHERE id = 1 RETURNING designer_pin_version AS v`,
    editor: `UPDATE settings SET editor_pin_hash = $1, editor_pin_version = editor_pin_version + 1, updated_at = now() WHERE id = 1 RETURNING editor_pin_version AS v`,
  } as const;
  let rows: Row[];
  if (isBaseRole(role)) rows = (await q(sqlByRole[role], [hash])) as Row[];
  else {
    rows = (await q(`UPDATE custom_roles SET pin_hash = $1, pin_version = pin_version + 1 WHERE key = $2 RETURNING pin_version AS v`, [hash, role])) as Row[];
    if (!rows.length) throw new ApiError(404, 'That role does not exist.');
  }
  const settings = await readSettings();
  const res = json({ ok: true, pins: settings.hasPin, roles: publicRoles(settings) });
  // The admin who changes their own PIN stays logged in on this browser.
  if (role === 'admin') await setSessionCookie(res, { role: 'admin', name: session.name, pinVersion: Number(rows[0].v) });
  return res;
});
