'use client';
import { useMemo, useState } from 'react';
import { Crown, Search, X } from 'lucide-react';
import { STATUS, STATUS_KEYS, TEAMS, type Role, type Team } from '@/lib/constants';
import { addDays, fmtDate, localDay } from '@/lib/dates';
import { coverage, isOverdue } from '@/lib/metrics';
import { prioCmp } from '@/lib/tasks';
import { plural, splitPlat } from '@/lib/text';
import { useApp } from '../store';
import { QItem } from '../parts';
import { CovScale, PageHeader, StatStrip } from '../ui';
import { TaskTable } from '../TaskTable';

export function TeamView({ team, admin }: { team: Role; admin: boolean }) {
  const { act, today, settings, teamTab, setTeamTab, teamFounder, setTeamFounder, qExpand, setQExpand, teamQuick, setViewAs, nav } = useApp();
  const mine = act.filter((t) => t.team === team);
  const founderList = mine.filter((t) => t.founder);
  const fm = !!teamFounder[team]; // Founder content view: everything on the page is limited to founder content
  const list = fm ? founderList : mine.filter((t) => !t.founder);
  const title = team === 'designer' ? 'Graphic Design Tasks' : team === 'editor' ? 'Video Editing Tasks' : `${TEAMS[team] || 'Team'} Tasks`;
  const key = 'team-' + team + (fm ? '-founder' : '');
  const empty = (
    <div className="empty">
      <h2>{team === 'designer' ? 'No design tasks assigned.' : team === 'editor' ? 'No video tasks assigned.' : 'No tasks assigned.'}</h2>
      {admin ? <p className="muted">Assign a sheet or tasks to this team in Task Distribution.</p> : null}
    </div>
  );
  const tab = teamTab[team] === 'table' ? 'table' : 'queue';
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
  if (!mine.length && !admin)
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
        <div className="tabrow">
          <div className="tabs" role="tablist">
            <button role="tab" aria-selected={tab === 'queue'} onClick={() => setTeamTab(team, 'queue')}>
              Work queue
            </button>
            <button role="tab" aria-selected={tab === 'table'} onClick={() => setTeamTab(team, 'table')}>
              All tasks
            </button>
          </div>
          <button className="founder-tab" aria-pressed={fm} onClick={() => setTeamFounder(team, !fm)}>
            <Crown className="size-4" />
            Founder content
            <span className="num">{founderList.filter((t) => t.status !== 'completed').length}</span>
          </button>
        </div>
        {fm ? (
          <div className="founder-banner">
            <Crown className="size-5" />
            <div>
              <b>Founder content</b>
              <span>Everything below, including the numbers above, is limited to founder content.</span>
            </div>
            <button className="btn sm" onClick={() => setTeamFounder(team, false)}>
              Back to regular content
            </button>
          </div>
        ) : null}
        {fm && !founderList.length ? (
          <div className="empty">
            <h2>No founder content yet.</h2>
            <p className="muted">{admin ? 'Tick “Founder content” for a sheet on the Assign step of Content Import and it will show up here.' : 'Founder content assigned to you will show up here.'}</p>
          </div>
        ) : tab === 'queue' ? (
          <Queue team={fm ? team + '-founder' : team} list={list} today={today} qExpand={qExpand} setQExpand={setQExpand} />
        ) : (
          <TaskTable tkey={key} team={team as Team} admin={admin} empty={empty} founder={fm} />
        )}
      </div>
    </>
  );
}

function Queue({ team, list, today, qExpand, setQExpand }: { team: string; list: ReturnType<typeof useApp>['act']; today: string; qExpand: Record<string, boolean>; setQExpand: (k: string) => void }) {
  const [fq, setFq] = useState({ q: '', status: '', platform: '', pillar: '', type: '' });
  const set = (k: keyof typeof fq, v: string) => setFq((x) => ({ ...x, [k]: v }));
  const all = list.filter((t) => t.status !== 'completed');
  const uniq = (get: (t: (typeof list)[number]) => string[]) => [...new Set(all.flatMap(get).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const plats = useMemo(() => uniq((t) => splitPlat(t.platform)), [all]); // eslint-disable-line react-hooks/exhaustive-deps
  const pillars = useMemo(() => uniq((t) => [t.pillar]), [all]); // eslint-disable-line react-hooks/exhaustive-deps
  const types = useMemo(() => uniq((t) => [t.type]), [all]); // eslint-disable-line react-hooks/exhaustive-deps
  const term = fq.q.trim().toLowerCase();
  const open = all.filter(
    (t) =>
      (!term || [t.title, t.platform, t.pillar, t.type].some((x) => String(x || '').toLowerCase().includes(term))) &&
      (!fq.status || t.status === fq.status) &&
      (!fq.platform || splitPlat(t.platform).includes(fq.platform)) &&
      (!fq.pillar || t.pillar === fq.pillar) &&
      (!fq.type || t.type === fq.type),
  );
  const filtered = !!(fq.q || fq.status || fq.platform || fq.pillar || fq.type);
  const secs: [string, string, (t: (typeof list)[number]) => boolean][] = [
    ['Overdue', 'overdue', (t) => !!t.postDate && t.postDate < today],
    ['Due Today', 'today', (t) => t.postDate === today],
    ['Due Soon', 'soon', (t) => !!t.postDate && t.postDate > today && t.postDate <= addDays(today, 3)],
    ['Future', 'future', (t) => !!t.postDate && t.postDate > addDays(today, 3)],
    ['No posting date', 'nodate', (t) => !t.postDate],
  ];
  const cmp = prioCmp(today);
  if (!all.length) return <div className="okbox">Every assigned task is completed. Nice work.</div>;
  const sel = (label: string, k: keyof typeof fq, allLabel: string, vals: string[]) => (
    <label className="field">
      <span>{label}</span>
      <select className="inp" value={fq[k]} onChange={(e) => set(k, e.target.value)}>
        <option value="">{allLabel}</option>
        {vals.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <div className="queue">
      <div className="filters mb-5" role="search" aria-label="Filter the work queue">
        <label className="field relative">
          <span>Search</span>
          <Search className="pointer-events-none absolute bottom-2.5 left-3 size-4 text-muted-foreground" />
          <input className="inp !pl-9" type="search" value={fq.q} placeholder="Search tasks…" onChange={(e) => set('q', e.target.value)} />
        </label>
        <label className="field">
          <span>Status</span>
          <select className="inp" value={fq.status} onChange={(e) => set('status', e.target.value)}>
            <option value="">All open statuses</option>
            {STATUS_KEYS.filter((k) => k !== 'completed').map((k) => (
              <option key={k} value={k}>
                {STATUS[k]}
              </option>
            ))}
          </select>
        </label>
        {sel('Platform', 'platform', 'All platforms', plats)}
        {sel('Content pillar', 'pillar', 'All pillars', pillars)}
        {sel('Type', 'type', 'All types', types)}
        {filtered ? (
          <button className="btn" onClick={() => setFq({ q: '', status: '', platform: '', pillar: '', type: '' })}>
            <X className="size-4" /> Clear filters
          </button>
        ) : null}
      </div>
      {filtered && !open.length ? <p className="muted">No open tasks match these filters.</p> : null}
      {secs.map(([label, k, fn]) => {
        const l = open.filter(fn).sort(cmp);
        if (!l.length && (k === 'nodate' || filtered)) return null;
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
