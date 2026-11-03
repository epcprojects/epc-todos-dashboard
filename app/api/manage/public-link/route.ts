import { requireSession } from '@/lib/server/auth';
import { handle, json } from '@/lib/server/http';
import { todayToken } from '@/lib/server/publicLink';

export const dynamic = 'force-dynamic';

/** Admin only: the secret part of the public today-posts link. */
export const GET = handle(async (req: Request) => {
  await requireSession(req, ['admin']);
  return json({ token: todayToken() });
});
