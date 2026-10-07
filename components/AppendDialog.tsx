'use client';
import { useEffect, useReducer, useRef, useState } from 'react';
import { CHUNK_SIZE, type ImportRec, type SheetMeta } from '@/lib/constants';
import { analyze, computeDates, headerChoices, readGrid, XLSX, type DataRow, type WizSheet } from '@/lib/excel';
import { deriveFields, plural } from '@/lib/text';
import { api, ApiFail, withRetry } from '@/lib/client/api';
import { useApp } from './store';

/** "Append new rows" for one sheet: re-upload the workbook, only rows that are not already in the dashboard are added. */
export function AppendDialog({ imp, sheet, onClose }: { imp: ImportRec; sheet: SheetMeta; onClose: () => void }) {
  const { tasks, reloadAll, toast } = useApp();
  const [, bump] = useReducer((x: number) => x + 1, 0);
  const wb = useRef<XLSX.WorkBook | null>(null);
  const ws = useRef<WizSheet | null>(null);
  const [file, setFile] = useState('');
  const [pick, setPick] = useState('');
  const [err, setErr] = useState('');
  const [run, setRun] = useState<{ done: number; total: number; failed: number; finished: boolean; msg: string } | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !(run && !run.finished) && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  const load = (name: string) => {
    const sh = wb.current!.Sheets[name];
    const s: WizSheet = { name: sheet.name, idx: sheet.idx, ws: sh, est: 0, selected: true, team: sheet.team, suggested: 'unassigned' };
    s.grid = readGrid(sh);
    analyze(s);
    ws.current = s;
    setPick(name);
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setErr('');
    try {
      wb.current = XLSX.read(await f.arrayBuffer(), { type: 'array', cellNF: true, cellDates: false, cellStyles: false });
    } catch {
      setErr('Unable to read this Excel workbook. Please upload a valid .xlsx file.');
      return;
    }
    const names = wb.current.SheetNames;
    if (!names.length) return setErr('This workbook contains no worksheets.');
    setFile(f.name);
    load(names.find((n) => n.trim().toLowerCase() === sheet.name.trim().toLowerCase()) || names[0]);
  };

  const s = ws.current;
  let fresh: DataRow[] = [];
  let existing = 0;
  if (s && s.an) {
    const have = new Set(tasks.map((t) => t.dupKey).filter(Boolean));
    const seen = new Set<string>();
    for (const r of s.an.data) {
      const k = r.key as string;
      if (have.has(k) || seen.has(k)) existing++;
      else {
        seen.add(k);
        fresh.push(r);
      }
    }
  }
  const headersDiffer = !!s?.an && JSON.stringify(s.an.headers) !== JSON.stringify(sheet.headers);

  const start = async () => {
    if (!s || !s.an || !fresh.length) return;
    const batch = Date.now().toString(36);
    const total = fresh.length;
    let done = 0;
    let failed = 0;
    let last = '';
    setRun({ done, total, failed, finished: false, msg: '' });
    for (let i = 0; i < fresh.length; i += CHUNK_SIZE) {
      const chunk = fresh.slice(i, i + CHUNK_SIZE);
      try {
        await withRetry(() =>
          api(`/api/imports/${imp.id}/rows`, {
            body: {
              sheetIdx: sheet.idx,
              appendBatch: batch,
              override: { headers: s.an!.headers, map: s.map, dateOrder: s.dateOrder || 'dmy' },
              rows: chunk.map((r) => ({
                excelRow: r.excelRow,
                vals: r.vals,
                urls: r.urls,
                postDate: r.date || null,
                dupKey: r.key || '',
                ...deriveFields(r.vals, s.map!),
              })),
            },
          }),
        );
      } catch (e) {
        failed += chunk.length;
        last = e instanceof Error ? e.message : 'Save failed.';
        if (e instanceof ApiFail && e.status === 401) break;
      }
      done += chunk.length;
      setRun({ done, total, failed, finished: false, msg: last });
    }
    setRun({ done, total, failed, finished: true, msg: last });
    toast(failed ? `Appended ${total - failed} of ${total} rows. ${last}` : `Appended ${plural(total, 'new row')} to ${sheet.name}`, failed ? 'bad' : undefined);
    try {
      await reloadAll();
    } catch {
      /* next poll refreshes */
    }
  };

  const running = !!run && !run.finished;
  return (
    <div className="modal-wrap" role="dialog" aria-modal="true" aria-label="Append new rows">
      <div className="modal">
        <div className="mh">
          <h2>Append new rows · {sheet.name}</h2>
          {running ? null : (
            <button className="btn ghost" onClick={onClose}>
              Close
            </button>
          )}
        </div>
        <div className="mb">
          <p className="muted" style={{ margin: 0 }}>
            Upload the workbook again. Only rows that are not already in the dashboard (same sheet, posting date, platform and title) are added, after the existing tasks. Existing tasks are never changed.
          </p>
          {err ? <div className="err">{err}</div> : null}
          <div>
            <label className="btn primary" htmlFor="append-file" style={{ cursor: 'pointer' }}>
              {file ? 'Choose a different workbook' : 'Choose Excel workbook'}
            </label>
            <input id="append-file" type="file" hidden accept=".xlsx,.xls,.xlsm,.csv" onChange={(e) => void onFile(e.target.files?.[0])} />
            {file ? (
              <span className="muted" style={{ marginLeft: 12 }}>
                {file}
              </span>
            ) : null}
          </div>
          {s && s.an && wb.current ? (
            <>
              <label className="field">
                <span>Worksheet to read</span>
                <select className="inp" value={pick} onChange={(e) => load(e.target.value)} disabled={running}>
                  {wb.current.SheetNames.map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Which row holds the column names?</span>
                <select
                  className="inp"
                  value={String(s.an.hi)}
                  disabled={running}
                  onChange={(e) => {
                    s.noHeader = false;
                    s.headerIdx = +e.target.value;
                    analyze(s);
                    computeDates(s);
                    bump();
                  }}
                >
                  {headerChoices(s).map((i) => (
                    <option key={i} value={i}>
                      Row {s.grid!.rows[i].excelRow}:{' '}
                      {s.grid!.rows[i].cells
                        .filter((c) => c && c.t.trim())
                        .slice(0, 5)
                        .map((c) => c!.t.trim().replace(/\s+/g, ' ').slice(0, 28))
                        .join(' · ')}
                    </option>
                  ))}
                </select>
              </label>
              {headersDiffer ? <div className="warnbox">The column names in this file differ from the ones first imported for this sheet. New rows will use this file&apos;s column names.</div> : null}
              <dl className="kv">
                <dt>Rows in this file</dt>
                <dd className="num">{s.an.data.length}</dd>
                <dt>Already in the dashboard</dt>
                <dd className="num">{existing}</dd>
                <dt>New rows to append</dt>
                <dd className="num">
                  <b>{fresh.length}</b>
                </dd>
              </dl>
              {!fresh.length ? <div className="okbox">Nothing new to append. Every row in this file is already in the dashboard.</div> : null}
              {run ? (
                <>
                  <div className="progressbar" role="progressbar" aria-valuenow={run.total ? Math.round((run.done * 100) / run.total) : 100} aria-valuemin={0} aria-valuemax={100}>
                    <i style={{ width: `${run.total ? Math.round((run.done * 100) / run.total) : 100}%` }} />
                  </div>
                  <p className="num">
                    {run.done} / {run.total} saved{run.failed ? ` · ${run.failed} failed` : ''}
                  </p>
                  {run.finished && !run.failed ? <div className="okbox">Done. {plural(run.total, 'new row')} appended.</div> : null}
                  {run.finished && run.failed ? <div className="err">{run.failed} rows could not be saved. {run.msg}</div> : null}
                </>
              ) : null}
            </>
          ) : null}
        </div>
        <div className="mf">
          <span />
          {run?.finished ? (
            <button className="btn primary" onClick={onClose}>
              Close
            </button>
          ) : (
            <button className="btn primary" disabled={!fresh.length || running} onClick={() => void start()}>
              Append {fresh.length ? plural(fresh.length, 'new row') : 'rows'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
