/* Settings and pure helpers for the "Manage" file explorer. Shared by the browser and the server. */

/** Everything lives under this prefix in the bucket: <bucket>/Automation-Folder/<folder>/<file>. */
export const ROOT_PREFIX = 'Automation-Folder';

/** The folders that exist. `key` is the exact folder name in S3, `label` is what people see. */
export const FOLDERS: { key: string; label: string }[] = [
  { key: 'Linkedin', label: 'LinkedIn' },
  { key: 'Facebook', label: 'Facebook' },
  { key: 'Instagram', label: 'Instagram' },
  { key: 'Tiktok', label: 'TikTok' },
  { key: 'Youtube', label: 'YouTube' },
];

/** Largest single file: 5 GiB, the S3 limit for one upload request (S3 enforces it on the upload itself). */
export const MAX_FILE_BYTES = 5 * 1024 * 1024 * 1024;

/**
 * File types people may upload, as lowercase extensions without the dot, e.g. ['jpg', 'png', 'mp4', 'pdf'].
 * An EMPTY list means every file type is allowed. Add or remove entries here to restrict uploads;
 * the browser checks before uploading and the server checks again before it signs an upload.
 */
export const ALLOWED_EXTENSIONS: string[] = [];

/** Extensions that can be previewed as a thumbnail in the grid view. */
export const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'bmp'];
export const VIDEO_EXTENSIONS = ['mp4', 'mov', 'webm', 'm4v'];

export const MAX_FILES_PER_UPLOAD_REQUEST = 50;

export const folderByKey = (key: string) => FOLDERS.find((f) => f.key === key);

export function extOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i > 0 && i < name.length - 1 ? name.slice(i + 1).toLowerCase() : '';
}

export function isAllowedName(name: string, allowed: string[] = ALLOWED_EXTENSIONS): boolean {
  if (!allowed.length) return true;
  return allowed.map((e) => e.toLowerCase().replace(/^\./, '')).includes(extOf(name));
}

/** Makes a file name safe as the last part of an S3 key: no folders, no control characters, bounded length. */
export function sanitizeName(raw: string): string {
  let n = String(raw || '')
    .replace(/[\\/]+/g, '_')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim();
  n = n.replace(/^\.+/, '');
  if (n.length > 200) {
    const e = extOf(n);
    n = n.slice(0, 200 - (e ? e.length + 1 : 0)) + (e ? '.' + e : '');
  }
  return n || 'file';
}

/** "photo.jpg" -> "photo (1).jpg" -> "photo (2).jpg" … until the name is free (compared case-insensitively). */
export function uniqueName(name: string, taken: Set<string>): string {
  const has = (n: string) => taken.has(n.toLowerCase());
  if (!has(name)) return name;
  const i = name.lastIndexOf('.');
  const base = i > 0 ? name.slice(0, i) : name;
  const ext = i > 0 ? name.slice(i) : '';
  for (let n = 1; ; n++) {
    const c = `${base} (${n})${ext}`;
    if (!has(c)) return c;
  }
}

export interface ManageFile {
  key: string;
  folder: string;
  name: string;
  size: number;
  lastModified: string;
}

/** Validates "Automation-Folder/<known folder>/<file name>"; returns null for anything else (no nesting, no "..", no folder markers). */
export function parseKey(key: string): { folder: string; name: string } | null {
  const prefix = ROOT_PREFIX + '/';
  if (!key.startsWith(prefix)) return null;
  const rest = key.slice(prefix.length);
  const i = rest.indexOf('/');
  if (i <= 0) return null;
  const folder = rest.slice(0, i);
  const name = rest.slice(i + 1);
  if (!folderByKey(folder) || !name || name.includes('/') || name === '.' || name === '..') return null;
  return { folder, name };
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const u = ['KB', 'MB', 'GB', 'TB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v >= 100 ? v.toFixed(0) : v.toFixed(1)} ${u[i]}`;
}
