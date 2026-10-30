import { z } from 'zod';
import { cleanPath, sanitizeFolderName } from '@/lib/manage-config';
import { requireSession } from '@/lib/server/auth';
import { ApiError, body, handle, json } from '@/lib/server/http';
import { createFolder } from '@/lib/server/s3';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const schema = z.object({ path: z.string().max(900).default(''), name: z.string().min(1).max(300) });

/** Creates an empty folder named `name` inside `path` ('' = Automation-Folder itself, next to LinkedIn, Facebook and the rest). */
export const POST = handle(async (req: Request) => {
  await requireSession(req);
  const b = await body(req, schema);
  const parent = cleanPath(b.path);
  if (parent === null) throw new ApiError(400, 'Invalid request: bad folder path');
  const name = sanitizeFolderName(b.name);
  if (!name) throw new ApiError(400, 'Enter a folder name.');
  if (!(await createFolder(parent, name))) throw new ApiError(409, `A folder named "${name}" already exists here. Choose another name.`);
  return json({ ok: true, path: parent ? `${parent}/${name}` : name });
});
