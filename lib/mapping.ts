import { FIELDS, type ColumnMap } from './constants';
import { norm } from './text';

/** Guess which column holds each field from the column names. */
export function guessMap(headers: string[]): ColumnMap {
  const nh = headers.map(norm);
  const used = new Set<number>();
  const m = {} as ColumnMap;
  for (const f of FIELDS) {
    let idx = -1;
    for (const syn of f.syn) {
      const i = nh.findIndex((h, j) => !used.has(j) && h === syn);
      if (i >= 0) {
        idx = i;
        break;
      }
    }
    if (idx < 0)
      for (const syn of f.syn) {
        const i = nh.findIndex(
          (h, j) => !used.has(j) && (h.startsWith(syn + ' ') || h.endsWith(' ' + syn) || h.includes(' ' + syn + ' ') || h.includes(syn + '/') || h.includes('/' + syn)),
        );
        if (i >= 0) {
          idx = i;
          break;
        }
      }
    if (idx >= 0) used.add(idx);
    m[f.k] = idx;
  }
  return m;
}

