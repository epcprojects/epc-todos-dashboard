import { describe, expect, it } from 'vitest';
import { coverage, covAll, health, isOverdue, pm, periodRange } from '@/lib/metrics';
import type { Status, Team } from '@/lib/constants';

const T = (postDate: string | null, status: Status, team: Team = 'designer', completedAt: string | null = null) => ({ postDate, status, team, completedAt });

describe('coverage', () => {
  const today = '2026-10-05';
  it('Oct 6-8 done and Oct 9 unfinished gives 3 days ahead', () => {
    const list = [T('2026-10-06', 'completed'), T('2026-10-07', 'completed'), T('2026-10-08', 'completed'), T('2026-10-09', 'not_started'), T('2026-10-10', 'completed')];
    const c = coverage(list, today);
    expect(c.days).toBe(3);
    expect(c.through).toBe('2026-10-08');
    expect(c.gap).toBe('2026-10-09');
  });
  it('everything done through Oct 12 with today Oct 5 gives 7', () => {
    const list = ['06', '07', '08', '09', '10', '11', '12'].map((d) => T(`2026-10-${d}`, 'completed'));
    expect(coverage(list, today).days).toBe(7);
  });
  it('an unfinished task today gives 0 days', () => {
    expect(coverage([T(today, 'in_progress'), T('2026-10-06', 'completed')], today).days).toBe(0);
  });
  it('no upcoming content', () => {
    expect(coverage([T('2026-10-01', 'completed')], today).none).toBe(true);
  });
  it('overall coverage uses the slower team', () => {
    const list = [
      ...['06', '07', '08', '09', '10'].map((d) => T(`2026-10-${d}`, 'completed', 'designer')),
      T('2026-10-06', 'completed', 'editor'),
      T('2026-10-07', 'not_started', 'editor'),
    ];
    const c = covAll(list, today);
    expect(c.d.days).toBe(5);
    expect(c.e.days).toBe(1);
    expect(c.o.days).toBe(1);
  });
});

describe('health & overdue', () => {
  const today = '2026-10-05';
  it('overdue is separate from status and makes health Behind', () => {
    const list = [T('2026-10-01', 'in_progress')];
    expect(isOverdue(list[0], today)).toBe(true);
    expect(health(list, today, 7).k).toBe('behind');
  });
  it('compares coverage with the target buffer', () => {
    const mk = (n: number) => Array.from({ length: n }, (_, i) => T(`2026-10-${String(6 + i).padStart(2, '0')}`, 'completed'));
    expect(health(mk(8), today, 7).k).toBe('ahead');
    expect(health(mk(7), today, 7).k).toBe('ontrack');
    expect(health(mk(3), today, 7).k).toBe('risk');
  });
  it('period metrics count scheduled and finished tasks', () => {
    const list = [T('2026-10-05', 'completed', 'designer', '2026-10-05T10:00:00'), T('2026-10-05', 'not_started')];
    const m = pm(list, '2026-10-05', '2026-10-05', today);
    expect(m.sch).toBe(2);
    expect(m.done).toBe(1);
    expect(m.pct).toBe(50);
    expect(m.fin).toBe(1);
  });
  it('week range starts on Monday', () => {
    const r = periodRange('week', 0, '2026-10-07');
    expect(r.from).toBe('2026-10-05');
    expect(r.to).toBe('2026-10-11');
  });
});
