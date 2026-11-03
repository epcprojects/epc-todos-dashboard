import { createHmac, timingSafeEqual } from 'crypto';
import { ApiError } from './http';
import { readLinks } from './filelinks';
import { listAll } from './s3';
import { recentMedia } from '@/lib/recent';
import type { ManageFile } from '@/lib/manage-config';

/**
 * The secret in the public today-posts link. It is derived from SESSION_SECRET (nothing is stored), so it is stable
 * across restarts. Set PUBLIC_LINK_SALT to any text to get a new link and cut off the old one.
 */
export function todayToken(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error('SESSION_SECRET must be set to a random string of at least 32 characters');
  return createHmac('sha256', s).update('public:today-posts:' + (process.env.PUBLIC_LINK_SALT || '')).digest('base64url').slice(0, 32);
}

/** Throws 404 (not 401, so the link's existence is not confirmed) unless the token is the right one. */
export function assertToken(t: string | null | undefined) {
  const want = Buffer.from(todayToken());
  const got = Buffer.from(String(t || ''));
  if (got.length !== want.length || !timingSafeEqual(got, want)) throw new ApiError(404, 'This link is not valid.');
}

export interface PublicLink {
  title: string;
  platform: string;
  caption: string;
}
export interface PublicToday {
  now: number;
  files: ManageFile[];
  links: Record<string, PublicLink>;
}

let cache: { at: number; data: PublicToday } | null = null;

/** The files of the last 24 hours with their captions. Cached for 30 s so a busy public link does not list the bucket on every visit. */
export async function readPublicToday(): Promise<PublicToday> {
  if (cache && Date.now() - cache.at < 30_000) return cache.data;
  const [all, links] = await Promise.all([listAll(), readLinks()]);
  const now = Date.now();
  const files = recentMedia(all.files, now);
  const out: Record<string, PublicLink> = {};
  for (const f of files) {
    const l = links[f.key];
    if (l) out[f.key] = { title: l.title, platform: l.platform, caption: l.caption };
  }
  const data = { now, files, links: out };
  cache = { at: Date.now(), data };
  return data;
}
