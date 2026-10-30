import { z } from 'zod';
import { cleanPath, MAX_FILES_PER_UPLOAD_REQUEST, MAX_FILE_BYTES, ROOT_PREFIX, extOf, isAllowedName, sanitizeName, uniqueName, ALLOWED_EXTENSIONS, formatBytes } from '@/lib/manage-config';
import { requireSession } from '@/lib/server/auth';
import { ApiError, body, handle, json } from '@/lib/server/http';
import { listFolder, presignUpload } from '@/lib/server/s3';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const schema = z.object({
  /** Folder below Automation-Folder, e.g. "Linkedin/Q4" ('' = the root). */
  path: z.string().max(900).default(''),
  /** true: a file whose name already exists overwrites it; false: it is saved as "name (1)". */
  replace: z.boolean().default(false),
  files: z
    .array(z.object({ name: z.string().min(1).max(1000), size: z.number().int().min(0), type: z.string().max(200).default('') }))
    .min(1)
    .max(MAX_FILES_PER_UPLOAD_REQUEST),
});

/**
 * Step 1 of an upload: the server checks the file and returns a short-lived signed form.
 * The browser then sends the file straight to S3 (so Vercel's 4.5 MB request limit never applies).
 * A name that already exists in the folder becomes "name (1).ext", unless `replace` is set (then it overwrites).
 */
export const POST = handle(async (req: Request) => {
  await requireSession(req); // every role may upload
  const b = await body(req, schema);

  const path = cleanPath(b.path);
  if (path === null) throw new ApiError(400, 'Invalid request: bad folder path');

  const existing = new Map((await listFolder(path)).map((f) => [f.name.toLowerCase(), f.name]));
  const taken = new Set(existing.keys());
  const targets = [];
  for (const f of b.files) {
    const original = sanitizeName(f.name);
    if (f.size > MAX_FILE_BYTES) throw new ApiError(413, `"${original}" is ${formatBytes(f.size)}. The largest file allowed is ${formatBytes(MAX_FILE_BYTES)}.`);
    if (!isAllowedName(original)) throw new ApiError(400, `"${original}" is not an allowed file type (${ALLOWED_EXTENSIONS.join(', ')}).`);
    // replace keeps the stored name (S3 names are case-sensitive, so reuse the existing spelling); a name used earlier in this same upload is still renamed
    const stored = b.replace ? existing.get(original.toLowerCase()) : undefined;
    const name = stored ?? uniqueName(original, taken);
    taken.add(name.toLowerCase());
    const key = `${ROOT_PREFIX}/${path ? path + '/' : ''}${name}`;
    const type = (f.type || 'application/octet-stream').replace(/[\r\n]/g, '');
    const post = await presignUpload(key, type);
    targets.push({ name, originalName: f.name, renamed: !stored && name !== original, replaced: !!stored, ext: extOf(name), key, url: post.url, fields: post.fields });
  }
  return json({ targets });
});
