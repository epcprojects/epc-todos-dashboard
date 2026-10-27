'use client';
import { useMemo, useState } from 'react';
import { ChevronDown, Layers, Upload } from 'lucide-react';
import { TEAMS, teamKeys, type Team } from '@/lib/constants';
import { useApp } from '../store';
import { PageHeader } from '../ui';
import { TaskTable } from '../TaskTable';

export function Distribution() {
  const { act, imports, nav, confirmBox, bulk } = useApp();
  const sheets = useMemo(() => {
    const out: { imp: (typeof imports)[number]; s: (typeof imports)[number]['sheets'][number]; ids: string[]; teams: Team[] }[] = [];
    for (const imp of imports) {
      for (const s of imp.sheets) {
        const n = act.filter((t) => t.importId === imp.id && t.sheetIdx === s.idx);
        if (!n.length) continue;
        out.push({ imp, s, ids: n.map((t) => t.id), teams: [...new Set(n.map((t) => t.team))] });
      }
    }
    return out;
  }, [act, imports]);
  const [sel, setSel] = useState(0);
  const [openReassign, setOpenReassign] = useState(false);
  const [team, setTeam] = useState<Team>('designer');

  const reassign = async () => {
    const x = sheets[sel];
    if (!x) return;
    const ok = await confirmBox({
      title: 'Reassign entire sheet?',
      body: (
        <>
          All {x.ids.length} active tasks from <b>{x.s.name}</b> ({x.imp.workbook}) will be assigned to <b>{TEAMS[team]}</b>. Statuses and notes are kept.
        </>
      ),
      ok: 'Reassign sheet',
    });
    if (!ok) return;
    await bulk(x.ids, { action: 'assign', team, sheet: { importId: x.imp.id, sheetIdx: x.s.idx } }, 'Reassigning sheet', (t) => (t.team === team ? null : { team }));
  };

  return (
    <>
      <PageHeader
        title="Task distribution"
        sub="Assign work and manage every task. Tick rows for bulk actions."
        actions={
          <button className="btn primary" onClick={() => nav('import')}>
            <Upload className="size-4" /> Upload Content Excel
          </button>
        }
        eyebrow="Admin"
      />
      {sheets.length ? (
        <section className="panel mb-4 !py-0">
          <button type="button" aria-expanded={openReassign} onClick={() => setOpenReassign((o) => !o)} className="flex w-full items-center gap-3 py-3.5 text-left">
            <span className="grid size-8 place-items-center rounded-lg bg-muted text-muted-foreground">
              <Layers className="size-4" />
            </span>
            <span className="flex-1">
              <span className="block text-[15px] font-semibold">Reassign an entire sheet</span>
              <span className="block text-[13px] text-muted-foreground">Move every task from one sheet to a team in one step</span>
            </span>
            <ChevronDown className={`size-4 text-muted-foreground transition-transform ${openReassign ? 'rotate-180' : ''}`} />
          </button>
          {openReassign && <div className="border-t pt-4 pb-4">
            <div className="row" style={{ alignItems: 'end' }}>
            <label className="field" style={{ flex: 2, minWidth: 260 }}>
              <span>Sheet</span>
              <select className="inp" id="rs-sheet" value={Math.min(sel, sheets.length - 1)} onChange={(e) => setSel(+e.target.value)}>
                {sheets.map((x, i) => (
                  <option key={x.imp.id + x.s.idx} value={i}>
                    {x.imp.workbook} › {x.s.name} — {x.ids.length} tasks (now: {x.teams.map((t) => TEAMS[t]).join(', ')})
                  </option>
                ))}
              </select>
            </label>
            <label className="field" style={{ flex: 1, minWidth: 200 }}>
              <span>Assign to</span>
              <select className="inp" id="rs-team" value={team} onChange={(e) => setTeam(e.target.value as Team)}>
                {teamKeys().map((x) => (
                  <option key={x} value={x}>
                    {TEAMS[x]}
                  </option>
                ))}
              </select>
            </label>
            <button className="btn primary" onClick={() => void reassign()}>
              Reassign sheet
            </button>
          </div>
        
          </div>}
        </section>
      ) : null}
      <TaskTable tkey="all" admin />
    </>
  );
}
