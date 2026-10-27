'use client';
import { TEAMS, type Role, type Team } from '@/lib/constants';
import { addDays, fmtDate, localDay } from '@/lib/dates';
import { coverage, isOverdue } from '@/lib/metrics';
import { prioCmp } from '@/lib/tasks';
import { plural } from '@/lib/text';
import { useApp } from '../store';
import { QItem } from '../parts';
import { CovScale, PageHeader, StatStrip } from '../ui';
import { TaskTable } from '../TaskTable';

export function TeamView({ team, admin }: { team: Role; admin: boolean }) {
  const { act, today, settings, teamTab, setTeamTab, qExpand, setQExpand, teamQuick, setViewAs, nav } = useApp();
  const list = act.filter((t) => t.team === team);
  const title = team === 'designer' ? 'Graphic Design Tasks' : team === 'editor' ? 'Video Editing Tasks' : `${TEAMS[team] || 'Team'} Tasks`;
  const key = 'team-' + team;
  const empty = (
    <div className="empty">
      <h2>{team === 'designer' ? 'No design tasks assigned.' : team === 'editor' ? 'No video tasks assigned.' : 'No tasks assigned.'}</h2>
      {admin ? <p className="muted">Assign a sheet or tasks to this team in Task Distribution.</p> : null}
    </div>
  );
  const tab = teamTab[team] || 'queue';
  const scheduledToday = list.filter((t) => t.postDate === today);
  const doneToday = list.filter((t) => localDay(t.completedAt) === today).length;
  const ip = list.filter((t) => t.status === 'in_progress').length;
  const ns = list.filter((t) => t.status === 'not_started').length;
  const od = list.filter((t) => isOverdue(t, today)).length;
  const upc = list.filter((t) => t.postDate && t.postDate > today && t.postDate <= addDays(today, 7) && t.status !== 'completed').length;
  const cov = coverage(list, today);
  const tgt = +settings.targetBuffer || 7;
  const head = (
    <PageHeader
      title={title}
      sub={admin ? `${TEAMS[team as Team]} workload` : fmtDate(today, { weekday: 'long', month: 'long' })}
      actions={
        admin ? (
          <button
            className="btn"
            onClick={() => {
              setViewAs(team);
              nav('team');
            }}
          >
            Preview as {TEAMS[team as Team]}
          </button>
        ) : null
      }
      eyebrow="Endpoint Clients"
    />
  );
  if (!list.length && !admin)
    return (
      <>
        {head}
        {empty}
      </>
    );
  return (
    <>
      {head}
      <div className="stack">
        <StatStrip
          items={[
            { label: "Today's tasks", value: scheduledToday.length, sub: `${scheduledToday.filter((t) => t.status === 'completed').length} done`, onClick: () => teamQuick(team, 'today') },
            { label: 'Completed today', value: doneToday, sub: 'Marked completed', tone: 'good', onClick: () => teamQuick(team, 'donetoday') },
            { label: 'In progress', value: ip, onClick: () => teamQuick(team, 'in_progress') },
            { label: 'Not started', value: ns, onClick: () => teamQuick(team, 'not_started') },
            { label: 'Overdue', value: od, sub: 'Past posting date', tone: od ? 'bad' : '', onClick: () => teamQuick(team, 'overdue') },
            { label: 'Upcoming', value: upc, sub: 'Unfinished, next 7 days', onClick: () => teamQuick(team, 'next7') },
          ]}
        />
        <div className="panel row" style={{ justifyContent: 'space-between' }}>
          <div>
            <b style={{ fontSize: 18 }}>Production coverage: {cov.none ? 'no upcoming content' : plural(cov.days, 'day') + ' ahead'}</b>
            <div className="muted">
              {cov.through ? `Ready through ${fmtDate(cov.through, { weekday: 'long' })} · ` : cov.gap ? `Next unfinished date: ${fmtDate(cov.gap, { weekday: 'long' })} · ` : ''}Target {tgt} days
            </div>
          </div>
          {cov.none ? null : (
            <div style={{ flex: 1, minWidth: 240, maxWidth: 520 }}>
              <CovScale days={cov.days} tgt={tgt} behind={od > 0} />
            </div>
          )}
        </div>
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'queue'} onClick={() => setTeamTab(team, 'queue')}>
            Work queue
          </button>
          <button role="tab" aria-selected={tab === 'table'} onClick={() => setTeamTab(team, 'table')}>
            All tasks
          </button>
        </div>
        {tab === 'queue' ? <Queue team={team} list={list} today={today} qExpand={qExpand} setQExpand={setQExpand} /> : <TaskTable tkey={key} team={team as Team} admin={admin} empty={empty} />}
      </div>
    </>
  );
}

function Queue({ team, list, today, qExpand, setQExpand }: { team: string; list: ReturnType<typeof useApp>['act']; today: string; qExpand: Record<string, boolean>; setQExpand: (k: string) => void }) {
  const open = list.filter((t) => t.status !== 'completed');
  const secs: [string, string, (t: (typeof list)[number]) => boolean][] = [
    ['Overdue', 'overdue', (t) => !!t.postDate && t.postDate < today],
    ['Due Today', 'today', (t) => t.postDate === today],
    ['Due Soon', 'soon', (t) => !!t.postDate && t.postDate > today && t.postDate <= addDays(today, 3)],
    ['Future', 'future', (t) => !!t.postDate && t.postDate > addDays(today, 3)],
    ['No posting date', 'nodate', (t) => !t.postDate],
  ];
  const cmp = prioCmp(today);
  if (!open.length) return <div className="okbox">Every assigned task is completed. Nice work.</div>;
  return (
    <div className="queue">
      {secs.map(([label, k, fn]) => {
        const l = open.filter(fn).sort(cmp);
        if (!l.length && k === 'nodate') return null;
        const ek = team + k;
        const lim = qExpand[ek] ? l.length : 12;
        return (
          <section className="sec" key={k}>
            <h3>
              {label} <span className={`pill ${k === 'overdue' ? 'fl-overdue' : k === 'today' ? 'fl-today' : 'fl-later'} num`}>{l.length}</span>
            </h3>
            {l.length ? <div className="qlist">{l.slice(0, lim).map((t) => <QItem key={t.id} t={t} today={today} />)}</div> : <p className="muted">Nothing here.</p>}
            {l.length > lim ? (
              <button className="btn sm mt-2" onClick={() => setQExpand(ek)}>
                Show all {l.length}
              </button>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
