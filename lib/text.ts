import { PLAT, PLAT_ALIAS, type ColumnMap, type FieldKey } from './constants';

export const norm = (s: unknown) => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
export const pctOf = (a: number, b: number) => (b ? Math.round((a * 100) / b) : 0);
export const plural = (n: number, w: string, p?: string) => `${n} ${n === 1 ? w : p || w + 's'}`;
export const isURL = (s: unknown) => /^https?:\/\/\S+$/i.test(String(s || '').trim());

export function platKey(p: string): string | null {
  const k = norm(p).replace(/[^a-z]/g, '');
  if (!k) return null;
  if (PLAT_ALIAS[k]) return PLAT_ALIAS[k];
  const f = PLAT.find((x) => k.includes(x[0]));
  return f ? f[0] : null;
}

/** The caption of a task: the Excel column called "Caption", "Caption / Social Copy" or "Social Copy". '' when the sheet has none. */
export function captionOf(headers: string[], vals: string[]): string {
  const h = (headers || []).map((x) => norm(x));
  const i = h.findIndex((x) => x === 'caption / social copy') >= 0 ? h.findIndex((x) => x === 'caption / social copy') : h.findIndex((x) => x.startsWith('caption')) >= 0 ? h.findIndex((x) => x.startsWith('caption')) : h.findIndex((x) => x.includes('social copy'));
  return i >= 0 ? String((vals || [])[i] ?? '').trim() : '';
}

export function splitPlat(s: string): string[] {
  return String(s || '')
    .split(/\s*(?:,|\/|&|\||\+|;|\n|\band\b)\s*/i)
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => {
      const k = platKey(x);
      const f = k && PLAT.find((p) => p[0] === k);
      return f ? f[1] : x;
    });
}

/** Short label shown inside the platform badge. */
export function platBadge(p: string): string {
  const k = platKey(p);
  const f = k && PLAT.find((x) => x[0] === k);
  return f ? f[2] : p.slice(0, 2).toUpperCase();
}

export function dupKey(sheet: string, date: string | null | undefined, plat: string, title: string, vals: string[]): string {
  const core = plat || title ? `${norm(plat)}|${norm(title)}` : norm(vals.join('|')).slice(0, 400);
  return `${norm(sheet)}|${date || ''}|${core}`;
}

export interface Derived {
  platform: string;
  title: string;
  type: string;
  pillar: string;
  day: string;
  time: string;
}

export function deriveFields(v: string[], m: Partial<ColumnMap>): Derived {
  const g = (k: FieldKey) => (m[k] != null && (m[k] as number) >= 0 ? String(v[m[k] as number] || '').trim() : '');
  return { platform: g('platform'), title: g('title'), type: g('type'), pillar: g('pillar'), day: g('day'), time: g('time') };
}

export function suggestTeam(name: string): 'designer' | 'editor' | 'unassigned' {
  const n = norm(name);
  if (/video|reel|short|tiktok|youtube|edit|motion|clip/.test(n)) return 'editor';
  if (/post|carousel|graphic|design|static|image|banner|creative|story/.test(n)) return 'designer';
  return 'unassigned';
}

/** True when a sheet's headers are all auto-generated ("Column A", "Column B (2)"). */
export function genericHeads(h: unknown): boolean {
  return Array.isArray(h) && h.length > 0 && h.every((x) => /^Column [A-Z]+( \(\d+\))?$/.test(String(x)));
}

/** Column letters for a 0-based index (A, B, … Z, AA …). Same as XLSX.utils.encode_col. */
export function encodeCol(i: number): string {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/** Column names for the "Use row N as column names" repair (same rules as the import preview). */
export function headersFromValues(vals: string[]): string[] {
  const seen: Record<string, number> = {};
  return vals.map((v, i) => {
    let h = String(v || '').replace(/\s+/g, ' ').trim() || 'Column ' + encodeCol(i);
    const b = h;
    let k = 2;
    while (seen[norm(h)]) h = `${b} (${k++})`;
    seen[norm(h)] = 1;
    return h;
  });
}
