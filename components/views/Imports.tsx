'use client';
import { TEAMS } from '@/lib/constants';
import { fmtDT } from '@/lib/dates';
import { headersFromValues, genericHeads } from '@/lib/text';
import { api } from '@/lib/client/api';
import { useState } from 'react';
import { Archive, ArchiveRestore, FilePlus2, Trash2, Upload } from 'lucide-react';
import type { ImportRec, SheetMeta } from '@/lib/constants';
import { AppendDialog } from '../AppendDialog';
import { useApp } from '../store';
import { EmptyImport, PageHeader } from '../ui';

const MODE_LABEL: Record<string, string> = { skip: 'Add new tasks only', update: 'Update matching tasks', new: 'Import as new' };

export function ImportsView() {
  const { imports, tasks, nav, toast, confirmBox, reloadAll } = useApp();

  const [appendFor, setAppendFor] = useState<{ imp: ImportRec; sheet: SheetMeta } | null>(null);

  const deleteSheet = async (imp: ImportRec, sh: SheetMeta) => {
    const ok = await confirmBox({
      title: `Delete untouched rows of ${sh.name}?`,
      body: (
        <>
          Rows from <b>{sh.name}</b> that nobody has worked on yet (still Not Started, no notes, no edits, no content updates) are permanently deleted. Rows that were started, completed, edited or have notes are kept.
        </>
      ),
      ok: 'Delete untouched rows',
      danger: true,
    });
    if (!ok) return;
    try {
      const r = await api<{ deleted: number; kept: number }>(`/api/imports/${encodeURIComponent(imp.id)}/delete-sheet`, { body: { sheetIdx: sh.idx } });
      toast(`Deleted ${r.deleted} untouched rows from ${sh.name}${r.kept ? `; ${r.kept} worked-on rows kept` : ''}`);
      await reloadAll();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Something went wrong.', 'bad');
    }
  };

  const fail = (e: unknown) => toast(e instanceof Error ? e.message : 'Something went wrong.', 'bad');

  const archive = async (id: string) => {
    const l = tasks.filter((t) => t.importId === id && !t.archived);
    if (!l.length) return toast('Nothing to archive.');
    const ok = await confirmBox({ title: 'Archive this import?', body: `${l.length} tasks will be archived. They disappear from team views and reports but can be restored.`, ok: 'Archive tasks' });
    if (!ok) return;
    try {
      await api(`/api/imports/${encodeURIComponent(id)}/archive`, { method: 'POST', body: {} });
      toast(`Archived ${l.length} tasks`);
      await reloadAll();
    } catch (e) {
      fail(e);
    }
  };
  const restore = async (id: string) => {
    const l = tasks.filter((t) => t.importId === id && t.archived);
    if (!l.length) return toast('No archived tasks in this import.');
    try {
      await api(`/api/imports/${encodeURIComponent(id)}/restore`, { method: 'POST', body: {} });
      toast(`Restored ${l.length} tasks`);
      await reloadAll();
    } catch (e) {
      fail(e);
    }
  };
  const remove = async (id: string) => {
    const imp = imports.find((i) => i.id === id);
    const n = tasks.filter((t) => t.importId === id).length;
    const ok = await confirmBox({
      title: 'Delete this import permanently?',
      body: (
        <>
          This deletes <b>{imp?.workbook}</b> and its <b>{n}</b> tasks, including their statuses, notes and history. This cannot be undone.
        </>
      ),
      ok: 'Delete import and tasks',
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/api/imports/${encodeURIComponent(id)}`, { method: 'DELETE' });
      toast('Import deleted');
      await reloadAll();
    } catch (e) {
      fail(e);
    }
  };
  const fixHead = async (id: string, si: number) => {
    const imp = imports.find((i) => i.id === id);
    const sh = imp?.sheets.find((x) => x.idx === si);
    const head = headerTask(id, si);
    if (!imp || !sh || !head) return;
    const heads = headersFromValues(head.v);
    const others = tasks.filter((t) => t.importId === id && t.sheetIdx === si && t.id !== head.id).length;
    const ok = await confirmBox({
      title: 'Use row ' + head.row + ' as column names?',
      body: (
        <>
          Columns will be named <b>{heads.slice(0, 6).join(', ')}{heads.length > 6 ? '…' : ''}</b> on {others} tasks from {sh.name}. The task created from row {head.row} is removed. Statuses, notes and assignments stay as they are.
        </>
      ),
      ok: 'Rename columns',
    });
    if (!ok) return;
    try {
      await api(`/api/imports/${encodeURIComponent(id)}/fix-headers`, { body: { sheetIdx: si } });
      toast('Column names fixed for ' + sh.name);
      await reloadAll();
    } catch (e) {
      fail(e);
    }
  };
  const headerTask = (impId: string, si: number) => {
    let best: (typeof tasks)[number] | null = null;
    for (const t of tasks) if (t.importId === impId && t.sheetIdx === si && (!best || t.row < best.row)) best = t;
    return best;
  };

  return (
    <>
      <PageHeader
        title="Import history"
        sub="Every workbook you have imported."
        actions={
          <button className="btn primary" onClick={() => nav('import')}>
            <Upload className="size-4" /> Upload Content Excel
          </button>
        }
        eyebrow="History"
      />
      {imports.length ? (
        <div className="stack">
          {imports.map((imp) => {
            const live = tasks.filter((t) => t.importId === imp.id);
            const arch = live.filter((t) => t.archived).length;
            return (
              <section className="panel" key={imp.id}>
                <div className="panel-h">
                  <div>
                    <h2>{imp.workbook}</h2>
                    <div className="muted">
                      Imported {fmtDT(imp.uploadedAt)}
                      {imp.status === 'importing' ? (
                        <>
                          {' · '}
                          <b>import in progress or interrupted</b>
                        </>
                      ) : null}
                      {imp.status === 'incomplete' ? (
                        <>
                          {' · '}
                          <b style={{ color: 'var(--danger)' }}>{imp.errors} rows failed to save</b>
                        </>
                      ) : null}
                    </div>
                  </div>
                  <div className="row">
                    <button className="btn sm" onClick={() => void archive(imp.id)}>
                      <Archive className="size-3.5" /> Archive tasks
                    </button>
                    <button className="btn sm" onClick={() => void restore(imp.id)}>
                      <ArchiveRestore className="size-3.5" /> Restore
                    </button>
                    <button className="btn sm danger" onClick={() => void remove(imp.id)}>
                      <Trash2 className="size-3.5" /> Delete import
                    </button>
                  </div>
                </div>
                {imp.sheets
                  .filter((s) => genericHeads(s.headers))
                  .map((s) => {
                    const h = headerTask(imp.id, s.idx);
                    return (
                      <div className="warnbox" style={{ marginBottom: 12 }} key={s.idx}>
                        <b>{s.name} was imported without its column names</b> (they show as Column A, B, C…).
                        {h ? (
                          <>
                            {' '}
                            Excel row {h.row} contains: <i>{h.v.filter(Boolean).slice(0, 5).join(' · ')}</i>.
                            <div style={{ marginTop: 10 }}>
                              <button className="btn sm primary" onClick={() => void fixHead(imp.id, s.idx)}>
                                Use row {h.row} as column names
                              </button>
                            </div>
                            <div className="small" style={{ marginTop: 6 }}>
                              Renames the columns on all tasks from this sheet and removes the extra task created from that row. Statuses, notes and assignments are kept.
                            </div>
                          </>
                        ) : null}
                      </div>
                    );
                  })}
                <table className="cmp">
                  <thead>
                    <tr>
                      <th>Sheet</th>
                      <th>Assigned to</th>
                      <th>Rows</th>
                      <th>New tasks</th>
                      <th>Updated</th>
                      <th>Skipped</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {imp.sheets.map((s) => (
                      <tr key={s.idx}>
                        <td>
                          <b>{s.name}</b>
                        </td>
                        <td>{TEAMS[s.team] || s.team}</td>
                        <td className="n">{s.rows}</td>
                        <td className="n">{s.added}</td>
                        <td className="n">{s.updated || 0}</td>
                        <td className="n">{s.skipped || 0}</td>
                        <td>
                          <div className="row" style={{ flexWrap: 'nowrap' }}>
                            <button className="btn sm" onClick={() => setAppendFor({ imp, sheet: s })}>
                              <FilePlus2 className="size-3.5" /> Append rows
                            </button>
                            <button className="btn sm danger" onClick={() => void deleteSheet(imp, s)}>
                              <Trash2 className="size-3.5" /> Delete untouched
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="muted small" style={{ margin: '10px 0 0' }}>
                  {live.length} tasks from this import currently in the dashboard{arch ? `, ${arch} archived` : ''}. Import mode: {MODE_LABEL[imp.mode] || 'Standard'}.
                </p>
              </section>
            );
          })}
        </div>
      ) : (
        <EmptyImport />
      )}
      {appendFor && <AppendDialog imp={appendFor.imp} sheet={appendFor.sheet} onClose={() => setAppendFor(null)} />}
    </>
  );
}
