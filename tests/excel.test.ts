import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { analyze, detectHeader, guessMap, headerScore, readGrid, type WizSheet } from '@/lib/excel';
import { dupKey, genericHeads, headersFromValues, suggestTeam, deriveFields } from '@/lib/text';

const LONG = "Competitor's Relative Social Media Actual Working Link for Inspiration";
const HEADERS = ['Date', 'Day', 'Platform', 'Title', 'Type', 'Content Pillar', 'Graphic Copy', 'Caption / Social Copy', LONG];

function sheetFrom(aoa: unknown[][], name = 'Posts'): WizSheet {
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  return { name, idx: 0, ws, est: aoa.length, selected: true, team: 'designer', suggested: 'designer' };
}

describe('header detection', () => {
  it('a header row with long column names wins over content rows', () => {
    const rows = [
      HEADERS,
      ['12/10/2026', 'Monday', 'LinkedIn', 'Why endpoint security matters for small teams', 'Static', 'Education', 'Protect every device in your fleet today', 'A longer caption sentence that reads like content, not a header.', 'https://example.com/ref'],
      ['13/10/2026', 'Tuesday', 'Instagram', 'Patch Tuesday explained', 'Carousel', 'Awareness', 'Patching keeps attackers out', 'Another long caption sentence with several words in it.', 'https://example.com/ref2'],
    ];
    const grid = readGrid(sheetFrom(rows).ws);
    expect(detectHeader(grid.rows)).toBe(0);
    expect(headerScore(grid.rows[0])).toBeGreaterThan(headerScore(grid.rows[1]));
  });

  it('a title row above the header is skipped', () => {
    const rows = [
      ['October 2026 Content Calendar'],
      [],
      HEADERS,
      ['12/10/2026', 'Monday', 'LinkedIn', 'Title one', 'Static', 'Education', 'copy', 'caption', 'https://example.com'],
    ];
    const s = sheetFrom(rows);
    s.grid = readGrid(s.ws);
    analyze(s);
    expect(s.an!.hi).toBe(2);
    expect(s.an!.headers).toEqual(HEADERS);
    expect(s.an!.data).toHaveLength(1);
    expect(s.an!.data[0].excelRow).toBe(4);
    expect(s.map!.date).toBe(0);
    expect(s.map!.platform).toBe(2);
    expect(s.map!.title).toBe(3);
    expect(s.an!.data[0].date).toBe('2026-10-12');
  });

  it('keeps long column names intact and maps by meaning', () => {
    expect(guessMap(HEADERS).pillar).toBe(5);
  });

  it('numbers, links and dates never look like headers', () => {
    const grid = readGrid(sheetFrom([[1, 2, 3], ['https://a.com/x', '12/10/2026', 'x']]).ws);
    expect(headerScore(grid.rows[0])).toBe(0);
    expect(headerScore(grid.rows[1])).toBe(1);
  });
});

describe('duplicate keys and derived fields', () => {
  it('normalises case, spacing and uses sheet|date|platform|title', () => {
    expect(dupKey('Posts', '2026-10-12', ' LinkedIn ', 'My  Title', [])).toBe('posts|2026-10-12|linkedin|my title');
  });
  it('falls back to the row values when there is no platform or title', () => {
    expect(dupKey('Posts', null, '', '', ['a', 'B'])).toBe('posts||a|b');
  });
  it('derives mapped fields', () => {
    const m = { date: 0, time: -1, day: 1, platform: 2, title: 3, type: 4, pillar: 5 };
    expect(deriveFields(['x', 'Mon', 'IG', 'T', 'Reel', 'P'], m)).toEqual({ platform: 'IG', title: 'T', type: 'Reel', pillar: 'P', day: 'Mon', time: '' });
  });
  it('suggests teams from sheet names', () => {
    expect(suggestTeam('Videos')).toBe('editor');
    expect(suggestTeam('Posts')).toBe('designer');
    expect(suggestTeam('Notes')).toBe('unassigned');
  });
  it('detects generic headers and repairs them from a row', () => {
    expect(genericHeads(['Column A', 'Column B (2)'])).toBe(true);
    expect(genericHeads(['Date', 'Column B'])).toBe(false);
    expect(headersFromValues(['Date', '', 'Date'])).toEqual(['Date', 'Column B', 'Date (2)']);
  });
});
