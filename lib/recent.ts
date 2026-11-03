import { mediaKind, type ManageFile, type MediaKind } from '@/lib/manage-config';

/** The virtual "today-posts" folder: not stored in S3, it is every image and video uploaded in the last 24 hours. */
export const TODAY_FOLDER = 'today-posts';
export const RECENT_MS = 24 * 60 * 60 * 1000;
/** Days and times are shown in Pakistan time. */
export const TZ = 'Asia/Karachi';

const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const dayKey = (t: number) => dayFmt.format(new Date(t));
const niceDay = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' });
const timeFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true });
export const uploadTime = (iso: string) => timeFmt.format(new Date(iso)).toUpperCase();

export interface RecentDay {
  key: string;
  label: string;
  images: ManageFile[];
  videos: ManageFile[];
}

/** Images and videos from the last 24 hours (rolling), newest first. */
export function recentMedia(files: ManageFile[], now = Date.now()): ManageFile[] {
  return files
    .filter((f) => {
      const t = Date.parse(f.lastModified);
      return mediaKind(f.name) !== null && t >= now - RECENT_MS && t <= now + 5 * 60 * 1000;
    })
    .sort((a, b) => b.lastModified.localeCompare(a.lastModified) || a.name.localeCompare(b.name));
}

/** Groups by calendar day in Pakistan time (a rolling 24 hours can span two dates), then Images / Videos. */
export function groupRecent(files: ManageFile[], now = Date.now(), only: '' | MediaKind = ''): RecentDay[] {
  const today = dayKey(now);
  const yesterday = dayKey(now - 24 * 60 * 60 * 1000);
  const days = new Map<string, RecentDay>();
  for (const f of recentMedia(files, now)) {
    const kind = mediaKind(f.name);
    if (only && kind !== only) continue;
    const k = dayKey(Date.parse(f.lastModified));
    if (!days.has(k)) {
      const pretty = niceDay.format(new Date(Date.parse(f.lastModified)));
      days.set(k, { key: k, label: k === today ? `Today · ${pretty}` : k === yesterday ? `Yesterday · ${pretty}` : pretty, images: [], videos: [] });
    }
    (kind === 'image' ? (days.get(k) as RecentDay).images : (days.get(k) as RecentDay).videos).push(f);
  }
  return [...days.values()].sort((a, b) => b.key.localeCompare(a.key));
}
