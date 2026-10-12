'use client';
import { useEffect } from 'react';
import { addDays, fmtDate } from '@/lib/dates';
import { health, isOverdue, periodRange, pm } from '@/lib/metrics';
import { genericHeads, pctOf, plural } from '@/lib/text';
import { TEAMS, type Status } from '@/lib/constants';
import { useApp } from '../store';
import { CovCard, RecentActivity, TeamCompare } from '../parts';
import { CovScale, EmptyImport, Kpi, PageHeader, Pill, ProgRow, Ring } from '../ui';

type Alert = [tone: string, icon: string, msg: string, q?: string];

export function Dashboard() {
  const { act, today, settings, imports, nav, gotoTasks, gotoReport, refreshActivity } = useApp();

  useEffect(() => {
    void refreshActivity();
  }, [refreshActivity]);

  const qa = (
    <>
      <button className="btn primary" onClick={() => nav('import')}>
        Upload Excel
      </button>
      <button className="btn" onClick={() => gotoReport('today')}>
        View Today
      </button>
      <button className="btn" onClick={() => gotoTasks('overdue')}>
        View Overdue
      </button>
      <button className="btn" onClick={() => nav('reports')}>
        View Reports
      </button>
    </>
  );
  const head = <PageHeader title="Production overview" sub={fmtDate(today, { weekday: 'long', month: 'long' })} actions={qa} eyebrow="Endpoint Clients" />;
  if (!act.length)
    return (
      <>
        {head}
        <EmptyImport />
      </>
    );

  const H = health(act, today, settings.targetBuffer);
  const c: Record<Status, number> = { not_started: 0, in_progress: 0, completed: 0, blocked: 0 };
  act.forEach((t) => c[t.status]++);
  const od = act.filter((t) => isOverdue(t, today)).length;
  const T = pm(act, today, today, today);
  const wk = periodRange('week', 0, today);
  const W = pm(act, wk.from, wk.to, today);
  const gapTxt = H.c.o.none ? '' : H.gap > 0 ? `${plural(H.gap, 'day')} behind target` : H.gap < 0 ? `${plural(-H.gap, 'day')} above target` : 'Exactly on target';

  const alerts: Alert[] = [];
  const odList = act.filter((t) => isOverdue(t, today));
  if (odList.length) {
    const d = odList.filter((t) => t.team === 'designer').length;
    const e = odList.filter((t) => t.team === 'editor').length;
    const more = H.c.extra.map((x) => `${TEAMS[x.key] || x.key} ${odList.filter((t) => t.team === x.key).length}`);
    alerts.push(['bad', '!', `${plural(odList.length, 'overdue task')} (${['Designer ' + d, 'Editor ' + e, ...more].join(', ')})`, 'overdue']);
  }
  (
    [
      ['Designer', H.c.d],
      ['Editor', H.c.e],
      ...H.c.extra.map((x) => [TEAMS[x.key] || x.key, x.c] as const),
    ] as const
  ).forEach(([n, cv]) => {
    if (cv.none) return;
    if (cv.days < H.tgt) alerts.push([cv.days < Math.ceil(H.tgt / 2) ? 'bad' : 'warn', '↓', `${n} only ${plural(cv.days, 'day')} ahead (target ${H.tgt})`]);
    else alerts.push(['ok', '✓', `${n} ${plural(cv.days, 'day')} ahead`]);
  });
  const tdy = act.filter((t) => t.postDate === today && t.status !== 'completed').length;
  if (tdy) alerts.push(['warn', '•', `Today has ${plural(tdy, 'unfinished task')}`, 'today']);
  const tm = act.filter((t) => t.postDate === addDays(today, 1) && t.status !== 'completed').length;
  if (tm) alerts.push(['info', '•', `Tomorrow has ${plural(tm, 'unfinished task')}`]);
  const blk = act.filter((t) => t.status === 'blocked').length;
  if (blk) alerts.push(['bad', '■', `${plural(blk, 'blocked task')} waiting on something`, 'blocked']);
  const un = act.filter((t) => t.team === 'unassigned').length;
  if (un) alerts.push(['info', '?', `${plural(un, 'task')} not assigned to anyone`, 'unassigned']);
  for (const imp of imports)
    for (const sh of imp.sheets)
      if (genericHeads(sh.headers)) alerts.push(['warn', '!', `${sh.name} was imported without its column names. Fix it in Imports with one click.`, '__imports']);
  const nd = act.filter((t) => !t.postDate && (t.team === 'designer' || t.team === 'editor')).length;
  if (nd) alerts.push(['info', '?', `${plural(nd, 'task')} without a readable posting date (left out of coverage)`, 'nodate']);

  const td = T.schList.filter((t) => t.team === 'designer');
  const te = T.schList.filter((t) => t.team === 'editor');
  const up = [3, 7, 14].map((n) => {
    const to = addDays(today, n);
    const l = act.filter((t) => t.postDate && t.postDate > today && t.postDate <= to);
    const u = l.filter((t) => t.status !== 'completed');
    return { n, total: l.length, un: u.length, d: u.filter((t) => t.team === 'designer').length, e: u.filter((t) => t.team === 'editor').length };
  });

  return (
    <>
      {head}
      <div className="stack">
        <div className="health">
          <div>
            <div className="muted small" style={{ fontWeight: 700 }}>
              Production Health
            </div>
            <span className={`badge h-${H.k}`}>{H.label}</span>
          </div>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ fontSize: 18, fontWeight: 700 }}>
              Overall content coverage: {H.c.o.none ? 'no upcoming content' : plural(H.c.o.days, 'day') + ' ahead'} · Target {H.tgt} days
            </div>
            <div className="muted">
              {H.od ? `${plural(H.od, 'task')} past their posting date are unfinished. ` : ''}
              {gapTxt}
              {H.c.o.through ? ` · Content fully prepared through ${fmtDate(H.c.o.through, { weekday: 'long' })}` : ''}
            </div>
            {H.c.o.none ? null : <CovScale days={H.c.o.days} tgt={H.tgt} behind={!!H.od} />}
          </div>
        </div>
        {alerts.length ? (
          <div className="alerts" aria-label="Alerts">
            {alerts.map(([t, i, m, q], k) => (
              <div key={k} className={`alert a-${t}`}>
                <span className="ic" aria-hidden="true">
                  {i}
                </span>
                <span style={{ flex: 1 }}>{m}</span>
                {q === '__imports' ? (
                  <button className="btn sm" onClick={() => nav('imports')}>
                    Open Imports
                  </button>
                ) : q ? (
                  <button className="btn sm" onClick={() => gotoTasks(q)}>
                    View
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
        <div className="kpis">
          <Kpi label="Total active tasks" value={act.length} onClick={() => gotoTasks('')} />
          <Kpi label="Completed" value={c.completed} sub={pctOf(c.completed, act.length) + '% of all'} tone="good" onClick={() => gotoTasks('completed')} />
          <Kpi label="In progress" value={c.in_progress} onClick={() => gotoTasks('in_progress')} />
          <Kpi label="Not started" value={c.not_started} onClick={() => gotoTasks('not_started')} />
          <Kpi label="Overdue" value={od} sub="Past posting date, not completed" tone={od ? 'bad' : ''} onClick={() => gotoTasks('overdue')} />
          <Kpi label="Today's completion" value={T.pct + '%'} sub={`${T.done} of ${T.sch} scheduled today`} onClick={() => gotoReport('today')} />
          <Kpi label="This week's completion" value={W.pct + '%'} sub={`${W.done} of ${W.sch} scheduled this week`} onClick={() => gotoReport('week')} />
          <Kpi label="Finished today" value={T.fin} sub="Tasks marked completed today" />
        </div>
        <div className="grid g3">
          <CovCard label="Designer coverage" c={H.c.d} tgt={H.tgt} />
          <CovCard label="Video Editor coverage" c={H.c.e} tgt={H.tgt} />
          {H.c.extra.map((x) => (
            <CovCard key={x.key} label={`${TEAMS[x.key] || x.key} coverage`} c={x.c} tgt={H.tgt} />
          ))}
          <CovCard label="Overall production coverage" c={H.c.o} tgt={H.tgt} />
        </div>
        <div className="grid g2">
          <section className="panel">
            <div className="panel-h">
              <h2>Today</h2>
              <button className="btn sm" onClick={() => gotoTasks('today')}>
                Open today&apos;s tasks
              </button>
            </div>
            {T.sch ? (
              <div className="row" style={{ gap: 24, alignItems: 'center' }}>
                <Ring p={T.pct} label="ready today" />
                <div className="stack" style={{ flex: 1, minWidth: 200, gap: 12 }}>
                  <div className="row small" style={{ gap: 8 }}>
                    <Pill s="completed" /> <b className="num">{T.done}</b> <Pill s="in_progress" /> <b className="num">{T.ip}</b> <Pill s="not_started" /> <b className="num">{T.ns}</b>
                    {T.blk ? (
                      <>
                        {' '}
                        <Pill s="blocked" /> <b className="num">{T.blk}</b>
                      </>
                    ) : null}
                  </div>
                  <ProgRow label="Designer" done={td.filter((t) => t.status === 'completed').length} total={td.length} cls="des" />
                  <ProgRow label="Video Editor" done={te.filter((t) => t.status === 'completed').length} total={te.length} cls="ed" />
                </div>
              </div>
            ) : (
              <p className="muted">Nothing is scheduled to post today.</p>
            )}
            <p className="muted small" style={{ margin: '12px 0 0' }}>
              Overdue from earlier days: <b className="num">{od}</b> · Finished today across all dates: <b className="num">{T.fin}</b>
            </p>
          </section>
          <section className="panel">
            <h2>Upcoming work</h2>
            <table className="cmp">
              <thead>
                <tr>
                  <th>Window</th>
                  <th>Scheduled</th>
                  <th>Unfinished</th>
                  <th>Design</th>
                  <th>Video</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {up.map((u) => (
                  <tr key={u.n}>
                    <td>
                      <b>Next {u.n} days</b>
                    </td>
                    <td className="n">{u.total}</td>
                    <td className="n">{u.un}</td>
                    <td className="n">{u.d}</td>
                    <td className="n">{u.e}</td>
                    <td>
                      <button className="btn sm" onClick={() => gotoTasks(`next${u.n}`)}>
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
        <section className="panel">
          <h2>Designer and Video Editor pace</h2>
          <TeamCompare />
        </section>
        <section className="panel">
          <h2>Recent activity</h2>
          <RecentActivity />
        </section>
      </div>
    </>
  );
}
