import { DeleteObjectsCommand, GetObjectCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { FOLDERS, MAX_FILE_BYTES, ROOT_PREFIX, parseKey, type ManageFile } from '@/lib/manage-config';

let client: S3Client | null = null;

function bucket(): string {
  const b = process.env.AWS_BUCKET;
  if (!b || !process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY || !process.env.AWS_REGION) throw new Error('S3_NOT_CONFIGURED');
  return b;
}

/** Created lazily so the build works without AWS settings. */
export function s3(): S3Client {
  bucket();
  if (!client) {
    client = new S3Client({
      region: process.env.AWS_REGION,
      credentials: { accessKeyId: process.env.AWS_ACCESS_KEY_ID as string, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY as string },
    });
  }
  return client;
}

/** Lists the direct children of one folder (folder markers and anything nested deeper are ignored). */
export async function listFolder(folder: string): Promise<ManageFile[]> {
  const Prefix = `${ROOT_PREFIX}/${folder}/`;
  const out: ManageFile[] = [];
  let token: string | undefined;
  do {
    const r = await s3().send(new ListObjectsV2Command({ Bucket: bucket(), Prefix, Delimiter: '/', ContinuationToken: token, MaxKeys: 1000 }));
    for (const o of r.Contents || []) {
      const p = o.Key ? parseKey(o.Key) : null;
      if (!o.Key || !p) continue;
      out.push({ key: o.Key, folder: p.folder, name: p.name, size: Number(o.Size || 0), lastModified: (o.LastModified || new Date(0)).toISOString() });
    }
    token = r.IsTruncated ? r.NextContinuationToken : undefined;
  } while (token);
  return out;
}

export async function listAll(): Promise<ManageFile[]> {
  const lists = await Promise.all(FOLDERS.map((f) => listFolder(f.key)));
  return lists.flat();
}

/** A presigned POST: S3 itself rejects files larger than MAX_FILE_BYTES or with a different content type. */
export async function presignUpload(key: string, contentType: string) {
  return createPresignedPost(s3(), {
    Bucket: bucket(),
    Key: key,
    Conditions: [['content-length-range', 0, MAX_FILE_BYTES], ['eq', '$Content-Type', contentType]],
    Fields: { 'Content-Type': contentType },
    Expires: 3600,
  });
}

export async function presignGet(key: string, opts: { download?: boolean; seconds?: number } = {}) {
  const name = parseKey(key)?.name || 'file';
  return getSignedUrl(
    s3(),
    new GetObjectCommand({
      Bucket: bucket(),
      Key: key,
      ResponseContentDisposition: `${opts.download ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(name)}`,
    }),
    { expiresIn: opts.seconds ?? 300 },
  );
}

export async function deleteKeys(keys: string[]): Promise<{ deleted: number; failed: string[] }> {
  let deleted = 0;
  const failed: string[] = [];
  for (let i = 0; i < keys.length; i += 1000) {
    const slice = keys.slice(i, i + 1000);
    const r = await s3().send(new DeleteObjectsCommand({ Bucket: bucket(), Delete: { Objects: slice.map((Key) => ({ Key })), Quiet: false } }));
    deleted += (r.Deleted || []).length;
    for (const e of r.Errors || []) if (e.Key) failed.push(e.Key);
  }
  return { deleted, failed };
}
