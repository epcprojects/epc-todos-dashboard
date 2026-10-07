import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { parseDateText, addDays, diffDays, weekStart } from '@/lib/dates';
import { cellISO } from '@/lib/excel';

const now = new Date(2026, 9, 5); // 5 Oct 2026

describe('parseDateText', () => {
  it('"October 12" uses the current year', () => expect(parseDateText('October 12', 'dmy', now)).toBe('2026-10-12'));
  it('"12/10/2026" is day first', () => expect(parseDateText('12/10/2026', 'dmy', now)).toBe('2026-10-12'));
  it('"12/10/2026" is month first when asked', () => expect(parseDateText('12/10/2026', 'mdy', now)).toBe('2026-12-10'));
  it('a part above 12 decides the order', () => {
    expect(parseDateText('25/10/2026', 'mdy', now)).toBe('2026-10-25');
    expect(parseDateText('10/25/2026', 'dmy', now)).toBe('2026-10-25');
  });
  it('"Mon, Oct 12, 2026"', () => expect(parseDateText('Mon, Oct 12, 2026', 'dmy', now)).toBe('2026-10-12'));
  it('"2026-10-12"', () => expect(parseDateText('2026-10-12', 'dmy', now)).toBe('2026-10-12'));
  it('rejects impossible dates and empty text', () => {
    expect(parseDateText('31/02/2026', 'dmy', now)).toBeNull();
    expect(parseDateText('', 'dmy', now)).toBeNull();
    expect(parseDateText('hello', 'dmy', now)).toBeNull();
  });
  it('two-digit years', () => expect(parseDateText('12/10/26', 'dmy', now)).toBe('2026-10-12'));
});

describe('Excel serial numbers', () => {
  it('46307 is 2026-10-12', () => {
    expect(cellISO({ t: '46307', raw: 46307, type: 'n' }, 'dmy')).toBe('2026-10-12');
  });
  it('a date-formatted number', () => {
    expect(cellISO({ t: '12-Oct-26', raw: 46307, type: 'n', z: 'd-mmm-yy' }, 'dmy')).toBe('2026-10-12');
  });
  it('matches SheetJS', () => {
    const p = XLSX.SSF.parse_date_code(46307);
    expect([p.y, p.m, p.d]).toEqual([2026, 10, 12]);
  });
});

describe('date arithmetic stays timezone-free', () => {
  it('addDays/diffDays/weekStart', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(diffDays('2026-10-12', '2026-10-05')).toBe(7);
    expect(weekStart('2026-10-11')).toBe('2026-10-05');
  });
});
