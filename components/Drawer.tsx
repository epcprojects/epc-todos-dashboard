'use client';
import { useEffect, useRef, useState } from 'react';
import { TEAMS, teamKeys, type HistoryEntry, type Task, type Team } from '@/lib/constants';
import { fmtDate, fmtDT, parseDateText } from '@/lib/dates';
import { sched } from '@/lib/metrics';
import { canEditContent } from '@/lib/perms';
import { displayTitle } from '@/lib/tasks';
import { dupKey, deriveFields, isURL } from '@/lib/text';
import { useApp } from './store';
import { Flag, PlatPills, Pill, StatusSelect, who } from './ui';

export function Drawer() {
  const { drawerId, taskById, closeDrawer } = useApp();
  const t = drawerId ? taskById(drawerId) : undefined;
  if (!t) return null;
  return <DrawerBody key={t.id} id={t.id} onClose={closeDrawer} />;
}

function DrawerBody({ id, onClose }: { id: string; onClose: () => void }) {
  const { taskById, today, isAdmin, role, settings, canTouch, drafts, setDraft, writeTask, confirmBox, deleteTask, toast, loadHistory } = useApp();
  const t = taskById(id)!;
  const [edit, setEdit] = useState<string[] | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const [team, setTeam] = useState<Team>(t.team);

  useEffect(() => closeBtn.current?.focus(), []);

  // Reload the activity list whenever the task changes (our own edit, or someone else's arriving via polling).
  useEffect(() => {
    let alive = true;
    loadHistory(id)
      .then((h) => alive && setHistory(h))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [id, t.updatedAt, loadHistory]);
  useEffect(() => setTeam(t.team), [t.team]);

  const touch = canTouch(t);
  const canEdit = role ? (isAdmin || canEditContent(role, { team: t.team, archived: false }, settings.allowTeamEdit)) : false;
  const dr = drafts[t.id] || {};
  const sf = sched(t, today);

  const saveContent = () => {
    if (!edit) return;
    const v = [...t.v];
    edit.forEach((x, i) => (v[i] = x));
    const changed = v.map((x, i) => (x !== t.v[i] ? t.h[i] : null)).filter((x): x is string => x !== null);
    setEdit(null);
    if (!changed.length) return;
    const d = deriveFields(v, t.m);
    let postDate = t.postDate;
    if (t.m.date >= 0) postDate = parseDateText(v[t.m.date], t.dateOrder) || (v[t.m.date] === t.v[t.m.date] ? t.postDate : null);
    const local: Partial<Task> = { v, postDate, time: d.time, day: d.day, platform: d.platform, title: d.title, type: d.type, pillar: d.pillar, dupKey: dupKey(t.sheet, postDate, d.platform, d.title, v) };
    void writeTask(t.id, { content: v }, local, 'Content saved');
  };

  const reassign = () => {
    if (t.team === team) return;
    void writeTask(t.id, { team }, { team }, 'Reassigned to ' + TEAMS[team]);
  };

  const del = async () => {
    const ok = await confirmBox({
      title: 'Delete task permanently?',
      body: (
        <>
          Are you sure you want to permanently delete this task?
          <br />
          <b>{displayTitle(t)}</b>
        </>
      ),
      ok: 'Delete permanently',
      danger: true,
    });
    if (!ok) return;
    if (await deleteTask(t.id)) {
      onClose();
      toast('Task deleted');
    }
  };

  return (
    <div
      className="drawer-wrap"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <aside className="drawer" role="dialog" aria-modal="true" aria-label="Task details">
        <div className="dh">
          <div>
            <div className="muted small" style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em' }}>
              Task Details · {TEAMS[t.team]}
            </div>
            <h2 style={{ marginTop: 4 }}>{displayTitle(t)}</h2>
          </div>
          <button className="btn" id="drawer-close" ref={closeBtn} onClick={onClose}>
            Close
          </button>
        </div>
        <div className="row">
          <PlatPills value={t.platform} />
          {t.type ? <span className="tag">{t.type}</span> : null}
          {t.pillar ? <span className="tag">{t.pillar}</span> : null}
          <Flag k={sf.k} l={sf.l} />
          {t.archived ? <span className="tag">Archived</span> : null}
        </div>
        <dl className="kv">
          <dt>Posting date</dt>
          <dd>
            <b>{t.postDate ? fmtDate(t.postDate, { weekday: 'long', month: 'long' }) : 'Not readable'}</b>
            {t.day ? ` · ${t.day}` : ''}
          </dd>
          <dt>Posting time</dt>
          <dd>{t.time || '—'}</dd>
          <dt>Completed at</dt>
          <dd>{fmtDT(t.completedAt)}</dd>
        </dl>
        {t.adminNote && !isAdmin ? (
          <div className="callout">
            <b>Note from admin:</b>
            {'\n'}
            {t.adminNote}
          </div>
        ) : null}

        <section className="panel stack" style={{ gap: 12 }}>
          <h3>Production</h3>
          <label className="field">
            <span>Production status</span>
            {touch ? <StatusSelect t={t} id="d-status" /> : <Pill s={t.status} />}
          </label>
          {t.status === 'blocked' ? (
            <>
              <label className="field">
                <span>What is it waiting for?</span>
                <input
                  className="inp"
                  id="d-block"
                  value={dr.block != null ? dr.block : t.blockedReason || ''}
                  onChange={(e) => setDraft(t.id, 'block', e.target.value)}
                  placeholder="e.g. Waiting for project screenshots"
                  maxLength={200}
                  disabled={!touch}
                />
              </label>
              {touch && (
                <div>
                  <button
                    className="btn sm"
                    onClick={() => {
                      const v = (dr.block != null ? dr.block : t.blockedReason || '').trim();
                      setDraft(t.id, 'block', null);
                      void writeTask(t.id, { blockedReason: v }, { blockedReason: v }, 'Reason saved');
                    }}
                  >
                    Save reason
                  </button>
                </div>
              )}
            </>
          ) : null}
          <label className="field">
            <span>Production notes</span>
            <textarea
              className="inp"
              id="d-notes"
              value={dr.notes != null ? dr.notes : t.notes || ''}
              onChange={(e) => setDraft(t.id, 'notes', e.target.value)}
              disabled={!touch}
              placeholder="e.g. Need screenshot from UI team"
            />
          </label>
          {touch && (
            <div>
              <button
                className="btn sm primary"
                onClick={() => {
                  const v = dr.notes != null ? dr.notes : t.notes || '';
                  setDraft(t.id, 'notes', null);
                  if (v === (t.notes || '')) return;
                  void writeTask(t.id, { notes: v }, { notes: v }, 'Notes saved');
                }}
              >
                Save notes
              </button>
            </div>
          )}
          {isAdmin && (
            <>
              <label className="field">
                <span>Note for the {TEAMS[t.team] || 'team'} (they see this highlighted)</span>
                <textarea
                  className="inp"
                  id="d-anote"
                  value={dr.anote != null ? dr.anote : t.adminNote || ''}
                  onChange={(e) => setDraft(t.id, 'anote', e.target.value)}
                  placeholder="e.g. Please revise headline"
                />
              </label>
              <div>
                <button
                  className="btn sm"
                  onClick={() => {
                    const v = dr.anote != null ? dr.anote : t.adminNote || '';
                    setDraft(t.id, 'anote', null);
                    void writeTask(t.id, { adminNote: v }, { adminNote: v }, 'Note saved');
                  }}
                >
                  Save note for team
                </button>
              </div>
            </>
          )}
        </section>

        <section>
          <div className="panel-h">
            <h3>Content from Excel</h3>
            {canEdit ? (
              edit ? (
                <div className="row">
                  <button className="btn sm" onClick={() => setEdit(null)}>
                    Cancel
                  </button>
                  <button className="btn sm primary" onClick={saveContent}>
                    Save changes
                  </button>
                </div>
              ) : (
                <button className="btn sm" onClick={() => setEdit([...t.v])}>
                  Edit content
                </button>
              )
            ) : null}
          </div>
          {t.h.map((h, i) => {
            const v = t.v[i] || '';
            const url = t.u[i];
            if (edit)
              return (
                <div className="content-field" key={i}>
                  <h4>
                    <label htmlFor={`ed-${i}`}>{h}</label>
                  </h4>
                  <textarea
                    className="inp"
                    id={`ed-${i}`}
                    value={edit[i] ?? ''}
                    rows={Math.min(10, Math.max(2, Math.ceil(v.length / 70)))}
                    onChange={(e) => setEdit((cur) => (cur ? cur.map((x, j) => (j === i ? e.target.value : x)) : cur))}
                  />
                </div>
              );
            let body: React.ReactNode;
            if (isURL(v))
              body = (
                <>
                  <a href={v.trim()} target="_blank" rel="noopener noreferrer">
                    Open Reference ↗
                  </a>
                  <div className="muted small" style={{ wordBreak: 'break-all' }}>
                    {v}
                  </div>
                </>
              );
            else if (url && /^https?:/i.test(url))
              body = (
                <>
                  <div className="txt">{v}</div>
                  <a href={url} target="_blank" rel="noopener noreferrer">
                    Open Reference ↗
                  </a>
                  <div className="muted small" style={{ wordBreak: 'break-all' }}>
                    {url}
                  </div>
                </>
              );
            else if (i === t.m.platform) body = <PlatPills value={v} />;
            else body = <div className="txt">{v ? v : <span className="muted">Empty</span>}</div>;
            return (
              <div className="content-field" key={i}>
                <h4>{h}</h4>
                {body}
              </div>
            );
          })}
        </section>

        {isAdmin && (
          <section className="panel stack" style={{ gap: 12 }}>
            <h3>Admin controls</h3>
            <div className="row" style={{ alignItems: 'end' }}>
              <label className="field">
                <span>Assigned team</span>
                <select className="inp" id="d-team" value={team} onChange={(e) => setTeam(e.target.value as Team)}>
                  {teamKeys().map((x) => (
                    <option key={x} value={x}>
                      {TEAMS[x]}
                    </option>
                  ))}
                </select>
              </label>
              <button className="btn" onClick={reassign}>
                Reassign
              </button>
            </div>
            <div className="row">
              {t.archived ? (
                <button className="btn" onClick={() => void writeTask(t.id, { archived: false }, { archived: false }, 'Task restored')}>
                  Restore task
                </button>
              ) : (
                <button className="btn" onClick={() => void writeTask(t.id, { archived: true }, { archived: true }, 'Task archived')}>
                  Archive task
                </button>
              )}
              <button className="btn danger" onClick={() => void del()}>
                Delete permanently
              </button>
            </div>
          </section>
        )}

        <section>
          <h3 style={{ marginBottom: 8 }}>Source and tracking</h3>
          <dl className="kv">
            <dt>Imported from</dt>
            <dd>
              Workbook: <b>{t.workbook}</b>
              <br />
              Sheet: <b>{t.sheet}</b>
              <br />
              Row: <b className="num">{t.row}</b>
              {t.sourceUpdatedFrom ? (
                <>
                  <br />
                  <span className="muted">
                    Content updated from {t.sourceUpdatedFrom} on {fmtDT(t.sourceUpdatedAt)}
                  </span>
                </>
              ) : null}
            </dd>
            <dt>Task ID</dt>
            <dd className="num">{t.id}</dd>
            <dt>Imported</dt>
            <dd>{fmtDT(t.importedAt)}</dd>
            <dt>Started</dt>
            <dd>{fmtDT(t.startedAt)}</dd>
            <dt>Last updated</dt>
            <dd>{fmtDT(t.updatedAt)}</dd>
            {t.lastCompletedAt && !t.completedAt ? (
              <>
                <dt>Previously completed</dt>
                <dd>{fmtDT(t.lastCompletedAt)}</dd>
              </>
            ) : null}
          </dl>
        </section>
        <section>
          <h3 style={{ marginBottom: 8 }}>Activity</h3>
          <ul className="hist">
            {history.map((h, i) => (
              <li key={i}>
                <time>{fmtDT(h.at)}</time>
                <span>
                  <b>{who(h)}</b> · {h.msg}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </aside>
    </div>
  );
}
