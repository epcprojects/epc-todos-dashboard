import { STATUS, STATUS_KEYS, TEAMS, type Task } from './constants';
import { addDays, fmtDate, fmtDT, localDay } from './dates';
import { isOverdue, periodRange, sched } from './metrics';
import { isURL, norm, splitPlat } from './text';

/** A task plus values computed once when it arrives from the server. */
export interface CTask extends Task {
  _hidx: Record<string, number>;
  _plats: string[];
  _hay: string;
}

export function ingest(t: Task): CTask {
  const d = { ...t, m: t.m || ({} as Task['m']), h: t.h || [], v: t.v || [], u: t.u || {} } as CTask;
  d._hidx = {};
  d.h.forEach((x, i) => (d._hidx[x] = i));
  d._plats = splitPlat(d.platform);
  d._hay = [d.title, d.platform, d.pillar, d.type, d.postDate, d.postDate ? fmtDate(d.postDate) : '', d.day, d.time, d.notes, d.id, d.sheet, ...d.v]
    .join(' \u0001 ')
    .toLowerCase();
  return d;
}

export function displayTitle(t: Pick<Task, 'title' | 'v' | 'row'>): string {
  if (t.title) return t.title;
  const v = (t.v || []).find((x) => x && x.length > 3 && !isURL(x));
  return v ? v.slice(0, 90) : `Row ${t.row}`;
}

export interface TableFilters {
  status: string;
  platform: string;
  pillar: string;
  type: string;
  day: string;
  team: string;
  sheet: string;
  workbook: string;
  quick: string;
  from: string;
  to: string;
  cfrom: string;
  cto: string;
  arch: 'active' | 'archived' | 'all';
}
export const emptyFilters = (): TableFilters => ({
  status: '', platform: '', pillar: '', type: '', day: '', team: '', sheet: '', workbook: '', quick: '', from: '', to: '', cfrom: '', cto: '', arch: 'active',
});

export function quickMatch(t: CTask, q: string, today: string): boolean {
  switch (q) {
    case 'today':
      return t.postDate === today;
    case 'week': {
      const w = periodRange('week', 0, today);
      return !!t.postDate && t.postDate >= w.from && t.postDate <= w.to;
    }
    case 'overdue':
      return isOverdue(t, today);
    case 'next3':
    case 'next7':
    case 'next14': {
      const n = +q.slice(4);
      return !!t.postDate && t.postDate > today && t.postDate <= addDays(today, n);
    }
    case 'unfinished':
      return t.status !== 'completed';
    case 'completed':
    case 'in_progress':
    case 'not_started':
    case 'blocked':
      return t.status === q;
    case 'nodate':
      return !t.postDate;
    case 'unassigned':
      return t.team === 'unassigned';
    case 'donetoday':
      return localDay(t.completedAt) === today;
    default:
      return true;
  }
}

export function filtered(list: CTask[], q: string, f: TableFilters, today: string): CTask[] {
  const qs = norm(q) ? norm(q).split(' ') : [];
  return list.filter((t) => {
    if (f.arch === 'active' && t.archived) return false;
    if (f.arch === 'archived' && !t.archived) return false;
    if (f.status && t.status !== f.status) return false;
    if (f.platform && !t._plats.includes(f.platform)) return false;
    if (f.pillar && t.pillar !== f.pillar) return false;
    if (f.type && t.type !== f.type) return false;
    if (f.day && t.day !== f.day) return false;
    if (f.team && t.team !== f.team) return false;
    if (f.sheet && t.sheet !== f.sheet) return false;
    if (f.workbook && t.workbook !== f.workbook) return false;
    if (f.from && !(t.postDate && t.postDate >= f.from)) return false;
    if (f.to && !(t.postDate && t.postDate <= f.to)) return false;
    if (f.cfrom || f.cto) {
      const d = localDay(t.completedAt);
      if (!d) return false;
      if (f.cfrom && d < f.cfrom) return false;
      if (f.cto && d > f.cto) return false;
    }
    if (f.quick && !quickMatch(t, f.quick, today)) return false;
    for (const w of qs) if (!t._hay.includes(w)) return false;
    return true;
  });
}

type Cmp = (x: CTask, y: CTask) => number;

export function prioCmp(today: string): Cmp {
  const b = (t: Pick<Task, 'postDate' | 'status'>) => {
    if (!t.postDate) return 3;
    if (t.status !== 'completed' && t.postDate < today) return 0;
    if (t.postDate === today) return 1;
    if (t.postDate > today) return 2;
    return 4;
  };
  return (x, y) => {
    const bx = b(x);
    const by = b(y);
    if (bx !== by) return bx - by;
    if (bx === 4) return (x.postDate as string) < (y.postDate as string) ? 1 : (x.postDate as string) > (y.postDate as string) ? -1 : 0;
    const dx = x.postDate || '';
    const dy = y.postDate || '';
    if (dx !== dy) return dx < dy ? -1 : 1;
    return (x.time || '').localeCompare(y.time || '') || x.row - y.row;
  };
}

export function sorter(kind: string, today: string): Cmp {
  const s = (a: unknown, b: unknown) => String(a || '').localeCompare(String(b || ''), undefined, { numeric: true, sensitivity: 'base' });
  switch (kind) {
    case 'date':
      return (x, y) => s(x.postDate || '9999', y.postDate || '9999') || x.row - y.row;
    case 'date_desc':
      return (x, y) => s(y.postDate || '', x.postDate || '');
    case 'platform':
      return (x, y) => s(x.platform, y.platform);
    case 'status':
      return (x, y) => STATUS_KEYS.indexOf(x.status) - STATUS_KEYS.indexOf(y.status);
    case 'title':
      return (x, y) => s(displayTitle(x), displayTitle(y));
    case 'pillar':
      return (x, y) => s(x.pillar, y.pillar);
    case 'completed':
      return (x, y) => s(y.completedAt || '', x.completedAt || '');
    default:
      return prioCmp(today);
  }
}

export function uniq(list: CTask[], fn: (t: CTask) => string | string[]): string[] {
  return [...new Set(list.flatMap((t) => { const v = fn(t); return Array.isArray(v) ? v : [v]; }).filter(Boolean))].sort((a, b) =>
    String(a).localeCompare(String(b), undefined, { numeric: true }),
  );
}

export function headersOf(list: CTask[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const sorted = [...list].sort((a, b) => (a.importedAt || '').localeCompare(b.importedAt || '') || a.sheetIdx - b.sheetIdx);
  for (const t of sorted) for (const h of t.h || []) if (!seen.has(h)) { seen.add(h); out.push(h); }
  return out;
}

/** Rows for CSV / Excel export (same columns as the prototype). */
export function exportRows(list: CTask[], today: string): (string | number)[][] {
  const heads = headersOf(list);
  const top = ['Task ID', 'Assigned Team', 'Status', 'Schedule', 'Posting Date', 'Platform', 'Title', 'Type', 'Content Pillar', 'Workbook', 'Sheet', 'Excel Row', 'Completed At', 'Blocked Reason', 'Production Notes', 'Admin Note'];
  const rows = list.map((t) => [
    t.id, TEAMS[t.team], STATUS[t.status], sched(t, today).l, t.postDate || '', t.platform, displayTitle(t), t.type, t.pillar, t.workbook, t.sheet, t.row,
    t.completedAt ? fmtDT(t.completedAt) : '', t.blockedReason || '', t.notes || '', t.adminNote || '',
    ...heads.map((h) => {
      const i = t._hidx[h];
      return i == null ? '' : t.u[i] ? `${t.v[i]} (${t.u[i]})` : t.v[i];
    }),
  ]);
  return [top.concat(heads.map((h) => 'Excel: ' + h)), ...rows];
}

export const csvOf = (aoa: unknown[][]) =>
  aoa
    .map((r) =>
      r
        .map((v) => {
          const s = String(v ?? '');
          return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
        })
        .join(','),
    )
    .join('\r\n');
