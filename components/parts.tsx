'use client';
import { TEAMS, workTeams } from '@/lib/constants';
import { addDays, fmtDate, fmtDT, localDay } from '@/lib/dates';
import { coverage, isOverdue, sched, type Coverage } from '@/lib/metrics';
import { displayTitle, type CTask } from '@/lib/tasks';
import { pctOf, plural } from '@/lib/text';
import { useApp } from './store';
import { CovScale, Flag, PlatPills, StatusSelect, who } from './ui';

export function CovCard({ label, c, tgt }: { label: string; c: Coverage; tgt: number }) {
  const v = c.none ? '—' : plural(c.days, 'day');
  const sub = c.none ? 'No upcoming scheduled content' : c.through ? `Prepared through ${fmtDate(c.through, { weekday: 'short' })}` : `Content for ${fmtDate(c.gap, { weekday: 'short' })} is not ready`;
  const tone = c.none ? '' : c.days >= tgt ? 'good' : c.days < Math.ceil(tgt / 2) ? 'bad' : '';
  return (
    <div className={`kpi ${tone}`}>
      <span className="l">{label}</span>
      <span className="v">
        {v}
        {c.none ? '' : ' ahead'}
      </span>
      <span className="s">{sub}</span>
      {c.none ? null : <CovScale days={c.days} tgt={tgt} behind={false} />}
    </div>
  );
}

export function TeamCompare() {
  const { act, today } = useApp();
  const rows = workTeams().map((team) => {
    const l = act.filter((t) => t.team === team);
    const done = l.filter((t) => t.status === 'completed').length;
    const od = l.filter((t) => isOverdue(t, today)).length;
    const ip = l.filter((t) => t.status === 'in_progress').length;
    const blk = l.filter((t) => t.status === 'blocked').length;
    const c = coverage(l, today);
    const f7 = l.filter((t) => {
      const d = localDay(t.completedAt);
      return d && d > addDays(today, -7) && d <= today;
    }).length;
    const due = l.filter((t) => t.postDate && t.postDate <= today);
    const dueDone = due.filter((t) => t.status === 'completed').length;
    return { team, n: l.length, done, od, ip, blk, c, avg: (f7 / 7).toFixed(1), dueP: pctOf(dueDone, due.length), pct: pctOf(done, l.length) };
  });
  return (
    <>
      <div className="tw" style={{ maxHeight: 'none' }}>
        <table className="cmp">
          <thead>
            <tr>
              <th>Team</th>
              <th>Assigned</th>
              <th>Completed</th>
              <th>Completion</th>
              <th>Due so far done</th>
              <th>In progress</th>
              <th>Blocked</th>
              <th>Overdue</th>
              <th>Avg / day (7d)</th>
              <th>Days ahead</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.team}>
                <td>
                  <b>{TEAMS[r.team]}</b>
                </td>
                <td className="n">{r.n}</td>
                <td className="n">{r.done}</td>
                <td className="n">{r.pct}%</td>
                <td className="n">{r.dueP}%</td>
                <td className="n">{r.ip}</td>
                <td className="n">{r.blk}</td>
                <td className="n" style={r.od ? { color: 'var(--danger)' } : undefined}>
                  {r.od}
                </td>
                <td className="n">{r.avg}</td>
                <td className="n">{r.c.none ? '—' : r.c.days}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted small" style={{ margin: '10px 0 0' }}>
        &quot;Due so far done&quot; counts tasks whose posting date is today or earlier. The team with fewer days ahead is the current bottleneck.
      </p>
    </>
  );
}

export function RecentActivity() {
  const { activity, taskById, openDrawer } = useApp();
  if (!activity.length) return <p className="muted">No activity yet.</p>;
  return (
    <ul className="hist">
      {activity.map((h, i) => {
        const t = h.taskId ? taskById(h.taskId) : undefined;
        const title = t ? displayTitle(t) : h.title || 'Task';
        return (
          <li key={i}>
            <time>{fmtDT(h.at)}</time>
            <span>
              <b>{who(h)}</b> · {h.msg} —{' '}
              <button className="linkish" onClick={() => h.taskId && openDrawer(h.taskId)}>
                {title}
              </button>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function QItem({ t, today }: { t: CTask; today: string }) {
  const { openDrawer } = useApp();
  const sf = sched(t, today);
  return (
    <div className={`qi ${sf.k === 'overdue' ? 'od' : ''}${t.founder ? ' fd' : ''}`}>
      <div className="d">
        {t.postDate ? fmtDate(t.postDate, { year: undefined }) : 'No date'}
        <small>
          {t.day || (t.postDate ? fmtDate(t.postDate, { weekday: 'long', day: undefined, month: undefined, year: undefined }) : '')}
          {t.time ? ' · ' + t.time : ''}
        </small>
      </div>
      <div style={{ minWidth: 0 }}>
        <button className="linkish" onClick={() => openDrawer(t.id)}>
          {displayTitle(t)}
        </button>
        <div className="meta">
          {t.founder ? <span className="tag founder">Founder</span> : null}
          {t.platform ? <PlatPills value={t.platform} /> : null}
          {t.type ? <span className="tag">{t.type}</span> : null}
          {t.pillar ? <span className="tag">{t.pillar}</span> : null}
          {t.adminNote ? <span className="pill fl-today">Note from admin</span> : null}
        </div>
      </div>
      <div className="ctl">
        <Flag k={sf.k} l={sf.l} />
        <StatusSelect t={t} />
        <button className="btn sm" onClick={() => openDrawer(t.id)}>
          View details
        </button>
      </div>
    </div>
  );
}

function niceMax(m: number) {
  if (m <= 4) return 4;
  const p = Math.pow(10, Math.floor(Math.log10(m)));
  const f = m / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
}

export function BarChart({ labels, series }: { labels: string[]; series: { cls: string; vals: number[]; name: string }[] }) {
  const W = 760;
  const H = 270;
  const pl = 42;
  const pr = 12;
  const pt = 20;
  const pb = 46;
  const n = labels.length || 1;
  const max = niceMax(Math.max(0, ...series.flatMap((s) => s.vals)));
  let steps = 4;
  if (max % 4) steps = max % 5 ? 2 : 5;
  const ph = H - pt - pb;
  const pw = W - pl - pr;
  const cw = pw / n;
  const bw = Math.max(3, Math.min(26, (cw * 0.72) / series.length));
  const y = (v: number) => pt + ph - (v / max) * ph;
  const every = Math.ceil(n / 16);
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Bar chart of completed tasks">
      {Array.from({ length: steps + 1 }, (_, i) => {
        const v = (max / steps) * i;
        return (
          <g key={i}>
            <line className="gl" x1={pl} x2={W - pr} y1={y(v).toFixed(1)} y2={y(v).toFixed(1)} />
            <text x={pl - 8} y={(y(v) + 4).toFixed(1)} textAnchor="end">
              {Math.round(v)}
            </text>
          </g>
        );
      })}
      {labels.map((lb, i) => {
        const cx = pl + cw * i + cw / 2;
        const gw = bw * series.length;
        return (
          <g key={i}>
            {series.map((s, j) => {
              const v = s.vals[i] || 0;
              const x = cx - gw / 2 + j * bw;
              const yy = y(v);
              return (
                <g key={j}>
                  <rect className={s.cls} x={x.toFixed(1)} y={yy.toFixed(1)} width={(bw - 2).toFixed(1)} height={Math.max(0, pt + ph - yy).toFixed(1)} rx="2">
                    <title>{`${s.name} · ${lb}: ${v}`}</title>
                  </rect>
                  {v && n <= 14 ? (
                    <text className="vl" x={(x + (bw - 2) / 2).toFixed(1)} y={(yy - 5).toFixed(1)} textAnchor="middle">
                      {v}
                    </text>
                  ) : null}
                </g>
              );
            })}
            {i % every === 0 ? (
              <text x={cx.toFixed(1)} y={H - pb + 20} textAnchor="middle">
                {lb}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}
