import { z } from 'zod';
import { TEAM_FOR_KIND, mediaKind, parseKey, platformOfPath } from '@/lib/manage-config';
import { requireSession } from '@/lib/server/auth';
import { setLink } from '@/lib/server/filelinks';
import { ApiError, body, clientTz, handle, json } from '@/lib/server/http';
import { changeStatuses, fetchLite, historyQuery } from '@/lib/server/tasks';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const schema = z.object({ key: z.string().max(1200), taskId: z.string().min(1).max(200).nullable() });

/**
 * Attaches a task to a picture or video (Graphic Designer task for pictures, Video Editor task for videos), or removes it with taskId null.
 * Attaching a file marks a task that is not completed yet as Completed (with a history entry); removing a link changes nothing.
 */
export const POST = handle(async (req: Request) => {
  const { session } = await requireSession(req);
  const b = await body(req, schema);
  const p = parseKey(b.key);
  if (!p) throw new ApiError(400, 'Invalid request: bad file key');
  const kind = mediaKind(p.name);
  if (!kind) throw new ApiError(400, 'Tasks can only be attached to pictures and videos.');
  await setLink(b.key, b.taskId, TEAM_FOR_KIND[kind], session.name, platformOfPath(p.path));
  let completed = false;
  if (b.taskId) {
    const actor = { role: session.role, name: session.name };
    const [t] = await fetchLite([b.taskId]);
    if (t && t.status !== 'completed') {
      await changeStatuses([t], 'completed', actor, clientTz(req));
      completed = true;
    }
    await historyQuery([{ id: b.taskId, msg: `File attached in Content Manage: ${p.path ? p.path + '/' : ''}${p.name}` }], actor);
  }
  return json({ ok: true, completed });
});
