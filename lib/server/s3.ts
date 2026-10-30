import { CopyObjectCommand, DeleteObjectsCommand, PutObjectCommand, GetObjectCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { MAX_FILE_BYTES, ROOT_PREFIX, parseFolderKey, parseKey, type ManageFile } from '@/lib/manage-config';

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

const toFile = (o: { Key?: string; Size?: number; LastModified?: Date }): ManageFile | null => {
  const p = o.Key ? parseKey(o.Key) : null;
  if (!o.Key || !p) return null;
  return { key: o.Key, path: p.path, name: p.name, size: Number(o.Size || 0), lastModified: (o.LastModified || new Date(0)).toISOString() };
};

const dirPrefix = (path: string) => `${ROOT_PREFIX}/${path ? path + '/' : ''}`;

/** Lists the files directly inside one folder (`path` is the folder below Automation-Folder, '' for the root). */
export async function listFolder(path = ''): Promise<ManageFile[]> {
  const out: ManageFile[] = [];
  let token: string | undefined;
  do {
    const r = await s3().send(new ListObjectsV2Command({ Bucket: bucket(), Prefix: dirPrefix(path), Delimiter: '/', ContinuationToken: token, MaxKeys: 1000 }));
    for (const o of r.Contents || []) {
      const f = toFile(o);
      if (f) out.push(f);
    }
    token = r.IsTruncated ? r.NextContinuationToken : undefined;
  } while (token);
  return out;
}

/** The names of the folders directly inside `path` (from folder markers and from files nested deeper). */
export async function listChildFolders(path = ''): Promise<string[]> {
  const out: string[] = [];
  let token: string | undefined;
  do {
    const r = await s3().send(new ListObjectsV2Command({ Bucket: bucket(), Prefix: dirPrefix(path), Delimiter: '/', ContinuationToken: token, MaxKeys: 1000 }));
    for (const p of r.CommonPrefixes || []) {
      const name = (p.Prefix || '').slice(dirPrefix(path).length).replace(/\/$/, '');
      if (name) out.push(name);
    }
    token = r.IsTruncated ? r.NextContinuationToken : undefined;
  } while (token);
  return out;
}

/** Every file at any depth below Automation-Folder, plus every folder (including empty ones made in the S3 console or with New folder). */
export async function listAll(): Promise<{ files: ManageFile[]; folders: string[] }> {
  const files: ManageFile[] = [];
  const folders: string[] = [];
  let token: string | undefined;
  do {
    const r = await s3().send(new ListObjectsV2Command({ Bucket: bucket(), Prefix: `${ROOT_PREFIX}/`, ContinuationToken: token, MaxKeys: 1000 }));
    for (const o of r.Contents || []) {
      const file = toFile(o);
      if (file) files.push(file);
      else if (o.Key) {
        const d = parseFolderKey(o.Key);
        if (d) folders.push(d);
      }
    }
    token = r.IsTruncated ? r.NextContinuationToken : undefined;
  } while (token);
  return { files, folders };
}

/** Creates an (empty) folder as a zero-byte "folder/" marker object, like the S3 console does. Returns false when the name is taken. */
export async function createFolder(parent: string, name: string): Promise<boolean> {
  const taken = (await listChildFolders(parent)).some((n) => n.toLowerCase() === name.toLowerCase());
  if (taken) return false;
  await s3().send(new PutObjectCommand({ Bucket: bucket(), Key: `${dirPrefix(parent)}${name}/`, Body: '' }));
  return true;
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

/** S3 has no rename: copy to the new key, then delete the old one. Returns null when the new name is already taken. */
export async function renameObject(key: string, newName: string): Promise<string | null> {
  const p = parseKey(key);
  if (!p) throw new Error('BAD_KEY');
  const target = `${dirPrefix(p.path)}${newName}`;
  if (target === key) return key;
  const taken = (await listFolder(p.path)).some((f) => f.key !== key && f.name.toLowerCase() === newName.toLowerCase());
  if (taken) return null;
  await s3().send(new CopyObjectCommand({ Bucket: bucket(), Key: target, CopySource: `${bucket()}/${key.split('/').map(encodeURIComponent).join('/')}` }));
  await s3().send(new DeleteObjectsCommand({ Bucket: bucket(), Delete: { Objects: [{ Key: key }], Quiet: true } }));
  return target;
}
