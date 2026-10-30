'use client';
import { ChevronDown, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { MediaKind, TaskOption } from '@/lib/manage-config';
import { fmtDate } from '@/lib/dates';

const WHO: Record<MediaKind, string> = { image: 'Graphic Designer', video: 'Video Editor' };

/** "Attach a task" dropdown with search. The list opens inline (not as a floating layer) so it works inside dialogs. */
export function TaskPicker({ kind, value, onChange, options, id, currentTitle }: { kind: MediaKind; value: string | null; onChange: (id: string | null) => void; options: TaskOption[] | null; id?: string; currentTitle?: string }) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const cur = value && options ? options.find((o) => o.id === value) : null;
  const shown = useMemo(() => {
    const t = term.trim().toLowerCase();
    const l = (options || []).filter((o) => !t || o.title.toLowerCase().includes(t) || o.platform.toLowerCase().includes(t));
    return l.slice(0, 60);
  }, [options, term]);

  return (
    <div className="tp">
      <button type="button" id={id} className="tp-btn" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className={cur || (value && currentTitle) ? 'tp-val' : 'tp-ph'}>{cur ? cur.title : value && currentTitle ? currentTitle : options === null ? 'Loading tasks…' : value ? 'Attached task' : `Attach a ${WHO[kind]} task (optional)`}</span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
      </button>
      {open ? (
        <div className="tp-panel">
          <label className="tp-search">
            <Search className="size-4 text-muted-foreground" />
            <input autoFocus placeholder="Search by title or platform…" value={term} onChange={(e) => setTerm(e.target.value)} aria-label="Search tasks" />
          </label>
          <ul className="tp-list" role="listbox" aria-label={`${WHO[kind]} tasks`}>
            <li>
              <button
                type="button"
                role="option"
                aria-selected={!value}
                className="tp-opt"
                onClick={() => {
                  onChange(null);
                  setOpen(false);
                }}
              >
                <b>No task</b>
              </button>
            </li>
            {options === null ? <li className="tp-note">Loading…</li> : null}
            {options && !shown.length ? <li className="tp-note">{options.length ? 'No task matches.' : `No unfinished ${WHO[kind]} tasks.`}</li> : null}
            {shown.map((o) => (
              <li key={o.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={o.id === value}
                  className="tp-opt"
                  onClick={() => {
                    onChange(o.id);
                    setOpen(false);
                    setTerm('');
                  }}
                >
                  <b>{o.title}</b>
                  <span>
                    {o.platform || 'No platform'}
                    {o.postDate ? ` · ${fmtDate(o.postDate, { year: undefined })}` : ''}
                    {o.founder ? <em className="tag founder">Founder</em> : null}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
