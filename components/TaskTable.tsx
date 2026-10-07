'use client';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { STATUS, STATUS_KEYS, TEAMS, TEAM_KEYS, TEAM_SHORT, type Status, type Task, type Team } from '@/lib/constants';
import { fmtDT } from '@/lib/dates';
import { sched } from '@/lib/metrics';
import { statusPatch } from '@/lib/status';
import { isURL } from '@/lib/text';
import { displayTitle, filtered, headersOf, sorter, uniq, type CTask } from '@/lib/tasks';
import { exportTasksFile } from '@/lib/client/export';
import { lsSet } from '@/lib/client/api';
import { useApp } from './store';
import { EmptyImport, Flag, PlatPills, StatusSelect } from './ui';

const SYS_COLS: [string, string][] = [
  ['__team', 'Assigned Team'],
  ['__sched', 'Schedule'],
  ['__completed', 'Completed At'],
  ['__notes', 'Production Notes'],
  ['__sheet', 'Sheet'],
  ['__id', 'Task ID'],
];

const QUICK: [string, string][] = [
  ['', 'All tasks'],
  ['today', 'Due today'],
  ['overdue', 'Overdue'],
  ['week', 'This week'],
  ['next3', 'Next 3 days'],
  ['next7', 'Next 7 days'],
  ['next14', 'Next 14 days'],
  ['unfinished', 'Unfinished'],
  ['donetoday', 'Completed today'],
  ['nodate', 'No posting date'],
];
const SORTS: [string, string][] = [
  ['prio', 'Priority (overdue first)'],
  ['date', 'Posting date, earliest'],
  ['date_desc', 'Posting date, latest'],
  ['platform', 'Platform'],
  ['status', 'Status'],
  ['title', 'Title'],
  ['pillar', 'Content pillar'],
  ['completed', 'Recently completed'],
];

interface Props {
  tkey: string;
  /** Limit to one team; omit for every task (admin Task Distribution). */
  team?: Team;
  admin: boolean;
  empty?: ReactNode;
}

function SearchBox({ tkey, value, onCommit }: { tkey: string; value: string; onCommit: (v: string) => void }) {
  const [val, setVal] = useState(value);
  const last = useRef(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (value !== last.current) {
      last.current = value;
      setVal(value);
    }
  }, [value]);
  return (
    <label className="field search">
      <span>Search tasks</span>
      <input
        className="inp"
        type="search"
        id={`q-${tkey}`}
        value={val}
        placeholder="Title, platform, pillar, copy, date…"
        onChange={(e) => {
          setVal(e.target.value);
          if (timer.current) clearTimeout(timer.current);
          const v = e.target.value;
          timer.current = setTimeout(() => {
            last.current = v;
            onCommit(v);
          }, 140);
        }}
      />
    </label>
  );
}

function Cell({ t, h }: { t: CTask; h: string }) {
  const i = t._hidx[h];
  if (i == null) return <td />;
  const v = t.v[i] || '';
  const url = t.u[i];
  if (i === t.m.platform)
    return (
      <td>
        <PlatPills value={v} />
      </td>
    );
  if (isURL(v))
    return (
      <td>
        <a href={v.trim()} target="_blank" rel="noopener noreferrer" title={v}>
          Open Reference ↗
        </a>
      </td>
    );
  if (url && /^https?:/i.test(url))
    return (
      <td>
        <a href={url} target="_blank" rel="noopener noreferrer" title={url}>
          {v || 'Open Reference'} ↗
        </a>
      </td>
    );
  return (
    <td>
      <div className={i === t.m.title ? 'clip title' : 'clip'}>{v}</div>
    </td>
  );
}

export function TaskTable({ tkey, team, admin, empty }: Props) {
  const { tasks, today, tstate, updTable, openDrawer, bulk, confirmBox, toast } = useApp();
  const st = tstate(tkey);
  const f = st.f;

  const base = useMemo(() => (team ? tasks.filter((t) => t.team === team) : tasks), [tasks, team]);
  const activeBase = useMemo(() => base.filter((t) => !t.archived), [base]);

  const plats = useMemo(() => uniq(base, (t) => t._plats), [base]);
  const pillars = useMemo(() => uniq(base, (t) => t.pillar), [base]);
  const types = useMemo(() => uniq(base, (t) => t.type), [base]);
  const days = useMemo(() => uniq(base, (t) => t.day), [base]);
  const sheets = useMemo(() => (admin ? uniq(base, (t) => t.sheet) : []), [base, admin]);
  const workbooks = useMemo(() => (admin ? uniq(base, (t) => t.workbook) : []), [base, admin]);

  const list = useMemo(() => filtered(base, st.q, st.f, today).sort(sorter(st.sort, today)), [base, st.q, st.f, st.sort, today]);
  const pages = Math.max(1, Math.ceil(list.length / st.size));
  const page = Math.min(st.page, pages);
  const slice = list.slice((page - 1) * st.size, page * st.size);

  const heads = useMemo(() => headersOf(base.filter((t) => !t.archived || st.f.arch !== 'active')), [base, st.f.arch]);
  const defaultSys = admin ? ['__team', '__sched'] : ['__sched'];
  const sysOn = (k: string) => st.hidden.includes('+' + k) || (defaultSys.includes(k) && !st.hidden.includes(k));
  const cols = [
    ...heads.filter((h) => !st.hidden.includes('c:' + h)).map((h) => ({ k: 'c:' + h, h, sys: false })),
    ...SYS_COLS.filter(([k]) => sysOn(k)).map(([k, h]) => ({ k, h, sys: true })),
  ];
  const allCols = [...heads.map((h) => ({ k: 'c:' + h, h, sys: false, on: !st.hidden.includes('c:' + h) })), ...SYS_COLS.map(([k, h]) => ({ k, h, sys: true, on: sysOn(k) }))];

  const set = (fn: (s: typeof st) => void) => updTable(tkey, fn);
  const setF = (k: keyof typeof f, v: string) =>
    set((s) => {
      (s.f as unknown as Record<string, string>)[k] = v;
      s.page = 1;
    });

  const toggleCol = (c: string, sys: boolean, checked: boolean) =>
    set((s) => {
      s.hidden = s.hidden.filter((x) => x !== c && x !== '+' + c);
      if (sys) {
        const def = defaultSys.includes(c);
        if (checked && !def) s.hidden.push('+' + c);
        if (!checked && def) s.hidden.push(c);
      } else if (!checked) s.hidden.push(c);
      lsSet('epc.cols.' + tkey, s.hidden);
    });

  const hasFilters = !!(st.q || Object.entries(f).some(([k, v]) => (k === 'arch' ? v !== 'active' : !!v)));
  const clearFilters = () =>
    set((s) => {
      s.q = '';
      (Object.keys(s.f) as (keyof typeof f)[]).forEach((x) => ((s.f as unknown as Record<string, string>)[x] = x === 'arch' ? 'active' : ''));
      s.page = 1;
    });

  const selN = st.sel.size;
  const pageSel = slice.length > 0 && slice.every((t) => st.sel.has(t.id));
  const [bt, setBt] = useState<Team>('designer');
  const [bs, setBs] = useState<Status>('not_started');

  const runBulk = (payload: Parameters<typeof bulk>[1], label: string, local?: (t: CTask) => Partial<Task> | null) => {
    const ids = [...st.sel];
    void bulk(ids, payload, label, local);
    set((s) => s.sel.clear());
  };

  if (!activeBase.length && f.arch !== 'archived') return <>{empty || <EmptyImport />}</>;

  return (
    <div id={`tt-${tkey}`}>
      <div className="filters" role="search">
        <SearchBox tkey={tkey} value={st.q} onCommit={(v) => set((s) => { s.q = v; s.page = 1; })} />
        <label className="field">
          <span>Quick view</span>
          <select className="inp" id={`fq-${tkey}`} value={f.quick} onChange={(e) => setF('quick', e.target.value)}>
            {QUICK.concat(admin ? [['unassigned', 'Unassigned']] : []).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Status</span>
          <select className="inp" id={`fs-${tkey}`} value={f.status} onChange={(e) => setF('status', e.target.value)}>
            <option value="">All statuses</option>
            {STATUS_KEYS.map((s) => (
              <option key={s} value={s}>
                {STATUS[s]}
              </option>
            ))}
          </select>
        </label>
        <Opt id={`fp-${tkey}`} label="Platform" all="All platforms" vals={plats} cur={f.platform} on={(v) => setF('platform', v)} />
        <Opt id={`fpl-${tkey}`} label="Content pillar" all="All pillars" vals={pillars} cur={f.pillar} on={(v) => setF('pillar', v)} />
        <Opt id={`ft-${tkey}`} label="Type" all="All types" vals={types} cur={f.type} on={(v) => setF('type', v)} />
        <Opt id={`fd-${tkey}`} label="Day" all="All days" vals={days} cur={f.day} on={(v) => setF('day', v)} />
        <label className="field">
          <span>Posting date from</span>
          <input className="inp" type="date" id={`ff-${tkey}`} value={f.from} onChange={(e) => setF('from', e.target.value)} />
        </label>
        <label className="field">
          <span>Posting date to</span>
          <input className="inp" type="date" id={`fto-${tkey}`} value={f.to} onChange={(e) => setF('to', e.target.value)} />
        </label>
        {admin && (
          <>
            <label className="field">
              <span>Assigned team</span>
              <select className="inp" id={`fteam-${tkey}`} value={f.team} onChange={(e) => setF('team', e.target.value)}>
                <option value="">All teams</option>
                {TEAM_KEYS.map((x) => (
                  <option key={x} value={x}>
                    {TEAMS[x]}
                  </option>
                ))}
              </select>
            </label>
            <Opt id={`fsh-${tkey}`} label="Sheet" all="All sheets" vals={sheets} cur={f.sheet} on={(v) => setF('sheet', v)} />
            <Opt id={`fwb-${tkey}`} label="Workbook" all="All workbooks" vals={workbooks} cur={f.workbook} on={(v) => setF('workbook', v)} />
            <label className="field">
              <span>Completed from</span>
              <input className="inp" type="date" id={`fcf-${tkey}`} value={f.cfrom} onChange={(e) => setF('cfrom', e.target.value)} />
            </label>
            <label className="field">
              <span>Completed to</span>
              <input className="inp" type="date" id={`fct-${tkey}`} value={f.cto} onChange={(e) => setF('cto', e.target.value)} />
            </label>
            <label className="field">
              <span>Archive</span>
              <select className="inp" id={`far-${tkey}`} value={f.arch} onChange={(e) => setF('arch', e.target.value)}>
                <option value="active">Active tasks</option>
                <option value="archived">Archived only</option>
                <option value="all">Active and archived</option>
              </select>
            </label>
          </>
        )}
      </div>

      <div className="toolbar">
        <div className="row">
          <b className="num">{list.length}</b> <span className="muted">of {activeBase.length} tasks</span>
          {hasFilters && (
            <button className="btn sm ghost" onClick={clearFilters}>
              Clear filters
            </button>
          )}
        </div>
        <div className="row">
          <label className="row" style={{ gap: 6 }}>
            <span className="muted small" style={{ fontWeight: 700 }}>
              Sort
            </span>
            <select className="inp" style={{ width: 'auto' }} id={`sort-${tkey}`} value={st.sort} onChange={(e) => set((s) => { s.sort = e.target.value; s.page = 1; })}>
              {SORTS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <details className="colmenu">
            <summary className="btn sm">Columns</summary>
            <div className="menu">
              {allCols.map((c) => (
                <label key={c.k}>
                  <input type="checkbox" checked={c.on} onChange={(e) => toggleCol(c.k, c.sys, e.target.checked)} />
                  {c.h}
                </label>
              ))}
            </div>
          </details>
          <button
            className="btn sm"
            onClick={() => {
              if (!list.length) return toast('No tasks to export.', 'bad');
              toast('Saved ' + exportTasksFile(list, 'csv', today));
            }}
          >
            Export CSV
          </button>
          <button
            className="btn sm"
            onClick={() => {
              if (!list.length) return toast('No tasks to export.', 'bad');
              toast('Saved ' + exportTasksFile(list, 'xlsx', today));
            }}
          >
            Export Excel
          </button>
        </div>
      </div>

      {admin && selN > 0 && (
        <div className="bulk" role="region" aria-label="Bulk actions">
          <b>{selN} selected</b>
          {selN < list.length && (
            <button className="btn sm ghost" style={{ color: 'inherit' }} onClick={() => set((s) => list.forEach((t) => s.sel.add(t.id)))}>
              Select all {list.length} matching
            </button>
          )}
          <label className="row" style={{ gap: 6 }}>
            Assign to
            <select id={`bt-${tkey}`} value={bt} onChange={(e) => setBt(e.target.value as Team)}>
              {TEAM_KEYS.map((x) => (
                <option key={x} value={x}>
                  {TEAMS[x]}
                </option>
              ))}
            </select>
          </label>
          <button className="btn sm" onClick={() => runBulk({ action: 'assign', team: bt }, 'Reassigning', (t) => (t.team === bt ? null : { team: bt }))}>
            Apply
          </button>
          <label className="row" style={{ gap: 6 }}>
            Status
            <select id={`bs-${tkey}`} value={bs} onChange={(e) => setBs(e.target.value as Status)}>
              {STATUS_KEYS.map((s) => (
                <option key={s} value={s}>
                  {STATUS[s]}
                </option>
              ))}
            </select>
          </label>
          <button
            className="btn sm"
            onClick={() =>
              runBulk({ action: 'status', status: bs }, 'Changing status', (t) => {
                if (t.status === bs) return null;
                const { patch } = statusPatch(t, bs);
                const now = new Date().toISOString();
                const l: Partial<Task> = { status: bs, blockedReason: patch.blockedReason };
                if (patch.completedAt === 'now') l.completedAt = now;
                if (patch.completedAt === null) {
                  l.completedAt = null;
                  l.lastCompletedAt = patch.lastCompletedAt ?? null;
                }
                if (patch.startedAt === 'now') l.startedAt = now;
                return l;
              })
            }
          >
            Apply
          </button>
          <button className="btn sm" onClick={() => runBulk({ action: 'archive' }, 'Archiving', (t) => (t.archived ? null : { archived: true }))}>
            Archive
          </button>
          <button className="btn sm" onClick={() => runBulk({ action: 'restore' }, 'Restoring', (t) => (!t.archived ? null : { archived: false }))}>
            Restore
          </button>
          <button
            className="btn sm danger"
            onClick={async () => {
              const n = st.sel.size;
              const ok = await confirmBox({
                title: 'Delete tasks permanently?',
                body: (
                  <>
                    Are you sure you want to permanently delete <b>{n}</b> {n === 1 ? 'task' : 'tasks'}? Status, notes and history are removed and cannot be recovered. Archive instead if you may need them later.
                  </>
                ),
                ok: `Delete ${n} permanently`,
                danger: true,
              });
              if (ok) runBulk({ action: 'delete' }, 'Deleting');
            }}
          >
            Delete permanently
          </button>
          <button className="btn sm ghost" style={{ color: 'inherit' }} onClick={() => set((s) => s.sel.clear())}>
            Clear selection
          </button>
        </div>
      )}

      {list.length ? (
        <>
          <div className="tw">
            <table className="t">
              <thead>
                <tr>
                  {admin && (
                    <th className="chk">
                      <input
                        type="checkbox"
                        aria-label="Select all on this page"
                        checked={pageSel}
                        onChange={(e) => set((s) => slice.forEach((t) => (e.target.checked ? s.sel.add(t.id) : s.sel.delete(t.id))))}
                      />
                    </th>
                  )}
                  {cols.map((c) => (
                    <th key={c.k} scope="col">
                      {c.h}
                    </th>
                  ))}
                  <th scope="col">Status</th>
                  <th scope="col">
                    <span className="sr">Details</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {slice.map((t) => {
                  const sf = sched(t, today);
                  return (
                    <tr
                      key={t.id}
                      data-row
                      className={st.sel.has(t.id) ? 'sel' : ''}
                      onClick={(e) => {
                        if (!(e.target as HTMLElement).closest('select,a,input,button,label')) openDrawer(t.id);
                      }}
                    >
                      {admin && (
                        <td className="chk">
                          <input
                            type="checkbox"
                            aria-label="Select task"
                            checked={st.sel.has(t.id)}
                            onChange={(e) => set((s) => (e.target.checked ? s.sel.add(t.id) : s.sel.delete(t.id)))}
                          />
                        </td>
                      )}
                      {cols.map((c) => {
                        if (!c.sys) return <Cell key={c.k} t={t} h={c.h} />;
                        switch (c.k) {
                          case '__team':
                            return (
                              <td key={c.k}>
                                <span className="tag">{TEAM_SHORT[t.team] || t.team}</span>
                              </td>
                            );
                          case '__sched':
                            return (
                              <td key={c.k}>
                                <Flag k={sf.k} l={sf.l} />
                              </td>
                            );
                          case '__completed':
                            return (
                              <td key={c.k} className="num">
                                {t.completedAt ? fmtDT(t.completedAt) : '—'}
                              </td>
                            );
                          case '__notes':
                            return (
                              <td key={c.k}>
                                <div className="clip">{t.notes || ''}</div>
                              </td>
                            );
                          case '__sheet':
                            return <td key={c.k}>{t.sheet}</td>;
                          case '__id':
                            return (
                              <td key={c.k} className="num">
                                {t.id}
                              </td>
                            );
                        }
                        return <td key={c.k} />;
                      })}
                      <td>
                        <StatusSelect t={t} />
                        {t.archived ? (
                          <>
                            {' '}
                            <span className="tag">Archived</span>
                          </>
                        ) : null}
                      </td>
                      <td>
                        <button className="btn sm" onClick={() => openDrawer(t.id)} aria-label={`View details: ${displayTitle(t)}`}>
                          View details
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="pager">
            <div className="row">
              <button className="btn sm" disabled={page <= 1} onClick={() => set((s) => (s.page = page - 1))}>
                Previous
              </button>
              <span className="num">
                Page {page} of {pages}
              </span>
              <button className="btn sm" disabled={page >= pages} onClick={() => set((s) => (s.page = page + 1))}>
                Next
              </button>
            </div>
            <label className="row" style={{ gap: 6 }}>
              <span className="muted small" style={{ fontWeight: 700 }}>
                Rows per page
              </span>
              <select className="inp" style={{ width: 'auto' }} id={`ps-${tkey}`} value={st.size} onChange={(e) => set((s) => { s.size = +e.target.value; s.page = 1; })}>
                {[25, 50, 100].map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </label>
          </div>
        </>
      ) : (
        <div className="empty">
          <p>No tasks match these filters.</p>
          <button className="btn" onClick={clearFilters}>
            Clear filters
          </button>
        </div>
      )}
    </div>
  );
}

function Opt({ id, label, all, vals, cur, on }: { id: string; label: string; all: string; vals: string[]; cur: string; on: (v: string) => void }) {
  return (
    <label className="field">
      <span>{label}</span>
      <select className="inp" id={id} value={cur} onChange={(e) => on(e.target.value)}>
        <option value="">{all}</option>
        {vals.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>
    </label>
  );
}
