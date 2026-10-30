'use client';
import { useReducer, useRef, useState } from 'react';
import { UploadCloud } from 'lucide-react';
import { norm, suggestTeam } from '@/lib/text';
import { XLSX, type WizSheet } from '@/lib/excel';
import { useApp } from '../store';
import { Wizard, type Wiz } from '../Wizard';

export function ImportUploader() {
  const { imports } = useApp();
  const wizRef = useRef<Wiz | null>(null);
  const [, bump] = useReducer((x: number) => x + 1, 0);
  const [over, setOver] = useState(false);
  const fileIn = useRef<HTMLInputElement>(null);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    let wb: XLSX.WorkBook;
    try {
      const buf = await file.arrayBuffer();
      wb = XLSX.read(buf, { type: 'array', cellNF: true, cellDates: false, cellStyles: false });
    } catch {
      wizRef.current = { step: 'error', error: 'Unable to read this Excel workbook. Please upload a valid .xlsx file.', file: file.name, sheets: [], mode: 'skip', reset: false, prevSame: 0, cur: 0 };
      bump();
      return;
    }
    if (!wb || !wb.SheetNames || !wb.SheetNames.length) {
      wizRef.current = { step: 'error', error: 'This workbook contains no worksheets.', file: file.name, sheets: [], mode: 'skip', reset: false, prevSame: 0, cur: 0 };
      bump();
      return;
    }
    const sheets: WizSheet[] = wb.SheetNames.map((name, idx) => {
      const ws = wb.Sheets[name];
      let est = 0;
      try {
        if (ws && ws['!ref']) {
          const r = XLSX.utils.decode_range(ws['!ref']);
          est = r.e.r - r.s.r;
        }
      } catch {
        /* unreadable range: show as empty */
      }
      const sg = suggestTeam(name);
      return { name, idx, ws, est, selected: false, team: sg, suggested: sg };
    });
    const prev = imports.filter((i) => norm(i.workbook) === norm(file.name));
    wizRef.current = { step: 'select', file: file.name, sheets, mode: 'skip', reset: false, prevSame: prev.length, cur: 0 };
    bump();
  };

  const close = () => {
    wizRef.current = null;
    if (fileIn.current) fileIn.current.value = '';
    bump();
  };

  return (
    <>
      <div
        className={`drop${over ? ' over' : ''}${imports.length ? ' compact' : ''}`}
        id="drop"
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragEnter={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          void onFile(e.dataTransfer.files[0]);
        }}
      >
        <div className="grid size-14 place-items-center rounded-2xl bg-accent text-accent-foreground">
          <UploadCloud className="size-7" />
        </div>
        <h2>Upload Content Excel</h2>
        <p className="muted" style={{ margin: 0 }}>
          .xlsx, .xls, .xlsm or .csv · read in your browser, never uploaded
        </p>
        <label className="btn primary" htmlFor="file-in" style={{ cursor: 'pointer' }}>
          Choose Excel workbook
        </label>
        <input type="file" id="file-in" ref={fileIn} accept=".xlsx,.xls,.xlsm,.csv" hidden onChange={(e) => void onFile(e.target.files?.[0])} />
        <p className="muted small" style={{ margin: 0 }}>
          or drag the file here
        </p>
      </div>
      {!imports.length && (
      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ['1', 'Pick sheets', 'Tick only the worksheets that hold production work.'],
          ['2', 'Check the preview', 'Confirm which columns hold the date, platform and title.'],
          ['3', 'Assign a team', 'Designer, Video Editor, any role you added, or Unassigned.'],
          ['4', 'Confirm', 'Rows already in the dashboard are flagged so you can skip or update them.'],
        ].map(([n, t, d]) => (
          <div key={n} className="rounded-xl border bg-card p-4 shadow-(--shadow-card)">
            <span className="grid size-7 place-items-center rounded-full bg-accent text-[13px] font-bold text-accent-foreground">{n}</span>
            <div className="mt-3 text-sm font-semibold">{t}</div>
            <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{d}</p>
          </div>
        ))}
      </div>
      )}
      {wizRef.current && <Wizard w={wizRef.current} bump={bump} close={close} />}
    </>
  );
}
