/* Date helpers. "Today" and every period are computed in the browser's local timezone;
   post dates are plain 'YYYY-MM-DD' strings and are never turned into JS Dates in local time. */

export const pad = (n: number) => String(n).padStart(2, '0');
export const isoOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayISO = () => isoOf(new Date());
export const toUTC = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};
export const fromUTC = (ms: number) => {
  const t = new Date(ms);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
};
export const addDays = (s: string, n: number) => fromUTC(toUTC(s) + n * 864e5);
export const diffDays = (a: string, b: string) => Math.round((toUTC(a) - toUTC(b)) / 864e5);
export const dow = (s: string) => (new Date(toUTC(s)).getUTCDay() + 6) % 7;
export const weekStart = (s: string) => addDays(s, -dow(s));
export const localDay = (iso: string | null | undefined) => (iso ? isoOf(new Date(iso)) : null);

export function fmtDate(s: string | null | undefined, opt?: Intl.DateTimeFormatOptions): string {
  if (!s) return '—';
  return new Date(toUTC(s)).toLocaleDateString(
    'en-GB',
    Object.assign({ timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' } as Intl.DateTimeFormatOptions, opt || {}),
  );
}
export const fmtShort = (s: string) => fmtDate(s, { year: undefined, weekday: 'short' });

export function fmtDT(iso: string | null | undefined, timeZone?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const tz = timeZone ? { timeZone } : {};
  return (
    d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', ...tz }) +
    ' – ' +
    d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', ...tz })
  );
}

export const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

export function mkISO(y: number, m: number, d: number): string | null {
  if (!(y > 1900 && y < 2200 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** Year to assume when a date has none: this year, or next year for months far in the past. */
export function guessYear(m: number, now: Date = new Date()): number {
  let y = now.getFullYear();
  if (m < now.getMonth() + 1 - 3) y++;
  return y;
}

export type DateOrder = 'dmy' | 'mdy';

export function parseDateText(input: unknown, order: DateOrder, now: Date = new Date()): string | null {
  const s = String(input ?? '').trim();
  if (!s) return null;
  let r: RegExpMatchArray | null;
  if ((r = s.match(/(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/))) return mkISO(+r[1], +r[2], +r[3]);
  if ((r = s.match(/\b(\d{1,2})[\/.\-](\d{1,2})(?:[\/.\-](\d{2,4}))?\b/))) {
    const a = +r[1];
    const b = +r[2];
    let y = r[3] ? +r[3] : null;
    if (y !== null && y < 100) y += 2000;
    let d: number;
    let m: number;
    if (a > 12) {
      d = a;
      m = b;
    } else if (b > 12) {
      m = a;
      d = b;
    } else if (order === 'mdy') {
      m = a;
      d = b;
    } else {
      d = a;
      m = b;
    }
    return mkISO(y ?? guessYear(m, now), m, d);
  }
  const low = s.toLowerCase();
  const mi = MONTHS.findIndex((x) => new RegExp('\\b' + x).test(low));
  if (mi >= 0) {
    const yM = low.match(/\b(19|20|21)\d{2}\b/);
    const y = yM ? +yM[0] : null;
    const rest = yM ? low.replace(yM[0], ' ') : low;
    const nm = rest.match(/\b(\d{1,2})(?:st|nd|rd|th)?\b/);
    if (nm) {
      const m = mi + 1;
      return mkISO(y ?? guessYear(m, now), m, +nm[1]);
    }
  }
  return null;
}
