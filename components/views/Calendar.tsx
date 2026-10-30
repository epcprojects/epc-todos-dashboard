'use client';
import { TEAM_SHORT, teamKeys } from '@/lib/constants';
import { addDays, diffDays, fmtDate, fromUTC, toUTC, weekStart } from '@/lib/dates';
import { isOverdue } from '@/lib/metrics';
import { displayTitle, type CTask } from '@/lib/tasks';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useApp } from '../store';
import { Flag, PageHeader, PlatPills, Pill } from '../ui';

export function CalendarView() {
  const { role, act, today, cal, setCal, openDrawer } = useApp();
  const r = role!;
  const scope = r === 'admin' ? act : act.filter((t) => t.team === r);
  const m = cal.month || today.slice(0, 7);
  const first = m + '-01';
  const start = weekStart(first);
  const by: Record<string, CTask[]> = {};
  scope.forEach((t) => {
    if (t.postDate) (by[t.postDate] = by[t.postDate] || []).push(t);
  });
  const mEnd = fromUTC(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 0));
  const weeks = Math.ceil((diffDays(mEnd, start) + 1) / 7);
  const label = new Date(toUTC(first)).toLocaleDateString('en-GB', { timeZone: 'UTC', month: 'long', year: 'numeric' });

  const cells = Array.from({ length: weeks * 7 }, (_, i) => {
    const d = addDays(start, i);
    const l = by[d] || [];
    const out = d.slice(0, 7) !== m;
    const od = l.some((t) => isOverdue(t, today));
    let lines: React.ReactNode;
    if (r === 'admin') {
      lines = (
        teamKeys().map((k) => [k, TEAM_SHORT[k]] as [string, string])
      ).map(([tm, lb]) => {
        const x = l.filter((t) => t.team === tm);
        if (!x.length) return null;
        const dn = x.filter((t) => t.status === 'completed').length;
        const cls = dn === x.length ? 'st-completed' : x.some((t) => isOverdue(t, today)) ? 'st-blocked' : dn ? 'st-in_progress' : 'st-not_started';
        return (
          <span key={tm} className={`ln ${cls}`}>
            <span>{lb}</span>
            <b className="num">
              {dn}/{x.length}
            </b>
          </span>
        );
      });
    } else if (l.length) {
      const dn = l.filter((t) => t.status === 'completed').length;
      const cls = dn === l.length ? 'st-completed' : od ? 'st-blocked' : dn ? 'st-in_progress' : 'st-not_started';
      lines = (
        <span className={`ln ${cls}`}>
          <span>Done</span>
          <b className="num">
            {dn}/{l.length}
          </b>
        </span>
      );
    }
    return (
      <button
        key={d}
        className={`day ${out ? 'out' : ''} ${d === today ? 'today' : ''} ${cal.sel === d ? 'sel' : ''} ${od ? 'od' : ''}`}
        aria-label={`${fmtDate(d, { weekday: 'long' })}: ${l.length} tasks`}
        onClick={() => setCal({ ...cal, sel: d })}
      >
        <span className="dn">{+d.slice(8)}</span>
        {lines}
      </button>
    );
  });

  const sel = cal.sel;
  const selList = sel ? [...(by[sel] || [])].sort((a, b) => a.team.localeCompare(b.team) || (a.platform || '').localeCompare(b.platform || '')) : [];
  const move = (d: number) => {
    if (!d) return setCal({ month: today.slice(0, 7), sel: today });
    const b = new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7) - 1 + d, 1));
    setCal({ ...cal, month: fromUTC(b.getTime()).slice(0, 7) });
  };

  return (
    <>
      <PageHeader
        title="Calendar"
        sub={r === 'admin' ? 'Completed / scheduled tasks for each posting day.' : 'Your tasks by posting date.'}
        actions={
          <div className="inline-flex items-center rounded-lg border bg-card p-0.5 shadow-(--shadow-card)">
            <button className="grid size-8 place-items-center rounded-md hover:bg-muted" aria-label="Previous month" onClick={() => move(-1)}>
              <ChevronLeft className="size-4" />
            </button>
            <button className="h-8 rounded-md px-3 text-sm font-semibold hover:bg-muted" onClick={() => move(0)}>
              Today
            </button>
            <button className="grid size-8 place-items-center rounded-md hover:bg-muted" aria-label="Next month" onClick={() => move(1)}>
              <ChevronRight className="size-4" />
            </button>
          </div>
        }
        eyebrow="Schedule"
      />
      <div className="grid" id="calwrap" style={{ alignItems: 'start' }}>
        <section className="panel">
          <h2 style={{ marginBottom: 12 }}>{label}</h2>
          <div className="cal">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
              <div className="dow" key={d}>
                {d}
              </div>
            ))}
            {cells}
          </div>
          <div className="legend" style={{ marginTop: 12 }}>
            <span className="pill st-completed">All done</span>
            <span className="pill st-in_progress">Partly done</span>
            <span className="pill st-not_started">Not started</span>
            <span className="pill st-blocked">Has overdue</span>
          </div>
        </section>
        <section className="panel">
          <h2 style={{ marginBottom: 12 }}>{sel ? fmtDate(sel, { weekday: 'long' }) : 'Select a date'}</h2>
          {sel ? (
            selList.length ? (
              <div className="stack" style={{ gap: 8 }}>
                {selList.map((t) => (
                  <div key={t.id} style={{ borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
                    <div className="row" style={{ gap: 6 }}>
                      <PlatPills value={t.platform} />
                      {t.type ? <span className="tag">{t.type}</span> : null}
                      {r === 'admin' ? <span className="tag">{TEAM_SHORT[t.team]}</span> : null}
                    </div>
                    <div style={{ margin: '6px 0' }}>
                      <button className="linkish" onClick={() => openDrawer(t.id)}>
                        {displayTitle(t)}
                      </button>
                    </div>
                    <Pill s={t.status} /> {isOverdue(t, today) ? <Flag k="overdue" l="Overdue" /> : null}
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted">Nothing scheduled on this date.</p>
            )
          ) : (
            <p className="muted">Click a day to see what is scheduled.</p>
          )}
        </section>
      </div>
    </>
  );
}
