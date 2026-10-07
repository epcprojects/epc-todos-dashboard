import { clearSessionCookie } from '@/lib/server/auth';
import { handle, json } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

export const POST = handle(async () => {
  const res = json({ ok: true });
  clearSessionCookie(res);
  return res;
});
