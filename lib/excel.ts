/* Client-side Excel pipeline: read a workbook, find the header row, map columns, parse dates.
   Ported from the prototype; nothing here touches the network. */
import * as XLSX from 'xlsx';
import { FIELDS, type ColumnMap, type FieldKey } from './constants';
import { isoOf, mkISO, parseDateText, type DateOrder } from './dates';
import { guessMap } from './mapping';
import { dupKey, isURL, norm } from './text';

export { guessMap };

export interface Cell {
  t: string;
  raw: unknown;
  type: string;
  z?: string;
  url?: string;
}
export interface GridRow {
  excelRow: number;
  cells: (Cell | null)[];
  empty: boolean;
}
export interface Grid {
  rows: GridRow[];
  c0: number;
}

export function readGrid(ws: XLSX.WorkSheet): Grid {
  const ref = ws['!ref'];
  if (!ref) return { rows: [], c0: 0 };
  const rg = XLSX.utils.decode_range(ref);
  const rows: GridRow[] = [];
  const maxR = Math.min(rg.e.r, rg.s.r + 20000);
  for (let R = rg.s.r; R <= maxR; R++) {
    const cells: (Cell | null)[] = [];
    let any = false;
    for (let C = rg.s.c; C <= rg.e.c; C++) {
      const c = ws[XLSX.utils.encode_cell({ r: R, c: C })] as XLSX.CellObject | undefined;
      if (!c || (c.v == null && c.w == null)) {
        cells.push(null);
        continue;
      }
      const t = c.t === 's' || (c.t as string) === 'str' ? String(c.v ?? '') : c.w != null ? String(c.w) : String(c.v ?? '');
      const cell: Cell = { t, raw: c.v, type: c.t, z: typeof c.z === "string" ? c.z : undefined };
      let url = c.l && c.l.Target;
      if (!url && c.f) {
        const m = String(c.f).match(/HYPERLINK\(\s*"([^"]+)"/i);
        if (m) url = m[1];
      }
      if (url) cell.url = url;
      if (t.trim() !== '' || url) any = true;
      cells.push(cell);
    }
    rows.push({ excelRow: R + 1, cells, empty: !any });
  }
  while (rows.length && rows[rows.length - 1].empty) rows.pop();
  return { rows, c0: rg.s.c };
}

export const HEADER_WORDS = new Set(
  FIELDS.flatMap((f) => f.syn).concat([
    'copy', 'graphic copy', 'editing copy', 'video copy', 'direction', 'graphic direction', 'editing direction', 'design direction',
    'caption', 'caption / social copy', 'social copy', 'competitor link', 'link', 'reference', 'reference link', 'notes', 'status',
    'hashtags', 'cta', 'hook', 'script',
  ]),
);
const HW_LONG = [...HEADER_WORDS].filter((w) => w.length > 3);

export function headerScore(r: GridRow): number {
  let s = 0;
  for (const c of r.cells) {
    if (!c) continue;
    const t = c.t.trim();
    if (!t) continue;
    if (c.type === 'n' || isURL(t) || t.length > 150 || (/\d/.test(t) && parseDateText(t, 'dmy'))) continue;
    s += 1;
    const k = norm(t);
    if (HEADER_WORDS.has(k) || HW_LONG.some((w) => k.startsWith(w + ' ') || k.endsWith(' ' + w) || k.startsWith(w + "'"))) s += 3;
  }
  return s;
}

export function detectHeader(rows: GridRow[]): number {
  let best = -1;
  let bs = 0;
  let first = -1;
  let seen = 0;
  for (let i = 0; i < rows.length && seen < 30; i++) {
    const r = rows[i];
    if (r.empty) continue;
    seen++;
    if (first < 0) first = i;
    const sc = headerScore(r);
    if (sc > bs) {
      bs = sc;
      best = i;
    }
  }
  return bs >= 2 ? best : first;
}

export function guessOrder(data: { cells: (Cell | null)[] }[], col: number): DateOrder {
  let dmy = 0;
  let mdy = 0;
  for (const r of data) {
    const c = r.cells[col];
    if (!c || c.type === 'n') continue;
    const m = String(c.t).match(/\b(\d{1,2})[\/.\-](\d{1,2})[\/.\-]/);
    if (!m) continue;
    if (+m[1] > 12) dmy++;
    else if (+m[2] > 12) mdy++;
  }
  return mdy > dmy ? 'mdy' : 'dmy';
}

export function cellISO(c: Cell | null, order: DateOrder): string | null {
  if (!c) return null;
  if (c.type === 'n' && typeof c.raw === 'number') {
    const isD = c.z && typeof c.z === 'string' && XLSX.SSF.is_date(c.z);
    if (isD || (c.raw > 30000 && c.raw < 80000)) {
      const p = XLSX.SSF.parse_date_code(c.raw);
      if (p) return mkISO(p.y, p.m, p.d);
    }
  }
  if (c.type === 'd' && c.raw instanceof Date) return isoOf(c.raw);
  return parseDateText(c.t, order);
}

export interface DataRow {
  excelRow: number;
  cells: (Cell | null)[];
  vals: string[];
  urls: Record<string, string>;
  date?: string | null;
  key?: string;
}
export interface Analysis {
  hi: number;
  headers: string[];
  data: DataRow[];
  blank: number;
  ncol: number;
}
export interface WizSheet {
  name: string;
  idx: number;
  ws: XLSX.WorkSheet;
  est: number;
  selected: boolean;
  team: string;
  /** Marked as founder content on the Assign step (only for sheets assigned to a work team). */
  founder?: boolean;
  suggested: 'designer' | 'editor' | 'unassigned';
  grid?: Grid;
  noHeader?: boolean;
  headerIdx?: number | null;
  headerMissing?: boolean;
  an?: Analysis;
  map?: ColumnMap;
  mapFor?: string;
  dateOrder?: DateOrder | null;
}

export function analyze(s: WizSheet): void {
  const rows = s.grid!.rows;
  let hi: number;
  if (s.noHeader) hi = -1;
  else if (s.headerIdx != null && s.headerIdx >= 0) hi = s.headerIdx;
  else {
    hi = detectHeader(rows);
    s.headerIdx = hi;
    s.headerMissing = hi < 0 || headerScore(rows[hi]) < 2;
  }
  let last = -1;
  rows.forEach((r) =>
    r.cells.forEach((c, i) => {
      if (c && (c.t.trim() || c.url) && i > last) last = i;
    }),
  );
  const ncol = last + 1;
  const hrow = hi >= 0 ? rows[hi] : null;
  const headers: string[] = [];
  const seen: Record<string, number> = {};
  for (let i = 0; i < ncol; i++) {
    let h = hrow && hrow.cells[i] ? hrow.cells[i]!.t.replace(/\s+/g, ' ').trim() : '';
    if (!h) h = 'Column ' + XLSX.utils.encode_col(i + s.grid!.c0);
    const b = h;
    let k = 2;
    while (seen[norm(h)]) h = `${b} (${k++})`;
    seen[norm(h)] = 1;
    headers.push(h);
  }
  const data: DataRow[] = [];
  let blank = 0;
  let pend = 0;
  for (let i = hi + 1; i < rows.length; i++) {
    const r = rows[i];
    if (r.empty) {
      pend++;
      continue;
    }
    blank += pend;
    pend = 0;
    const vals: string[] = [];
    const urls: Record<string, string> = {};
    for (let j = 0; j < ncol; j++) {
      const c = r.cells[j];
      vals.push(c ? c.t : '');
      if (c && c.url && c.url !== c.t) urls[j] = c.url;
    }
    data.push({ excelRow: r.excelRow, cells: r.cells, vals, urls });
  }
  s.an = { hi, headers, data, blank, ncol };
  if (!s.map || s.mapFor !== headers.join('\u0001')) {
    s.map = guessMap(headers);
    s.mapFor = headers.join('\u0001');
    s.dateOrder = null;
  }
  if (!s.dateOrder) s.dateOrder = s.map.date >= 0 ? guessOrder(data, s.map.date) : 'dmy';
  computeDates(s);
}

export function computeDates(s: WizSheet): void {
  const m = s.map!;
  for (const r of s.an!.data) {
    r.date = m.date >= 0 ? cellISO(r.cells[m.date], s.dateOrder as DateOrder) : null;
    const g = (k: FieldKey) => (m[k] >= 0 ? (r.vals[m[k]] || '').trim() : '');
    r.key = dupKey(s.name, r.date, g('platform'), g('title'), r.vals);
  }
}

export function headerChoices(s: WizSheet): number[] {
  const out: number[] = [];
  const rows = s.grid!.rows;
  for (let i = 0; i < rows.length && out.length < 15; i++) if (!rows[i].empty) out.push(i);
  const hi = s.an && s.an.hi;
  if (hi != null && hi >= 0 && !out.includes(hi)) out.push(hi);
  return out;
}

export { XLSX };
