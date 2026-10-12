import { STATUS_KEYS, type Status, type Task, type Team } from './constants';
import { addDays, diffDays, fmtDate, fromUTC, localDay, todayISO, weekStart } from './dates';
import { pctOf } from './text';

type TaskLike = Pick<Task, 'postDate' | 'status'>;

export const isOverdue = (t: TaskLike, today: string) => !!t.postDate && t.postDate < today && t.status !== 'completed';

export function sched(t: TaskLike, today: string): { k: string; l: string } {
  if (t.status === 'completed') return { k: 'done', l: 'Done' };
  if (!t.postDate) return { k: 'nodate', l: 'No date' };
  if (t.postDate < today) return { k: 'overdue', l: 'Overdue' };
  if (t.postDate === today) return { k: 'today', l: 'Due today' };
  if (diffDays(t.postDate, today) <= 3) return { k: 'soon', l: 'Due soon' };
  return { k: 'later', l: 'Upcoming' };
}

export interface Coverage {
  days: number;
  through: string | null;
  none?: boolean;
  gap: string | null;
}

/** Consecutive posting days from tomorrow that are fully completed; stops at the first unfinished day. */
export function coverage(list: TaskLike[], today: string): Coverage {
  const fut = list.filter((t) => t.postDate && t.postDate >= today);
  if (!fut.length) return { days: 0, through: null, none: true, gap: null };
  const inc = fut.filter((t) => t.status !== 'completed').map((t) => t.postDate as string).sort();
  if (!inc.length) {
    const max = fut.map((t) => t.postDate as string).sort().pop() as string;
    return { days: diffDays(max, today), through: max, gap: null };
  }
  const F = inc[0];
  if (F === today) return { days: 0, through: null, gap: F };
  const th = addDays(F, -1);
  return { days: diffDays(th, today), through: th, gap: F };
}

export function covAll(list: (TaskLike & { team: Team })[], today: string) {
  const d = coverage(list.filter((t) => t.team === 'designer'), today);
  const e = coverage(list.filter((t) => t.team === 'editor'), today);
  // admin-created roles count too: the overall figure is the slowest team that has upcoming content
  const extraKeys = [...new Set(list.map((t) => t.team))].filter((k) => k !== 'designer' && k !== 'editor' && k !== 'admin' && k !== 'unassigned');
  const extra = extraKeys.map((k) => ({ key: k, c: coverage(list.filter((t) => t.team === k), today) }));
  const live = [d, e, ...extra.map((x) => x.c)].filter((c) => !c.none);
  const o: Coverage = live.length ? live.reduce((a, b) => (a.days <= b.days ? a : b)) : { days: 0, through: null, none: true, gap: null };
  return { d, e, o, extra };
}

export type HealthKind = 'behind' | 'none' | 'ahead' | 'ontrack' | 'risk';

export function health(list: (TaskLike & { team: Team })[], today: string, targetBuffer: number) {
  const od = list.filter((t) => isOverdue(t, today)).length;
  const c = covAll(list, today);
  const tgt = +targetBuffer || 7;
  let k: HealthKind;
  let label: string;
  if (od) {
    k = 'behind';
    label = 'Behind';
  } else if (c.o.none) {
    k = 'none';
    label = 'No upcoming content';
  } else if (c.o.days > tgt) {
    k = 'ahead';
    label = 'Ahead';
  } else if (c.o.days === tgt) {
    k = 'ontrack';
    label = 'On Track';
  } else {
    k = 'risk';
    label = 'At Risk';
  }
  return { k, label, od, c, tgt, gap: tgt - c.o.days };
}

export type PeriodKind = 'today' | 'week' | 'month' | 'all';

export function periodRange(kind: PeriodKind, off: number, t: string = todayISO()) {
  if (kind === 'today') {
    const d = addDays(t, off);
    return { from: d, to: d, label: off === 0 ? `Today · ${fmtDate(d, { weekday: 'long' })}` : fmtDate(d, { weekday: 'long' }) };
  }
  if (kind === 'week') {
    const s = addDays(weekStart(t), 7 * off);
    const e = addDays(s, 6);
    return {
      from: s,
      to: e,
      label: `${off === 0 ? 'This week' : off === -1 ? 'Last week' : off === 1 ? 'Next week' : 'Week'} · ${fmtDate(s, { year: undefined })} – ${fmtDate(e)}`,
    };
  }
  if (kind === 'month') {
    const b = new Date(Date.UTC(+t.slice(0, 4), +t.slice(5, 7) - 1 + off, 1));
    const s = fromUTC(b.getTime());
    const e = fromUTC(Date.UTC(b.getUTCFullYear(), b.getUTCMonth() + 1, 0));
    return {
      from: s,
      to: e,
      label: (off === 0 ? 'This month · ' : '') + b.toLocaleDateString('en-GB', { timeZone: 'UTC', month: 'long', year: 'numeric' }),
    };
  }
  return { from: '0000-01-01', to: '9999-12-31', label: 'All time' };
}

export function pm<T extends TaskLike & { completedAt: string | null }>(list: T[], from: string, to: string, today: string) {
  const sch = list.filter((t) => t.postDate && t.postDate >= from && t.postDate <= to);
  const c: Record<Status, number> = { not_started: 0, in_progress: 0, completed: 0, blocked: 0 };
  sch.forEach((t) => (c[t.status] = (c[t.status] || 0) + 1));
  const fin = list.filter((t) => {
    const d = localDay(t.completedAt);
    return d && d >= from && d <= to;
  });
  const od = sch.filter((t) => isOverdue(t, today)).length;
  return {
    sch: sch.length,
    schList: sch,
    done: c.completed,
    ip: c.in_progress,
    ns: c.not_started,
    blk: c.blocked,
    pct: pctOf(c.completed, sch.length),
    rem: sch.length - c.completed,
    od,
    fin: fin.length,
    finList: fin,
  };
}

export { STATUS_KEYS };
