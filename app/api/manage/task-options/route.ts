import { z } from 'zod';
import { TEAM_FOR_KIND } from '@/lib/manage-config';
import { requireSession } from '@/lib/server/auth';
import { taskOptions } from '@/lib/server/filelinks';
import { ApiError, handle, json } from '@/lib/server/http';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const schema = z.object({ kind: z.enum(['image', 'video']) });

/** Unfinished tasks a picture (Graphic Designer) or a video (Video Editor) can be attached to. Any signed-in role may ask. */
export const GET = handle(async (req: Request) => {
  await requireSession(req);
  const parsed = schema.safeParse({ kind: new URL(req.url).searchParams.get('kind') });
  if (!parsed.success) throw new ApiError(400, 'Invalid request: kind must be image or video');
  const { kind } = parsed.data;
  return json({ tasks: await taskOptions(TEAM_FOR_KIND[kind]) });
});
