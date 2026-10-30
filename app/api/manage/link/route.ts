import { z } from 'zod';
import { TEAM_FOR_KIND, mediaKind, parseKey, platformOfPath } from '@/lib/manage-config';
import { requireSession } from '@/lib/server/auth';
import { setLink } from '@/lib/server/filelinks';
import { ApiError, body, handle, json } from '@/lib/server/http';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const schema = z.object({ key: z.string().max(1200), taskId: z.string().min(1).max(200).nullable() });

/** Attaches a task to a picture or video (Graphic Designer task for pictures, Video Editor task for videos), or removes it with taskId null. */
export const POST = handle(async (req: Request) => {
  const { session } = await requireSession(req);
  const b = await body(req, schema);
  const p = parseKey(b.key);
  if (!p) throw new ApiError(400, 'Invalid request: bad file key');
  const kind = mediaKind(p.name);
  if (!kind) throw new ApiError(400, 'Tasks can only be attached to pictures and videos.');
  await setLink(b.key, b.taskId, TEAM_FOR_KIND[kind], session.name, platformOfPath(p.path));
  return json({ ok: true });
});
