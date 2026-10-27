'use client';
import type { ReactNode } from 'react';
import { ROLES, STATUS, STATUS_KEYS, type HistoryEntry, type Status } from '@/lib/constants';
import { pctOf, platBadge, splitPlat } from '@/lib/text';
import { PlatformIcon, hasPlatformIcon } from './PlatformIcon';
import type { CTask } from '@/lib/tasks';
import { useApp } from './store';

export function Pill({ s }: { s: Status }) {
  return (
    <span className={`pill st-${s}`}>
      <i className="dot" aria-hidden="true" />
      {STATUS[s] || s}
    </span>
  );
}

export function Flag({ k, l }: { k: string; l: string }) {
  return <span className={`pill fl-${k}`}>{l}</span>;
}

export function PlatPills({ value }: { value: string }) {
  const ps = splitPlat(value);
  if (!ps.length) return <span className="muted">—</span>;
  return (
    <>
      {ps.map((p, i) => (
        <span key={i}>
          {i > 0 && ' '}
          <span className="tag plat">
            {hasPlatformIcon(p) ? <PlatformIcon name={p} className="size-[18px]" /> : <b aria-hidden="true">{platBadge(p)}</b>}
            {p}
          </span>
        </span>
      ))}
    </>
  );
}

export function PageHeader({ title, sub, actions, eyebrow }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode; eyebrow?: string }) {
  return (
    <div className="ph">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {sub ? <p>{sub}</p> : null}
      </div>
      {actions ? <div className="row no-print">{actions}</div> : null}
    </div>
  );
}

export function Kpi({ label, value, sub, tone, onClick }: { label: ReactNode; value: ReactNode; sub?: ReactNode; tone?: string; onClick?: () => void }) {
  const inner = (
    <>
      <span className="l">{label}</span>
      <span className="v">{value}</span>
      {sub ? <span className="s">{sub}</span> : null}
    </>
  );
  if (onClick)
    return (
      <button type="button" className={`kpi ${tone || ''}`} onClick={onClick}>
        {inner}
      </button>
    );
  return <div className={`kpi ${tone || ''}`}>{inner}</div>;
}

export function ProgRow({ label, done, total, cls }: { label: ReactNode; done: number; total: number; cls?: string }) {
  const p = pctOf(done, total);
  return (
    <div className="prog">
      <div className="top">
        <span>{label}</span>
        <span className="num">
          {done} / {total} completed · {p}%
        </span>
      </div>
      <div className="bar" role="img" aria-label={`${typeof label === 'string' ? label : 'Progress'}: ${p}% complete`}>
        <i className={cls || 'done'} style={{ width: `${p}%` }} />
      </div>
    </div>
  );
}

export function CovScale({ days, tgt, behind }: { days: number; tgt: number; behind: boolean }) {
  const max = Math.max(14, tgt + 3, days + 1);
  const pos = (v: number) => Math.min(100, Math.max(0, (v / max) * 100));
  const marks = [0, 7, 14].filter((x) => x < max && pos(x) <= 70); // keep clear of the "Nd ahead" end label
  return (
    <div className="scale" role="img" aria-label={`${days} days ahead, target ${tgt} days`}>
      <div className="scale-track">
        <div className="scale-fill" style={{ width: `${pos(days)}%` }} />
        <div className="scale-target" style={{ left: `${pos(tgt)}%` }} title={`Target ${tgt} days`} />
      </div>
      <div className="scale-labels">
        {marks.map((x) => (
          <span key={x} style={{ left: `${pos(x)}%` }}>
            {x === 0 ? (behind ? 'Behind' : '0') : x + 'd'}
          </span>
        ))}
        <span style={{ left: '100%' }}>{max}d ahead</span>
      </div>
    </div>
  );
}

export function Ring({ p, label }: { p: number; label: string }) {
  const r = 46;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 120 120" className="donut" role="img" aria-label={`${p}% ${label}`}>
      <circle cx="60" cy="60" r={r} className="ring-bg" />
      <circle cx="60" cy="60" r={r} className="ring-fg" strokeDasharray={`${((c * p) / 100).toFixed(1)} ${c.toFixed(1)}`} transform="rotate(-90 60 60)" style={p === 0 ? { display: 'none' } : undefined} />
      <text x="60" y="62" textAnchor="middle" className="ring-n">
        {p}%
      </text>
      <text x="60" y="80" textAnchor="middle" className="ring-l">
        {label}
      </text>
    </svg>
  );
}

export function EmptyImport() {
  const { nav } = useApp();
  return (
    <div className="empty">
      <h2>No content calendar imported yet.</h2>
      <p className="muted">Upload your Excel content calendar. You will choose which sheets to import and who receives each one.</p>
      <button className="btn primary" onClick={() => nav('import')}>
        Upload Content Excel
      </button>
    </div>
  );
}

export function StatusSelect({ t, id }: { t: CTask; id?: string }) {
  const { setStatus } = useApp();
  return (
    <select className={`st st-${t.status}`} id={id} aria-label="Production status" value={t.status} onChange={(e) => setStatus(t.id, e.target.value as Status)}>
      {STATUS_KEYS.map((s) => (
        <option key={s} value={s}>
          {STATUS[s]}
        </option>
      ))}
    </select>
  );
}

export const who = (h: Pick<HistoryEntry, 'name' | 'role'>) => {
  const r = ROLES[h.role] || 'Someone';
  return h.name ? `${h.name} (${r})` : r;
};

export interface StatItem {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: 'good' | 'bad' | '';
  onClick?: () => void;
}

/** One connected card of numbers (instead of a grid of separate boxes). */
export function StatStrip({ items }: { items: StatItem[] }) {
  return (
    <div
      className="grid overflow-hidden rounded-xl border bg-card shadow-(--shadow-card)"
      style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}
    >
      {items.map((it, i) => {
        const inner = (
          <>
            <span className="text-[13px] font-medium text-muted-foreground">{it.label}</span>
            <span className={`font-heading mt-1 text-[26px] leading-none font-semibold tracking-tight tabular-nums ${it.tone === 'bad' ? 'text-danger' : it.tone === 'good' ? 'text-success' : ''}`}>{it.value}</span>
            {it.sub ? <span className="mt-1.5 text-[13px] leading-snug text-muted-foreground">{it.sub}</span> : null}
          </>
        );
        const cls = `flex flex-col items-start p-4 text-left ${i ? 'border-l' : ''} border-t first:border-t-0 sm:border-t-0`;
        return it.onClick ? (
          <button key={it.label} type="button" onClick={it.onClick} className={`${cls} transition-colors hover:bg-muted/50`}>
            {inner}
          </button>
        ) : (
          <div key={it.label} className={cls}>
            {inner}
          </div>
        );
      })}
    </div>
  );
}
