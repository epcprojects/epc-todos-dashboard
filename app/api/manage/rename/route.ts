import { z } from 'zod';
import { isAllowedName, ALLOWED_EXTENSIONS, parseKey, sanitizeName } from '@/lib/manage-config';
import { requireSession } from '@/lib/server/auth';
import { ApiError, body, handle, json } from '@/lib/server/http';
import { moveLink } from '@/lib/server/filelinks';
import { renameObject } from '@/lib/server/s3';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const schema = z.object({ key: z.string().max(1200), name: z.string().min(1).max(1000) });

/** Renames one file in place (same folder). A name that is already taken is refused, never overwritten. */
export const POST = handle(async (req: Request) => {
  await requireSession(req);
  const b = await body(req, schema);
  if (!parseKey(b.key)) throw new ApiError(400, 'Invalid request: bad file key');
  const name = sanitizeName(b.name);
  if (!isAllowedName(name)) throw new ApiError(400, `"${name}" is not an allowed file type (${ALLOWED_EXTENSIONS.join(', ')}).`);
  const key = await renameObject(b.key, name);
  if (key === null) throw new ApiError(409, `A file named "${name}" already exists in this folder. Choose another name.`);
  if (key !== b.key) await moveLink(b.key, key);
  return json({ ok: true, key, name });
});
