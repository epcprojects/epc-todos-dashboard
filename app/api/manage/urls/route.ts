import { z } from 'zod';
import { parseKey } from '@/lib/manage-config';
import { requireSession } from '@/lib/server/auth';
import { ApiError, body, handle, json } from '@/lib/server/http';
import { presignGet } from '@/lib/server/s3';

export const dynamic = 'force-dynamic';

const schema = z.object({ keys: z.array(z.string().max(1200)).min(1).max(100) });

/** Short-lived view links for thumbnails in the grid. The bucket itself stays private. */
export const POST = handle(async (req: Request) => {
  await requireSession(req);
  const { keys } = await body(req, schema);
  if (keys.some((k) => !parseKey(k))) throw new ApiError(400, 'Invalid request: bad file key');
  const urls: Record<string, string> = {};
  await Promise.all(keys.map(async (k) => (urls[k] = await presignGet(k, { seconds: 900 }))));
  return json({ urls });
});
