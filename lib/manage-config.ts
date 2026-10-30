/* Settings and pure helpers for the "Manage" file explorer. Shared by the browser and the server. */

/** Everything lives under this prefix in the bucket: <bucket>/Automation-Folder/<any folders>/<file>. */
export const ROOT_PREFIX = 'Automation-Folder';

/** Folders always shown at the top level, even while empty. `key` is the exact folder name in S3, `label` is what people see. More can be created in the app. */
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

/** Which kind of task can be attached to a file: pictures go with Graphic Designer tasks, videos with Video Editor tasks. */
export type MediaKind = 'image' | 'video';
export function mediaKind(name: string): MediaKind | null {
  const e = extOf(name);
  return IMAGE_EXTENSIONS.includes(e) ? 'image' : VIDEO_EXTENSIONS.includes(e) ? 'video' : null;
}
/**
 * The platform a folder stands for, as the lowercase word a task's platform contains ("linkedin", "tiktok" …):
 * the first folder below Automation-Folder when it is one of the five platform folders, otherwise null
 * (files in any other folder can be attached to a task of any platform).
 */
export function platformOfPath(path: string): string | null {
  const first = (path.split('/')[0] || '').toLowerCase();
  return FOLDERS.some((f) => f.key.toLowerCase() === first) ? first : null;
}
export const TEAM_FOR_KIND: Record<MediaKind, string> = { image: 'designer', video: 'editor' };

/** The task attached to a file, with the pieces Content Manage shows (the caption is read from the task each time). */
export interface FileLink {
  taskId: string;
  title: string;
  platform: string;
  postDate: string | null;
  team: string;
  status: string;
  founder: boolean;
  caption: string;
}

/** A task offered in the "attach a task" dropdown. */
export interface TaskOption {
  id: string;
  /** not_started | in_progress | completed | blocked */
  status: string;
  title: string;
  platform: string;
  postDate: string | null;
  founder: boolean;
}

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
  /** Folder below Automation-Folder, e.g. "Linkedin/Campaigns/Q4" ('' for a file directly in Automation-Folder). */
  path: string;
  name: string;
  size: number;
  lastModified: string;
}

const badSegment = (s: string) => !s || s === '.' || s === '..';

/** Validates a folder path such as "Linkedin/Q4"; returns it cleaned ('' = the root), or null when unsafe. */
export function cleanPath(raw: string): string | null {
  const segs = String(raw || '').split('/').filter((x) => x !== '');
  if (segs.some(badSegment) || segs.join('/').length > 900) return null;
  return segs.join('/');
}

/** Makes a typed folder name safe as one path segment: no slashes, no control characters, bounded length. */
export function sanitizeFolderName(raw: string): string {
  const n = String(raw || '')
    .replace(/[\\/]+/g, '_')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, 100)
    .trim();
  return badSegment(n) ? '' : n;
}

/** Validates "Automation-Folder/[<folders>/]<file name>"; null for anything else (no "..", no folder markers). */
export function parseKey(key: string): { path: string; name: string } | null {
  const prefix = ROOT_PREFIX + '/';
  if (!key.startsWith(prefix)) return null;
  const segs = key.slice(prefix.length).split('/');
  const name = segs.pop() as string;
  if (badSegment(name) || segs.some(badSegment)) return null;
  return { path: segs.join('/'), name };
}

/** A folder marker object ("Automation-Folder/Linkedin/Campaigns/") as made by the S3 console or by New folder; null for files. */
export function parseFolderKey(key: string): string | null {
  if (!key.endsWith('/') || !key.startsWith(ROOT_PREFIX + '/')) return null;
  const segs = key.slice(ROOT_PREFIX.length + 1, -1).split('/');
  return segs.some(badSegment) ? null : segs.join('/');
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
