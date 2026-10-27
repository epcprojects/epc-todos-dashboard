'use client';
import { useReducer, useRef, useState } from 'react';
import { UploadCloud } from 'lucide-react';
import { norm, suggestTeam } from '@/lib/text';
import { XLSX, type WizSheet } from '@/lib/excel';
import { useApp } from '../store';
import { PageHeader } from '../ui';
import { Wizard, type Wiz } from '../Wizard';

export function ImportPage() {
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
      <PageHeader title="Content import" sub="Upload the Excel content calendar. Nothing is imported until you choose sheets, check the preview and confirm." eyebrow="Admin" />
      <div
        className={`drop${over ? ' over' : ''}`}
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
          .xlsx, .xls, .xlsm or .csv · the workbook is analyzed in your browser first, nothing is imported automatically
        </p>
        <label className="btn primary" htmlFor="file-in" style={{ cursor: 'pointer' }}>
          Choose Excel workbook
        </label>
        <input type="file" id="file-in" ref={fileIn} accept=".xlsx,.xls,.xlsm,.csv" hidden onChange={(e) => void onFile(e.target.files?.[0])} />
        <p className="muted small" style={{ margin: 0 }}>
          or drag the file here
        </p>
      </div>
      <section className="panel" style={{ marginTop: 18 }}>
        <h2>How importing works</h2>
        <ol className="muted" style={{ margin: '8px 0 0', paddingLeft: 22, lineHeight: 1.9 }}>
          <li>All worksheets in the workbook are listed; tick only the ones that hold production work.</li>
          <li>Preview each sheet: every column is kept. Confirm which columns hold the posting date, platform and title.</li>
          <li>Choose who receives each sheet: Graphic Designer, Video Editor, Admin Only or Unassigned.</li>
          <li>Review the summary. Rows already in the dashboard are flagged so you can skip, update or re-import them.</li>
        </ol>
      </section>
      {wizRef.current && <Wizard w={wizRef.current} bump={bump} close={close} />}
    </>
  );
}
