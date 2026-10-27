import { z } from 'zod';
import { FOLDERS, cleanPath, MAX_FILES_PER_UPLOAD_REQUEST, MAX_FILE_BYTES, ROOT_PREFIX, extOf, isAllowedName, sanitizeName, uniqueName, ALLOWED_EXTENSIONS, formatBytes } from '@/lib/manage-config';
import { requireSession } from '@/lib/server/auth';
import { ApiError, body, handle, json } from '@/lib/server/http';
import { listFolder, presignUpload } from '@/lib/server/s3';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const schema = z.object({
  folder: z.string().min(1).max(40),
  path: z.string().max(900).default(''),
  files: z
    .array(z.object({ name: z.string().min(1).max(1000), size: z.number().int().min(0), type: z.string().max(200).default('') }))
    .min(1)
    .max(MAX_FILES_PER_UPLOAD_REQUEST),
});

/**
 * Step 1 of an upload: the server checks the file and returns a short-lived signed form.
 * The browser then sends the file straight to S3 (so Vercel's 4.5 MB request limit never applies).
 * A name that already exists in the folder becomes "name (1).ext".
 */
export const POST = handle(async (req: Request) => {
  await requireSession(req); // every role may upload
  const b = await body(req, schema);
  if (!FOLDERS.some((f) => f.key === b.folder)) throw new ApiError(400, 'Invalid request: unknown folder');

  const path = cleanPath(b.path);
  if (path === null) throw new ApiError(400, 'Invalid request: bad folder path');

  const taken = new Set((await listFolder(b.folder, path)).map((f) => f.name.toLowerCase()));
  const targets = [];
  for (const f of b.files) {
    const original = sanitizeName(f.name);
    if (f.size > MAX_FILE_BYTES) throw new ApiError(413, `"${original}" is ${formatBytes(f.size)}. The largest file allowed is ${formatBytes(MAX_FILE_BYTES)}.`);
    if (!isAllowedName(original)) throw new ApiError(400, `"${original}" is not an allowed file type (${ALLOWED_EXTENSIONS.join(', ')}).`);
    const name = uniqueName(original, taken);
    taken.add(name.toLowerCase());
    const key = `${ROOT_PREFIX}/${b.folder}/${path ? path + '/' : ''}${name}`;
    const type = (f.type || 'application/octet-stream').replace(/[\r\n]/g, '');
    const post = await presignUpload(key, type);
    targets.push({ name, originalName: f.name, renamed: name !== original, ext: extOf(name), key, url: post.url, fields: post.fields });
  }
  return json({ targets });
});
