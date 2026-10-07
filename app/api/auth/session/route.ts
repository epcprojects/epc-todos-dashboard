import { getSession, readSettings } from '@/lib/server/auth';
import { handle, json } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

/** Public: tells the login screen whether setup is needed and which roles have a PIN. Never returns hashes. */
export const GET = handle(async (req: Request) => {
  const s = await getSession(req);
  const settings = s ? s.settings : await readSettings();
  return json({
    authenticated: !!s,
    role: s?.session.role,
    name: s?.session.name,
    setupNeeded: !settings.hasPin.admin,
    pins: settings.hasPin,
  });
});
