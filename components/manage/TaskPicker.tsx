'use client';
import { ChevronDown, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { MediaKind, TaskOption } from '@/lib/manage-config';
import { fmtDate } from '@/lib/dates';

const WHO: Record<MediaKind, string> = { image: 'Graphic Designer', video: 'Video Editor' };

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/** Everything a task can be found by: title, platform and its posting date written the ways people type it
 *  ("2026-11-02", "2 nov", "nov 2", "2 november", "02/11", "monday"). */
function haystack(o: TaskOption): string {
  const parts = [o.title, o.platform, o.founder ? 'founder' : ''];
  if (o.postDate) {
    const [y, m, d] = o.postDate.split('-').map(Number);
    const month = MONTHS[m - 1] || '';
    const day = DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
    const dd = String(d).padStart(2, '0');
    const mm = String(m).padStart(2, '0');
    parts.push(o.postDate, `${d} ${month.slice(0, 3)}`, `${month.slice(0, 3)} ${d}`, `${d} ${month}`, `${month} ${d}`, `${dd} ${month.slice(0, 3)}`, `${month.slice(0, 3)} ${dd}`, `${d}/${m}`, `${dd}/${mm}`, `${d}-${m}`, `${dd}-${mm}`, `${mm}-${dd}`, `${dd}.${mm}`, String(y), day, day.slice(0, 3));
  }
  return parts.join(' | ').toLowerCase();
}

/** "Attach a task" dropdown with search. The list opens inline (not as a floating layer) so it works inside dialogs. */
export function TaskPicker({ kind, value, onChange, options, id, currentTitle, platform, platformLabel }: { kind: MediaKind; value: string | null; onChange: (id: string | null) => void; options: TaskOption[] | null; id?: string; currentTitle?: string; platform?: string | null; platformLabel?: string }) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const cur = value && options ? options.find((o) => o.id === value) : null;
  const shown = useMemo(() => {
    // every word typed must match somewhere (so "linkedin 2 nov" narrows by platform and date)
    const words = term.trim().toLowerCase().split(/\s+/).filter(Boolean);
    // a typed number ("2") must stand alone, so it does not match inside "2026" or "12"
    const has = (h: string, w: string) => (/^\d+$/.test(w) ? new RegExp(`(^|[^0-9])${w}([^0-9]|$)`).test(h) : h.includes(w));
    const l = (options || []).filter((o) => {
      if (platform && !o.platform.toLowerCase().includes(platform)) return false; // a LinkedIn file only offers LinkedIn tasks
      const h = haystack(o);
      return words.every((w) => has(h, w));
    });
    return l.slice(0, 60);
  }, [options, term, platform]);

  return (
    <div className="tp">
      <button type="button" id={id} className="tp-btn" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className={cur || (value && currentTitle) ? 'tp-val' : 'tp-ph'}>{cur ? cur.title : value && currentTitle ? currentTitle : options === null ? 'Loading tasks…' : value ? 'Attached task' : `Attach a ${platformLabel ? platformLabel + ' ' : ''}${WHO[kind]} task (optional)`}</span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
      </button>
      {open ? (
        <div className="tp-panel">
          <label className="tp-search">
            <Search className="size-4 text-muted-foreground" />
            <input autoFocus placeholder={platform ? 'Search by title or date…' : 'Search by title, platform or date…'} value={term} onChange={(e) => setTerm(e.target.value)} aria-label="Search tasks" />
          </label>
          {platform ? <div className="tp-note tp-only">Showing {platformLabel || platform} tasks only</div> : null}
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
            {options && !shown.length ? <li className="tp-note">{term.trim() ? 'No task matches.' : `No ${platformLabel ? platformLabel + ' ' : ''}${WHO[kind]} tasks.`}</li> : null}
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
                    {o.status === 'completed' ? <em className="tag tp-done">Completed</em> : null}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {cur && cur.status !== 'completed' ? <p className="tp-hint">This task will be marked Completed when the file is attached.</p> : null}
    </div>
  );
}
