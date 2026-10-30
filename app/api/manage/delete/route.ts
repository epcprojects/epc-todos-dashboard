import { z } from 'zod';
import { parseKey } from '@/lib/manage-config';
import { requireSession } from '@/lib/server/auth';
import { ApiError, body, handle, json } from '@/lib/server/http';
import { dropLinks } from '@/lib/server/filelinks';
import { deleteKeys } from '@/lib/server/s3';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const schema = z.object({ keys: z.array(z.string().max(1200)).min(1).max(1000) });

/** Every signed-in role may delete. Deletes files, never folders: only "Automation-Folder/<known folder>/<file>" keys are accepted. */
export const POST = handle(async (req: Request) => {
  await requireSession(req);
  const { keys } = await body(req, schema);
  if (keys.some((k) => !parseKey(k))) throw new ApiError(400, 'Invalid request: only files inside the platform folders can be deleted');
  const r = await deleteKeys([...new Set(keys)]);
  await dropLinks(keys.filter((k) => !r.failed.includes(k)));
  return json({ ok: r.failed.length === 0, deleted: r.deleted, failed: r.failed });
});
