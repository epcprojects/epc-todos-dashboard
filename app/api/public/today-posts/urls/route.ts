import { z } from 'zod';
import { assertToken, readPublicToday } from '@/lib/server/publicLink';
import { ApiError, body, handle, json } from '@/lib/server/http';
import { presignGet } from '@/lib/server/s3';

export const dynamic = 'force-dynamic';

const schema = z.object({ t: z.string().max(100), keys: z.array(z.string().max(1200)).min(1).max(100) });

/** Short-lived view links for thumbnails, only for files that are in today-posts. */
export const POST = handle(async (req: Request) => {
  const { t, keys } = await body(req, schema);
  assertToken(t);
  const have = new Set((await readPublicToday()).files.map((f) => f.key));
  if (keys.some((k) => !have.has(k))) throw new ApiError(404, 'That file is no longer in today-posts.');
  const urls: Record<string, string> = {};
  await Promise.all(keys.map(async (k) => (urls[k] = await presignGet(k, { seconds: 900 }))));
  return json({ urls });
});
