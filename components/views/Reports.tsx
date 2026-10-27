'use client';
import { STATUS_KEYS, type Status } from '@/lib/constants';
import { addDays, diffDays, fmtDate, fmtDT, fmtShort, localDay, weekStart } from '@/lib/dates';
import { health, periodRange, pm, type Coverage, type PeriodKind } from '@/lib/metrics';
import { prioCmp } from '@/lib/tasks';
import { pctOf, plural } from '@/lib/text';
import { exportCsvRows, exportTasksFile } from '@/lib/client/export';
import { useApp } from '../store';
import { BarChart, QItem, TeamCompare } from '../parts';
import { CovScale, EmptyImport, Kpi, PageHeader, PlatPills, Pill, ProgRow } from '../ui';

const covTxt = (c: Coverage) => (c.none ? 'No upcoming content' : plural(c.days, 'Day') + ' Ahead');

export function Reports() {
  const { act, today, settings, rep, setRep, toast } = useApp();
  const R = rep;
  const P = periodRange(R.kind, R.off, today);
  if (!act.length)
    return (
      <>
        <PageHeader title="Reports" />
        <EmptyImport />
      </>
    );
  let from = P.from;
  let to = P.to;
  if (R.kind === 'all') {
    const ds = act.flatMap((t) => [t.postDate, localDay(t.completedAt)]).filter(Boolean).sort() as string[];
    from = ds[0] || today;
    to = ds[ds.length - 1] || today;
  }
  const des = act.filter((t) => t.team === 'designer');
  const edi = act.filter((t) => t.team === 'editor');
  const M = pm(act, from, to, today);
  const D = pm(des, from, to, today);
  const E = pm(edi, from, to, today);
  const H = health(act, today, settings.targetBuffer);
  const el = Math.max(1, diffDays(to < today ? to : today, from) + 1);
  const avg = to < from || from > today ? '—' : (M.fin / el).toFixed(1);

  const labels: string[] = [];
  const sd: number[] = [];
  const se: number[] = [];
  let chartTitle = '';
  const fd = (t: { completedAt: string | null }) => localDay(t.completedAt);
  const countOn = (list: typeof act, d: string) => list.filter((t) => fd(t) === d).length;
  const countIn = (list: typeof act, s: string, e: string) =>
    list.filter((t) => {
      const d = fd(t);
      return d && d >= s && d <= e;
    }).length;
  if (R.kind === 'today') {
    for (let i = 6; i >= 0; i--) {
      const d = addDays(P.to, -i);
      labels.push(fmtShort(d));
      sd.push(countOn(des, d));
      se.push(countOn(edi, d));
    }
    chartTitle = 'Tasks completed per day, last 7 days';
  } else if (R.kind === 'all') {
    const end = weekStart(today);
    for (let i = 7; i >= 0; i--) {
      const s = addDays(end, -7 * i);
      const e = addDays(s, 6);
      labels.push(fmtDate(s, { year: undefined }));
      sd.push(countIn(des, s, e));
      se.push(countIn(edi, s, e));
    }
    chartTitle = 'Tasks completed per week, last 8 weeks';
  } else {
    const n = diffDays(to, from) + 1;
    for (let i = 0; i < n; i++) {
      const d = addDays(from, i);
      labels.push(R.kind === 'week' ? fmtShort(d) : String(+d.slice(8)));
      sd.push(countOn(des, d));
      se.push(countOn(edi, d));
    }
    chartTitle = 'Tasks completed per day';
  }
  const statusAll = R.kind === 'all' ? act : M.schList;
  const sc: Record<Status, number> = { not_started: 0, in_progress: 0, completed: 0, blocked: 0 };
  statusAll.forEach((t) => sc[t.status]++);
  const platRows: Record<string, { done: number; pend: number }> = {};
  statusAll.forEach((t) =>
    (t._plats.length ? t._plats : ['No platform']).forEach((p) => {
      platRows[p] = platRows[p] || { done: 0, pend: 0 };
      if (t.status === 'completed') platRows[p].done++;
      else platRows[p].pend++;
    }),
  );
  const per: [PeriodKind, string][] = [
    ['today', 'Today'],
    ['week', 'This Week'],
    ['month', 'This Month'],
    ['all', 'All Time'],
  ];
  const unit = R.kind === 'today' ? 'day' : R.kind;

  const exportReport = () => {
    const c = (x: Coverage) => (x.none ? 'No upcoming content' : x.days + ' days ahead');
    const aoa = [
      ['Endpoint Clients · Production Report'],
      ['Generated', fmtDT(new Date().toISOString())],
      ['Period', P.label],
      [],
      ['Metric', 'All', 'Graphic Designer', 'Video Editor'],
      ['Tasks scheduled', M.sch, D.sch, E.sch],
      ['Completed', M.done, D.done, E.done],
      ['Completion %', M.pct, D.pct, E.pct],
      ['In progress', M.ip, D.ip, E.ip],
      ['Not started', M.ns, D.ns, E.ns],
      ['Blocked', M.blk, D.blk, E.blk],
      ['Remaining', M.rem, D.rem, E.rem],
      ['Overdue', M.od, D.od, E.od],
      ['Finished in period', M.fin, D.fin, E.fin],
      [],
      ['Coverage', 'Overall', 'Graphic Designer', 'Video Editor'],
      ['Days ahead', c(H.c.o), c(H.c.d), c(H.c.e)],
      ['Prepared through', H.c.o.through || '', H.c.d.through || '', H.c.e.through || ''],
      ['Target buffer (days)', H.tgt],
      ['Production health', H.label],
    ];
    const name = `production-report-${today}.csv`;
    exportCsvRows(name, aoa);
    toast('Saved ' + name);
  };
  const exportPeriod = () => {
    const list = R.kind === 'all' ? act : act.filter((t) => t.postDate && t.postDate >= P.from && t.postDate <= P.to);
    if (!list.length) return toast('No tasks to export.', 'bad');
    toast('Saved ' + exportTasksFile(list, 'xlsx', today));
  };

  return (
    <>
      <PageHeader
        title="Reports"
        sub={P.label}
        eyebrow="Performance"
        actions={
          <>
            <button className="btn" onClick={exportReport}>
              Export report (CSV)
            </button>
            <button className="btn" onClick={() => window.print()}>
              Export report (PDF)
            </button>
            <button className="btn" onClick={exportPeriod}>
              Export period tasks (Excel)
            </button>
          </>
        }
      />
      <div className="row no-print" style={{ justifyContent: 'space-between', marginBottom: 16 }}>
        <div className="row" role="group" aria-label="Report period">
          {per.map(([k, l]) => (
            <button key={k} className={`btn ${R.kind === k ? 'primary' : ''}`} aria-pressed={R.kind === k} onClick={() => setRep({ kind: k, off: 0 })}>
              {l}
            </button>
          ))}
        </div>
        {R.kind !== 'all' && (
          <div className="row">
            <button className="btn" onClick={() => setRep({ ...R, off: R.off - 1 })}>
              Previous {unit}
            </button>
            {R.off ? (
              <button className="btn" onClick={() => setRep({ ...R, off: 0 })}>
                Current
              </button>
            ) : null}
            <button className="btn" onClick={() => setRep({ ...R, off: R.off + 1 })}>
              Next {unit}
            </button>
          </div>
        )}
      </div>
      <div className="stack">
        <section className="panel">
          <h2>Production Report</h2>
          <dl className="kv" style={{ marginTop: 6 }}>
            <dt>Today</dt>
            <dd>{fmtDate(today, { weekday: 'long', month: 'long' })}</dd>
            <dt>Period</dt>
            <dd>{P.label}</dd>
            <dt>Tasks scheduled</dt>
            <dd className="num">
              <b>{M.sch}</b>
            </dd>
            <dt>Completed</dt>
            <dd className="num">
              <b>{M.done}</b> ({M.pct}%)
            </dd>
            <dt>In progress</dt>
            <dd className="num">{M.ip}</dd>
            <dt>Not started</dt>
            <dd className="num">{M.ns}</dd>
            {M.blk ? (
              <>
                <dt>Blocked</dt>
                <dd className="num">{M.blk}</dd>
              </>
            ) : null}
            <dt>Overdue</dt>
            <dd className="num" style={M.od ? { color: 'var(--danger)', fontWeight: 700 } : undefined}>
              {M.od}
            </dd>
            <dt>Designer completion</dt>
            <dd className="num">
              {D.pct}% ({D.done} / {D.sch})
            </dd>
            <dt>Editor completion</dt>
            <dd className="num">
              {E.pct}% ({E.done} / {E.sch})
            </dd>
            <dt>Designer coverage</dt>
            <dd>{covTxt(H.c.d)}</dd>
            <dt>Editor coverage</dt>
            <dd>{covTxt(H.c.e)}</dd>
            <dt>Overall content coverage</dt>
            <dd>
              <b>{covTxt(H.c.o)}</b>
              {H.c.o.through ? ` · fully prepared through ${fmtDate(H.c.o.through, { weekday: 'short' })}` : ''}
            </dd>
            <dt>Target</dt>
            <dd>{H.tgt} Days Ahead</dd>
            <dt>Production health</dt>
            <dd>
              <span className={`badge pill h-${H.k}`} style={{ fontSize: 15 }}>
                {H.label}
              </span>
            </dd>
          </dl>
        </section>
        <div className="kpis cols-6">
          <Kpi label="Scheduled" value={M.sch} sub="Posting date in period" />
          <Kpi label="Completed" value={M.done} sub={M.pct + '% of scheduled'} tone="good" />
          <Kpi label="Remaining" value={M.rem} />
          <Kpi label="Overdue" value={M.od} tone={M.od ? 'bad' : ''} />
          <Kpi label="Finished in period" value={M.fin} sub="By completion time" />
          <Kpi label="Avg completed / day" value={avg} sub="Elapsed days in period" />
        </div>
        <section className="panel">
          <div className="panel-h">
            <h2>{chartTitle}</h2>
            <div className="legend">
              <span>
                <i style={{ background: 'var(--chart-1)' }} />
                Graphic Designer
              </span>
              <span>
                <i style={{ background: 'var(--chart-2)' }} />
                Video Editor
              </span>
            </div>
          </div>
          <BarChart
            labels={labels}
            series={[
              { cls: 'b-des', vals: sd, name: 'Designer' },
              { cls: 'b-ed', vals: se, name: 'Editor' },
            ]}
          />
        </section>
        <div className="grid g2">
          <section className="panel">
            <h2>Designer vs Video Editor</h2>
            <div className="stack" style={{ gap: 14 }}>
              <ProgRow label="Graphic Designer · scheduled in period" done={D.done} total={D.sch} cls="des" />
              <ProgRow label="Video Editor · scheduled in period" done={E.done} total={E.sch} cls="ed" />
            </div>
            <div style={{ marginTop: 16 }}>
              <TeamCompare />
            </div>
          </section>
          <section className="panel">
            <h2>Production coverage</h2>
            <div className="stack" style={{ gap: 16 }}>
              {(
                [
                  ['Graphic Designer', H.c.d],
                  ['Video Editor', H.c.e],
                  ['Overall', H.c.o],
                ] as [string, Coverage][]
              ).map(([n, c]) => (
                <div key={n}>
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <b>{n}</b>
                    <span className="num">
                      {c.none ? '—' : plural(c.days, 'day') + ' ahead'}
                      {c.through ? ' · through ' + fmtDate(c.through, { year: undefined }) : ''}
                    </span>
                  </div>
                  {c.none ? null : <CovScale days={c.days} tgt={H.tgt} behind={H.od > 0} />}
                </div>
              ))}
              <p className="muted small" style={{ margin: 0 }}>
                Coverage counts consecutive posting days from tomorrow whose tasks are all completed. The first unfinished day stops the count. Overall uses the slower team.
              </p>
            </div>
          </section>
        </div>
        <div className="grid g2">
          <section className="panel">
            <h2>Status distribution</h2>
            <p className="muted small" style={{ margin: '0 0 10px' }}>
              {R.kind === 'all' ? 'All active tasks' : 'Tasks scheduled in this period'} · {statusAll.length} total
            </p>
            <div className="bar" style={{ height: 22 }} role="img" aria-label="Status distribution">
              {(
                [
                  ['completed', 'done'],
                  ['in_progress', 'ip'],
                  ['blocked', 'blk'],
                  ['not_started', 'ns'],
                ] as [Status, string][]
              ).map(([s, c]) => (
                <i key={s} className={c} style={{ width: `${pctOf(sc[s], statusAll.length)}%` }} />
              ))}
            </div>
            <table className="cmp" style={{ marginTop: 12 }}>
              <tbody>
                {STATUS_KEYS.map((s) => (
                  <tr key={s}>
                    <td>
                      <Pill s={s} />
                    </td>
                    <td className="n">{sc[s]}</td>
                    <td className="n">{pctOf(sc[s], statusAll.length)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <section className="panel">
            <h2>Platform distribution</h2>
            <p className="muted small" style={{ margin: '0 0 10px' }}>
              Completed vs pending by platform
            </p>
            <div className="stack" style={{ gap: 12 }}>
              {Object.entries(platRows)
                .sort((a, b) => b[1].done + b[1].pend - (a[1].done + a[1].pend))
                .map(([p, v]) => {
                  const tot = v.done + v.pend;
                  return (
                    <div className="prog" key={p}>
                      <div className="top">
                        <span>
                          <PlatPills value={p} />
                        </span>
                        <span className="num">
                          {v.done} done · <b>{v.pend} pending</b>
                        </span>
                      </div>
                      <div className="bar">
                        <i className="done" style={{ width: `${pctOf(v.done, tot)}%` }} />
                      </div>
                    </div>
                  );
                })}
              {Object.keys(platRows).length ? null : <p className="muted">No tasks in this period.</p>}
            </div>
          </section>
        </div>
        {R.kind === 'today' && (
          <section className="panel">
            <h2>Tasks scheduled {R.off === 0 ? 'today' : 'on this day'}</h2>
            {M.schList.length ? (
              <div className="stack" style={{ gap: 8 }}>
                {[...M.schList].sort(prioCmp(today)).map((t) => (
                  <QItem key={t.id} t={t} today={today} />
                ))}
              </div>
            ) : (
              <p className="muted">Nothing scheduled.</p>
            )}
          </section>
        )}
      </div>
    </>
  );
}
