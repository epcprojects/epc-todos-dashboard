import { assertToken, readPublicToday } from '@/lib/server/publicLink';
import { handle, json } from '@/lib/server/http';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/** No login: anyone holding the secret link may list the last 24 hours of images and videos. Read-only. */
export const GET = handle(async (req: Request) => {
  assertToken(new URL(req.url).searchParams.get('t'));
  return json(await readPublicToday());
});
